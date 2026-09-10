/**
 * The generic collection contract, in its first production instance.
 *
 * Thread 4 §04 L ratified one grammar for every collection: cursor pagination, a
 * deterministic `(updated_at, id)` order, a default of 50 and a maximum of 200.
 * Locations is the proof case, so this module is deliberately resource-agnostic —
 * the next resource reuses it rather than inventing its own paging.
 *
 * ── A CURSOR IS A POSITION, NOT A PERMISSION ──
 *
 * The cursor encodes only where the previous page stopped. It carries no tenant,
 * no boundary and no grant, and nothing downstream trusts it for authority: the
 * organization and the boundary are applied inside the SQL that selects rows, so
 * a forged or replayed cursor can move the window and can never widen it.
 *
 * ── WHY THE ID TIEBREAK IS NOT OPTIONAL ──
 *
 * `updated_at` alone is not unique. Two rows sharing a timestamp on a page
 * boundary would be silently skipped or repeated forever, and the caller would
 * have no way to detect it.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type Cursor = { sortKey: string; id: string };

export function encodeCursor(cursor: Cursor): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Returns null for anything that is not a well-formed cursor. Callers refuse; they never guess. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
    const value = (raw ?? "").trim();
    if (!value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
        if (!parsed || typeof parsed !== "object") return null;
        const { sortKey, id } = parsed as Record<string, unknown>;
        if (typeof sortKey !== "string" || typeof id !== "string") return null;
        if (!sortKey || !id) return null;
        if (Number.isNaN(new Date(sortKey).getTime())) return null;
        return { sortKey, id };
    } catch {
        return null;
    }
}

export type LimitResult = { ok: true; limit: number } | { ok: false; reason: string };

/**
 * A limit is clamped, never silently ignored — but a NONSENSE limit is refused.
 * Quietly turning `limit=abc` into 50 hides a client bug until it matters.
 */
export function resolveLimit(raw: string | null | undefined): LimitResult {
    if (raw === null || raw === undefined || raw === "") return { ok: true, limit: DEFAULT_PAGE_SIZE };
    if (!/^\d+$/.test(raw.trim())) return { ok: false, reason: "limit must be a positive integer" };
    const parsed = Number(raw.trim());
    if (parsed < 1) return { ok: false, reason: "limit must be at least 1" };
    return { ok: true, limit: Math.min(parsed, MAX_PAGE_SIZE) };
}

export type Page<T> = { data: T[]; next_cursor: string | null };

/**
 * Build a page. One extra row is fetched to decide whether another page exists,
 * so `next_cursor` is never returned for a page that would come back empty —
 * a caller should not have to make a request to learn there is nothing left.
 */
export function buildPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    return {
        data,
        next_cursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
    };
}
