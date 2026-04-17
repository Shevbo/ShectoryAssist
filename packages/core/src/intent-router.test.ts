import { describe, expect, it } from "vitest";
import { normalizeUserTranscript, routeIntentRuleBased } from "./intent-router.js";

describe("routeIntentRuleBased", () => {
  it("detects gazeta picture of day", () => {
    expect(
      routeIntentRuleBased("Прочитай топики новостей с сайта gazeta.ru").intent,
    ).toBe("gazeta_picture_of_day");
  });
  it("detects help", () => {
    expect(routeIntentRuleBased("Что ты умеешь?").intent).toBe("help");
  });
  it("detects help with NBSP between words", () => {
    expect(routeIntentRuleBased("Что\u00a0ты\u00a0умеешь?").intent).toBe("help");
  });
  it("detects help without explicit ты", () => {
    expect(routeIntentRuleBased("Что умеешь?").intent).toBe("help");
  });
  it("normalizeUserTranscript collapses unicode spaces", () => {
    expect(normalizeUserTranscript("a\u00a0b")).toBe("a b");
  });
  it("unknown for empty", () => {
    expect(routeIntentRuleBased("   ").intent).toBe("unknown");
  });
});
