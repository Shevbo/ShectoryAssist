/**
 * HTTP к Generative Language API через undici + опциональный ProxyAgent —
 * тот же подход, что в экосистеме Shectory (`@shectory/gemini-proxy` / Ourdiary).
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

export function normalizeGeminiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  return (
    trimmed.replace(/\/v1beta\/openai.*$/i, "/v1beta").replace(/\/openai.*$/i, "") ||
    "https://generativelanguage.googleapis.com/v1beta"
  );
}

export function resolveAgentProxyUrl(): string | undefined {
  return (
    process.env.AGENT_PROXY?.trim() ||
    process.env.AGENT_HTTPS_PROXY?.trim() ||
    process.env.AGENT_HTTP_PROXY?.trim() ||
    undefined
  );
}

export type GeminiHttpConfig = {
  apiKey: string;
  baseUrl: string;
  proxyUrl?: string;
  requestTimeoutMs: number;
  proxyConnectTimeoutMs: number;
};

export async function geminiPostGenerateContent(
  http: GeminiHttpConfig,
  model: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: unknown; rawText: string }> {
  const cleanModel = model.replace(/^models\//, "");
  const url = `${http.baseUrl.replace(/\/$/, "")}/models/${cleanModel}:generateContent?key=${encodeURIComponent(http.apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), http.requestTimeoutMs);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-goog-api-key": http.apiKey,
  };
  const fetchOptions: Parameters<typeof undiciFetch>[1] & {
    dispatcher?: import("undici").Dispatcher;
  } = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal as AbortSignal,
  };
  if (http.proxyUrl?.trim()) {
    fetchOptions.dispatcher = new ProxyAgent({
      uri: http.proxyUrl.trim(),
      proxyTls: { timeout: http.proxyConnectTimeoutMs },
    }) as import("undici").Dispatcher;
  }

  try {
    const res = await undiciFetch(url, fetchOptions);
    const rawText = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText) as unknown;
    } catch {
      json = { parseError: true, snippet: rawText.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, json, rawText };
  } finally {
    clearTimeout(timeout);
  }
}
