/**
 * Opportunity drawer — entity_layouts visual config at runtime (Phase 4).
 *
 * Honors settings-authored section metadata on the layout runtime read path.
 * Opportunity drawer only; gated by layout runtime feature flags.
 */

import { sectionIsKpiTile } from "@/lib/layout/runtime/layoutRuntimeKpiTilePresentation";
import type { LayoutSection } from "@/lib/layout/layoutV2";
import { LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    OPPORTUNITY_DRAWER_SECTION_KEYS,
    PLATFORM_RESERVED_SECTION_KEYS,
} from "@/lib/layout/surfaceLayoutRegistry";
import type { LayoutRuntimeSectionVisibilityContext } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";

export function isOpportunityDrawerRegisteredLayoutSectionKey(sectionKey: string): boolean {
    return (OPPORTUNITY_DRAWER_SECTION_KEYS as readonly string[]).includes(sectionKey);
}

export function isLayoutSectionEditorHiddenMetadata(section: LayoutSection): boolean {
    return section.metadata?.[LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY] === true;
}

/**
 * True when layoutEditorHidden should suppress a section in opportunity drawer runtime.
 * Fails open (does not hide) when adoption is off, key is unregistered, or key is platform-reserved.
 */
export function shouldSuppressOpportunityDrawerSectionForEditorHidden(
    section: LayoutSection,
    adoptionEnabled: boolean,
): boolean {
    if (!adoptionEnabled) return false;
    if (PLATFORM_RESERVED_SECTION_KEYS.has(section.key)) return false;
    if (!isLayoutSectionEditorHiddenMetadata(section)) return false;
    if (isOpportunityDrawerRegisteredLayoutSectionKey(section.key)) return true;
    if (section.metadata?.createdByVisualEditor === true) return true;
    if (sectionIsKpiTile(section)) return true;
    return false;
}

export function buildOpportunityDrawerRuntimeSectionVisibilityContext(
    overrides: Partial<LayoutRuntimeSectionVisibilityContext> = {},
    options?: { adoptionEnabled?: boolean },
): LayoutRuntimeSectionVisibilityContext {
    return {
        compositionShell: true,
        opportunityEntityLayoutsVisualConfig: options?.adoptionEnabled ?? false,
        ...overrides,
    };
}
