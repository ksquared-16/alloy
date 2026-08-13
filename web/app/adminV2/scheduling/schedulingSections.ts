/**
 * Assignments Workspace product structure — Work | Studio (Operational Workspace Doctrine V3).
 *
 * Work    — Overview (attention), Roster (execution + bulk commands), Daily Roster
 *           (combined child + staff expectation for one day), Attendance.
 * Studio  — Assignment Categories · Patterns · Validation. Templates stay hidden until usable.
 *
 * Commands live in the header Actions dropdown and on Roster selection — not a separate tab.
 * Scheduling (room × day, ratios, patterns) is a property of assignments — not the workspace noun.
 */

export type SchedulingMode = "work" | "studio";

export type SchedulingWorkView = "overview" | "roster" | "daily_roster" | "attendance";
/** Templates retained for deep-link compatibility; not shown in Studio tabs until usable. */
export type SchedulingStudioView = "types" | "patterns" | "templates" | "validation";
export type SchedulingSection = SchedulingWorkView | SchedulingStudioView;

export const SCHEDULING_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
];

export const SCHEDULING_WORK_TABS: { key: SchedulingWorkView; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "roster", label: "Roster" },
    { key: "daily_roster", label: "Daily Roster" },
    { key: "attendance", label: "Attendance" },
];

export const SCHEDULING_STUDIO_TABS: { key: SchedulingStudioView; label: string }[] = [
    { key: "types", label: "Assignment Categories" },
    { key: "patterns", label: "Patterns" },
    { key: "validation", label: "Validation" },
];

/** Which mode a section belongs to — drives mode inference on deep navigation. */
export const SCHEDULING_SECTION_MODE: Record<SchedulingSection, SchedulingMode> = {
    overview: "work",
    roster: "work",
    daily_roster: "work",
    attendance: "work",
    types: "studio",
    patterns: "studio",
    templates: "studio",
    validation: "studio",
};
