/**
 * Telegram: `undici` ProxyAgent + `undici.fetch`, сигнал grammY (abort-controller) — через мост
 * на нативный AbortSignal. Первый `getMe` при старте — отдельно, как Gemini: только нативный сигнал.
 */
import { undiciProxyAgentOptionsFromEnv } from "@shectory-assist/adapters-gemini/undici-proxy-opts";
import type { UserFromGetMe } from "grammy/types";
import { ProxyAgent, fetch as undiciFetch } from "undici";

export type TelegramFetch = typeof globalThis.fetch;

function requestUrl(input: Parameters<TelegramFetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return (input as Request).url;
}

/** grammY на Node использует `abort-controller`; `undici.fetch` требует нативный AbortSignal. */
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
  const dispatcher = new ProxyAgent(
    undiciProxyAgentOptionsFromEnv(uri, proxyConnectTimeoutMs),
  ) as import("undici").Dispatcher;

  const viaProxy = ((input: Parameters<TelegramFetch>[0], init?: Parameters<TelegramFetch>[1]) =>
    undiciFetch(requestUrl(input), {
      ...(init as object),
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])) as typeof fetch;

  return wireGrammyAbortSignalForUndici(viaProxy) as TelegramFetch;
}

/**
 * Первый getMe без grammY Api: тот же паттерн, что `geminiPostGenerateContent` (нативный AbortController + undici).
 */
export async function telegramGetMeWithNativeSignal(
  token: string,
  proxyUrl: string | undefined,
  proxyConnectTimeoutMs: number,
  deadlineMs: number,
): Promise<UserFromGetMe> {
  const url = `https://api.telegram.org/bot${token}/getMe`;
  const ac = new AbortController();
  const ms = Math.max(5_000, deadlineMs);
  const to = setTimeout(() => ac.abort(), ms);
  try {
    const opts: Parameters<typeof undiciFetch>[1] = {
      method: "GET",
      signal: ac.signal,
    };
    const uri = proxyUrl?.trim();
    if (uri) {
      opts.dispatcher = new ProxyAgent(
        undiciProxyAgentOptionsFromEnv(uri, proxyConnectTimeoutMs),
      ) as import("undici").Dispatcher;
    }
    const res = await undiciFetch(url, opts);
    const data = (await res.json()) as {
      ok: boolean;
      result?: UserFromGetMe;
      description?: string;
    };
    if (!data.ok || data.result === undefined) {
      throw new Error(data.description ?? "getMe_not_ok");
    }
    return data.result;
  } finally {
    clearTimeout(to);
  }
}

/** Для вызовов вне grammY (оркестратор / gazeta): чистый undici fetch + ProxyAgent. */
export function createUndiciProxiedFetch(
  proxyUrl: string | undefined,
  proxyConnectTimeoutMs: number,
): typeof fetch {
  const uri = proxyUrl?.trim();
  if (!uri) {
    return globalThis.fetch.bind(globalThis);
  }
  const dispatcher = new ProxyAgent(
    undiciProxyAgentOptionsFromEnv(uri, proxyConnectTimeoutMs),
  ) as import("undici").Dispatcher;

  return ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
    undiciFetch(input as string | URL, {
      ...(init as object),
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])) as typeof fetch;
}
