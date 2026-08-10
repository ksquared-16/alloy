/**
 * Apply published Queue Row variant groupByCriteria + sortCriteria for child Waitlist.
 *
 * Canonical owner: the published queue-row Waitlist variant (not a second Work View authority).
 * Group by Program (placement section), then sort within each group by placement priority /
 * waitlist position. Positions remain business-derived within Program sections.
 */

import type {
    QueueRowVariantGroupCriterion,
    QueueRowVariantSortCriterion,
} from "@/lib/layout/queueRecordLayoutV3";
import { applyQueueRowVariantSortCriteria } from "@/lib/presentation/runtime/applyQueueRowVariantSortCriteria";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function readGroupValue(row: Record<string, unknown>, key: string): string {
    const k = key.trim().toLowerCase();
    const ctx = (row.context ?? row._queue_row_context) as QueueRowContext | Record<string, unknown> | null | undefined;
    const placement = (ctx as QueueRowContext | null | undefined)?.placement_context;
    const waitlistProj = row._placement_waitlist_row as Record<string, unknown> | null | undefined;
    const childPlacement = row.placementWaitlistRow as Record<string, unknown> | null | undefined;

    if (k.includes("program") || k === "program_room" || k.includes("category") || k.includes("cohort")) {
        return (
            placement?.program_label?.trim() ||
            placement?.room_label?.trim() ||
            (typeof waitlistProj?.program_room_group_label === "string"
                ? waitlistProj.program_room_group_label.trim()
                : "") ||
            (typeof childPlacement?.program_room_group_label === "string"
                ? childPlacement.program_room_group_label.trim()
                : "") ||
            (typeof waitlistProj?.runtime_position_section_key === "string"
                ? waitlistProj.runtime_position_section_key.trim()
                : "") ||
            (typeof childPlacement?.runtime_position_section_key === "string"
                ? childPlacement.runtime_position_section_key.trim()
                : "") ||
            ""
        );
    }
    if (k.includes("location") || k.includes("site") || k.includes("campus")) {
        return (
            placement?.location_label?.trim() ||
            placement?.location_id?.trim() ||
            (typeof waitlistProj?.site_id === "string" ? waitlistProj.site_id.trim() : "") ||
            ""
        );
    }
    return String(row[key] ?? "");
}

function compareGroupKeys(a: string, b: string): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Group then sort: contiguous Program sections, placement/sortCriteria within each section.
 * When groupBy is empty, falls through to sortCriteria only.
 * When sortCriteria is empty but rows carry derived runtime_position, sort by that within group
 * (Placement System authority — not client inventing a score).
 */
export function applyQueueRowVariantGroupAndSortCriteria<T extends Record<string, unknown>>(
    rows: readonly T[],
    groupBy: readonly QueueRowVariantGroupCriterion[] | null | undefined,
    sortCriteria: readonly QueueRowVariantSortCriterion[] | null | undefined,
): T[] {
    if (!rows.length) return [];

    const effectiveSort: QueueRowVariantSortCriterion[] =
        sortCriteria?.length ?
            [...sortCriteria]
        :   [{ key: "waitlist.position", direction: "asc", nulls: "last" }];

    if (!groupBy?.length) {
        return applyQueueRowVariantSortCriteria(rows, effectiveSort);
    }

    const primary = groupBy[0]!;
    const buckets = new Map<string, T[]>();
    const order: string[] = [];
    for (const row of rows) {
        const key = readGroupValue(row, primary.key);
        if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
        }
        buckets.get(key)!.push(row);
    }
    order.sort(compareGroupKeys);

    const out: T[] = [];
    for (const key of order) {
        const groupRows = buckets.get(key) ?? [];
        out.push(...applyQueueRowVariantSortCriteria(groupRows, effectiveSort));
    }
    return out;
}
