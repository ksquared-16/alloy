import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import {
    OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS,
    filterOpportunityOverviewSectionsForFirstPaint,
    opportunityInquirySummaryRightPanelFromPrimaryOnly,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";

/** Reserved header action rail height (matches DrawerWorkflowHeaderQuickActionsSkeleton). */
export const OPPORTUNITY_DRAWER_HEADER_ACTIONS_RAIL_MIN_H_CLASS = "min-h-[2.75rem]";

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

/** Summary stays single-column until below-fold reveal — prevents grid column pop-in. */
export function computeShowInquirySummaryRightColumn(params: {
    aboveFoldLocked: boolean;
    record: Record<string, unknown>;
    enrichmentLayoutReady: boolean;
    secondaryReady: boolean;
    taskAssistEnabled: boolean;
}): boolean {
    if (params.aboveFoldLocked) return false;
    if (opportunityInquirySummaryRightPanelFromPrimaryOnly(params.record)) {
        return true;
    }
    return params.enrichmentLayoutReady && params.secondaryReady && params.taskAssistEnabled;
}

/** Family block stays compact until below-fold — prevents FamilyContactsPanel height jump. */
export function computeFamilySummaryUsesFullPanel(params: {
    aboveFoldLocked: boolean;
    familyContactsInSummary: boolean;
    firstPaintActive: boolean;
}): boolean {
    if (params.aboveFoldLocked) return false;
    return params.familyContactsInSummary && !params.firstPaintActive;
}

export function shouldDeferOpportunityDrawerSecondaryReveal(aboveFoldLocked: boolean): boolean {
    return aboveFoldLocked;
}

/**
 * Workflow overview sections for layout-stable open.
 * When above-fold locked: deferred sections unmounted, inquiry_children last + collapsed.
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
        const withoutDeferred = sections.filter(
            (s) =>
                !OPPORTUNITY_ENRICHMENT_DEFERRED_OVERVIEW_SECTION_KEYS.has(s.key) || s.key === "inquiry_children"
        );
        const withoutChildren = withoutDeferred.filter((s) => s.key !== "inquiry_children");
        const children = withoutDeferred.find((s) => s.key === "inquiry_children");
        const collapsedChildren =
            children ?
                [{ ...children, defaultExpanded: false, collapsible: true } as EntityDrawerSectionConfig]
            :   [];
        return [...withoutChildren, ...collapsedChildren];
    }

    return filterOpportunityOverviewSectionsForFirstPaint(
        sections,
        params.firstPaintGatesActive,
        params.enrichmentLayoutReady,
        params.enrichmentHeldUntilInteraction
    );
}

/** Contract: full hydrate must not widen summary columns while above-fold is locked. */
export function opportunityDrawerSummaryLayoutMode(params: {
    aboveFoldLocked: boolean;
    recordSurface: string;
    showRightColumn: boolean;
}): "one" | "two" {
    if (params.aboveFoldLocked) return "one";
    return params.showRightColumn ? "two" : "one";
}
