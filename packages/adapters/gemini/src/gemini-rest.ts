import type { GeminiNluFn, NluResult } from "@shectory-assist/core";
import { geminiPostGenerateContent, type GeminiHttpConfig } from "./gemini-fetch.js";

type GenPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: GenPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string; code?: number };
};

async function postGenerateContent(
  http: GeminiHttpConfig,
  model: string,
  body: unknown,
): Promise<GenerateContentResponse> {
  const res = await geminiPostGenerateContent(http, model, body);
  const json = res.json as GenerateContentResponse;
  if (!res.ok) {
    const msg =
      json.error?.message ??
      (typeof res.rawText === "string" ? res.rawText.slice(0, 500) : String(res.status));
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }
  return json;
}

function firstTextFromResponse(r: GenerateContentResponse): string {
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const texts = parts.map((p) => p.text).filter(Boolean) as string[];
  return texts.join("\n").trim();
}

export type GeminiRestConfig = GeminiHttpConfig & {
  asrModel: string;
  nluModel: string;
  /** Текстовый чат (свободный диалог); по умолчанию как nlu — быстрый flash. */
  chatModel: string;
  ttsModel: string;
};

export function createGeminiRestAdapter(config: GeminiRestConfig) {
  const http: GeminiHttpConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    proxyUrl: config.proxyUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    proxyConnectTimeoutMs: config.proxyConnectTimeoutMs,
  };

  const transcribeAudio = async (args: {
    buffer: Buffer;
    mimeType: string;
    traceId: string;
  }) => {
    void args.traceId;
    const b64 = args.buffer.toString("base64");
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: args.mimeType || "audio/webm",
                data: b64,
              },
            },
            {
              text: "Transcribe this audio to Russian. Output only the transcript text, no commentary.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    };
    const r = await postGenerateContent(http, config.asrModel, body);
    const transcript = firstTextFromResponse(r);
    if (!transcript) {
      throw new Error("Empty ASR transcript");
    }
    return { transcript };
  };

  const classifyIntent: GeminiNluFn = async (text: string, traceId: string) => {
    void traceId;
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Classify user message into JSON only, no markdown. Schema:
{"intent":"gazeta_picture_of_day"|"help"|"set_voice"|"unknown","voiceName":string|null}
Rules: gazeta if user wants news headlines from gazeta.ru picture of day. help for capabilities, "что умеешь", "что ты умеешь", помощь, what can you do. set_voice if user asks to change TTS voice by name. unknown otherwise.`,
            },
            { text: `Message: ${text}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 128,
        responseMimeType: "application/json",
      },
    };
    try {
      const r = await postGenerateContent(http, config.nluModel, body);
      const raw = firstTextFromResponse(r);
      try {
        const parsed = JSON.parse(raw) as {
          intent?: string;
          voiceName?: string | null;
        };
        const intent = parsed.intent;
        if (
          intent === "gazeta_picture_of_day" ||
          intent === "help" ||
          intent === "set_voice" ||
          intent === "unknown"
        ) {
          const out: NluResult = {
            intent,
            entities:
              intent === "set_voice" && parsed.voiceName
                ? { voiceName: parsed.voiceName }
                : intent === "gazeta_picture_of_day"
                  ? { source: "gazeta.ru", block: "picture_of_day" }
                  : {},
          };
          return out;
        }
      } catch {
        /* fallthrough */
      }
    } catch {
      /* fallthrough */
    }
    return { intent: "unknown", entities: {} };
  };

  const generateChatReply = async (args: { text: string; locale: string; traceId: string }) => {
    void args.traceId;
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are Shectory Assist, a helpful assistant for a Russian-speaking user. Reply in Russian unless the user clearly writes in another language. Be concise (max ~900 characters), no filler. Do not claim you browsed the live web unless the user message was only about gazeta.ru headlines (that is handled elsewhere).

Locale hint: ${args.locale}

User message:
${args.text}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 1024,
      },
    };
    const r = await postGenerateContent(http, config.chatModel, body);
    return firstTextFromResponse(r);
  };

  const synthesizeSpeech = async (args: {
    text: string;
    voiceName: string;
    traceId: string;
  }): Promise<Buffer | null> => {
    void args.traceId;
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Read aloud in clear Russian for a voice assistant. Do not add meta commentary.\n\n${args.text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: args.voiceName || "Kore",
            },
          },
        },
      },
    };
    try {
      const r = await postGenerateContent(http, config.ttsModel, body);
      const parts = r.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        const d = p.inlineData;
        if (d?.data && d.mimeType?.startsWith("audio/")) {
          return Buffer.from(d.data, "base64");
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  return { transcribeAudio, classifyIntent, generateChatReply, synthesizeSpeech };
}
