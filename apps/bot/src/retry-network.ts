/**
 * Повторы при транзиентных сбоях до Telegram через прокси (ECONNRESET и т.п.).
 * grammY `withRetries` в `bot.start` / `init` ретраит в основном 5xx и 429, не обрыв соединения.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientTelegramNetworkError(err: unknown): boolean {
  const codes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
    "UND_ERR_SOCKET",
  ]);
  let cur: unknown = err;
  for (let d = 0; d < 8 && cur !== undefined && cur !== null; d++) {
    if (typeof cur === "object") {
      const o = cur as { code?: unknown; cause?: unknown };
      if (typeof o.code === "string" && codes.has(o.code)) {
        return true;
      }
      cur = o.cause;
    } else {
      break;
    }
  }
  const s = String(err);
  return s.includes("fetch failed") || s.includes("ECONNRESET") || s.includes("ECONNREFUSED");
}

export type RetryLog = (obj: Record<string, unknown>) => void;

/**
 * Выполняет `fn` до `maxAttempts` раз с экспоненциальной задержкой между попытками (потолок `maxDelayMs`).
 */
export async function withTransientNetworkRetries<T>(
  log: { msg: string; logLine: RetryLog },
  maxAttempts: number,
  baseDelayMs: number,
  maxDelayMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const n = Math.max(1, maxAttempts);
  const base = Math.max(50, baseDelayMs);
  const cap = Math.max(base, maxDelayMs);
  let last: unknown;
  for (let attempt = 1; attempt <= n; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable = attempt < n && isTransientTelegramNetworkError(e);
      if (!retryable) {
        throw e;
      }
      const delay = Math.min(cap, base * 2 ** (attempt - 1));
      log.logLine({
        msg: log.msg,
        attempt,
        max_attempts: n,
        delay_ms: delay,
        err: String(e),
      });
      await sleep(delay);
    }
  }
  throw last;
}
