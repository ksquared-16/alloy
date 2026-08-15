/**
 * Roster workspace product structure.
 *
 * Roster is the EXPECTATION layer — who is expected where and when, given the
 * commitments Assignments owns. Attendance is the ACTUALITY layer over the same
 * daily operating population. They are two modes of one operational day, which is
 * why they are two sections of one workspace rather than two workspaces.
 *
 * Staff and Children join them as the DURABLE population underneath both: the people the operating
 * day is made of, whether or not any queue is currently working them. They were a separate Records
 * workspace, and the separation asked the operator to know in advance whether they wanted "the day"
 * or "the people" — when the answer is almost always both, about the same person, minutes apart.
 * A director looking at a short room and a director looking at Lennon's record are one director.
 *
 *   Roster      Day / Week × Rooms / Staff — the operating plan
 *   Attendance  who is actually here, today
 *   Staff       people who work here      (Person + Employment)
 *   Children    children in the org       (the household member row)
 *
 * There is deliberately no third level. The shared shell supplies the section
 * tabs, and Roster's own Day/Week range and Rooms/Staff lens live in its toolbar —
 * a nested "Roster › Roster" would be a level that means nothing to an operator.
 *
 * The workspace is named `Roster` for V1. Whether a broader "Daily Operations"
 * noun eventually covers this is undecided and deliberately not pre-empted here.
 */

export type RosterSection = "roster" | "attendance" | "staff" | "children";

export const ROSTER_SECTION_TABS: { key: RosterSection; label: string }[] = [
    { key: "roster", label: "Roster" },
    { key: "attendance", label: "Attendance" },
    { key: "staff", label: "Staff" },
    { key: "children", label: "Children" },
];

/**
 * Resolve a section from a deep link, including links written while these surfaces lived elsewhere.
 *
 * `daily_roster` was the day grain of Roster and resolves to Roster rather than dead-ending.
 * `staff` / `children` were the two sections of the separate Records workspace; every link ever
 * written to Records — a stored deep link, a bookmark, a redirect from `/organization/staff` —
 * arrives here now, and resolving them is what makes the re-home a MOVE rather than a removal.
 */
export function resolveRosterSection(raw: string | null | undefined): RosterSection | null {
    if (!raw) return null;
    if (raw === "attendance") return "attendance";
    if (raw === "roster" || raw === "daily_roster") return "roster";
    if (raw === "staff" || raw === "children") return raw;
    return null;
}
