import {
  normalizeGeminiBaseUrl,
  resolveAgentProxyUrl,
} from "@shectory-assist/adapters-gemini";

export type BotConfig = {
  /** Снимок allowlist с портала; если не заданы PORTAL_ALLOWLIST_* — null. */
  portalAllowlistProjectSlug: string | null;
  /** Если true и запрос к порталу не удался — пускаем пользователя (не блокируем бот). */
  allowlistFetchFailOpen: boolean;
  telegramBotToken: string;
  /** Секрет из `secret_token` при setWebhook; проверяется заголовком `X-Telegram-Bot-Api-Secret-Token`. */
  telegramWebhookSecret: string | null;
  /** Единый ключ Gemini (как в Ourdiary): `AGENT_LLM_API_KEY`. */
  agentLlmApiKey: string;
  agentGeminiBaseUrl: string;
  agentProxyUrl: string | undefined;
  agentLlmTimeoutMs: number;
  agentProxyConnectTimeoutMs: number;
  geminiAsrModel: string;
  geminiNluModel: string;
  /** Текстовый чат (Gemini 2.5 Flash и т.п.). */
  geminiChatModel: string;
  geminiTtsModel: string;
  defaultVoice: string;
  port: number;
  mode: "long_poll" | "webhook";
  rateLimitPerUserPerMinute: number;
  gazetaUserAgent: string;
  gazetaCacheTtlMs: number;
  gazetaMaxFetchesPerMinute: number;
  maxTitles: number;
  /** Жёсткий лимит на весь пайплайн (NLU + скилл + TTS), мс. */
  assistPipelineDeadlineMs: number;
  /**
   * Таймаут одного HTTP-запроса к Telegram Bot API (секунды, grammY `client.timeoutSeconds`).
   * У grammY по умолчанию 500 с — при медленном прокси `getMe`/`deleteWebhook` держат старт до long poll минутами.
   * Не ставьте ниже ~55: long poll `getUpdates` у Telegram до 50 с.
   */
  telegramApiTimeoutSeconds: number;
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") {
    return fallback;
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Как в `@shectory/gemini-proxy`: устаревшее имя модели мапится на поддерживаемое. */
function normalizeChatModelId(raw: string): string {
  let m = raw.replace(/^models\//, "").trim();
  if (m === "gemini-2.0-flash") {
    m = "gemini-2.5-flash";
  }
  return m;
}

function normalizeTtsModelId(raw: string): string {
  return raw.replace(/^models\//, "").trim();
}

export function loadConfig(): BotConfig {
  const mode = (process.env.BOT_MODE ?? "long_poll") as BotConfig["mode"];
  if (mode !== "long_poll" && mode !== "webhook") {
    throw new Error("BOT_MODE must be long_poll or webhook");
  }

  const agentLlmApiKey =
    process.env.AGENT_LLM_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!agentLlmApiKey) {
    throw new Error("Missing AGENT_LLM_API_KEY (или устаревший GEMINI_API_KEY)");
  }

  const portalBase = process.env.PORTAL_ALLOWLIST_BASE_URL?.trim();
  const bridgeSecret = process.env.SHECTORY_AUTH_BRIDGE_SECRET?.trim();
  const portalAllowlistProjectSlug =
    portalBase && bridgeSecret
      ? (process.env.PORTAL_ALLOWLIST_PROJECT_SLUG?.trim() || "shectory-assist")
      : null;

  return {
    portalAllowlistProjectSlug,
    allowlistFetchFailOpen: (process.env.PORTAL_ALLOWLIST_FAIL_OPEN ?? "true").trim() !== "false",
    telegramBotToken: req("TELEGRAM_BOT_TOKEN"),
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
    agentLlmApiKey,
    agentGeminiBaseUrl: normalizeGeminiBaseUrl(process.env.AGENT_LLM_BASE_URL),
    agentProxyUrl: resolveAgentProxyUrl(),
    agentLlmTimeoutMs: envInt("AGENT_LLM_TIMEOUT_MS", 45_000),
    agentProxyConnectTimeoutMs: envInt("AGENT_PROXY_CONNECT_TIMEOUT_MS", 30_000),
    geminiAsrModel: normalizeChatModelId(
      process.env.AGENT_GEMINI_ASR_MODEL?.trim() ||
        process.env.GEMINI_ASR_MODEL?.trim() ||
        process.env.AGENT_LLM_MODEL_FAST?.trim() ||
        process.env.AGENT_LLM_MODEL?.trim() ||
        "gemini-2.5-flash",
    ),
    geminiNluModel: normalizeChatModelId(
      process.env.AGENT_GEMINI_NLU_MODEL?.trim() ||
        process.env.GEMINI_NLU_MODEL?.trim() ||
        process.env.AGENT_LLM_MODEL?.trim() ||
        "gemini-2.5-flash",
    ),
    geminiChatModel: normalizeChatModelId(
      process.env.AGENT_GEMINI_CHAT_MODEL?.trim() ||
        process.env.AGENT_LLM_MODEL_FAST?.trim() ||
        process.env.AGENT_GEMINI_NLU_MODEL?.trim() ||
        process.env.AGENT_LLM_MODEL?.trim() ||
        "gemini-2.5-flash",
    ),
    geminiTtsModel: normalizeTtsModelId(
      process.env.AGENT_GEMINI_TTS_MODEL?.trim() ||
        process.env.GEMINI_TTS_MODEL?.trim() ||
        "gemini-2.5-flash-preview-tts",
    ),
    defaultVoice: process.env.DEFAULT_TTS_VOICE ?? "Kore",
    port: Number(process.env.PORT ?? "8080"),
    mode,
    rateLimitPerUserPerMinute: Number(process.env.RATE_LIMIT_PER_USER_PER_MIN ?? "12"),
    gazetaUserAgent:
      process.env.GAZETA_USER_AGENT ??
      "ShectoryAssist/0.1 (MVP demo; contact: set GAZETA_USER_AGENT in .env)",
    gazetaCacheTtlMs: Number(process.env.GAZETA_CACHE_TTL_MS ?? "90000"),
    gazetaMaxFetchesPerMinute: Number(process.env.GAZETA_MAX_FETCH_PER_MIN ?? "8"),
    maxTitles: Number(process.env.GAZETA_MAX_TITLES ?? "15"),
    assistPipelineDeadlineMs: envInt("ASSIST_PIPELINE_DEADLINE_MS", 120_000),
    telegramApiTimeoutSeconds: Math.max(55, envInt("TELEGRAM_API_TIMEOUT_SEC", 120)),
  };
}
