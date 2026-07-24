/**
 * Shared Lead / Person / Child drawer overview composition grid and surface rhythm.
 *
 * Entity-specific section keys and slot partitioners stay in *OverviewComposition modules;
 * this file owns the cross-drawer placement contract only.
 *
 * Layout breakpoints use **container queries** on `.adminv2-drawer-overview-canvas` so overview
 * grids respond to drawer content width, not the browser viewport.
 */

import {
    LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS,
    LAYOUT_RUNTIME_SECTION_STACK_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { PRESENTATION_EMPTY_STATE } from "@/lib/presentation/presentationTypography";

/** Local metadata read — mirrors layoutEditorSectionLayout without importing it (avoids module cycle). */
const LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY = "layoutEditorSectionRowGroup" as const;

function readSectionRowGroup(section: LayoutSection): string | null {
    const raw = section.metadata?.[LAYOUT_EDITOR_SECTION_ROW_GROUP_METADATA_KEY];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

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

export const DRAWER_OVERVIEW_CANVAS_CLASS = `${DRAWER_OVERVIEW_CONTAINER_CLASS} ${LAYOUT_RUNTIME_SECTION_STACK_CLASS} rounded-lg p-3 ${LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS}`;

/** @deprecated Use DRAWER_OVERVIEW_SHELL_GRID_CLASS — container-aware, not viewport `lg:`. */
export const DRAWER_OVERVIEW_BODY_GRID_CLASS = DRAWER_OVERVIEW_SHELL_GRID_CLASS;

export const DRAWER_OVERVIEW_LEFT_COLUMN_CLASS = "adminv2-drawer-overview-col-left";

export const DRAWER_OVERVIEW_MAIN_COLUMN_CLASS = "adminv2-drawer-overview-col-main";

export const DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS = "adminv2-drawer-overview-main-zone-flow";

export const DRAWER_OVERVIEW_RIGHT_RAIL_CLASS = "adminv2-drawer-overview-col-rail";

export const DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS = "adminv2-drawer-overview-lead-source-grid";

export const DRAWER_OVERVIEW_ENROLLMENT_FIELD_GRID_CLASS = "adminv2-drawer-enrollment-field-grid";

export const DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS = LAYOUT_RUNTIME_SECTION_STACK_CLASS;

/** Composition slot wrapper — stretch section shell to peer row height in shell grid. */
export const DRAWER_OVERVIEW_COMPOSITION_SLOT_CLASS = "flex h-full min-h-0 min-w-0 flex-col";

export const DRAWER_OVERVIEW_SUMMARY_STRIP_WIDGET_MIN_HEIGHT = "min-h-[4.25rem]";

export const DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS =
    "[&_[data-layout-runtime-summary-row]]:items-stretch [&_[data-layout-runtime-summary-widget]]:min-h-[4.25rem]";

/** Standard empty-state copy tone for overview widgets and relationship lists. */
export const DRAWER_OVERVIEW_EMPTY_STATE_CLASS = PRESENTATION_EMPTY_STATE;

/** Default section body padding inside premium panel shell. */
export const DRAWER_OVERVIEW_PANEL_BODY_CLASS = "px-3.5 pb-3.5 pt-2.5";

/** Enrollment / roster sections — card list bleeds to panel edges. */
export const DRAWER_OVERVIEW_PANEL_ENROLLMENT_BODY_CLASS = "px-0 pb-0 pt-0";

/** Premium drawer overview panel — pine accent + soft header (Lead reference styling). */
export const DRAWER_OVERVIEW_PANEL_SURFACE =
    "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-alloy-stone/40 border-b-[2px] border-b-alloy-stone/55 border-l-[3px] border-l-alloy-juniper/75 bg-white shadow-[0_2px_6px_rgba(24,39,58,0.09)]";

export const DRAWER_OVERVIEW_PANEL_CENTERPIECE_SURFACE =
    "overflow-hidden rounded-xl border border-alloy-stone/38 border-b-[2px] border-b-alloy-stone/55 border-l-[3px] border-l-alloy-juniper/80 bg-white shadow-[0_3px_10px_rgba(24,39,58,0.09)] ring-1 ring-alloy-stone/12";

// Clean header: white surface + Alloy-green eyebrow + hairline divider. The old pale wash band
// (emerald-50 gradient) read as a washed-out mint stripe; re-tinting it pine kept the same washed
// FORMAT, so the band is removed entirely and the green now lives in the eyebrow type — matching
// the Review & Decide treatment.
export const DRAWER_OVERVIEW_PANEL_HEADER =
    "border-b border-alloy-stone/16 bg-white px-3.5 py-2.5";

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
