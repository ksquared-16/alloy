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
 *   WorkspaceModeNav → WorkspaceModeTabs + WorkspaceSubTabs [+ WorkspaceOperationalHealthStrip]
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
 * @see docs/platform/core/navigation-and-workspace-doctrine.md — Alloy Operational Workspace Doctrine V2
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
export { default as WorkspaceOperationalHealthStrip } from "@/components/workspace/WorkspaceOperationalHealthStrip";
export type {
    WorkspaceOperationalHealthItem,
    OperationalHealthStatus,
} from "@/components/workspace/WorkspaceOperationalHealthStrip";
export { default as WorkspaceSection } from "@/components/workspace/WorkspaceSection";
export { default as WorkspaceCard } from "@/components/workspace/WorkspaceCard";
export { default as WorkspaceZonePanel } from "@/components/workspace/WorkspaceZonePanel";
export { default as WorkspaceDivider } from "@/components/workspace/WorkspaceDivider";
export { default as WorkspaceSurface } from "@/components/workspace/WorkspaceSurface";

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
    WS_OPERATIONAL_HEALTH_STRIP,
    WS_KPI_CARD_CHROME,
    WS_PANEL_SURFACE_FLAT,
    WS_PROCESS_TILE_CHROME,
    WS_ACTION_PRIMARY,
    WS_ACTION_SECONDARY,
} from "@/components/workspace/workspaceTokens";
