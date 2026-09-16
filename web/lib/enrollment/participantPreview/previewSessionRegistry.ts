import type { PreviewBootstrap } from "@/lib/enrollment/participantPreview/bootstrapPreviewSession";

/**
 * Where a preview conversation lives between turns.
 *
 * A conversation is stateful and HTTP is not, so something has to hold the session across requests.
 * In production that something is a row. For preview it is this map — process memory, scoped to one
 * admin, evicted on a timer. Nothing here survives a restart, which is the correct durability for a
 * thing that is explicitly not a record.
 *
 * SINGLE PROCESS. A preview started on one server process is continued on that process. The QA and
 * development servers are single-process, so this holds; a multi-process deployment would drop a
 * preview mid-conversation and the caller would be told to start again rather than shown wrong
 * state. Said plainly here because it is the one property of this file that is an assumption
 * rather than a guarantee.
 */

type Entry = { bootstrap: PreviewBootstrap; orgId: string; touchedAt: number };

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 50;

const registry = new Map<string, Entry>();

function evictStale(now: number) {
    for (const [id, e] of registry) if (now - e.touchedAt > TTL_MS) registry.delete(id);
    // A preview nobody returned to must not keep a Form schema alive forever.
    while (registry.size > MAX_ENTRIES) {
        const oldest = [...registry.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
        if (!oldest) break;
        registry.delete(oldest[0]);
    }
}

export function putPreview(id: string, bootstrap: PreviewBootstrap, orgId: string): void {
    const now = Date.now();
    evictStale(now);
    registry.set(id, { bootstrap, orgId, touchedAt: now });
}

/** Scoped by org: a preview id from one organization never resolves for another. */
export function getPreview(id: string, orgId: string): PreviewBootstrap | null {
    const now = Date.now();
    evictStale(now);
    const e = registry.get(id);
    if (!e || e.orgId !== orgId) return null;
    e.touchedAt = now;
    return e.bootstrap;
}

export function dropPreview(id: string): void {
    registry.delete(id);
}
