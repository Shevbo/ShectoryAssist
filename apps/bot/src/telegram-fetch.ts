/**
 * Вызовы Telegram Bot API через undici + AGENT_PROXY (как Gemini).
 * Без прокси на многих площадках РФ api.telegram.org недоступен напрямую.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * grammY на Node тянет `abort-controller` + `node-fetch`; сигнал — не нативный `AbortSignal`.
 * `undici` fetch валидирует `init.signal` и падает с «Expected signal … instance of AbortSignal».
 * Пробрасываем отмену в нативный AbortController, который undici принимает.
 */
export function wireGrammyAbortSignalForUndici(inner: typeof fetch): typeof fetch {
  return (async (input, init) => {
    const parent = init?.signal;
    if (parent === undefined || parent === null) {
      return await inner(input as string | URL, init as RequestInit);
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
      return await inner(input as string | URL, {
        ...(init as object),
        signal: native.signal,
      } as RequestInit);
    } finally {
      parent.removeEventListener("abort", onParentAbort);
    }
  }) as typeof fetch;
}

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

  const viaProxy = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as string | URL, {
      ...(init as object),
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])) as typeof fetch;

  return wireGrammyAbortSignalForUndici(viaProxy);
}
