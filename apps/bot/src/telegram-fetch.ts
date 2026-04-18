/**
 * Telegram через тот же `ProxyAgent`, что и Gemini (`undici`), но вызов — `globalThis.fetch`
 * с `dispatcher` (совместимость сигналов с grammY лучше, чем у `undici.fetch`).
 * Полифилл `abort-controller` из grammY не подходит для `undici` fetch — мостим в нативный сигнал.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

export type TelegramFetch = typeof globalThis.fetch;

export function wireGrammyAbortSignalForUndici(inner: typeof fetch): typeof fetch {
  return (async (input, init) => {
    const parent = init?.signal;
    if (parent === undefined || parent === null) {
      return await inner(input, init);
    }
    const native = new AbortController();
    const onParentAbort = () => {
      native.abort();
    };
    if (parent.aborted) {
      native.abort();
    } else {
      parent.addEventListener("abort", onParentAbort, { once: true });
    }
    try {
      return await inner(input, {
        ...init,
        signal: native.signal,
      });
    } finally {
      parent.removeEventListener("abort", onParentAbort);
    }
  }) as typeof fetch;
}

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

  return wireGrammyAbortSignalForUndici(viaDispatcher) as TelegramFetch;
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
