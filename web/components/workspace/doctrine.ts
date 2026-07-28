/**
 * @module Alloy Workspace Doctrine — component barrel
 *
 * ## Purpose
 * Single import surface for every operational module workspace (Processing, Communications,
 * Work Items, Scheduling, Attendance, Billing, Reporting).
 *
 * **Processing (Digital Mailroom) is the certified reference implementation.** Future modules
 * compose these primitives unchanged — module code supplies data and content only.
 *
 * ## Visual hierarchy (five layers — frozen)
 *
 * | Layer | Name | Components |
 * |-------|------|------------|
 * | 1 | Application shell | `WorkspaceShell`, `WorkspaceHeader`, `WorkspaceModeNav`, `WorkspaceModeTabs`, `WorkspaceSubTabs` |
 * | 2 | Workspace field | `WS_SHELL_INSET`, `WS_FIELD_CANVAS`, `WS_FIELD` |
 * | 3 | White operational surfaces | `WorkspaceSurface`, `WorkspaceCard`, `WorkspaceZonePanel` |
 * | 4 | Interactive objects | `WS_ACTION_PRIMARY`, `WS_ACTION_SECONDARY`, artifact controls |
 * | 5 | Selection / Bend Pine | `WS_ROW_SELECTED`, active tabs, queue selection rails |
 *
 * ## Required hierarchy (never deviate)
 * ```
 * WorkspaceShell
 *   WorkspaceHeader
 *   WorkspaceModeNav → WorkspaceModeTabs + WorkspaceSubTabs [+ WorkspaceOperationalHealth]
 *   WS_SHELL_INSET → WS_FIELD_CANVAS
 *     WorkspaceSurface / WorkspaceCard / WorkspaceZonePanel
 *     WorkspaceDivider (zone separation)
 * ```
 *
 * ## Color doctrine (frozen — no additional accent colors)
 * | Token | Use |
 * |-------|-----|
 * | Midnight Forge | structure, titles, inventory icons |
 * | Alloy Slate | metadata, counts, secondary copy |
 * | Bend Pine | action, selection, progress, primary CTA |
 * | Alloy Gold | publish, finalized, completed |
 * | Alloy Ember | needs-review attention (KPI only) |
 *
 * ## Metric philosophy (V3)
 * Metrics are **contextual, operational, and section-scoped** — they belong to the active
 * section, never the workspace as a whole. No inventory totals, no workspace-wide rollups,
 * no interactive cards. Rendered as a flat `WorkspaceOperationalHealth` strip with a reserved
 * trend line per metric. `WorkspaceMetricTiles` is legacy (Communications / Work Items only
 * until migrated).
 *
 * @see docs/platform/core/navigation-and-workspace-doctrine.md — Alloy Operational Workspace Doctrine V3
 */

export { default as WorkspaceShell } from "@/components/workspace/WorkspaceShell";
export type { WorkspaceShellHeader } from "@/components/workspace/WorkspaceShell";
export { default as WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
export { default as WorkspaceModeNav } from "@/components/workspace/WorkspaceModeNav";
export { default as WorkspaceModeTabs } from "@/components/workspace/WorkspaceModeTabs";
export { default as WorkspaceSubTabs } from "@/components/workspace/WorkspaceSubTabs";
export { default as WorkspaceMetricTiles } from "@/components/workspace/WorkspaceMetricTiles";
export type {
    WorkspaceMetricTileItem,
    WorkspaceMetricStatus,
    WorkspaceMetricTilesSize,
    WorkspaceMetricTilesAlign,
} from "@/components/workspace/WorkspaceMetricTiles";
export { default as WorkspaceOperationalHealth } from "@/components/workspace/WorkspaceOperationalHealth";
export type {
    WorkspaceOperationalHealthItem,
    WorkspaceOperationalHealthTrend,
    WorkspaceOperationalHealthTrendDirection,
    WorkspaceOperationalHealthTone,
} from "@/components/workspace/WorkspaceOperationalHealth";
export { default as WorkspaceSection } from "@/components/workspace/WorkspaceSection";
export { default as WorkspaceCard } from "@/components/workspace/WorkspaceCard";
export { default as WorkspaceZonePanel } from "@/components/workspace/WorkspaceZonePanel";
export { default as WorkspaceDivider } from "@/components/workspace/WorkspaceDivider";
export { default as WorkspaceSurface } from "@/components/workspace/WorkspaceSurface";
export {
    WorkspaceOverviewStack,
    WorkspaceOverviewActionRow,
    WorkspaceOverviewActivityBand,
    WorkspaceOverviewInfoGrid,
    WorkspaceOverviewInfoPrimary,
} from "@/components/workspace/WorkspaceOverviewLayout";

/** Design tokens — import when composing custom layout inside doctrine surfaces. */
export {
    WS_FIELD,
    WS_SHELL_INSET,
    WS_FIELD_CANVAS,
    WS_CONTROL_BAND_DIVIDER,
    WS_SHELL_NAV_CLASS,
    WS_QUEUE_RAIL,
    WS_CANVAS,
    WS_INSPECTOR,
    WS_METRIC_EYEBROW,
    WS_METRIC_EYEBROW_INLINE,
    WS_KPI_CARD_CHROME,
    WS_PANEL_SURFACE_FLAT,
    WS_PROCESS_TILE_CHROME,
    WS_ACTION_PRIMARY,
    WS_ACTION_SECONDARY,
    WS_OVERVIEW_CONTENT,
    WS_OVERVIEW_STACK,
    WS_OVERVIEW_ACTION_GRID,
    WS_OVERVIEW_ACTIVITY_GRID,
    WS_OVERVIEW_INFO_GRID,
    WS_OVERVIEW_INFO_PRIMARY,
    WS_OVERVIEW_INFO_SPLIT,
    WS_OVERVIEW_LAUNCH_GRID,
} from "@/components/workspace/workspaceTokens";
