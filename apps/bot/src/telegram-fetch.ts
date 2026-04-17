/**
 * Вызовы Telegram Bot API через undici + AGENT_PROXY (как Gemini).
 * Без прокси на многих площадках РФ api.telegram.org недоступен напрямую.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

export function createTelegramApiFetch(proxyUrl: string | undefined, proxyConnectTimeoutMs: number): typeof fetch {
  const uri = proxyUrl?.trim();
  if (!uri) {
    return globalThis.fetch.bind(globalThis);
  }
  const dispatcher = new ProxyAgent({
    uri,
    proxyTls: { timeout: proxyConnectTimeoutMs },
  }) as import("undici").Dispatcher;

  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as string | URL, {
      ...(init as object),
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])) as typeof fetch;
}
