/**
 * Operational Workspace Doctrine V2 — canonical primitives for module workspaces.
 * Processing (Digital Mailroom) is the certified reference implementation.
 */

export { default as WorkspaceShell } from "./WorkspaceShell";
export { default as WorkspaceHeader, OPERATIONAL_PRIMARY_ACTION_CLASS, OPERATIONAL_SECONDARY_ACTION_CLASS } from "./WorkspaceHeader";
export { default as WorkspaceModeTabs } from "./WorkspaceModeTabs";
export { default as WorkspaceSubTabs } from "./WorkspaceSubTabs";
export { default as WorkspaceMetricTiles, type WorkspaceMetricTileItem } from "./WorkspaceMetricTiles";
export { default as WorkspaceSurface, workspaceSurfaceDividerClass } from "./WorkspaceSurface";
export { default as WorkspaceCard, type WorkspaceCardTier } from "./WorkspaceCard";
export { default as WorkspaceZonePanel, WorkspaceZoneEmptyHint } from "./WorkspaceZonePanel";
export { default as WorkspaceDivider } from "./WorkspaceDivider";
