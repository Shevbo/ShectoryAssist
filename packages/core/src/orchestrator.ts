import type { IdempotencyStore } from "./idempotency.js";
import type { Logger } from "./logger.js";
import { clipText } from "./logger.js";
import type { RateLimiter } from "./rate-limit.js";
import { routeIntent, type GeminiNluFn } from "./intent-router.js";
import type { SkillRegistry } from "./skills.js";
import type {
  AsrResult,
  Intent,
  NluResult,
  PipelineMetrics,
  SkillInput,
  SkillOutput,
} from "./types.js";

export type GeminiAdapter = {
  transcribeAudio: (args: {
    buffer: Buffer;
    mimeType: string;
    traceId: string;
  }) => Promise<AsrResult>;
  classifyIntent?: GeminiNluFn;
  synthesizeSpeech: (args: {
    text: string;
    voiceName: string;
    traceId: string;
  }) => Promise<Buffer | null>;
};

export type UserProfileStore = {
  getVoice(userId: string): Promise<string>;
  setVoice(userId: string, voice: string): Promise<void>;
};

export type OrchestratorDeps = {
  skills: SkillRegistry;
  gemini: GeminiAdapter;
  idempotency: IdempotencyStore;
  rateLimiter: RateLimiter;
  profiles: UserProfileStore;
  logger: Logger;
};

const HELP_TEXT =
  "Привет! Я Shectory Assist. Отправь голосовое с просьбой прочитать «картину дня» с Газеты точка ру — я озвучу заголовки. " +
  "Можно написать текстом то же самое. Чтобы сменить голос (если поддерживается моделью), напиши: голос Kore.";

function aggregateMessages(out: SkillOutput): string {
  return out.messages.map((m) => m.text).join("\n\n");
}

