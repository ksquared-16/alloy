/**
 * Shared Lead / Person / Child drawer overview composition grid and surface rhythm.
 *
 * Entity-specific section keys and slot partitioners stay in *OverviewComposition modules;
 * this file owns the cross-drawer placement contract only.
 *
 * Layout breakpoints use **container queries** on `.adminv2-drawer-overview-canvas` so overview
 * grids respond to drawer content width, not the browser viewport.
 */

import { LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { readSectionRowGroup } from "@/lib/layout/layoutEditorSectionLayout";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { PRESENTATION_EMPTY_STATE } from "@/lib/presentation/presentationTypography";

/** Twelve-column shell: left 4 / main 5 / right rail 3 — relationship cards / enrollment / comms rail. */
export const DRAWER_OVERVIEW_SHELL_GRID = {
    leftColumn: 4,
    mainColumn: 5,
    rightRail: 3,
    columns: 12,
} as const;

/** Minimum drawer overview canvas width before enabling the 3/7/2 dashboard grid. */
export const DRAWER_OVERVIEW_DASHBOARD_MIN_WIDTH_PX = 1040;

export const DRAWER_OVERVIEW_CONTAINER_CLASS = "adminv2-drawer-overview-canvas";

export const DRAWER_OVERVIEW_SHELL_GRID_CLASS = "adminv2-drawer-overview-shell-grid";

export const DRAWER_OVERVIEW_CANVAS_CLASS = `${DRAWER_OVERVIEW_CONTAINER_CLASS} space-y-3 rounded-lg p-3 ${LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS}`;

/** @deprecated Use DRAWER_OVERVIEW_SHELL_GRID_CLASS — container-aware, not viewport `lg:`. */
export const DRAWER_OVERVIEW_BODY_GRID_CLASS = DRAWER_OVERVIEW_SHELL_GRID_CLASS;

export const DRAWER_OVERVIEW_LEFT_COLUMN_CLASS = "adminv2-drawer-overview-col-left";

export const DRAWER_OVERVIEW_MAIN_COLUMN_CLASS = "adminv2-drawer-overview-col-main";

export const DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS = "adminv2-drawer-overview-main-zone-flow";

export const DRAWER_OVERVIEW_RIGHT_RAIL_CLASS = "adminv2-drawer-overview-col-rail";

export const DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS = "adminv2-drawer-overview-lead-source-grid";

export const DRAWER_OVERVIEW_ENROLLMENT_FIELD_GRID_CLASS = "adminv2-drawer-enrollment-field-grid";

export const DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS = "space-y-3";

export const DRAWER_OVERVIEW_SUMMARY_STRIP_WIDGET_MIN_HEIGHT = "min-h-[4.25rem]";

export const DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS =
    "[&_[data-layout-runtime-summary-row]]:items-stretch [&_[data-layout-runtime-summary-widget]]:min-h-[4.25rem]";

/** Standard empty-state copy tone for overview widgets and relationship lists. */
export const DRAWER_OVERVIEW_EMPTY_STATE_CLASS = PRESENTATION_EMPTY_STATE;

/** Default section body padding inside premium panel shell. */
export const DRAWER_OVERVIEW_PANEL_BODY_CLASS = "px-3 pb-3 pt-2";

/** Enrollment / roster sections — card list bleeds to panel edges. */
export const DRAWER_OVERVIEW_PANEL_ENROLLMENT_BODY_CLASS = "px-0 pb-0 pt-0";

/** Premium drawer overview panel — pine accent + soft header (Lead reference styling). */
export const DRAWER_OVERVIEW_PANEL_SURFACE =
    "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/22 border-b-alloy-stone/30 border-l-[3px] border-l-alloy-juniper/70 bg-white shadow-[0_1px_5px_rgba(24,39,58,0.07)]";

export const DRAWER_OVERVIEW_PANEL_CENTERPIECE_SURFACE =
    "overflow-hidden rounded-xl border border-alloy-stone/20 border-l-[3px] border-l-alloy-juniper/75 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.06)] ring-1 ring-alloy-stone/10";

export const DRAWER_OVERVIEW_PANEL_HEADER =
    "border-b border-alloy-stone/10 bg-gradient-to-r from-emerald-50/70 via-emerald-50/35 to-white px-3 py-2";

export const DRAWER_OVERVIEW_PANEL_ICON_BADGE =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/10 bg-alloy-juniper/[0.08] text-alloy-juniper/80";

export function drawerOverviewShellGridSpans(): {
    left: string;
    main: string;
    rightRail: string;
} {
    return {
        left: DRAWER_OVERVIEW_LEFT_COLUMN_CLASS,
        main: DRAWER_OVERVIEW_MAIN_COLUMN_CLASS,
        rightRail: DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    };
}

/**
 * When a semantic composition slot shares a row group with flow sections, render them
 * together via section flow so stacked/peer layouts match builder preview.
 */
export function mergeCompositionSlotIntoFlowWhenRowGrouped(
    doc: LayoutDoc,
    slotSection: LayoutSection | null,
    flowSections: LayoutSection[],
): { slotStandalone: LayoutSection | null; flowSections: LayoutSection[] } {
    if (!slotSection || flowSections.length === 0) {
        return { slotStandalone: slotSection, flowSections };
    }
    const groupId = readSectionRowGroup(slotSection);
    if (!groupId) {
        return { slotStandalone: slotSection, flowSections };
    }
    const sharesGroup = flowSections.some((section) => readSectionRowGroup(section) === groupId);
    if (!sharesGroup) {
        return { slotStandalone: slotSection, flowSections };
    }
    const flowKeys = new Set([slotSection.key, ...flowSections.map((section) => section.key)]);
    const merged = doc.sections.filter((section) => flowKeys.has(section.key));
    return { slotStandalone: null, flowSections: merged };
}
