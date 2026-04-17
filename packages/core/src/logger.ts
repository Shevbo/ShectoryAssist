export type LogRecord = {
  level: "info" | "warn" | "error";
  msg: string;
  traceId: string;
  stage?: string;
  userId?: string;
  extra?: Record<string, string | number | boolean | null>;
};

export type Logger = (rec: LogRecord) => void;

export function createJsonLogger(out: Pick<typeof process, "stdout"> = process): Logger {
  return (rec: LogRecord) => {
    out.stdout.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        ...rec,
      })}\n`,
    );
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
