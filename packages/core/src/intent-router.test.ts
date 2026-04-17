import { describe, expect, it } from "vitest";
import { routeIntentRuleBased } from "./intent-router.js";

describe("routeIntentRuleBased", () => {
  it("detects gazeta picture of day", () => {
    expect(
      routeIntentRuleBased("Прочитай топики новостей с сайта gazeta.ru").intent,
    ).toBe("gazeta_picture_of_day");
  });
  it("detects help", () => {
    expect(routeIntentRuleBased("Что ты умеешь?").intent).toBe("help");
  });
  it("unknown for empty", () => {
    expect(routeIntentRuleBased("   ").intent).toBe("unknown");
  });
});
