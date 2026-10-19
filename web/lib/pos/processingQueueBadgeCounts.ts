/**
 * WHAT THE INCOMING AND COMPLETED BADGES COUNT.
 *
 * Incoming is every case still open — received, processing, needs_review, needs_resolution, ready —
 * whatever its category. Category folders (Enrollment, …) are overlapping LENSES over the same open
 * cases, not a partition: an open enrollment submission is in Incoming AND in Enrollment, and leaves
 * both, into Completed, when it is approved.
 *
 * The rail used to count the rows it had loaded — the newest page (25 rows) — so Incoming stopped at
 * 25 and a new submission never moved it. The queue endpoint already returns org-wide counts by
 * status; the two status-defined folders read those. Category folders have no server count and stay
 * on loaded rows (a lower bound the rail does not claim is a total).
 */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["completed", "archived"]);
/**
 * Not a status: the evidence-only cases (family or child no longer exists). The status counts already
 * exclude them, and they are neither incoming nor completed — they have their own folder.
 */
const NOT_A_STATUS: ReadonlySet<string> = new Set(["subject_removed"]);

export function processingStatusFolderCounts(
    serverCounts: Record<string, number> | null | undefined,
    loaded: { incoming: number; completed: number },
): { incoming: number; completed: number } {
    const entries = Object.entries(serverCounts ?? {}).filter(([, n]) => typeof n === "number" && Number.isFinite(n));
    if (entries.length === 0) return loaded;
    let incoming = 0;
    let completed = 0;
    for (const [status, n] of entries) {
        if (NOT_A_STATUS.has(status)) continue;
        if (CLOSED_STATUSES.has(status)) completed += n;
        else incoming += n;
    }
    // Never report fewer than are on screen (a count read a moment before a new row arrived).
    return { incoming: Math.max(incoming, loaded.incoming), completed: Math.max(completed, loaded.completed) };
}
