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

export type Page<T> = { data: T[]; next_cursor: string | null; sync_token: string | null };

/**
 * Build a page. One extra row is fetched to decide whether another page exists,
 * so `next_cursor` is never returned for a page that would come back empty —
 * a caller should not have to make a request to learn there is nothing left.
 *
 * ── WHY A SYNC TOKEN EXISTS AS WELL AS A CURSOR ──
 *
 * `next_cursor` is null on the last page, which is correct for paging and useless for
 * synchronizing: at the exact moment a consumer finishes a pass and most needs to record where it
 * got to, the contract handed it nothing. The only checkpoint left was a timestamp, and a timestamp
 * cannot separate two rows that share one — which is the same reason the cursor carries an id.
 *
 * So every page also returns `sync_token`: the exact position of the last row it returned, in the
 * same encoding and with the same meaning as a cursor. It is present on the last page precisely
 * because that is the page worth remembering.
 */
export function buildPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    return {
        data,
        next_cursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
        sync_token: last ? encodeCursor(cursorOf(last)) : null,
    };
}

/**
 * Where a request starts, from whichever token the caller supplied.
 *
 * A cursor and a sync token are the same thing used at two timescales — a position within one pass
 * and a position between passes — and they are compared identically, so the platform resolves them
 * to ONE concept rather than growing two comparison paths that can disagree. A cursor wins when
 * both are present: it is the more specific statement about where this pass is.
 */
export type PositionResult = { ok: true; position: Cursor | null } | { ok: false; field: "cursor" | "since_token" };

export function resolvePosition(rawCursor: string | null | undefined, rawSyncToken: string | null | undefined): PositionResult {
    const cursorValue = (rawCursor ?? "").trim();
    if (cursorValue) {
        const cursor = decodeCursor(cursorValue);
        return cursor ? { ok: true, position: cursor } : { ok: false, field: "cursor" };
    }
    const tokenValue = (rawSyncToken ?? "").trim();
    if (tokenValue) {
        const token = decodeCursor(tokenValue);
        return token ? { ok: true, position: token } : { ok: false, field: "since_token" };
    }
    return { ok: true, position: null };
}

export type WatermarkResult = { ok: true; since: string | null } | { ok: false; reason: string };

/**
 * Parse an `updated_since` watermark.
 *
 * Requires an explicit offset or `Z`. A bare `2026-01-01T00:00:00` is ambiguous
 * — it means a different instant depending on who reads it — and silently
 * choosing UTC for a partner in another timezone would skip or re-deliver rows
 * near every boundary. Refusing is the only answer that cannot be quietly wrong.
 *
 * A FUTURE timestamp is accepted and simply matches nothing. It is not an error:
 * a partner whose clock runs fast is not making a malformed request, and the
 * honest response is an empty page they can act on.
 */
export function resolveUpdatedSince(raw: string | null | undefined): WatermarkResult {
    const value = (raw ?? "").trim();
    if (!value) return { ok: true, since: null };

    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
        return { ok: false, reason: "updated_since must include a timezone offset or Z" };
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return { ok: false, reason: "updated_since must be an ISO-8601 timestamp" };
    }
    /*
     * THE VALIDATED STRING, NOT THE RE-SERIALIZED INSTANT.
     *
     * This used to return `parsed.toISOString()`, and that single call was a correctness bug with a
     * partner-visible symptom. A JavaScript Date holds milliseconds; Postgres stores timestamptz to
     * microseconds. Normalizing `…:04.346845Z` to `…:04.346Z` moved the watermark BACKWARDS, so the
     * fact on the boundary was delivered again on the next sync — measured during Thread 7 slice
     * 7.1 and documented at the time as at-least-once.
     *
     * The parse still happens, because a value that cannot be parsed is still refused. What changed
     * is that the caller's own precision is carried through to the comparison instead of being
     * rounded off on the way. Postgres parses the offset forms this validator accepts, so nothing
     * needed a second normalizer — the honest fix was to stop normalizing.
     */
    return { ok: true, since: value };
}
