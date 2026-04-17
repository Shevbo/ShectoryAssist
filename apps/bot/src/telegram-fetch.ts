/**
 * Вызовы Telegram Bot API через undici + AGENT_PROXY (как Gemini).
 * Без прокси на многих площадках РФ api.telegram.org недоступен напрямую.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Дополнительный дедлайн на весь fetch: на части связок undici+Proxy игнорируется signal из grammY,
 * из‑за чего getMe может «висеть» дольше client.timeoutSeconds.
 */
export function wrapFetchWithDeadline(inner: typeof fetch, deadlineMs: number): typeof fetch {
  const ms = Math.max(5_000, deadlineMs);
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const cap = AbortSignal.timeout(ms);
    const parent = init?.signal;
    const merged =
      parent !== undefined && parent !== null ? AbortSignal.any([cap, parent]) : cap;
    return inner(input as string | URL, {
      ...(init as object),
      signal: merged,
    } as RequestInit);
  }) as typeof fetch;
}

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
