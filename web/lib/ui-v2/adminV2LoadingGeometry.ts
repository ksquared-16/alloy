/**
 * Shared AdminV2 loading placeholder geometry — keep reserves/skeletons aligned with final layout.
 * Visual-only constants; does not change fetch timing or data ownership.
 *
 * **Vocabulary (PERF-A-01):**
 * - `quiet_reserve` — non-pulsing bordered hold (dept oper, dept KPI band, WU lane)
 * - `row_skeleton` — compact pulsing queue rows (work-unit lane only; not dept cold nav)
 */

/** Default in-lane queue row placeholders (matches typical first viewport). */
export const ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT = 5;

/** Orientation KPI strip cells (`KpiStripSkeleton` when pulse skeleton is intentional). */
export const ADMINV2_KPI_STRIP_CELL_COUNT = 5;

/** Dept paired oper panel inner reserve height (throughput + attention). */
export const ADMINV2_DEPT_PAIRED_OPER_PANEL_MIN_H = "11.5rem";

/** Dept / workspace KPI quiet reserve band (`WorkspaceQuietKpiReserve`). */
export const ADMINV2_DEPT_KPI_QUIET_RESERVE_MIN_H = "4.25rem";

/** Work-unit queue lane quiet reserve (`WorkspaceQuietQueueLaneReserve`). */
export const ADMINV2_WORK_UNIT_QUEUE_LANE_MIN_H = "14rem";

/** Shared calm reserve panel surface (dept oper columns). */
export const ADMINV2_QUIET_RESERVE_PANEL_CLASS =
    "rounded-lg border border-alloy-stone/12 bg-white/45";

/** @deprecated Row-pulse skeleton count — prefer {@link ADMINV2_DEPT_PAIRED_OPER_PANEL_MIN_H} quiet reserve on dept route load. */
export const ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT = 3;

/** Opportunity drawer body reserve while queue preview seed is active (sidebar bootstrap). */
export const ADMINV2_DRAWER_OPPORTUNITY_BOOTSTRAP_BODY_MIN_H = "10.5rem";

/** Opportunity workflow-shaped drawer body reserve (record chrome pending). */
export const ADMINV2_DRAWER_OPPORTUNITY_WORKFLOW_BODY_MIN_H = "13.5rem";

/** Workflow timeline strip height in opportunity inquiry header. */
export const ADMINV2_DRAWER_OPPORTUNITY_TIMELINE_MIN_H = "36px";

/** Opportunity drawer title-rail quick-action reserve (workflow v1). */
export const ADMINV2_DRAWER_OPPORTUNITY_TITLE_RAIL_MIN_H = "2.75rem";

/** AdminV2 opportunity workflow drawer tab panel host (Card 3 — stable tab switch). */
export const ADMINV2_DRAWER_TAB_PANEL_MIN_H = "22rem";

/** Drawer panel opens immediately on `openDrawer` — geometry locked before bootstrap returns. */
export const ADMINV2_DRAWER_SHELL_INSTANT_ATTR = "data-adminv2-drawer-shell-instant";

/** Max wait for `surface=drawer_primary` before revealing bootstrap shell (one coordinated paint). */
export const ADMINV2_OPPORTUNITY_DRAWER_REVEAL_COORD_MAX_MS = 1400;

export function adminV2DeptPairedOperPanelReserveStyle(): { minHeight: string } {
    return { minHeight: ADMINV2_DEPT_PAIRED_OPER_PANEL_MIN_H };
}

export function adminV2DeptKpiQuietReserveStyle(): { minHeight: string } {
    return { minHeight: ADMINV2_DEPT_KPI_QUIET_RESERVE_MIN_H };
}

export function adminV2WorkUnitQueueLaneReserveStyle(): { minHeight: string } {
    return { minHeight: ADMINV2_WORK_UNIT_QUEUE_LANE_MIN_H };
}

export function adminV2DrawerTabPanelHostStyle(): { minHeight: string } {
    return { minHeight: ADMINV2_DRAWER_TAB_PANEL_MIN_H };
}
