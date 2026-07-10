"use client";

/**
 * @module WorkspaceSubTabs
 *
 * ## Purpose
 * Underline sub-section tabs inside an active workspace mode (Overview | Queue,
 * Inbox | Templates, Forms | Packets, …).
 *
 * ## When to use
 * Inside `WorkspaceModeNav` beneath the mode rail. Reads as subordinate to Work | Studio.
 *
 * ## Do NOT use for
 * - Primary Work | Studio switching (use `WorkspaceModeTabs`).
 * - Record drawer / Focus Panel tabs.
 */

export { default } from "@/app/adminV2/communications/CommsModalTabBar";
