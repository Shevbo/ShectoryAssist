import { Bot } from "grammy";
import { loadConfig } from "./config.js";
import { wireTelegramBot } from "./telegram-handlers.js";
import { startTelegramWebhookServer } from "./webhook-server.js";

async function main() {
  const cfg = loadConfig();
  const bot = new Bot(cfg.telegramBotToken);
  wireTelegramBot(bot, cfg);

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
