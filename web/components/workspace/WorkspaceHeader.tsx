"use client";

/**
 * @module WorkspaceHeader
 *
 * ## Purpose
 * Module-level header for operational modal workspaces: icon, title, optional tagline,
 * action rail, and Close. Bend Pine left accent + top wash.
 *
 * ## When to use
 * As the first child of `WorkspaceShell` for Processing, Communications, Work Items,
 * Scheduling, Attendance, Billing, Reporting, and future modules.
 *
 * ## Do NOT use for
 * - Org-level `/workspace` landing headers (Presentation Runtime `WorkspaceHeader` in
 *   `@/components/presentation/workspace/WorkspaceHeader` — different component, same name).
 * - Record drawer / Focus Panel record titles.
 * - Settings page titles.
 *
 * Import operational module header from `@/components/workspace/doctrine`.
 * Import org-level presentation header from `@/components/presentation/workspace/WorkspaceHeader`.
 */

export {
    default,
    OPERATIONAL_PRIMARY_ACTION_CLASS as WORKSPACE_PRIMARY_ACTION_CLASS,
    OPERATIONAL_SECONDARY_ACTION_CLASS as WORKSPACE_SECONDARY_ACTION_CLASS,
} from "@/app/adminV2/components/OperationalModalHeader";
