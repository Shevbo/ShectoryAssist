import type { NluResult } from "./types.js";

const GAZETA_HINTS =
  /gazeta|газет|картин[аы]\s+дня|топик|новост|заголовк|прочитай/i;
const HELP_HINTS = /помощь|help|что\s+ты\s+умеешь|как\s+пользоваться/i;
const VOICE_HINTS = /голос\s+([\w-]+)|смени\s+голос/i;

export function routeIntentRuleBased(transcript: string): NluResult {
  const t = transcript.trim();
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
  const primary = routeIntentRuleBased(transcript);
  if (primary.intent !== "unknown") {
    return primary;
  }
  if (options.geminiNlu) {
    return options.geminiNlu(transcript, options.traceId);
  }
  return primary;
}
