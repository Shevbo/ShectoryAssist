import fs from "node:fs";
import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { createTelegramApiFetch, wrapFetchWithDeadline } from "./telegram-fetch.js";
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
  const innerFetch = createTelegramApiFetch(cfg.agentProxyUrl, cfg.agentProxyConnectTimeoutMs);
  const tgFetch = wrapFetchWithDeadline(
    innerFetch,
    cfg.telegramApiTimeoutSeconds * 1000 + 2_000,
  );
  logLine({
    msg: "assist_telegram_client",
    viaProxy: Boolean(cfg.agentProxyUrl),
    telegram_api_timeout_sec: cfg.telegramApiTimeoutSeconds,
  });

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
    logLine({ msg: "assist_bot_init_begin" });
    await bot.init();
    logLine({ msg: "assist_bot_init_ok", username: bot.botInfo.username, bot_id: bot.botInfo.id });
    await startTelegramWebhookServer(cfg, bot);
  } else {
    logLine({ msg: "assist_bot_start_enter" });
    // До start grammY параллелит getMe и deleteWebhook; под PM2 это иногда «виснет» без long poll.
    // Явный init: второй этап start делает только deleteWebhook.
    logLine({ msg: "assist_bot_init_begin" });
    await bot.init();
    logLine({
      msg: "assist_bot_init_ok",
      username: bot.botInfo.username,
      bot_id: bot.botInfo.id,
    });
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
