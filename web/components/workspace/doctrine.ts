/**
 * @module Alloy Workspace Doctrine — component barrel
 *
 * ## Purpose
 * Single import surface for every operational module workspace (Processing, Communications,
 * Work Items, Scheduling, Attendance, Billing, Reporting). Processing (Digital Mailroom) is
 * the reference implementation.
 *
 * ## Required hierarchy (never deviate)
 * ```
 * WorkspaceHeader        Module title + tagline + actions + close
 * WorkspaceModeTabs      Work | Studio
 * WorkspaceSubTabs       Module section tabs (Overview | Queue, …)
 * WorkspaceSurface       Stone field workspace body
 *   WorkspaceCard        White contained surfaces
 *   WorkspaceZonePanel   Multi-column zones (queue, source, inspector)
 *   WorkspaceMetricTiles Canonical metric tiles
 *   WorkspaceDivider     Subtle stone separators
 *   WorkspaceSection     Labeled content groups
 * ```
 *
 * ## Background doctrine
 * Stone workspace field (~4%), white surfaces, white cards, thin stone separators,
 * soft elevation. No flat white modal backgrounds. No per-module themes.
 *
 * ## Color doctrine (frozen)
 * | Token | Use |
 * |-------|-----|
 * | Midnight Forge | structure, navigation, typography, icons, secondary actions |
 * | Bend Pine | primary action, selection, progress, success (never decoration) |
 * | Alloy Gold | attention, published |
 * | White | surfaces and cards |
 * | River Stone | workspace field |
 *
 * No other accent colors in operational module workspaces.
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
    WS_SHELL_NAV_CLASS,
    WS_QUEUE_RAIL,
    WS_CANVAS,
    WS_INSPECTOR,
    WS_METRIC_EYEBROW_INLINE,
    WS_KPI_CARD_CHROME,
    WS_PANEL_SURFACE_FLAT,
    WS_PROCESS_TILE_CHROME,
    WS_ACTION_PRIMARY,
    WS_ACTION_SECONDARY,
} from "@/components/workspace/workspaceTokens";
