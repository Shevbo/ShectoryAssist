import fs from "node:fs";
import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { createTelegramApiFetch } from "./telegram-fetch.js";
import { wireTelegramBot } from "./telegram-handlers.js";
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
  const tgFetch = createTelegramApiFetch(cfg.agentProxyUrl, cfg.agentProxyConnectTimeoutMs);
  logLine({ msg: "assist_telegram_client", viaProxy: Boolean(cfg.agentProxyUrl) });

  const bot = new Bot(cfg.telegramBotToken, {
    client: {
      fetch: tgFetch,
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
