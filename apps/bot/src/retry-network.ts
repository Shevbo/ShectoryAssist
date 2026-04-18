/**
 * Повторы при транзиентных сбоях до Telegram через прокси (ECONNRESET и т.п.).
 * grammY `withRetries` в `bot.start` / `init` ретраит в основном 5xx и 429, не обрыв соединения.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapGrammyHttpError(err: unknown): unknown {
  if (typeof err !== "object" || err === null) {
    return err;
  }
  const o = err as { name?: string; error?: unknown };
  if (o.name === "HttpError" && o.error !== undefined) {
    return unwrapGrammyHttpError(o.error);
  }
  return err;
}

function isTransientTelegramNetworkError(err: unknown): boolean {
  const root = unwrapGrammyHttpError(err);
  const codes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
    "UND_ERR_SOCKET",
  ]);
  let cur: unknown = root;
  for (let d = 0; d < 10 && cur !== undefined && cur !== null; d++) {
    if (typeof cur === "object") {
      const o = cur as { code?: unknown; cause?: unknown; message?: unknown };
      if (typeof o.code === "string" && codes.has(o.code)) {
        return true;
      }
      const msg = typeof o.message === "string" ? o.message : "";
      if (msg.includes("timed out") || msg.includes("Time-out")) {
        return true;
      }
      if (msg === "Request was cancelled" || msg.includes("Request was cancelled")) {
        return true;
      }
      cur = o.cause;
    } else {
      break;
    }
  }
  const s = String(root);
  return (
    s.includes("fetch failed") ||
    s.includes("ECONNRESET") ||
    s.includes("ECONNREFUSED") ||
    s.includes("Request was cancelled") ||
    s.includes("timed out")
  );
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
