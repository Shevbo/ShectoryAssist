import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePictureOfDayHtml, titlesToSpeechScript } from "./parse-picture-of-day.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("parsePictureOfDayHtml", () => {
  it("parses fixture snapshot", () => {
    const html = readFileSync(join(__dirname, "../fixtures/gazeta-home-sample.html"), "utf-8");
    const r = parsePictureOfDayHtml(html);
    expect(r.titles).toContain("Тестовый заголовок один");
    expect(r.titles).toContain("Тестовый заголовок два");
    expect(r.usedSelector).toBe("[data-testid='picture-of-day'] a");
  });

  it("speech script mentions empty state", () => {
    expect(titlesToSpeechScript([])).toMatch(/Не удалось/);
  });

  it("fallback picks article links in main", () => {
    const html = `<html><body><main>
      <a href="/social/99999999/some-article.shtml">Заголовок статьи для теста</a>
      <a href="/politics/88888888/other.shtml">Вторая новость тестовая</a>
    </main></body></html>`;
    const r = parsePictureOfDayHtml(html, { maxTitles: 10 });
    expect(r.titles).toContain("Заголовок статьи для теста");
    expect(r.titles).toContain("Вторая новость тестовая");
    expect(r.usedSelector).toBe("fallback_article_links");
  });
});
