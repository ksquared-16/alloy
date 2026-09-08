import { applyCohortLocalManualPositions } from "@/lib/orchestration/placement/applyCohortLocalManualPositions";
import { comparePlacementSortTuples } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { readNormalizedCohortFromWaitlistRow } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import {
    readWaitlistRowProgramCategoryScope,
    resolveWaitlistCategorySortIndex,
    type WaitlistProgramCategoryContext,
} from "@/lib/orchestration/placement/waitlistProgramCategoryResolution";

function waitlistSectionKey(
    row: Record<string, unknown>,
    context?: WaitlistProgramCategoryContext | null
): string | null {
    const cohort = readNormalizedCohortFromWaitlistRow(row);
    if (!cohort) return null;
    const scope = readWaitlistRowProgramCategoryScope(row);
    return resolveWaitlistQueueSection({
        cohortKey: cohort.cohortKey,
        cohortLabel: cohort.cohortLabel,
        siteId: scope.siteId,
        programKey: scope.programKey,
        programCategoryId: scope.programCategoryId,
        locationCategoryContext: context,
    }).sectionKey;
}

/**
 * Sort waitlist candidate rows for stable UI sections:
 * 1) org-level program category section key (Infant, Toddler, … — not room/cohort slug)
 * 2) normalized `program_room_cohort_key` within the section
 * 3) evaluator `sort_tuple` when non-shadow reorder is active
 * 4) list row id
 *
 * Opportunity-level rows (no `_placement_waitlist_row`) sort after candidate rows.
 */
export function sortPlacementCandidateQueueRows(
    rows: Array<Record<string, unknown>>,
    shadowMode: boolean,
    context?: WaitlistProgramCategoryContext | null
): Array<Record<string, unknown>> {
    if (rows.length < 2) return rows;

    const natural = [...rows].sort((a, b) => {
        const ca = readNormalizedCohortFromWaitlistRow(a);
        const cb = readNormalizedCohortFromWaitlistRow(b);
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        if (ca && cb) {
            const sectionA = waitlistSectionKey(a, context) ?? "";
            const sectionB = waitlistSectionKey(b, context) ?? "";
            const bySection =
                resolveWaitlistCategorySortIndex(sectionA, context) -
                resolveWaitlistCategorySortIndex(sectionB, context);
            if (bySection !== 0) return bySection;

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

    /*
     * The natural order is settled above. A manual position is the operator placing a row INTO that
     * order, so it is applied here rather than as a sort key — see
     * `applyCohortLocalManualPositions` for why an ordinal cannot be a tuple component.
     *
     * Shadow mode never reorders, so it never places either: a preview must show what the rules
     * alone produce.
     */
    return shadowMode ? natural : applyCohortLocalManualPositions(natural);
}
