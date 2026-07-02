/**
 * Canonical Workspace → Work Unit → Focus Panel runtime trace.
 *
 * These are PERMANENT, unconditional trace points at each canonical section
 * boundary of the golden flow. There is no flag and no debug mode — they always
 * emit so the full chain is observable in both the browser console and Vercel
 * server logs:
 *
 *   [alloy-runtime:WS.PROCESS_TILE_WORK_VIEWS]
 *     → [alloy-runtime:WU.ROUTE_RESOLVE]
 *       → [alloy-runtime:WU.HEADER]
 *         → [alloy-runtime:WU.QUEUE_REGION]
 *           → [alloy-runtime:WU.FOCUS_PANEL]
 *
 * PII rule (enforced by convention + tests): never log person names, emails,
 * phone numbers, or message contents. Only IDs, keys, labels, counts, booleans,
 * and URLs are permitted in a payload.
 *
 * Every payload carries a `source` describing where the values came from (e.g.
 * `configured_work_views`, `configured_work_units`) so the log proves the values
 * are config-driven, not hardcoded.
 */

export type AlloyRuntimeSection =
    | "WS.PROCESS_TILE_WORK_VIEWS"
    | "WU.ROUTE_RESOLVE"
    | "WU.HEADER"
    | "WU.QUEUE_REGION"
    | "WU.FOCUS_PANEL";

/** Payload key names that must never appear — a guard against accidental PII. */
const FORBIDDEN_PII_KEYS = new Set([
    "name",
    "full_name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "phone_number",
    "message",
    "message_body",
    "body",
    "notes",
]);

/** Last emitted signature per section — suppresses identical consecutive re-renders. */
const lastSignatureBySection = new Map<AlloyRuntimeSection, string>();

/**
 * Emit one structured runtime trace line for a canonical section boundary.
 * Identical consecutive payloads for the same section are suppressed so React
 * re-renders do not flood the log while still surfacing every real transition.
 */
export function alloyRuntimeTrace(
    section: AlloyRuntimeSection,
    payload: Record<string, unknown>,
): void {
    const safe = stripForbiddenKeys(payload);
    const signature = JSON.stringify(safe);
    if (lastSignatureBySection.get(section) === signature) return;
    lastSignatureBySection.set(section, signature);
    // eslint-disable-next-line no-console
    console.log(`[alloy-runtime:${section}]`, signature);
}

/** Remove any forbidden PII-shaped keys before emitting (defense in depth). */
function stripForbiddenKeys(payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (FORBIDDEN_PII_KEYS.has(key.toLowerCase())) continue;
        out[key] = value;
    }
    return out;
}

/** Derive a canonical work-view/lane slug from a generated href's last path segment. */
export function workViewSlugFromHref(href: string): string {
    const path = href.split("?")[0]?.split("#")[0] ?? href;
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
}

/** True when a generated href carries the forbidden `work_view=` or `queue=` params. */
export function hrefHasWorkViewOrQueueParam(href: string): boolean {
    return href.includes("work_view=") || href.includes("queue=");
}
