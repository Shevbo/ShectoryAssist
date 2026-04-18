/**
 * Telegram через тот же `ProxyAgent`, что и Gemini (`undici`), но вызов — `globalThis.fetch`
 * с `dispatcher` (в Node сигнал grammY совместим; пакетный `undici.fetch` — нет).
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

export type TelegramFetch = typeof globalThis.fetch;

/**
 * Дополнительный дедлайн на весь fetch (запас к client.timeoutSeconds grammY).
 */
export function wrapFetchWithDeadline(inner: TelegramFetch, deadlineMs: number): TelegramFetch {
  const ms = Math.max(5_000, deadlineMs);
  return ((input, init) => {
    const cap = AbortSignal.timeout(ms);
    const parent = init?.signal;
    const merged =
      parent !== undefined && parent !== null ? AbortSignal.any([cap, parent]) : cap;
    return inner(input, {
      ...init,
      signal: merged,
    });
  }) as TelegramFetch;
}

export function createTelegramApiFetch(
  proxyUrl: string | undefined,
  proxyConnectTimeoutMs: number,
): TelegramFetch {
  const uri = proxyUrl?.trim();
  if (!uri) {
    return globalThis.fetch.bind(globalThis) as TelegramFetch;
  }
  const dispatcher = new ProxyAgent({
    uri,
    proxyTls: { timeout: proxyConnectTimeoutMs },
  }) as import("undici").Dispatcher;

  const viaDispatcher = ((input: Parameters<TelegramFetch>[0], init?: Parameters<TelegramFetch>[1]) =>
    globalThis.fetch(input, {
      ...(init as object),
      dispatcher,
    } as unknown as RequestInit)) as typeof fetch;

  // Node global fetch обычно принимает сигнал grammY; undici.fetch — нет.
  return viaDispatcher as TelegramFetch;
}

/** Только для вызовов вне grammY (например оркестратор), где нужен чистый undici fetch. */
export function createUndiciProxiedFetch(
  proxyUrl: string | undefined,
  proxyConnectTimeoutMs: number,
): typeof fetch {
  const uri = proxyUrl?.trim();
  if (!uri) {
    return globalThis.fetch.bind(globalThis);
  }
  const dispatcher = new ProxyAgent({
    uri,
    proxyTls: { timeout: proxyConnectTimeoutMs },
  }) as import("undici").Dispatcher;

  return ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
    undiciFetch(input as string | URL, {
      ...(init as object),
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])) as typeof fetch;
}
