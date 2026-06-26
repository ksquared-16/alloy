"use client";

/**
 * Alloy OS — positional / priority preload model (documented, lightweight).
 *
 * This module is the single documented source for *the order in which a surface prepares its
 * contents*. It does not introduce a scheduler or virtualization engine — the existing systems
 * (workspace tile bundles, work-unit queue bootstrap, default-subject auto-open, Focus Panel mode
 * prewarm) already do the work. This codifies their intended priority so the experience reads as
 * "primary first → visible next → offscreen later", not "everything at once / random order".
 *
 * Priority is positional: what the operator is most likely looking at (top-left primary tile,
 * active subject) prepares first; offscreen / non-critical work is deferred to idle.
 */

/** Ordered phases for preparing the /workspace surface. Lower index = higher priority. */
export const WORKSPACE_PRELOAD_PRIORITY = [
    /** 1. Org shell + primary (top-left) business process tile — the operator's landing focus. */
    "primary_tile",
    /** 2. Remaining tiles currently visible in layout order. */
    "visible_tiles",
    /** 3. KPI / health values hydrate into their reserved placement (no separate loader). */
    "kpi_placements",
    /** 4. Lower-priority / offscreen tiles + inactive process surfaces, warmed after idle. */
    "offscreen_tiles",
] as const;

export type WorkspacePreloadPriority = (typeof WORKSPACE_PRELOAD_PRIORITY)[number];

/** Ordered phases for preparing a Work Unit operating surface. Lower index = higher priority. */
export const WORK_UNIT_PRELOAD_PRIORITY = [
    /** 1. The active operational subject (default auto-open / deep-link record) and its Focus Panel. */
    "active_subject",
    /** 2. The condensed queue rows for the active lane that are visible above the fold. */
    "visible_rows",
    /** 3. Adjacent visible rows (just below the fold) prefetch on intent / as they approach. */
    "adjacent_rows",
    /** 4. Non-active lanes — metadata / counts only, not full row hydration. */
    "inactive_lane_metadata",
    /** 5. Non-active Focus Panel modes prewarm after the active mode is interactive. */
    "focus_panel_modes",
    /** 6. Heavy embedded workspaces (e.g. Communications inside the Focus Panel) stay lazy until opened. */
    "embedded_workspaces",
] as const;

export type WorkUnitPreloadPriority = (typeof WORK_UNIT_PRELOAD_PRIORITY)[number];

/**
 * Whether a given work-unit preparation step is allowed to run eagerly on entry (vs. deferred to
 * intent / idle). Steps after the visible rows are deferred so entry stays focused on the active
 * subject and the rail the operator actually sees. This is intentionally a simple positional rule
 * rather than a virtualization budget — keep it dumb until measurements demand more.
 */
export function workUnitPriorityRunsEagerlyOnEntry(step: WorkUnitPreloadPriority): boolean {
    return step === "active_subject" || step === "visible_rows";
}
