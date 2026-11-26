/**
 * Browser-history destination stamping (B2) — the canonical fix for Back/Forward restoration.
 *
 * The URL is a projection, not the identity (Art 2.4): a pill-switched Work View and two slug forms
 * of one destination are URL-ambiguous, so `attentionFromUrl` alone cannot key `surfaceIdFor`
 * canonically on `popstate` — it falls back to `target::lens` and the Host rebuilds or shows a mixed
 * frame across history. K3 already writes the projected URL at commit; here it ALSO stamps the
 * committed `DestinationId` into `history.state` (alongside Next's own internals, never replacing
 * them). On `popstate` the stamp is read back and the exact destination is restored — including the
 * pill views and default-subject the URL cannot express.
 *
 * Pure module: no DOM, no React. The Surface Host binds it to `window.history`; the value semantics
 * are certified in isolation.
 */

import {
    type DestinationId,
    destinationIdKey,
    parseDestinationIdKey,
} from "@/lib/runtime/graph/destinationId";

/** The single reserved key under which K3's committed destination lives in `history.state`. */
export const ALLOY_HISTORY_DESTINATION_KEY = "__alloyDest";

/** Read the stamped destination from a `history.state` value; `null` when absent or malformed. */
export function readHistoryDestination(state: unknown): DestinationId | null {
    if (!state || typeof state !== "object") return null;
    const raw = (state as Record<string, unknown>)[ALLOY_HISTORY_DESTINATION_KEY];
    return typeof raw === "string" ? parseDestinationIdKey(raw) : null;
}

/**
 * Merge the committed destination into a `history.state` value WITHOUT disturbing any other owner's
 * fields (Next.js keeps its router tree here). A `null` destination clears the stamp — a return to
 * the Workspace, or an error terminal, must never leave a stale destination on the entry.
 */
export function stampHistoryDestination(prevState: unknown, dest: DestinationId | null): Record<string, unknown> {
    const next: Record<string, unknown> =
        prevState && typeof prevState === "object" ? { ...(prevState as Record<string, unknown>) } : {};
    if (dest) next[ALLOY_HISTORY_DESTINATION_KEY] = destinationIdKey(dest);
    else delete next[ALLOY_HISTORY_DESTINATION_KEY];
    return next;
}
