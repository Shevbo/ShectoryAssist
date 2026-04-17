import { Bot, InputFile, type Context } from "grammy";
import { createOrchestratorStack } from "./orchestrator-stack.js";
import type { BotConfig } from "./config.js";
import { fetchAllowlistSnapshot, isTelegramUserAllowed } from "./portal-allowlist.js";
import type { Orchestrator } from "@shectory-assist/core";

function extractUserText(msg: { text?: string; caption?: string }): string | undefined {
  if (typeof msg.text === "string" && msg.text.trim()) {
    return msg.text.trim();
  }
  if (typeof msg.caption === "string" && msg.caption.trim()) {
    return msg.caption.trim();
  }
  return undefined;
}

function isOggOpus(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS";
}

function isMp3(buf: Buffer): boolean {
  return (
    (buf.length >= 3 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) ||
    (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
  );
}

async function downloadTelegramVoice(
  bot: Bot<Context>,
  filePath: string,
  httpFetch: typeof fetch,
): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
  const res = await httpFetch(url);
  if (!res.ok) {
    throw new Error(`telegram_file_download:${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function wireTelegramBot(
  bot: Bot<Context>,
  cfg: BotConfig,
  opts: { telegramFetch: typeof fetch },
) {
  const { orchestrator, logger, idempotency } = createOrchestratorStack(cfg);
  const httpFetch = opts.telegramFetch;

  bot.catch((err) => {
    logger({
      level: "error",
      msg: "telegram_bot_error",
      traceId: "telegram",
      extra: { err: String(err) },
    });
  });

  bot.command("start", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    if (cfg.portalAllowlistProjectSlug) {
      const snap = await fetchAllowlistSnapshot(cfg.portalAllowlistProjectSlug);
      const gate = isTelegramUserAllowed(userId, snap, cfg.allowlistFetchFailOpen);
      if (!gate.ok) {
        await ctx.reply("Доступ к боту ограничен. Обратитесь к администратору Shectory.");
        return;
      }
    }
    await ctx.reply(
      "Я Shectory Assist. Голосом или текстом: «картина дня» с gazeta.ru — заголовки (озвучка через Gemini TTS). Любые другие вопросы — текстом, отвечу через быстрый Gemini Chat. Команда /start снова покажет это сообщение.",
    );
  });

  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    if (!msg) {
      return;
    }
    const traceId = `tg-${ctx.update.update_id}`;
    const userId = String(ctx.from?.id ?? "unknown");
    const messageKey = `${ctx.chat?.id ?? 0}:${msg.message_id}`;
    const idemKey = `${userId}:${messageKey}`;

    if (cfg.portalAllowlistProjectSlug) {
      const snap = await fetchAllowlistSnapshot(cfg.portalAllowlistProjectSlug);
      const gate = isTelegramUserAllowed(userId, snap, cfg.allowlistFetchFailOpen);
      if (!gate.ok) {
        logger({
          level: "info",
          msg: "telegram_allowlist_denied",
          traceId,
          userId,
          extra: { reason: gate.reason ?? "denied" },
        });
        await ctx.reply("Доступ к боту ограничен. Обратитесь к администратору Shectory.");
        return;
      }
    }
    const locale = ctx.from?.language_code ?? "ru-RU";

    let audio: { buffer: Buffer; mimeType: string } | undefined;
    let voiceDownloadFailed = false;
    try {
      if (msg.voice) {
        const file = await ctx.getFile();
        if (file.file_path) {
          const buffer = await downloadTelegramVoice(bot, file.file_path, httpFetch);
          audio = { buffer, mimeType: msg.voice.mime_type ?? "audio/ogg" };
        }
      } else if (msg.audio) {
        const file = await ctx.getFile();
        if (file.file_path) {
          const buffer = await downloadTelegramVoice(bot, file.file_path, httpFetch);
          audio = {
            buffer,
            mimeType: msg.audio.mime_type ?? "audio/mpeg",
          };
        }
      }
    } catch (e) {
      voiceDownloadFailed = true;
      logger({
        level: "warn",
        msg: "telegram_voice_download_failed",
        traceId,
        userId,
        extra: { err: String(e) },
      });
    }

    if (voiceDownloadFailed && (msg.voice || msg.audio)) {
      await ctx.reply(
        "Не удалось скачать голосовое из Telegram (сеть или прокси). Попробуй ещё раз или отправь текстом.",
      );
      return;
    }

    const text = extractUserText(msg);

    if (!audio && (!text || !text.trim())) {
      await ctx.reply(
        "Пока обрабатываю только текст, подпись к медиа или голосовое. Отправь, например: «Прочитай картину дня с gazeta.ru».",
      );
      return;
    }

    void ctx.replyWithChatAction("typing").catch(() => {});

    let r: Awaited<ReturnType<Orchestrator["handleUserMessageEvent"]>>;
    let pipelineTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      r = await Promise.race([
        orchestrator.handleUserMessageEvent({
          userId,
          locale,
          messageKey,
          traceId,
          audio,
          text: text ?? null,
        }),
        new Promise<never>((_, rej) => {
          pipelineTimer = setTimeout(
            () => rej(new Error("assist_pipeline_deadline")),
            cfg.assistPipelineDeadlineMs,
          );
        }),
      ]);
    } catch (e) {
      clearTimeout(pipelineTimer);
      await idempotency.release(idemKey);
      if (e instanceof Error && e.message === "assist_pipeline_deadline") {
        logger({
          level: "error",
          msg: "pipeline_deadline",
          traceId,
          userId,
          extra: { ms: cfg.assistPipelineDeadlineMs },
        });
        await ctx
          .reply(
            "Обработка заняла слишком много времени (сеть или модель). Попробуй ещё раз через минуту или короче запрос.",
          )
          .catch(() => {});
        return;
      }
      logger({
        level: "error",
        msg: "orchestrator_threw",
        traceId,
        userId,
        extra: { err: String(e) },
      });
      await ctx.reply("Внутренняя ошибка. Попробуй ещё раз новым сообщением.").catch(() => {});
      return;
    } finally {
      clearTimeout(pipelineTimer);
    }

    if (r.duplicateSkipped) {
      await ctx.reply(
        "Это сообщение уже было обработано. Если ответа не видно — отправь новое сообщение (Telegram мог повторить апдейт).",
      );
      return;
    }

    if (!r.replyText && !r.replyAudio) {
      await ctx.reply("Пустой ответ. Напиши /start или переформулируй запрос текстом.");
      return;
    }

    logger({
      level: "info",
      msg: "pipeline_complete",
      traceId,
      userId,
      extra: {
        asrOk: r.metrics.asrOk,
        skillOk: r.metrics.skillOk,
        ttsOk: r.metrics.ttsOk,
        parseEmpty: r.metrics.parseEmpty ?? false,
      },
    });

    const releaseAfterSendFailure = async (err: unknown) => {
      await idempotency.release(idemKey);
      logger({
        level: "error",
        msg: "telegram_reply_failed",
        traceId,
        userId,
        extra: { err: String(err) },
      });
    };

    if (r.replyAudio && r.replyAudio.byteLength > 0) {
      const buf = r.replyAudio;
      const cap = r.replyText.length > 1024 ? `${r.replyText.slice(0, 1020)}…` : r.replyText;
      try {
        if (isOggOpus(buf)) {
          await ctx.replyWithVoice(new InputFile(buf, "reply.ogg"), { caption: cap });
          return;
        }
        if (isMp3(buf)) {
          await ctx.replyWithAudio(new InputFile(buf, "reply.mp3"), { caption: cap });
          return;
        }
      } catch (e) {
        logger({
          level: "warn",
          msg: "telegram_voice_send_failed",
          traceId,
          userId,
          extra: { err: String(e) },
        });
      }
      try {
        await ctx.replyWithDocument(new InputFile(buf, "reply.bin"), { caption: cap });
      } catch (e) {
        await releaseAfterSendFailure(e);
        await ctx.reply(r.replyText).catch(() => {});
      }
      return;
    }

    try {
      await ctx.reply(r.replyText);
    } catch (e) {
      await releaseAfterSendFailure(e);
      await ctx.reply("Ответ был готов, но Telegram не принял отправку. Попробуй ещё раз.").catch(() => {});
    }
  });
}
