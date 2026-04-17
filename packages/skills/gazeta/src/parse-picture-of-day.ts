import * as cheerio from "cheerio";

export type ParseResult = {
  titles: string[];
  usedSelector?: string;
};

const SELECTORS = [
  "[data-testid='picture-of-day'] a",
  "[data-testid=\"picture-of-day\"] a",
  ".b-day-topic a",
  ".day-topic a",
  "section[class*='picture'] a",
  ".l-day_top a",
  "main .b-day-topic a",
  ".l-col-main a[href*='/social/']",
  ".l-col-main a[href*='/politics/']",
  ".l-wrp a[href*='/social/']",
  ".b-story__title a",
  ".b-topic-latest a[href*='.shtml']",
];

function normalizeTitle(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function parsePictureOfDayHtml(
  html: string,
  options?: { maxTitles?: number },
): ParseResult {
  const maxTitles = options?.maxTitles ?? 20;
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const titles: string[] = [];

  for (const sel of SELECTORS) {
    $(sel).each((_i, el) => {
      const t = normalizeTitle($(el).text());
      if (t.length < 3) {
        return;
      }
      if (seen.has(t)) {
        return;
      }
      seen.add(t);
      titles.push(t);
    });
    if (titles.length > 0) {
      const clipped =
        titles.length > maxTitles
          ? [...titles.slice(0, maxTitles), `… и ещё ${titles.length - maxTitles}`]
          : titles;
      return { titles: clipped, usedSelector: sel };
    }
  }

  const hrefLooksLikeArticle = (href: string): boolean => {
    const h = href.trim();
    if (!h || h.startsWith("#") || h.startsWith("javascript:")) {
      return false;
    }
    return /\/(social|politics|business|culture|science|sport|news)\/[^"'?#]+\.shtml/i.test(h) || /\/news\/[^"'?#]+/i.test(h);
  };

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    if (!hrefLooksLikeArticle(href)) {
      return;
    }
    const t = normalizeTitle($(el).text());
    if (t.length < 10 || t.length > 200) {
      return;
    }
    if (/^(читать|подробнее|все новости|ещё)$/i.test(t)) {
      return;
    }
    if (seen.has(t)) {
      return;
    }
    seen.add(t);
    titles.push(t);
    if (titles.length >= maxTitles) {
      return false;
    }
    return undefined;
  });

  return { titles: titles.slice(0, maxTitles), usedSelector: "fallback_article_links" };
}

export function titlesToSpeechScript(titles: string[]): string {
  if (titles.length === 0) {
    return "Не удалось получить заголовки блока «картина дня». Возможно, изменилась вёрстка сайта или доступ ограничен.";
  }
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join(". ");
  return `Картина дня на Газете точка ру. ${list}`;
}
