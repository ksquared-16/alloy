import type { OpportunityDrawerPaintRecord } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import {
    opportunityInquiryFamilyBlockReadyOnPrimary,
    opportunityInquirySummaryRightPanelFromPrimaryOnly,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import {
    classifyOpportunityDrawerLayoutChanges,
    type OpportunityDrawerLayoutChangeReport,
} from "@/lib/admin/drawer/opportunityFullHydrateMerge";
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
        sourceSurface?: string;
    }
): OpportunityDrawerLayoutChangeReport {
    const geometryChanged = opportunityDrawerAboveFoldGeometryChanged(
        snapshotOpportunityDrawerAboveFoldGeometry(prev),
        snapshotOpportunityDrawerAboveFoldGeometry(merged)
    );
    const layoutReport = classifyOpportunityDrawerLayoutChanges(prev, merged, geometryChanged);

    logDrawerLayoutStability({
        opportunity_id: opportunityId,
        phase,
        changed_sections: layoutReport.changed_sections,
        above_fold_changed: layoutReport.above_fold_changed,
        geometry_changed: layoutReport.geometry_changed,
        text_only_change: layoutReport.text_only_change,
        full_hydrate_applied: params.fullHydrateApplied,
        above_fold_locked: params.aboveFoldLocked,
        source_surface: params.sourceSurface,
    });

    return layoutReport;
}
