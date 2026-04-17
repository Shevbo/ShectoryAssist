import type { SkillInput, SkillOutput } from "@shectory-assist/core";
import { parsePictureOfDayHtml } from "./parse-picture-of-day.js";

export type GazetaSkillConfig = {
  baseUrl?: string;
  userAgent: string;
  cacheTtlMs: number;
  maxGlobalFetchesPerMinute: number;
  maxTitles: number;
  /** По умолчанию global fetch; на сервере без прямого доступа к gazeta.ru задайте тот же прокси, что для Gemini. */
  fetch?: typeof fetch;
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

function isLikelyAntiBotHtml(html: string): boolean {
  const head = html.slice(0, 30_000).toLowerCase();
  return (
    head.includes("unity-id") ||
    head.includes("unity_gazeta_redirect") ||
    head.includes("machineclick=aggressivelogin") ||
    (html.length < 5000 && head.includes("location.replace") && !head.includes("b-day-topic"))
  );
}

export function createGazetaPictureOfDaySkill(config: GazetaSkillConfig) {
  const url = config.baseUrl ?? "https://www.gazeta.ru/";
  const httpFetch = config.fetch ?? globalThis.fetch.bind(globalThis);
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
      const res = await httpFetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
          Referer: "https://www.gazeta.ru/",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        return {
          messages: [
            {
              text: `Сайт Газеты вернул ошибку ${res.status}. Попробуй позже. Если сервер в датацентре без доступа к gazeta.ru, задайте AGENT_PROXY (тот же, что для Telegram/Gemini).`,
            },
          ],
          audioPolicy: "text_only",
          metadata: { httpStatus: res.status, traceId: input.traceId },
        };
      }
      html = await res.text();
      cache = { html, expires: now + config.cacheTtlMs };
    }

    if (isLikelyAntiBotHtml(html)) {
      return {
        messages: [
          {
            text:
              "Gazeta.ru отдала страницу авторизации или антибот вместо ленты — из такого HTML заголовки не извлечь. Попробуй с AGENT_PROXY или позже. Обычные вопросы могу обсудить текстом без этого сайта.",
          },
        ],
        audioPolicy: "text_only",
        metadata: { parseEmpty: true, antiBot: true, traceId: input.traceId },
      };
    }

    const parsed = parsePictureOfDayHtml(html, { maxTitles: config.maxTitles });
    const textBlock =
      parsed.titles.length === 0
        ? "Не удалось получить заголовки блока «картина дня»: вёрстка изменилась, сайт отдал заглушку или доступ с этого IP ограничен. Задайте AGENT_PROXY (как для Gemini), обновите GAZETA_USER_AGENT или попробуйте позже. Другие темы могу обсудить текстом."
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
