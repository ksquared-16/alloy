import type { OpportunityDrawerPaintRecord } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import {
    opportunityInquiryFamilyBlockReadyOnPrimary,
    opportunityInquirySummaryRightPanelFromPrimaryOnly,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { logDrawerLayoutStability } from "@/lib/perf/drawerLayoutStabilityPerf";

/** Above-fold geometry signals that must not flip after first paint when layout is locked. */
export type OpportunityDrawerAboveFoldGeometrySnapshot = {
    family_block_ready: boolean;
    right_panel_from_primary: boolean;
    customer_name: string;
    primary_person_name: string;
};

export function snapshotOpportunityDrawerAboveFoldGeometry(
    record: OpportunityDrawerPaintRecord
): OpportunityDrawerAboveFoldGeometrySnapshot {
    return {
        family_block_ready: opportunityInquiryFamilyBlockReadyOnPrimary(record),
        right_panel_from_primary: opportunityInquirySummaryRightPanelFromPrimaryOnly(record),
        customer_name: String(record._customer_name ?? "").trim(),
        primary_person_name: String(record._primary_person_name ?? "").trim(),
    };
}

export function opportunityDrawerAboveFoldGeometryChanged(
    before: OpportunityDrawerAboveFoldGeometrySnapshot,
    after: OpportunityDrawerAboveFoldGeometrySnapshot
): boolean {
    return (
        before.family_block_ready !== after.family_block_ready ||
        before.right_panel_from_primary !== after.right_panel_from_primary ||
        before.customer_name !== after.customer_name ||
        before.primary_person_name !== after.primary_person_name
    );
}

export function reportOpportunityDrawerHydrateLayoutStability(
    opportunityId: string,
    phase: string,
    prev: OpportunityDrawerPaintRecord,
    merged: OpportunityDrawerPaintRecord,
    params: {
        aboveFoldLocked: boolean;
        fullHydrateApplied: boolean;
    }
): void {
    const changedSections = Object.keys(merged).filter(
        (k) => JSON.stringify(prev[k]) !== JSON.stringify(merged[k])
    );
    const geometryChanged = opportunityDrawerAboveFoldGeometryChanged(
        snapshotOpportunityDrawerAboveFoldGeometry(prev),
        snapshotOpportunityDrawerAboveFoldGeometry(merged)
    );
    logDrawerLayoutStability({
        opportunity_id: opportunityId,
        phase,
        above_fold_locked: params.aboveFoldLocked,
        full_hydrate_applied: params.fullHydrateApplied,
        changed_sections: changedSections,
        geometry_changed: geometryChanged,
    });
}
