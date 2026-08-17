/**
 * OPERATIONS — the workspace product structure, and the one canonical key.
 *
 * Operations is where the operating day is run and configured. It replaces three top-level products
 * that were each a partial answer to the same operator question:
 *
 *   Roster       the operating day, and the people it is made of
 *   Records      those same people, browsed durably
 *   Assignments  the commitments the day is derived from, plus their configuration
 *
 * An operator looking at a short room and an operator looking at Lennon's record are one operator,
 * minutes apart. Three doors made them declare in advance which question they were about to ask.
 *
 * ── `operations` IS THE CANONICAL KEY, NOT AN ALIAS FOR `roster` ──
 *
 * Keeping `roster` as the internal key "for convenience" would have been cheaper by exactly one
 * rename and wrong permanently: every later reader would learn that the workspace IS Roster and that
 * Operations is chrome, which is the opposite of what happened. Roster is one of four WORK sections.
 * `roster`, `records` and `scheduling` survive only as compatibility inputs to the resolvers below —
 * they name no state and no coordinator key.
 *
 * ── WORK AND STUDIO ARE THE EXISTING GRAMMAR ──
 *
 * Not a new shell primitive. Assignments already proved Work | Studio on the canonical
 * `WorkspaceShell`, and Operations composes the same one: a product that both RUNS the day and
 * CONFIGURES what the day is made of needs exactly that split, and inventing a second vocabulary for
 * it would be two answers to one question.
 */

export type OperationsMode = "work" | "studio";

/** WORK — running the operating day, and the durable population underneath it. */
export type OperationsWorkSection = "roster" | "attendance" | "staff" | "children";

/**
 * STUDIO — configuring what the day is made of.
 *
 * `templates` is retained in the TYPE for deep-link compatibility and is deliberately absent from
 * the tabs: it was never shown in the Assignments Studio either, and a link naming it resolves to
 * the section that actually exists rather than dead-ending.
 */
export type OperationsStudioSection = "types" | "patterns" | "validation" | "templates";

export type OperationsSection = OperationsWorkSection | OperationsStudioSection;

export const OPERATIONS_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
];

export const OPERATIONS_WORK_TABS: { key: OperationsWorkSection; label: string }[] = [
    { key: "roster", label: "Roster" },
    { key: "attendance", label: "Attendance" },
    { key: "staff", label: "Staff" },
    { key: "children", label: "Children" },
];

export const OPERATIONS_STUDIO_TABS: { key: OperationsStudioSection; label: string }[] = [
    { key: "types", label: "Assignment Categories" },
    { key: "patterns", label: "Patterns" },
    { key: "validation", label: "Validation" },
];

/** Which mode a section belongs to — drives mode inference on deep navigation. */
export const OPERATIONS_SECTION_MODE: Record<OperationsSection, OperationsMode> = {
    roster: "work",
    attendance: "work",
    staff: "work",
    children: "work",
    types: "studio",
    patterns: "studio",
    validation: "studio",
    templates: "studio",
};

/**
 * Resolve a WORK section from any link ever written to the products Operations absorbed.
 *
 * `daily_roster` was Roster's day grain. `staff` / `children` were the two sections of the separate
 * Records workspace — every stored deep link, bookmark and `/organization/staff` redirect arrives
 * here. Resolving them is what makes this a MOVE rather than a removal.
 */
export function resolveOperationsWorkSection(
    raw: string | null | undefined,
): OperationsWorkSection | null {
    if (!raw) return null;
    if (raw === "attendance") return "attendance";
    if (raw === "roster" || raw === "daily_roster") return "roster";
    if (raw === "staff" || raw === "children") return raw;
    return null;
}

/**
 * Resolve a STUDIO section, including the Assignments Studio's own vocabulary.
 *
 * `templates` resolves to `patterns`: it is the section a templates link was always trying to reach,
 * and forwarding it is more honest than opening a tab that has never been shown.
 */
export function resolveOperationsStudioSection(
    raw: string | null | undefined,
): Exclude<OperationsStudioSection, "templates"> | null {
    if (!raw) return null;
    if (raw === "types" || raw === "patterns" || raw === "validation") return raw;
    if (raw === "templates") return "patterns";
    return null;
}

/**
 * Resolve an ASSIGNMENTS work-view link onto Operations.
 *
 * The retired Assignments workspace had two work views. `assignments` was the commitment ledger,
 * which is now the Roster surface's Assignments LENS — so the link lands on Roster and the caller
 * selects that lens. `overview` was an attention board that Operations does not rebuild; it forwards
 * to Roster, whose control band already carries the operational health signals.
 *
 * Returning the lens explicitly rather than folding it into the section keeps the two facts
 * separate: which SECTION to open, and what that section should be showing.
 */
export function resolveAssignmentsWorkDestination(
    raw: string | null | undefined,
): { section: OperationsWorkSection; lens?: "assignments" } | null {
    if (!raw) return null;
    if (raw === "assignments") return { section: "roster", lens: "assignments" };
    if (raw === "overview") return { section: "roster" };
    return resolveOperationsWorkSection(raw) ? { section: resolveOperationsWorkSection(raw)! } : null;
}

/**
 * The range Roster is showing. Day is the operating surface; Week is the plan.
 *
 * Declared here because it is Roster's own vocabulary and Roster is an Operations section. It lived
 * in `schedulingSections` for historical reasons — the surface grew up inside the Assignments
 * workspace — and moved with the surface rather than outliving the module that hosted it.
 */
export type RosterRange = "day" | "week";
