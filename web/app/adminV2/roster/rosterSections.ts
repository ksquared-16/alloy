/**
 * Roster workspace product structure.
 *
 * Roster is the EXPECTATION layer — who is expected where and when, given the
 * commitments Assignments owns. Attendance is the ACTUALITY layer over the same
 * daily operating population. They are two modes of one operational day, which is
 * why they are two sections of one workspace rather than two workspaces.
 *
 *   Roster      Day / Week × Rooms / Staff — the operating plan
 *   Attendance  who is actually here, today
 *
 * There is deliberately no third level. The shared shell supplies the section
 * tabs, and Roster's own Day/Week range and Rooms/Staff lens live in its toolbar —
 * a nested "Roster › Roster" would be a level that means nothing to an operator.
 *
 * The workspace is named `Roster` for V1. Whether a broader "Daily Operations"
 * noun eventually covers this is undecided and deliberately not pre-empted here.
 */

export type RosterSection = "roster" | "attendance";

export const ROSTER_SECTION_TABS: { key: RosterSection; label: string }[] = [
    { key: "roster", label: "Roster" },
    { key: "attendance", label: "Attendance" },
];

/**
 * Resolve a section from a deep link, including links written while these
 * surfaces still lived in Assignments. `daily_roster` was the day grain of
 * Roster; it resolves to Roster rather than dead-ending.
 */
export function resolveRosterSection(raw: string | null | undefined): RosterSection | null {
    if (!raw) return null;
    if (raw === "attendance") return "attendance";
    if (raw === "roster" || raw === "daily_roster") return "roster";
    return null;
}
