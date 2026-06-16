/**
 * Opportunity drawer — when to honor LayoutDoc household/contact blocks vs profile substitution.
 */

export type LayoutEditorHouseholdRenderingContext = {
    sectionKey: string;
    compositionSectionSurface?: boolean;
    operatorSurfaces?: boolean;
    opportunityEntityLayoutsVisualConfig?: boolean;
    honorLayoutDocBlocks?: boolean;
};

/** True when section rows/columns from LayoutDoc should render instead of DrawerHouseholdProfileSection. */
export function shouldHonorLayoutDocHouseholdBlocks(ctx: LayoutEditorHouseholdRenderingContext): boolean {
    if (ctx.sectionKey !== "household_contact" && ctx.sectionKey !== "household_relationships") {
        return false;
    }
    if (ctx.honorLayoutDocBlocks) return true;
    if (ctx.opportunityEntityLayoutsVisualConfig) return true;
    return false;
}

export function shouldUseDrawerHouseholdProfileSubstitution(ctx: LayoutEditorHouseholdRenderingContext): boolean {
    if (!ctx.compositionSectionSurface || !ctx.operatorSurfaces) return false;
    if (ctx.sectionKey !== "household_contact" && ctx.sectionKey !== "household_relationships") {
        return false;
    }
    return !shouldHonorLayoutDocHouseholdBlocks(ctx);
}
