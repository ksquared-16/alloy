"use client";

/**
 * @module WorkspaceModeTabs
 *
 * ## Purpose
 * Primary mode selector for operational module workspaces (Work | Studio).
 *
 * ## When to use
 * Inside `WorkspaceModeNav` or standalone when a module needs the canonical bordered-pill
 * mode switch. Bend Pine marks the active mode.
 *
 * ## Do NOT use for
 * - Sub-section tabs (use `WorkspaceSubTabs`).
 * - Settings/configuration plane navigation.
 * - Generic tab bars outside the workspace shell hierarchy.
 */

export { default, type AlloyModeOption as WorkspaceMode } from "@/components/workspace/AlloyModeSwitch";
