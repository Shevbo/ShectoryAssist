import type { SkillInput, SkillOutput } from "@shectory-assist/core";
import { parsePictureOfDayHtml } from "./parse-picture-of-day.js";

export type GazetaSkillConfig = {
  baseUrl?: string;
  userAgent: string;
  cacheTtlMs: number;
  maxGlobalFetchesPerMinute: number;
  maxTitles: number;
};

type CacheEntry = { html: string; expires: number };

let fetchCountWindowStart = 0;
let fetchCountInWindow = 0;

function allowGlobalFetch(windowMs: number, max: number): boolean {
  const now = Date.now();
  if (now - fetchCountWindowStart > windowMs) {
    fetchCountWindowStart = now;
    fetchCountInWindow = 0;
  }
  if (fetchCountInWindow >= max) {
    return false;
  }
  fetchCountInWindow += 1;
  return true;
}

export function createGazetaPictureOfDaySkill(config: GazetaSkillConfig) {
  const url = config.baseUrl ?? "https://www.gazeta.ru/";
  let cache: CacheEntry | null = null;

  return async function gazetaPictureOfDay(input: SkillInput): Promise<SkillOutput> {
    if (!allowGlobalFetch(60_000, config.maxGlobalFetchesPerMinute)) {
      return {
        messages: [
          {
            text: "Слишком частые запросы к источнику. Подожди минуту и попробуй снова.",
          },
        ],
        audioPolicy: "text_only",
        metadata: { rateLimited: true, traceId: input.traceId },
      };
    }

    const now = Date.now();
    let html: string;
    if (cache && cache.expires > now) {
      html = cache.html;
    } else {
      const res = await fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        return {
          messages: [
            {
              text: `Сайт Газеты вернул ошибку ${res.status}. Попробуй позже.`,
            },
          ],
          audioPolicy: "text_only",
          metadata: { httpStatus: res.status, traceId: input.traceId },
        };
      }
      html = await res.text();
      cache = { html, expires: now + config.cacheTtlMs };
    }

    const parsed = parsePictureOfDayHtml(html, { maxTitles: config.maxTitles });
    const textBlock =
      parsed.titles.length === 0
        ? "Не удалось получить заголовки блока «картина дня». Возможно, изменилась вёрстка сайта или доступ ограничен."
        : `Заголовки «картины дня» (Gazeta.ru):\n${parsed.titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

    return {
      messages: [{ text: textBlock }],
      audioPolicy: "prefer_voice",
      metadata: {
        parseEmpty: parsed.titles.length === 0,
        selector: parsed.usedSelector ?? "fallback_links",
        traceId: input.traceId,
      },
    };
  };
}
