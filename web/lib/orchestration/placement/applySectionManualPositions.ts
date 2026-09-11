/**
 * Apply manual waitlist positions as SECTION-LOCAL PLACEMENTS.
 *
 * ── WHY THIS IS A PLACEMENT PASS AND NOT A SORT KEY ──
 *
 * A pin says "put this candidate at position N of the list the operator is reading". That is a
 * statement about where a row sits in an order, not a component of the order. It cannot be
 * expressed as a per-row sort key, because a per-row value cannot know how many unpinned rows
 * precede it.
 *
 * An earlier implementation tried anyway: it spliced `pin_ordinal` into `sort_tuple` for pinned
 * candidates only, so the comparison ran `pin_ordinal` against `bucket.priority_order` and every
 * ordinal below that constant collapsed to the same answer. Measured on deployed staging, pinning a
 * row to 2, 5 or 12 produced an identical position — the engine could only hear "ahead of the
 * unpinned rows". See `applyPlacementCandidateOverrides` for the tuple evidence.
 *
 * So the natural order is decided first, by the canonical tuple comparison, and this pass then
 * places pinned rows into it. There is no second ranking algorithm here: this consults no facts, no
 * priority, no bucket and no tie-breaker. It only moves rows the operator explicitly asked to move.
 *
 * ── WHY THE RUN IS THE SECTION, AND NOT THE COHORT ──
 *
 * This pass used to move a row only among its own `program_room_cohort_key` members, and the
 * queue's position is section-scoped. A section is a program CATEGORY and can hold more than one
 * cohort, so the two numbers differed and an operator read one rank while editing another.
 *
 * Worse, it made positions unreachable. `program_room_cohort_key` is a slugified program/room
 * LABEL, not a controlled vocabulary, so one program drifts into several spellings: the deployed
 * Firefly INFANT section holds twelve candidates, eleven under `infant_0_18_months` and one under
 * the degraded `infant`. The natural sort groups cohorts into contiguous blocks, so the `infant`
 * row held section position 1 and NOTHING the operator did to the other eleven could reach it.
 * A ranked list of twelve where three positions cannot be occupied is not a ranked list.
 *
 * The run is therefore the section: the ranked universe the operator is actually looking at. The
 * cohort key keeps every other job it had — provenance, eligibility, lineage on the override row —
 * it simply stops deciding which positions exist.
 *
 * This is deliberately robust to the label drift rather than dependent on fixing it. Normalizing
 * degraded cohort keys is worth doing and is tracked separately; this ranking model is correct
 * whether or not that happens.
 *
 * ── GUARANTEES ──
 *
 * - Sections are never crossed. A row is placed among the rows it is ranked against, and the
 *   section occupies exactly the slots it occupied before.
 * - Unpinned rows keep their natural relative order, always.
 * - Two pins are deterministic: ascending ordinal, ties broken by the incoming (canonical) order.
 * - An ordinal past the end of the section clamps to last; below 1 clamps to first. The control
 *   already refuses to offer those, so clamping is a safety net, not a feature.
 * - No pins in a section means that section's array is returned untouched.
 */
import type { PlacementPriorityV2CandidatePreview } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";

type Row = Record<string, unknown>;

/** Resolve the ranked universe a row belongs to. Supplied by the caller, which owns section context. */
export type SectionKeyOf = (row: Row) => string | null;

/**
 * The operator's requested position for a row, or null when none is in force.
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
 * Reposition pinned rows to their requested ordinals within each contiguous section run.
 *
 * `rows` must already be in canonical order (section, then cohort, then priority tuple) — this pass
 * relies on section members being contiguous, which is exactly what the canonical sorter produces.
 * Returns a new array; the input rows are not mutated.
 */
export function applySectionManualPositions(rows: Row[], sectionKeyOf: SectionKeyOf): Row[] {
    if (rows.length < 2) return [...rows];

    const out: Row[] = [];
    let i = 0;
    while (i < rows.length) {
        const section = sectionKeyOf(rows[i]!);
        // A row outside every ranked section cannot host a move; pass it through untouched.
        if (section == null) {
            out.push(rows[i]!);
            i += 1;
            continue;
        }
        let j = i;
        while (j < rows.length && sectionKeyOf(rows[j]!) === section) j += 1;
        out.push(...placeWithinRun(rows.slice(i, j)));
        i = j;
    }
    return out;
}

/** Place one section's pinned rows at their requested ordinals, preserving natural order elsewhere. */
function placeWithinRun(group: Row[]): Row[] {
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
    // means an ordinal past the end of the section lands last rather than being silently lost.
    let lastSeated = -1;
    for (const { row, ordinal } of pinned) {
        const index = Math.min(Math.max(ordinal - 1, lastSeated + 1), placed.length);
        placed.splice(index, 0, row);
        lastSeated = index;
    }
    return placed;
}
