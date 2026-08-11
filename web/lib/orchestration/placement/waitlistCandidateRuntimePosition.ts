/**
 * Runtime waitlist position for V2 candidate rows (Card 1).
 * Derived at queue load / client filter time — never persisted.
 */

import { comparePlacementSortTuples } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import {
    readWaitlistRowProgramCategoryScope,
    type WaitlistProgramCategoryContext,
} from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";

export const WAITLIST_RUNTIME_POSITION_HELP =
    "Position is calculated from the current priority rules and filters. It is not a permanent stored rank.";

export type WaitlistRuntimePositionMode = "preview" | "live";

export type WaitlistRuntimePositionFields = {
    runtime_position: number;
    runtime_position_total: number;
    runtime_position_label: string;
    runtime_position_mode: WaitlistRuntimePositionMode;
    /** Org-level category section key used for scoping (e.g. `toddler`). */
    runtime_position_section_key?: string;
    /** Preview-only hint when manual pin(s) rank above this row in the section. */
    runtime_position_precedence_note?: string;
};

export function formatWaitlistRuntimePositionLabel(
    mode: WaitlistRuntimePositionMode,
    position: number,
    total: number
): string {
    const n = Math.max(1, Math.floor(position));
    const t = Math.max(n, Math.floor(total));
    // Compact queue scan: `#1/4`. Preview keeps an explicit prefix so operators know it is not live.
    return mode === "preview" ? `Preview #${n}/${t}` : `#${n}/${t}`;
}

/** Parse compact / legacy position labels into `{n}/{t}` for row chrome. */
export function compactWaitlistPositionLabel(label: string | null | undefined): string | null {
    const raw = typeof label === "string" ? label.trim() : "";
    if (!raw) return null;
    if (/^#\d+\/\d+$/.test(raw)) return raw;
    const m = raw.match(/(?:Preview\s+)?(?:position\s+)?#?(\d+)\s*\/\s*(\d+)/i);
    if (!m) return null;
    const n = Math.max(1, Number(m[1]));
    const t = Math.max(n, Number(m[2]));
    if (!Number.isFinite(n) || !Number.isFinite(t)) return null;
    return raw.toLowerCase().includes("preview") ? `Preview #${n}/${t}` : `#${n}/${t}`;
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
    Object.assign(wr as Record<string, unknown>, fields);
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
            writeRuntimePositionOnRow(rows[rowIdx]!, {
                runtime_position: position,
                runtime_position_total: total,
                runtime_position_label: formatWaitlistRuntimePositionLabel(mode, position, total),
                runtime_position_mode: mode,
                runtime_position_section_key: sectionKey,
                ...(beatenByManualPin ?
                    {
                        runtime_position_precedence_note:
                            "Ranked below manually adjusted row(s) in this program section.",
                    }
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