async function runSkill(
  intent: Intent,
  input: SkillInput,
  skills: SkillRegistry,
): Promise<SkillOutput> {
  const handler = skills[intent];
  if (!handler) {
    return {
      messages: [
        {
          text: "Пока я умею только сценарий с блоком «картина дня» Gazeta.ru. Переформулируй запрос.",
        },
      ],
      audioPolicy: "text_only",
    };
  }
  return handler(input);
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async handleUserMessageEvent(args: {
    userId: string;
    locale: string;
    messageKey: string;
    traceId: string;
    audio?: { buffer: Buffer; mimeType: string };
    text?: string | null;
  }): Promise<{
    replyText: string;
    replyAudio: Buffer | null;
    metrics: PipelineMetrics;
    /** Повтор того же update_id после успешной обработки (или после сбоя отправки с «съеденным» ключом). */
    duplicateSkipped?: boolean;
  }> {
    const { logger, rateLimiter, idempotency, gemini, skills, profiles } = this.deps;
    const metrics: PipelineMetrics = {
      asrOk: false,
      skillOk: false,
      ttsOk: false,
    };

    if (!rateLimiter.hit(args.userId)) {
      logger({
        level: "warn",
        msg: "rate_limited",
        traceId: args.traceId,
        userId: args.userId,
      });
      return {
        replyText: "Слишком много запросов. Подожди немного и попробуй снова.",
        replyAudio: null,
        metrics,
      };
    }

    const idemKey = `${args.userId}:${args.messageKey}`;
    if (!(await idempotency.tryConsume(idemKey))) {
      logger({
        level: "info",
        msg: "duplicate_update_skipped",
        traceId: args.traceId,
        userId: args.userId,
        extra: { key: idemKey },
      });
      return { replyText: "", replyAudio: null, metrics, duplicateSkipped: true };
    }

    let transcript = (args.text ?? "").trim();
    if (args.audio) {
      try {
        const asr = await gemini.transcribeAudio({
          buffer: args.audio.buffer,
          mimeType: args.audio.mimeType,
          traceId: args.traceId,
        });
        transcript = asr.transcript.trim();
        metrics.asrOk = true;
        logger({
          level: "info",
          msg: "asr_ok",
          traceId: args.traceId,
          stage: "asr",
          userId: args.userId,
          extra: { transcriptLen: transcript.length },
        });
      } catch (e) {
        logger({
          level: "error",
          msg: "asr_failed",
          traceId: args.traceId,
          stage: "asr",
          userId: args.userId,
          extra: { err: String(e) },
        });
        return {
          replyText: "Не получилось распознать голос. Запиши сообщение ещё раз или отправь текстом.",
          replyAudio: null,
          metrics,
        };
      }
    }

    if (!transcript) {
      return {
        replyText: "Я не вижу текста или аудио в сообщении. Попробуй ещё раз.",
        replyAudio: null,
        metrics,
      };
    }

    logger({
      level: "info",
      msg: "user_message",
      traceId: args.traceId,
      userId: args.userId,
      extra: { transcriptClip: clipText(transcript) },
    });

    let routed: NluResult;
    try {
      routed = await routeIntent(transcript, {
        geminiNlu: gemini.classifyIntent,
        traceId: args.traceId,
      });
    } catch (e) {
      logger({
        level: "error",
        msg: "intent_route_failed",
        traceId: args.traceId,
        userId: args.userId,
        extra: { err: String(e) },
      });
      return {
        replyText: "Не удалось разобрать запрос. Попробуй переформулировать текстом.",
        replyAudio: null,
        metrics,
      };
    }

    const voiceDefault = await profiles.getVoice(args.userId);
    let voice = voiceDefault;
    if (routed.intent === "set_voice" && routed.entities.voiceName) {
      await profiles.setVoice(args.userId, routed.entities.voiceName);
      voice = routed.entities.voiceName;
      return {
        replyText: `Ок, запомнил голос «${voice}» для следующих ответов.`,
        replyAudio: null,
        metrics,
      };
    }

    const skillInput: SkillInput = {
      userId: args.userId,
      locale: args.locale,
      transcriptText: transcript,
      intent: routed.intent,
      entities: { ...routed.entities, voiceName: voice },
      traceId: args.traceId,
    };

    let skillOut: SkillOutput;
    const t0 = Date.now();
    try {
      if (routed.intent === "help") {
        skillOut = {
          messages: [{ text: HELP_TEXT }],
          audioPolicy: "prefer_voice",
        };
      } else if (routed.intent === "unknown") {
        skillOut = {
          messages: [
            {
              text:
                "Пока я понимаю в основном запросы про «картину дня» на gazeta.ru. Пример: «Прочитай топики новостей с сайта газеты точка ру».",
            },
          ],
          audioPolicy: "prefer_voice",
        };
      } else {
        skillOut = await runSkill(routed.intent, skillInput, skills);
      }
      metrics.skillOk = true;
      metrics.skillMs = Date.now() - t0;
      if (skillOut.metadata?.parseEmpty === true) {
        metrics.parseEmpty = true;
      }
    } catch (e) {
      logger({
        level: "error",
        msg: "skill_failed",
        traceId: args.traceId,
        stage: "skill",
        userId: args.userId,
        extra: { err: String(e) },
      });
      return {
        replyText: "Сервис временно недоступен. Попробуй чуть позже.",
        replyAudio: null,
        metrics,
      };
    }

    const replyText = aggregateMessages(skillOut);
    if (skillOut.audioPolicy === "text_only") {
      return { replyText, replyAudio: null, metrics };
    }

    const t1 = Date.now();
    const audio = await gemini.synthesizeSpeech({
      text: replyText,
      voiceName: voice,
      traceId: args.traceId,
    });
    metrics.ttsMs = Date.now() - t1;
    if (audio) {
      metrics.ttsOk = true;
    } else {
      logger({
        level: "warn",
        msg: "tts_unavailable_text_fallback",
        traceId: args.traceId,
        stage: "tts",
        userId: args.userId,
      });
    }

    return { replyText, replyAudio: audio, metrics };
  }
}
