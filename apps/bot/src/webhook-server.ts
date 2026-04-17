import Fastify from "fastify";
import type { Bot, Context } from "grammy";
import type { Update } from "grammy/types";
import type { BotConfig } from "./config.js";

export async function startTelegramWebhookServer(cfg: BotConfig, bot: Bot<Context>) {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "shectory-assist-telegram" }));

  app.post("/telegram/webhook", async (req, reply) => {
    if (cfg.telegramWebhookSecret) {
      const token = req.headers["x-telegram-bot-api-secret-token"];
      if (token !== cfg.telegramWebhookSecret) {
        return reply.code(401).send({ ok: false });
      }
    }
    const update = req.body as Update;
    await bot.handleUpdate(update);
    return reply.code(200).send({ ok: true });
  });

  await app.listen({ port: cfg.port, host: "0.0.0.0" });
}
