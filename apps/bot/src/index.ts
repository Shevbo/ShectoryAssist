import fs from "node:fs";
import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import {
  createTelegramApiFetch,
  telegramGetMeWithNativeSignal,
  wrapFetchWithDeadline,
  type TelegramFetch,
} from "./telegram-fetch.js";
import { wireTelegramBot } from "./telegram-handlers.js";
import { withTransientNetworkRetries } from "./retry-network.js";
import { startTelegramWebhookServer } from "./webhook-server.js";

function logLine(obj: Record<string, unknown>) {
  const line = `${JSON.stringify(obj)}\n`;
  try {
    fs.writeSync(1, line);
  } catch {
    // ignore
  }
}

async function main() {
  const cfg = loadConfig();
  const innerFetch: TelegramFetch = createTelegramApiFetch(
    cfg.agentProxyUrl,
    cfg.agentProxyConnectTimeoutMs,
  );
  const tgFetch = wrapFetchWithDeadline(
    innerFetch,
    cfg.telegramApiTimeoutSeconds * 1000 + 2_000,
  );
  logLine({
    msg: "assist_telegram_client",
    viaProxy: Boolean(cfg.agentProxyUrl),
    telegram_api_timeout_sec: cfg.telegramApiTimeoutSeconds,
    telegram_bootstrap_timeout_ms: cfg.telegramBootstrapTimeoutMs,
  });
  if (cfg.agentProxyUrl?.trim()) {
    try {
      const u = new URL(cfg.agentProxyUrl.trim());
      const hasUrlAuth = Boolean(u.username);
      const hasEnvAuth = Boolean(
        process.env.AGENT_PROXY_TOKEN?.trim() || process.env.AGENT_PROXY_USER?.trim(),
      );
      if (!hasUrlAuth && !hasEnvAuth) {
        logLine({
          msg: "assist_telegram_proxy_auth_hint",
          note: "если прокси отдаёт 407 — задайте user:pass в AGENT_PROXY или AGENT_PROXY_USER/PASSWORD или AGENT_PROXY_TOKEN",
        });
      }
    } catch {
      // ignore invalid proxy URL for hint
    }
  }

  // getMe вне grammY Api — нативный AbortSignal + undici (как Gemini); дальше grammY с wire(innerFetch).
  const bootstrapDeadlineMs = cfg.telegramBootstrapTimeoutMs + 2_000;
  logLine({ msg: "assist_bot_bootstrap_begin" });
  const botInfo = await withTransientNetworkRetries(
    { msg: "assist_bot_bootstrap_getme_retry", logLine },
    cfg.telegramBootstrapMaxAttempts,
    cfg.telegramBootstrapRetryBaseMs,
    cfg.telegramBootstrapRetryMaxDelayMs,
    () =>
      telegramGetMeWithNativeSignal(
        cfg.telegramBotToken,
        cfg.agentProxyUrl,
        cfg.agentProxyConnectTimeoutMs,
        bootstrapDeadlineMs,
      ),
  );
  logLine({
    msg: "assist_bot_init_ok",
    username: botInfo.username,
    bot_id: botInfo.id,
  });

  const bot = new Bot(cfg.telegramBotToken, {
    botInfo,
    client: {
      fetch: tgFetch as never,
      timeoutSeconds: cfg.telegramApiTimeoutSeconds,
    },
  });

  bot.use(async (ctx, next) => {
    logLine({
      msg: "tg_update_ingress",
      update_id: ctx.update.update_id,
      keys: Object.keys(ctx.update).filter((k) => k !== "update_id"),
    });
    await next();
  });

  wireTelegramBot(bot, cfg, { telegramFetch: tgFetch });

  if (cfg.mode === "webhook") {
    await startTelegramWebhookServer(cfg, bot);
  } else {
    logLine({ msg: "assist_bot_start_enter" });
    // grammY ретраит deleteWebhook только по 5xx/429; ECONNRESET с прокси — через наш слой.
    await withTransientNetworkRetries(
      { msg: "assist_bot_delete_webhook_retry", logLine },
      cfg.telegramBootstrapMaxAttempts,
      cfg.telegramBootstrapRetryBaseMs,
      cfg.telegramBootstrapRetryMaxDelayMs,
      () => bot.api.deleteWebhook({ drop_pending_updates: false }),
    );
    const pollingTimeoutSec = cfg.agentProxyUrl ? 12 : 30;
    await bot.start({
      timeout: pollingTimeoutSec,
      onStart: (me) => {
        logLine({
          msg: "assist_polling_started",
          username: me.username,
          polling_timeout_sec: pollingTimeoutSec,
        });
      },
    });
  }
}

main().catch((e) => {
  try {
    fs.writeSync(2, `${JSON.stringify({ msg: "assist_fatal", err: String(e) })}\n`);
  } catch {
    // ignore
  }
  console.error(e);
  process.exitCode = 1;
});
