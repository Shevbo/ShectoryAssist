import type { NluResult } from "./types.js";

const GAZETA_HINTS =
  /gazeta|газет|картин[аы]\s+дня|топик|новост|заголовк|прочитай/i;
/** Вопросы про возможности бота (в т.ч. после неточного ASR). Без `\b`: в JS `\b` не работает с кириллицей. */
const HELP_HINTS =
  /(?:^|[\s,.!?])(?:помощь|help)(?:$|[\s,.!?])|что[\s,.!?]*ты[\s,.!?]*умеешь|что[\s,.!?]+умеешь|как\s+пользоваться|на\s+что\s+ты\s+способен|твои\s+возможности|чем\s+полезен|what\s+can\s+you\s+do/i;
const VOICE_HINTS = /голос\s+([\w-]+)|смени\s+голос/i;

/** NBSP и похожие символы → обычный пробел (иначе `\s` в RegExp может не сработать). */
export function normalizeUserTranscript(transcript: string): string {
  return transcript
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function routeIntentRuleBased(transcript: string): NluResult {
  const t = normalizeUserTranscript(transcript);
  if (!t) {
    return { intent: "unknown", entities: {} };
  }
  if (HELP_HINTS.test(t)) {
    return { intent: "help", entities: {} };
  }
  const voiceMatch = t.match(VOICE_HINTS);
  if (voiceMatch?.[1]) {
    return {
      intent: "set_voice",
      entities: { voiceName: voiceMatch[1] },
    };
  }
  if (GAZETA_HINTS.test(t)) {
    return {
      intent: "gazeta_picture_of_day",
      entities: { source: "gazeta.ru", block: "picture_of_day" },
    };
  }
  return { intent: "unknown", entities: {} };
}

export type GeminiNluFn = (text: string, traceId: string) => Promise<NluResult>;

export async function routeIntent(
  transcript: string,
  options: {
    geminiNlu?: GeminiNluFn;
    traceId: string;
  },
): Promise<NluResult> {
  const normalized = normalizeUserTranscript(transcript);
  const primary = routeIntentRuleBased(normalized);
  if (primary.intent !== "unknown") {
    return primary;
  }
  if (options.geminiNlu) {
    return options.geminiNlu(normalized, options.traceId);
  }
  return primary;
}
