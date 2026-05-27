import { comparePlacementSortTuples } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { readNormalizedCohortFromWaitlistRow } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";

/**
 * Sort waitlist candidate rows for stable UI sections:
 * 1) normalized `program_room_cohort_key` (one section per cohort)
 * 2) evaluator `sort_tuple` when non-shadow reorder is active
 * 3) list row id
 *
 * Opportunity-level rows (no `_placement_waitlist_row`) sort after candidate rows.
 */
export function sortPlacementCandidateQueueRows(
    rows: Array<Record<string, unknown>>,
    shadowMode: boolean
): Array<Record<string, unknown>> {
    if (rows.length < 2) return rows;

    return [...rows].sort((a, b) => {
        const ca = readNormalizedCohortFromWaitlistRow(a);
        const cb = readNormalizedCohortFromWaitlistRow(b);
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        if (ca && cb) {
            const byCohort = ca.cohortKey.localeCompare(cb.cohortKey);
            if (byCohort !== 0) return byCohort;
        }

        if (!shadowMode) {
            const ta = a.__placement_v2_sort_tuple;
            const tb = b.__placement_v2_sort_tuple;
            const hasA = Array.isArray(ta) && ta.length > 0;
            const hasB = Array.isArray(tb) && tb.length > 0;
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            if (hasA && hasB) {
                const c = comparePlacementSortTuples(
                    ta as Array<string | number | null>,
                    tb as Array<string | number | null>
                );
                if (c !== 0) return c;
            }
        }

        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });
}
