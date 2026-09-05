/**
 * Runtime waitlist position for V2 candidate rows (Card 1).
 * Derived at queue load / client filter time — never persisted.
 */

import { comparePlacementSortTuples } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { readRowManualPinOrdinal } from "@/lib/orchestration/placement/applyCohortLocalManualPositions";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import {
    readWaitlistRowProgramCategoryScope,
    type WaitlistProgramCategoryContext,
} from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";

export const WAITLIST_RUNTIME_POSITION_HELP =
    "Position is calculated from the current priority rules and filters. It is not a permanent stored rank.";

export type WaitlistRuntimePositionMode = "preview" | "live";

/**
 * Typed precedence outcomes. Copy lives at the presentation owner, never in the ordering engine.
 *
 * `pin_scoped_to_cohort` — the row's pin IS in force: it sits at exactly the ordinal the operator
 * chose within its own cohort. The section it is displayed in lists an earlier cohort first, so the
 * section-scoped position is a different (larger) number than the one they picked. Derived only
 * from this row's own pin and cohort plus the cohort keys ahead of it; it never depends on the
 * identity, accessibility or contested state of whichever row is actually ahead.
 */
export type WaitlistRuntimePrecedenceReason = "pin_scoped_to_cohort";

export type WaitlistRuntimePositionFields = {
    runtime_position: number;
    runtime_position_total: number;
    runtime_position_label: string;
    runtime_position_mode: WaitlistRuntimePositionMode;
    /** Org-level category section key used for scoping (e.g. `toddler`). */
    runtime_position_section_key?: string;
    /** Preview-only hint when manual pin(s) rank above this row in the section. */
    runtime_position_precedence_note?: string;
    /** Operator-safe typed precedence outcome — NOT shadow-gated. */
    runtime_position_precedence_reason?: WaitlistRuntimePrecedenceReason;
    /*
     * THE GROUP-LOCAL RANGE — the only range a manual position may legally express.
     *
     * `runtime_position` / `runtime_position_total` are SECTION-scoped: they answer "where does this
     * row sit in the list the operator is reading". A pin is COHORT-scoped: `pin_ordinal` orders a
     * candidate inside its own program/room cohort, and a section can hold several cohorts.
     *
     * Publishing both is what stops the Adjust control offering a position the command cannot mean.
     * Bounding that control on the section total let it offer "12" to a candidate whose cohort holds
     * 11 — the write then clamped, and the operator's number silently became a different number.
     * The control must read THIS, and no client may recompute it: one placement authority.
     */
    runtime_group_position?: number;
    runtime_group_total?: number;
};

export function formatWaitlistRuntimePositionLabel(
    mode: WaitlistRuntimePositionMode,
    position: number,
    total: number
): string {
    const n = Math.max(1, Math.floor(position));
    const t = Math.max(n, Math.floor(total));
    // Compact queue scan: `1/4`. Preview keeps an explicit prefix so operators know it is not live.
    return mode === "preview" ? `Preview ${n}/${t}` : `${n}/${t}`;
}

export type WaitlistRankParts = {
    /** True when the label is a preview (not live) rank. */
    preview: boolean;
    numerator: number;
    denominator: number;
    /** Plain compact string without `#` — `1/4` or `Preview 1/4`. */
    compact: string;
};

