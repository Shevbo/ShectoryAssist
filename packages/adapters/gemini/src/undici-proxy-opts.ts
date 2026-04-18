import { ProxyAgent } from "undici";

export type UndiciProxyAgentOptions = ConstructorParameters<typeof ProxyAgent>[0];

/**
 * Опции undici `ProxyAgent` с учётом аутентификации (407 без логина в URL).
 *
 * - Учётные данные в `AGENT_PROXY` как `http://user:pass@host:port` — без изменений.
 * - Иначе: `AGENT_PROXY_TOKEN` — значение заголовка `Proxy-Authorization` (например `Basic …` или `Bearer …`).
 * - Иначе: `AGENT_PROXY_USER` и при необходимости `AGENT_PROXY_PASSWORD` — собирается `Basic` base64.
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

  const base: UndiciProxyAgentOptions = {
    uri,
    proxyTls: { timeout: proxyConnectTimeoutMs },
  };

  if (tokenEnv) {
    return { ...base, token: tokenEnv };
  }
  if (!parsed.username && userEnv) {
    return {
      ...base,
      token: `Basic ${Buffer.from(`${userEnv}:${passEnv}`, "utf8").toString("base64")}`,
    };
  }
  return base;
}
