import { Bot, InputFile, type Context } from "grammy";
import { createOrchestratorStack } from "./orchestrator-stack.js";
import type { BotConfig } from "./config.js";

function isOggOpus(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS";
}

function isMp3(buf: Buffer): boolean {
  return (
    (buf.length >= 3 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) ||
    (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
  );
}

async function downloadTelegramVoice(bot: Bot<Context>, filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`telegram_file_download:${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function wireTelegramBot(bot: Bot<Context>, cfg: BotConfig) {
  const { orchestrator, logger } = createOrchestratorStack(cfg);

  bot.catch((err) => {
    logger({
      level: "error",
      msg: "telegram_bot_error",
      traceId: "telegram",
      extra: { err: String(err) },
    });
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Я Shectory Assist. Голосом или текстом попроси прочитать «картину дня» с сайта gazeta.ru — озвучу заголовки. Можно спросить «что ты умеешь».",
    );
  });

  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    if (!msg) {
      return;
    }
    const traceId = `tg-${ctx.update.update_id}`;
    const userId = String(ctx.from?.id ?? "unknown");
    const locale = ctx.from?.language_code ?? "ru-RU";
    const messageKey = `${ctx.chat?.id ?? 0}:${msg.message_id}`;

    let audio: { buffer: Buffer; mimeType: string } | undefined;
    try {
      if (msg.voice) {
        const file = await ctx.getFile();
        if (file.file_path) {
          const buffer = await downloadTelegramVoice(bot, file.file_path);
          audio = { buffer, mimeType: msg.voice.mime_type ?? "audio/ogg" };
        }
      } else if (msg.audio) {
        const file = await ctx.getFile();
        if (file.file_path) {
          const buffer = await downloadTelegramVoice(bot, file.file_path);
          audio = {
            buffer,
            mimeType: msg.audio.mime_type ?? "audio/mpeg",
          };
        }
      }
    } catch (e) {
      logger({
        level: "warn",
        msg: "telegram_voice_download_failed",
        traceId,
        userId,
        extra: { err: String(e) },
      });
    }

    const text = "text" in msg ? msg.text : undefined;

    if (!audio && (!text || !text.trim())) {
      return;
    }

    const r = await orchestrator.handleUserMessageEvent({
      userId,
      locale,
      messageKey,
      traceId,
      audio,
      text: text ?? null,
    });

    if (!r.replyText && !r.replyAudio) {
      return;
    }

    logger({
      level: "info",
      msg: "pipeline_complete",
      traceId,
      userId,
      extra: {
        asrOk: r.metrics.asrOk,
        skillOk: r.metrics.skillOk,
        ttsOk: r.metrics.ttsOk,
        parseEmpty: r.metrics.parseEmpty ?? false,
      },
    });

    if (r.replyAudio && r.replyAudio.byteLength > 0) {
      const buf = r.replyAudio;
      try {
        if (isOggOpus(buf)) {
          await ctx.replyWithVoice(new InputFile(buf, "reply.ogg"), {
            caption: r.replyText.length > 1024 ? `${r.replyText.slice(0, 1020)}…` : r.replyText,
          });
          return;
        }
        if (isMp3(buf)) {
          await ctx.replyWithAudio(new InputFile(buf, "reply.mp3"), {
            caption: r.replyText.length > 1024 ? `${r.replyText.slice(0, 1020)}…` : r.replyText,
          });
          return;
        }
      } catch (e) {
        logger({
          level: "warn",
          msg: "telegram_voice_send_failed",
          traceId,
          userId,
          extra: { err: String(e) },
        });
      }
      await ctx.replyWithDocument(new InputFile(buf, "reply.bin"), {
        caption: r.replyText.length > 1024 ? `${r.replyText.slice(0, 1020)}…` : r.replyText,
      });
      return;
    }

    await ctx.reply(r.replyText);
  });
}
