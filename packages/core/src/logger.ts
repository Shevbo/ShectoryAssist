import fs from "node:fs";

export type LogRecord = {
  level: "info" | "warn" | "error";
  msg: string;
  traceId: string;
  stage?: string;
  userId?: string;
  extra?: Record<string, string | number | boolean | null>;
};

export type Logger = (rec: LogRecord) => void;

/**
 * Writes one JSON line per call with fs.writeSync so logs appear immediately
 * under PM2 (stdout connected to a pipe is often fully buffered).
 */
export function createJsonLogger(): Logger {
  return (rec: LogRecord) => {
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      ...rec,
    })}\n`;
    try {
      fs.writeSync(1, line);
    } catch {
      // EPIPE / closed fd — ignore
    }
  };
}

/** Avoid logging full user content in traces. */
export function clipText(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}
