import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import {
    OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS,
    filterOpportunityOverviewSectionsForFirstPaint,
    opportunityInquirySummaryRightPanelFromPrimaryOnly,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";

/** Reserved header action rail height (matches header action skeleton). */
export const OPPORTUNITY_DRAWER_HEADER_ACTIONS_RAIL_MIN_H_CLASS = "min-h-[2.75rem]";

/** Skeleton button geometry — stable swap target for record_header actions. */
export const OPPORTUNITY_DRAWER_HEADER_ACTIONS_SKELETON_BUTTON_CLASSES = [
    "h-9 w-[5.25rem]",
    "h-9 w-24",
    "h-9 w-28",
] as const;

export function opportunityDrawerHeaderActionsExpectRegistry(params: {
    drawerShellVariant: string;
    bootstrapEnabled: boolean;
    bootstrapLegacy: boolean;
    inquiryWorkflow: boolean;
}): boolean {
    return (
        params.drawerShellVariant === "adminV2" &&
        params.bootstrapEnabled &&
        !params.bootstrapLegacy &&
        params.inquiryWorkflow
    );
}

/** Show reserved skeleton until record_header actions resolve (never pop-in empty). */
export function opportunityDrawerHeaderActionsShowSkeleton(params: {
    expectRegistry: boolean;
    headerActionsLoading: boolean;
    headerActionsReady: boolean;
}): boolean {
    if (!params.expectRegistry) return false;
    if (params.headerActionsReady) return false;
    return params.headerActionsLoading || !params.headerActionsReady;
}

/** Collapsed inquiry_children section shell — stable header row only above the fold. */
export const OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL_CLASS = "min-h-[2.75rem]";

/** Pixels scrolled in drawer body before below-fold enrichment may mount. */
export const OPPORTUNITY_DRAWER_BELOW_FOLD_SCROLL_PX = 72;

/**
 * While true, layout gates ignore `surface=full` / secondary-ready flips that would reshape above-the-fold UI.
 * Set for composed preload opens until scroll or idle reveal.
 */
export function opportunityDrawerAboveFoldLayoutLocked(
    layoutFrozen: boolean,
    belowFoldRevealed: boolean
): boolean {
    return layoutFrozen && !belowFoldRevealed;
}

/** First-paint layout gates stay active while above-fold is locked (even after full hydrate). */
export function opportunityDrawerLayoutFirstPaintGatesActive(
    aboveFoldLocked: boolean,
    firstPaintActive: boolean
): boolean {
    return aboveFoldLocked || firstPaintActive;
}

/**
 * @deprecated Prefer `buildOpportunityDrawerPipelineState` → `above_fold.inquiry_summary`.
 * Kept for unit tests and bootstrap races before shell pipeline is available.
 */
export function computeShowInquirySummaryRightColumn(params: {
    summaryRightColumnReserved: boolean;
    record: Record<string, unknown>;
    belowFoldEnrichmentReady: boolean;
    fullHydrateReady: boolean;
    taskAssistEnabled: boolean;
}): boolean {
    if (params.summaryRightColumnReserved) return true;
    if (opportunityInquirySummaryRightPanelFromPrimaryOnly(params.record)) {
        return true;
    }
    return (
        params.belowFoldEnrichmentReady &&
        params.fullHydrateReady &&
        params.taskAssistEnabled
    );
}

/** @deprecated Prefer drawer pipeline `family_contacts.use_full_panel`. */
export function computeFamilySummaryUsesFullPanel(params: {
    familyContactsInSummary: boolean;
}): boolean {
    return params.familyContactsInSummary;
}

export function shouldDeferOpportunityDrawerSecondaryReveal(aboveFoldLocked: boolean): boolean {
    return aboveFoldLocked;
}

/**
 * Workflow overview sections for layout-stable open.
 * When above-fold locked: below-fold enrichments stay collapsed; inquiry_children stays expanded.
 */
export function stabilizeOpportunityWorkflowOverviewSections(
    sections: EntityDrawerSectionConfig[],
    params: {
        aboveFoldLocked: boolean;
        firstPaintGatesActive: boolean;
        enrichmentLayoutReady: boolean;
        enrichmentHeldUntilInteraction?: boolean;
    }
): EntityDrawerSectionConfig[] {
    if (params.aboveFoldLocked) {
        return sections.map((s) => {
            if (s.key === "inquiry_children") {
                return { ...s, defaultExpanded: true, collapsible: true };
            }
            if (OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS.has(s.key)) {
                return { ...s, defaultExpanded: false, collapsible: true };
            }
            return s;
        });
    }

    return filterOpportunityOverviewSectionsForFirstPaint(
        sections,
        params.firstPaintGatesActive,
        params.enrichmentLayoutReady,
        params.enrichmentHeldUntilInteraction
    );
}

/** @deprecated Prefer drawer pipeline `inquiry_summary.column_mode`. */
export function opportunityDrawerSummaryLayoutMode(params: {
    showRightColumn: boolean;
}): "one" | "two" {
    return params.showRightColumn ? "two" : "one";
}
