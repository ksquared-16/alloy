/**
 * Apply manual waitlist positions as COHORT-LOCAL PLACEMENTS.
 *
 * ── WHY THIS IS A PLACEMENT PASS AND NOT A SORT KEY ──
 *
 * A pin says "put this candidate at position N of its own cohort". That is a statement about where
 * a row sits in an order, not a component of the order. It cannot be expressed as a per-row sort
 * key, because a per-row value cannot know how many unpinned rows precede it.
 *
 * The previous implementation tried anyway: it spliced `pin_ordinal` into `sort_tuple` for pinned
 * candidates only, so the comparison ran `pin_ordinal` against `bucket.priority_order` and every
 * ordinal below that constant collapsed to the same answer. Measured on deployed staging, pinning a
 * row to 2, 5 or 12 produced an identical position — the engine could only hear "ahead of the
 * unpinned rows". See `applyPlacementCandidateOverrides` for the tuple evidence.
 *
 * So the natural order is decided first, by the canonical tuple comparison, and this pass then
 * places pinned rows into it. There is no second ranking algorithm here: this consults no facts, no
 * priority, no bucket and no tie-breaker. It only moves rows the operator explicitly asked to move,
 * within the cohort they already belong to.
 *
 * ── GUARANTEES ──
 *
 * - Sections and cohorts are never crossed. A row is placed among its OWN cohort members and the
 *   cohort occupies exactly the slots it occupied before.
 * - Unpinned rows keep their natural relative order, always.
 * - Two pins are deterministic: ascending ordinal, ties broken by the incoming (canonical) order.
 * - An ordinal past the end of the cohort clamps to last; below 1 clamps to first. The control
 *   already refuses to offer those, so clamping is a safety net, not a feature.
 * - No pins in a cohort means the cohort array is returned untouched.
 */
import type { PlacementPriorityV2CandidatePreview } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";

type Row = Record<string, unknown>;

/** The cohort a candidate row belongs to, normalized exactly as the canonical sorter groups by. */
export function readRowCohortKey(row: Row): string | null {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return null;
    const o = wr as { program_room_cohort_key?: string; program_room_group_label?: string };
    const { cohortKey } = normalizePlacementWaitlistCohort(o.program_room_cohort_key, o.program_room_group_label);
    return cohortKey?.trim() ? cohortKey.trim() : null;
}

/**
 * The operator's requested cohort-local position for a row, or null when none is in force.
 *
 * A released or inactive override never reaches the projection, so its absence here IS the
 * "cleared adjustment" behaviour — no special case is needed for reset.
 */
export function readRowManualPinOrdinal(row: Row): number | null {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return null;
    const pv2 = (wr as { placement_priority_v2?: Partial<PlacementPriorityV2CandidatePreview> })
        .placement_priority_v2;
    const ord = pv2?.manual_pin_ordinal;
    if (typeof ord !== "number" || !Number.isFinite(ord)) return null;
    const n = Math.trunc(ord);
    return n >= 1 ? n : null;
}

/**
 * Reposition pinned rows to their requested ordinals within each contiguous cohort run.
 *
 * `rows` must already be in canonical order (section, then cohort, then priority tuple) — this pass
 * relies on cohort members being contiguous, which is exactly what the canonical sorter produces.
 * Returns a new array; the input rows are not mutated.
 */
export function applyCohortLocalManualPositions(rows: Row[]): Row[] {
    if (rows.length < 2) return [...rows];

    const out: Row[] = [];
    let i = 0;
    while (i < rows.length) {
        const cohort = readRowCohortKey(rows[i]!);
        // A row with no cohort cannot host a cohort-local move; pass it through untouched.
        if (cohort == null) {
            out.push(rows[i]!);
            i += 1;
            continue;
        }
        let j = i;
        while (j < rows.length && readRowCohortKey(rows[j]!) === cohort) j += 1;
        out.push(...placeWithinCohort(rows.slice(i, j)));
        i = j;
    }
    return out;
}

/** Place one cohort's pinned rows at their requested ordinals, preserving natural order elsewhere. */
function placeWithinCohort(group: Row[]): Row[] {
    const pinned: Array<{ row: Row; ordinal: number; naturalIndex: number }> = [];
    const unpinned: Row[] = [];

    group.forEach((row, naturalIndex) => {
        const ordinal = readRowManualPinOrdinal(row);
        if (ordinal == null) unpinned.push(row);
        else pinned.push({ row, ordinal, naturalIndex });
    });

    if (pinned.length === 0) return [...group];

    // Ascending ordinal; equal ordinals keep the canonical order they arrived in, so two operators
    // pinning the same number produce a stable answer rather than an arbitrary one.
    pinned.sort((a, b) => a.ordinal - b.ordinal || a.naturalIndex - b.naturalIndex);

    const placed: Row[] = [...unpinned];
    // Seats are filled in ascending ordinal order and never move backwards. `lastSeated` is what
    // makes two pins requesting the SAME ordinal deterministic: the second is seated immediately
    // after the first, in canonical order, instead of displacing it. Clamping to `placed.length`
    // means an ordinal past the end of the cohort lands last rather than being silently lost.
    let lastSeated = -1;
    for (const { row, ordinal } of pinned) {
        const index = Math.min(Math.max(ordinal - 1, lastSeated + 1), placed.length);
        placed.splice(index, 0, row);
        lastSeated = index;
    }
    return placed;
}
