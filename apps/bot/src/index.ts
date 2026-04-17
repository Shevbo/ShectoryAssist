import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { createTelegramApiFetch } from "./telegram-fetch.js";
import { wireTelegramBot } from "./telegram-handlers.js";
import { startTelegramWebhookServer } from "./webhook-server.js";

async function main() {
  const cfg = loadConfig();
  const tgFetch = createTelegramApiFetch(cfg.agentProxyUrl, cfg.agentProxyConnectTimeoutMs);
  if (cfg.agentProxyUrl) {
    console.log(JSON.stringify({ msg: "assist_telegram_client", viaProxy: true }));
  } else {
    console.log(JSON.stringify({ msg: "assist_telegram_client", viaProxy: false }));
  }

  const bot = new Bot(cfg.telegramBotToken, {
    client: {
      fetch: tgFetch,
    },
  });
  wireTelegramBot(bot, cfg, { telegramFetch: tgFetch });

  if (cfg.mode === "webhook") {
    await startTelegramWebhookServer(cfg, bot);
  } else {
    await bot.start();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
