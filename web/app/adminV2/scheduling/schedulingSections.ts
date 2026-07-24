/**
 * Scheduling Workspace product structure — Work | Studio (Operational Workspace Doctrine V3).
 *
 * Work    — operational planning: Overview (what needs attention today), Roster
 *           (room × weekday occupancy + ratios), Attendance (Phase 2).
 * Studio  — Scheduling administration: Schedule Patterns (create/edit/duplicate/archive),
 *           Planning (future/seasonal/bulk landing), Calculations (operator explanation of
 *           the governed Operational Calculations Scheduling consumes). Studio administers
 *           Scheduling in place — it never redirects operators back to Settings.
 *
 * ## IA decision — Templates collapsed into Schedule Patterns (2026-07-22)
 * A "Schedule Pattern" already IS the reusable day + hours + type shape the editor applies
 * to set an entire schedule — exactly what a "Template" would be. Maintaining both is a
 * duplicate concept with no material difference in V1, so **Templates is collapsed into
 * Schedule Patterns** (one vocabulary: Patterns). "Future Drafts" likewise folds into
 * **Planning** (proposed pre-enrollment schedules are a planning artifact). Net Studio =
 * Patterns · Planning · Calculations.
 *
 * ## Staff-ready IA
 * Modes/sections are data-driven strings, and the Roster/Studio are structured so a future
 * **Staff Scheduling** capability adds a Work sub-tab and/or a Studio section without
 * reshaping the shell — no child-only assumption is hardcoded into the navigation.
 *
 * These are the section tabs the shared WorkspaceShell renders; mode-scoped so the
 * sub-tab rail only ever shows the active mode's sections (Processing reference).
 */

export type SchedulingMode = "work" | "studio";

export type SchedulingWorkView = "overview" | "roster" | "attendance";
export type SchedulingStudioView = "patterns" | "planning" | "calculations";
export type SchedulingSection = SchedulingWorkView | SchedulingStudioView;

export const SCHEDULING_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
];

export const SCHEDULING_WORK_TABS: { key: SchedulingWorkView; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "roster", label: "Roster" },
    { key: "attendance", label: "Attendance" },
];

export const SCHEDULING_STUDIO_TABS: { key: SchedulingStudioView; label: string }[] = [
    { key: "patterns", label: "Schedule Patterns" },
    { key: "planning", label: "Planning" },
    { key: "calculations", label: "Calculations" },
];

/** Which mode a section belongs to — drives mode inference on deep navigation. */
export const SCHEDULING_SECTION_MODE: Record<SchedulingSection, SchedulingMode> = {
    overview: "work",
    roster: "work",
    attendance: "work",
    patterns: "studio",
    planning: "studio",
    calculations: "studio",
};
