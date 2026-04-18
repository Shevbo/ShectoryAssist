import { ProxyAgent } from "undici";

export type UndiciProxyAgentOptions = ConstructorParameters<typeof ProxyAgent>[0];

function stripUrlCredentials(parsed: URL): string {
  const u = new URL(parsed.href);
  u.username = "";
  u.password = "";
  return u.href;
}

/**
 * Опции undici `ProxyAgent` с учётом аутентификации (407).
 *
 * Для HTTP(S)-прокси с `user:pass` в URL явно выставляем `token` (Basic) и URI без
 * userinfo — иначе часть версий undici даёт CONNECT без `Proxy-Authorization`.
 *
 * - `AGENT_PROXY_TOKEN` — полное значение `Proxy-Authorization`.
 * - Иначе `AGENT_PROXY_USER` / `AGENT_PROXY_PASSWORD` при URL без логина.
 * - SOCKS: URL без изменений (учёт SOCKS5 в undici).
 */
export function undiciProxyAgentOptionsFromEnv(
  proxyUrl: string,
  proxyConnectTimeoutMs: number,
): UndiciProxyAgentOptions {
  const uri = proxyUrl.trim();
  const parsed = new URL(uri);
  const tokenEnv = process.env.AGENT_PROXY_TOKEN?.trim();
  const userEnv = process.env.AGENT_PROXY_USER?.trim();
  const passEnv = process.env.AGENT_PROXY_PASSWORD ?? "";

  const proxyTls = { timeout: proxyConnectTimeoutMs };
  const isSocks = parsed.protocol === "socks5:" || parsed.protocol === "socks:";

  if (isSocks) {
    return { uri, proxyTls };
  }

  if (tokenEnv) {
    return {
      uri: stripUrlCredentials(parsed),
      proxyTls,
      token: tokenEnv,
    };
  }

  if (parsed.username) {
    const user = decodeURIComponent(parsed.username);
    const pass = decodeURIComponent(parsed.password || "");
    return {
      uri: stripUrlCredentials(parsed),
      proxyTls,
      token: `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`,
    };
  }

  if (userEnv) {
    return {
      uri,
      proxyTls,
      token: `Basic ${Buffer.from(`${userEnv}:${passEnv}`, "utf8").toString("base64")}`,
    };
  }

  return { uri, proxyTls };
}