/** Parse compact / legacy position labels into numerator + denominator for row chrome. */
export function parseWaitlistRankParts(label: string | null | undefined): WaitlistRankParts | null {
    const raw = typeof label === "string" ? label.trim() : "";
    if (!raw) return null;
    const m = raw.match(/(?:Preview\s+)?(?:position\s+)?#?(\d+)\s*\/\s*(\d+)/i);
    if (!m) return null;
    const numerator = Math.max(1, Number(m[1]));
    const denominator = Math.max(numerator, Number(m[2]));
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
    const preview = /\bpreview\b/i.test(raw);
    return {
        preview,
        numerator,
        denominator,
        compact: preview ? `Preview ${numerator}/${denominator}` : `${numerator}/${denominator}`,
    };
}

/** Parse compact / legacy position labels into `{n}/{t}` for row chrome (no `#`). */
export function compactWaitlistPositionLabel(label: string | null | undefined): string | null {
    return parseWaitlistRankParts(label)?.compact ?? null;
}

function readSortTuple(row: Record<string, unknown>): Array<string | number | null> | null {
    const internal = row.__placement_v2_sort_tuple;
    if (Array.isArray(internal) && internal.length > 0) {
        return internal as Array<string | number | null>;
    }
    const wr = row._placement_waitlist_row;
    if (wr != null && typeof wr === "object" && !Array.isArray(wr)) {
        const pv2 = (wr as { placement_priority_v2?: { sort_tuple?: unknown } }).placement_priority_v2;
        if (Array.isArray(pv2?.sort_tuple) && pv2.sort_tuple.length > 0) {
            return pv2.sort_tuple as Array<string | number | null>;
        }
    }
    return null;
}

/** Drop `primary_group_fact_key` (first tuple slot) for within-section priority rank. */
export function stripPrimaryGroupFromPlacementSortTuple(
    tuple: Array<string | number | null>
): Array<string | number | null> {
    if (tuple.length <= 1) return [...tuple];
    return tuple.slice(1);
}

function readRowActiveOverrideKinds(row: Record<string, unknown>): string[] {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return [];
    const pv2 = (wr as { placement_priority_v2?: { active_override_kinds?: unknown } }).placement_priority_v2;
    const kinds = pv2?.active_override_kinds;
    if (!Array.isArray(kinds)) return [];
    return kinds.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

/** Normalized cohort key for a row — the same normalization the canonical sorter groups by. */
function readWaitlistRowCohortKey(row: Record<string, unknown>): string | null {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return null;
    const o = wr as { program_room_cohort_key?: string; program_room_group_label?: string };
    const { cohortKey } = normalizePlacementWaitlistCohort(o.program_room_cohort_key, o.program_room_group_label);
    return cohortKey?.trim() ? cohortKey.trim() : null;
}

function rowHasManualPinOverride(row: Record<string, unknown>): boolean {
    return readRowActiveOverrideKinds(row).includes("pin");
}

/** Category section key for one candidate queue row. */
export function readWaitlistCandidateSectionKey(
    row: Record<string, unknown>,
    context?: WaitlistProgramCategoryContext | null
): string | null {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return null;
    const o = wr as { program_room_cohort_key?: string; program_room_group_label?: string };
    const { cohortKey, cohortLabel } = normalizePlacementWaitlistCohort(
        o.program_room_cohort_key,
        o.program_room_group_label
    );
    const scope = readWaitlistRowProgramCategoryScope(row);
    return resolveWaitlistQueueSection({
        cohortKey,
        cohortLabel,
        siteId: scope.siteId,
        programKey: scope.programKey,
        programCategoryId: scope.programCategoryId,
        locationCategoryContext: context,
    }).sectionKey;
}

function isWaitlistCandidateRow(row: Record<string, unknown>): boolean {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return false;
    return (wr as { row_projection?: string }).row_projection === "placement_candidate";
}

function compareWaitlistCandidateRowsByPriority(
    a: Record<string, unknown>,
    b: Record<string, unknown>
): number {
    const ta = readSortTuple(a);
    const tb = readSortTuple(b);
    const hasA = Array.isArray(ta) && ta.length > 0;
    const hasB = Array.isArray(tb) && tb.length > 0;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (hasA && hasB) {
        const c = comparePlacementSortTuples(
            stripPrimaryGroupFromPlacementSortTuple(ta!),
            stripPrimaryGroupFromPlacementSortTuple(tb!)
        );
        if (c !== 0) return c;
    }
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

function writeRuntimePositionOnRow(
    row: Record<string, unknown>,
    fields: WaitlistRuntimePositionFields
): void {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return;
    const target = wr as Record<string, unknown>;
    /*
     * Clear the precedence outcomes before writing. `Object.assign` only ADDS keys, so a row that no
     * longer qualifies would silently keep the explanation written for a previous ordering — the
     * operator would read a stale reason after a Work View switch, a site change, or an unpin.
     * Position is recomputed on every assignment; its explanation must be too.
     */
    delete target.runtime_position_precedence_note;
    delete target.runtime_position_precedence_reason;
    Object.assign(target, fields);
}

/**
 * Assign `runtime_position*` on each `_placement_waitlist_row` within org category sections.
 *
 * - **Live:** position follows current row order (after priority sort).
 * - **Shadow:** position follows priority `sort_tuple` rank while list order may differ.
 */
export function assignWaitlistCandidateRuntimePositions(
    rows: Array<Record<string, unknown>>,
    shadowMode: boolean,
    context?: WaitlistProgramCategoryContext | null
): void {
    const mode: WaitlistRuntimePositionMode = shadowMode ? "preview" : "live";
    const bySection = new Map<string, number[]>();

    rows.forEach((row, idx) => {
        if (!isWaitlistCandidateRow(row)) return;
        const sk = readWaitlistCandidateSectionKey(row, context);
        if (!sk) return;
        const list = bySection.get(sk) ?? [];
        list.push(idx);
        bySection.set(sk, list);
    });

    for (const [sectionKey, indices] of bySection) {
        const total = indices.length;
        if (total === 0) continue;

        const rankIndices =
            shadowMode && indices.length > 1
                ? [...indices].sort((ia, ib) =>
                      compareWaitlistCandidateRowsByPriority(rows[ia]!, rows[ib]!)
                  )
                : indices;

        rankIndices.forEach((rowIdx, rank) => {
            const position = rank + 1;
            const beatenByManualPin =
                shadowMode &&
                position > 1 &&
                rankIndices.slice(0, rank).some((higherIdx) => rowHasManualPinOverride(rows[higherIdx]!));
            /*
             * A pin is an ordinal WITHIN ITS COHORT, but the position shown is scoped to the whole
             * program section, and a section may contain several cohorts. So an operator can pin to 1,
             * have the pin fully in force, and still read "2/12" — which is indistinguishable from a
             * pin that failed. This says the pin worked and names only the generic rule.
             *
             * Every input is this row's own: its pin, its cohort, and the set of cohort keys ordered
             * ahead of it. Nothing about the row actually in front is consulted, so a contested or
             * inaccessible neighbour cannot leak through this reason.
             */
            const ownCohort = readWaitlistRowCohortKey(rows[rowIdx]!);
            const requestedOrdinal = readRowManualPinOrdinal(rows[rowIdx]!);
            // Where the row actually sits among its OWN cohort members in this section.
            const cohortLocalPosition =
                ownCohort == null
                    ? null
                    : rankIndices
                          .slice(0, rank)
                          .filter((higherIdx) => readWaitlistRowCohortKey(rows[higherIdx]!) === ownCohort)
                          .length + 1;
            /*
             * The pin is honoured — the row is exactly where the operator put it within its cohort —
             * but the SECTION lists an earlier cohort first, so the number on screen is larger than
             * the number they chose. Say so.
             *
             * This used to require the row to be FIRST in its cohort, which meant the one case that
             * most needs explaining went unexplained: a row pinned to 2, correctly second in its
             * cohort, displaying 3/12, with no indication the pin had taken. Now the test is the
             * honest one — "you asked for N, you got N in your group, the section says something
             * else" — and it never consults the identity of whichever row is ahead.
             */
            const pinScopedToCohort =
                requestedOrdinal != null &&
                cohortLocalPosition != null &&
                cohortLocalPosition === requestedOrdinal &&
                position !== requestedOrdinal;
            // How many candidates share this row's cohort in this section — the legal range a manual
            // position may address. Counted from the same `rankIndices` the positions come from, so
            // the control can never be bounded by a number this engine did not produce.
            const cohortTotal =
                ownCohort == null
                    ? null
                    : rankIndices.filter((idx) => readWaitlistRowCohortKey(rows[idx]!) === ownCohort).length;
            writeRuntimePositionOnRow(rows[rowIdx]!, {
                runtime_position: position,
                runtime_position_total: total,
                runtime_position_label: formatWaitlistRuntimePositionLabel(mode, position, total),
                runtime_position_mode: mode,
                runtime_position_section_key: sectionKey,
                ...(cohortLocalPosition != null && cohortTotal != null
                    ? { runtime_group_position: cohortLocalPosition, runtime_group_total: cohortTotal }
                    : {}),
                ...(beatenByManualPin ?
                    {
                        runtime_position_precedence_note:
                            "Ranked below manually adjusted row(s) in this program section.",
                    }
                :   {}),
                ...(pinScopedToCohort ?
                    { runtime_position_precedence_reason: "pin_scoped_to_cohort" as const }
                :   {}),
            });
        });
    }
}

/** True when display order matches priority tuple order within each section. */
export function waitlistVisibleOrderMatchesPriority(
    rows: Array<Record<string, unknown>>,
    shadowMode: boolean,
    context?: WaitlistProgramCategoryContext | null
): boolean {
    if (shadowMode) return false;
    const bySection = new Map<string, number[]>();
    rows.forEach((row, idx) => {
        if (!isWaitlistCandidateRow(row)) return;
        const sk = readWaitlistCandidateSectionKey(row, context);
        if (!sk) return;
        const list = bySection.get(sk) ?? [];
        list.push(idx);
        bySection.set(sk, list);
    });

    for (const indices of bySection.values()) {
        if (indices.length < 2) continue;
        for (let i = 1; i < indices.length; i++) {
            const cmp = compareWaitlistCandidateRowsByPriority(rows[indices[i - 1]!]!, rows[indices[i]!]!);
            if (cmp > 0) return false;
        }
    }
    return true;
}
