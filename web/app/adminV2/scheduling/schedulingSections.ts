/**
 * Assignments Workspace product structure — Work | Studio (Operational Workspace Doctrine V3).
 *
 * Work    — Overview (attention), Assignments (the ledger index + bulk commands),
 *           Roster (the expected operating plan, Day or Week), Attendance (actual).
 * Studio  — Assignment Categories · Patterns · Validation. Templates stay hidden until usable.
 *
 * There were two tabs called "Roster" and "Daily Roster". They read the same
 * subject matter at two grains through two projections, and they disagreed: one
 * showed a staffing verdict, the other showed capacity health beside a demand
 * number. "Which Roster?" is not a question an operator should have to answer.
 *
 * Roster is now ONE surface with a Day/Week range, and the assignment index —
 * which is ledger content, not roster content — is its own tab under its own name.
 *
 * Commands live in the header Actions dropdown and on Assignments selection.
 * Scheduling (room × day, ratios, patterns) is a property of assignments — not the workspace noun.
 */

export type SchedulingMode = "work" | "studio";

export type SchedulingWorkView = "overview" | "assignments";
/** Templates retained for deep-link compatibility; not shown in Studio tabs until usable. */
export type SchedulingStudioView = "types" | "patterns" | "templates" | "validation";
export type SchedulingSection = SchedulingWorkView | SchedulingStudioView;

/**
 * The range Roster is showing. Day is the operating surface; Week is the plan.
 * Declared here because Roster's read models and section vocabulary grew up in
 * this module; the surface itself now lives in the Roster workspace.
 */
export type RosterRange = "day" | "week";

export const SCHEDULING_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
];

export const SCHEDULING_WORK_TABS: { key: SchedulingWorkView; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "assignments", label: "Assignments" },
];

export const SCHEDULING_STUDIO_TABS: { key: SchedulingStudioView; label: string }[] = [
    { key: "types", label: "Assignment Categories" },
    { key: "patterns", label: "Patterns" },
    { key: "validation", label: "Validation" },
];

/**
 * Resolve a work view from a deep link.
 *
 * `roster` / `daily_roster` / `attendance` are deliberately NOT handled here.
 * They are forwarded to the Roster workspace before this workspace ever opens
 * (see `dispatchAdminV2OpenSchedulingModal`). Mapping them onto an Assignments
 * tab is exactly the two-owners ambiguity the move removed.
 */
export function resolveWorkView(raw: string | null | undefined): SchedulingWorkView | null {
    if (!raw) return null;
    if (raw === "overview" || raw === "assignments") return raw;
    return null;
}

/** Which mode a section belongs to — drives mode inference on deep navigation. */
export const SCHEDULING_SECTION_MODE: Record<SchedulingSection, SchedulingMode> = {
    overview: "work",
    assignments: "work",
    types: "studio",
    patterns: "studio",
    templates: "studio",
    validation: "studio",
};
