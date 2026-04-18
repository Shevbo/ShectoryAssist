import {
  createGeminiRestAdapter,
  type GeminiRestConfig,
} from "@shectory-assist/adapters-gemini";
import {
  createJsonLogger,
  InMemoryIdempotencyStore,
  Orchestrator,
  TokenBucketRateLimiter,
} from "@shectory-assist/core";
import { createGazetaPictureOfDaySkill } from "@shectory-assist/skill-gazeta";
import type { BotConfig } from "./config.js";
import { MemoryProfileStore } from "./memory-profile-store.js";
import { createUndiciProxiedFetch } from "./telegram-fetch.js";

export function createOrchestratorStack(cfg: BotConfig) {
  const logger = createJsonLogger();
  const geminiCfg: GeminiRestConfig = {
    apiKey: cfg.agentLlmApiKey,
    baseUrl: cfg.agentGeminiBaseUrl,
    proxyUrl: cfg.agentProxyUrl,
    requestTimeoutMs: cfg.agentLlmTimeoutMs,
    proxyConnectTimeoutMs: cfg.agentProxyConnectTimeoutMs,
    asrModel: cfg.geminiAsrModel,
    nluModel: cfg.geminiNluModel,
    chatModel: cfg.geminiChatModel,
    ttsModel: cfg.geminiTtsModel,
  };
  const gemini = createGeminiRestAdapter(geminiCfg);
  const gazeta = createGazetaPictureOfDaySkill({
    userAgent: cfg.gazetaUserAgent,
    cacheTtlMs: cfg.gazetaCacheTtlMs,
    maxGlobalFetchesPerMinute: cfg.gazetaMaxFetchesPerMinute,
    maxTitles: cfg.maxTitles,
    fetch: createUndiciProxiedFetch(cfg.agentProxyUrl, cfg.agentProxyConnectTimeoutMs),
  });

  const idempotency = new InMemoryIdempotencyStore();
  const orchestrator = new Orchestrator({
    skills: {
      gazeta_picture_of_day: gazeta,
    },
    gemini: {
      transcribeAudio: gemini.transcribeAudio,
      classifyIntent: gemini.classifyIntent,
      generateChatReply: gemini.generateChatReply,
      synthesizeSpeech: gemini.synthesizeSpeech,
    },
    idempotency,
    rateLimiter: new TokenBucketRateLimiter(cfg.rateLimitPerUserPerMinute, 60_000),
    profiles: new MemoryProfileStore(cfg.defaultVoice),
    logger,
  });

  return { orchestrator, logger, idempotency };
}
