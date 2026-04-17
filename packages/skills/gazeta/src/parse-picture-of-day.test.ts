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
});
