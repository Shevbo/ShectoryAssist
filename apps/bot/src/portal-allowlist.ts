export type AllowlistSnapshot = {
  restricted: boolean;
  allowedTelegramUserIds: string[];
};

const cache: { at: number; slug: string; snap: AllowlistSnapshot | null } = {
  at: 0,
  slug: "",
  snap: null,
};

const DEFAULT_TTL_MS = 60_000;

function cacheTtlMs(): number {
  const n = Number(process.env.PORTAL_ALLOWLIST_CACHE_MS ?? "");
  return Number.isFinite(n) && n >= 5_000 ? n : DEFAULT_TTL_MS;
}

/**
 * Читает allowlist из Shectory Portal (internal API). При отсутствии URL/секрета — null (= не ограничивать).
 */
export async function fetchAllowlistSnapshot(projectSlug: string): Promise<AllowlistSnapshot | null> {
  const base = process.env.PORTAL_ALLOWLIST_BASE_URL?.trim().replace(/\/$/, "");
  const secret = process.env.SHECTORY_AUTH_BRIDGE_SECRET?.trim();
  if (!base || !secret) {
    return null;
  }

  const now = Date.now();
  if (cache.slug === projectSlug && cache.snap && now - cache.at < cacheTtlMs()) {
    return cache.snap;
  }

  const url = `${base}/api/internal/assist-bot-allowlist?slug=${encodeURIComponent(projectSlug)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(Number(process.env.PORTAL_ALLOWLIST_TIMEOUT_MS ?? "8000")),
    });
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as Partial<AllowlistSnapshot>;
    const restricted = Boolean(j.restricted);
    const allowedTelegramUserIds = Array.isArray(j.allowedTelegramUserIds)
      ? j.allowedTelegramUserIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const snap: AllowlistSnapshot = { restricted, allowedTelegramUserIds };
    cache.at = now;
    cache.slug = projectSlug;
    cache.snap = snap;
    return snap;
  } catch {
    return null;
  }
}

export function isTelegramUserAllowed(
  telegramUserId: string,
  snap: AllowlistSnapshot | null,
  failOpen: boolean,
): { ok: boolean; reason?: string } {
  if (!snap) {
    return failOpen ? { ok: true } : { ok: false, reason: "allowlist_unavailable" };
  }
  if (!snap.restricted) {
    return { ok: true };
  }
  const set = new Set(snap.allowedTelegramUserIds);
  if (set.has(telegramUserId.trim())) {
    return { ok: true };
  }
  return { ok: false, reason: "not_in_allowlist" };
}
