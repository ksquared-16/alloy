/**
 * Shared Lead / Person / Child drawer overview composition grid and surface rhythm.
 *
 * Entity-specific section keys and slot partitioners stay in *OverviewComposition modules;
 * this file owns the cross-drawer placement contract only.
 */

import { LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { PRESENTATION_EMPTY_STATE } from "@/lib/presentation/presentationTypography";

/** Twelve-column shell: left 3 / main 7 / right rail 2. */
export const DRAWER_OVERVIEW_SHELL_GRID = {
    leftColumn: 3,
    mainColumn: 7,
    rightRail: 2,
    columns: 12,
} as const;

export const DRAWER_OVERVIEW_CANVAS_CLASS = `space-y-3 rounded-lg p-3 ${LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS}`;

export const DRAWER_OVERVIEW_BODY_GRID_CLASS =
    "grid grid-cols-1 items-stretch gap-3 lg:grid-cols-12 lg:gap-4";

export const DRAWER_OVERVIEW_LEFT_COLUMN_CLASS = "min-w-0 lg:col-span-3 lg:flex lg:flex-col";

export const DRAWER_OVERVIEW_MAIN_COLUMN_CLASS = "min-w-0 lg:col-span-7 lg:flex lg:flex-col";

export const DRAWER_OVERVIEW_RIGHT_RAIL_CLASS =
    "flex min-w-0 flex-col gap-3 lg:col-span-2 lg:min-w-[11.5rem]";

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
    "overflow-hidden rounded-lg border border-alloy-stone/15 border-l-[3px] border-l-alloy-juniper/70 bg-white shadow-[0_1px_4px_rgba(24,39,58,0.05)]";

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
    const { leftColumn, mainColumn, rightRail } = DRAWER_OVERVIEW_SHELL_GRID;
    return {
        left: `lg:col-span-${leftColumn}`,
        main: `lg:col-span-${mainColumn}`,
        rightRail: `lg:col-span-${rightRail}`,
    };
}
