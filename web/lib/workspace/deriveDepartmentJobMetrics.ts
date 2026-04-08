/**
 * Lightweight client-side derivations for Operations workspace signals.
 * Uses the same job list shapes returned by GET /api/admin/jobs (enriched rows).
 * Counts are based on the fetched sample (max 200 per request) — pragmatic, not a full analytics roll-up.
 */

export type JobRowForWorkspaceMetrics = {
    id: string;
    work_unit_id?: string | null;
    gross_price_cents?: number | null;
    /** Next future schedule start from jobs list enrichment. */
    _next_schedule?: string | null;
    receivable_outstanding_cents?: number | null;
};

function localDayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** True when the ISO timestamp falls on the same local calendar day as `now`. */
export function isScheduledLocalDay(iso: string | null | undefined, now: Date): boolean {
    if (!iso) return false;
    const t = new Date(iso);
    return localDayKey(t) === localDayKey(now);
}

/** Jobs that should surface for follow-up: overdue next visit, or money owed. */
export function jobNeedsAttention(j: JobRowForWorkspaceMetrics): boolean {
    const outstanding = j.receivable_outstanding_cents ?? 0;
    if (outstanding > 0) return true;
    if (j._next_schedule) {
        if (new Date(j._next_schedule).getTime() < Date.now()) return true;
    }
    return false;
}

const HIGH_VALUE_MIN_CENTS = 300 * 100; // $300 — opinionated floor for “big ticket” triage

/** High-value jobs that still need movement (unassigned or money at risk). */
export function jobHighTouchAttention(j: JobRowForWorkspaceMetrics): boolean {
    const g = j.gross_price_cents ?? 0;
    if (g < HIGH_VALUE_MIN_CENTS) return false;
    const outstanding = j.receivable_outstanding_cents ?? 0;
    const unassigned = j.work_unit_id == null;
    return unassigned || outstanding > 0;
}

export function mergeJobListsById(
    a: JobRowForWorkspaceMetrics[],
    b: JobRowForWorkspaceMetrics[]
): JobRowForWorkspaceMetrics[] {
    const map = new Map<string, JobRowForWorkspaceMetrics>();
    for (const j of a) map.set(j.id, j);
    for (const j of b) map.set(j.id, j);
    return [...map.values()];
}

export function computeOperationsSignalCounts(merged: JobRowForWorkspaceMetrics[], now: Date) {
    let scheduledToday = 0;
    let needsAttention = 0;
    let highTouch = 0;
    for (const j of merged) {
        if (isScheduledLocalDay(j._next_schedule ?? null, now)) scheduledToday += 1;
        if (jobNeedsAttention(j)) needsAttention += 1;
        if (jobHighTouchAttention(j)) highTouch += 1;
    }
    return { scheduledToday, needsAttention, highTouch };
}

export function filterJobsScheduledToday<T extends JobRowForWorkspaceMetrics>(rows: T[], now: Date): T[] {
    return rows.filter((j) => isScheduledLocalDay(j._next_schedule ?? null, now));
}

export function filterJobsNeedsAttention<T extends JobRowForWorkspaceMetrics>(rows: T[]): T[] {
    return rows.filter(jobNeedsAttention);
}
