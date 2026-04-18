/**
 * Telegram Bot API: без прокси — `globalThis.fetch`; с прокси — `node-fetch` + agent
 * (совместимо с abort-controller из grammY). `undici` fetch отвергает полифилл AbortSignal.
 */
import type { Agent } from "node:http";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

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

function buildProxyAgent(uri: string, proxyConnectTimeoutMs: number): Agent {
  const u = new URL(uri);
  const isSocks =
    u.protocol === "socks5:" || u.protocol === "socks4:" || u.protocol === "socks:";
  if (isSocks) {
    return new SocksProxyAgent(uri, { timeout: proxyConnectTimeoutMs }) as unknown as Agent;
  }
  return new HttpsProxyAgent(uri, { timeout: proxyConnectTimeoutMs }) as unknown as Agent;
}

export function createTelegramApiFetch(
  proxyUrl: string | undefined,
  proxyConnectTimeoutMs: number,
): TelegramFetch {
  const uri = proxyUrl?.trim();
  if (!uri) {
    return globalThis.fetch.bind(globalThis) as TelegramFetch;
  }
  const agent = buildProxyAgent(uri, proxyConnectTimeoutMs);
  return (async (input, init) => {
    const url = requestUrl(input);
    const res = await fetch(url, {
      ...(init as object),
      agent,
    } as import("node-fetch").RequestInit);
    return res as unknown as Awaited<ReturnType<TelegramFetch>>;
  }) as TelegramFetch;
}
