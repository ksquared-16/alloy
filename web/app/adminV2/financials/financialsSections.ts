/**
 * FINANCIALS — the workspace product structure.
 *
 * ── WORK AND STUDIO ──
 *
 * Work is running the financial day. Studio is what the day is made of — and Financials has a
 * real one, because the configuration already exists at `/organization/financials`: the
 * commercial catalogue, tuition rates, policies, accounting mappings, the simulator and the
 * funding boundary.
 *
 * Thread 4 declined a Studio for exactly the right reason at the time — a mode rail with one
 * position in it is furniture, and a Studio that DUPLICATED that configuration would be worse
 * than none. This one duplicates nothing: it is a launch and summary surface over the canonical
 * owners, and every tile navigates to the page that actually persists the setting. No
 * configuration is authored here and nothing is written here.
 *
 * ── WHY THESE WORK SECTIONS, AND NOT MORE ──
 *
 * Each one has a canonical owner, a proven cross-household read seam, and its own location
 * semantics. A section that cannot be filled truthfully is a navigation promise the product
 * cannot keep, so the test for adding one is a read seam, not an ambition.
 *
 *   Overview    the landing: money-related figures from the registered Financials metric pack
 *   Accounts    households carrying posted money, from the position cohort
 *   Charges     draft charges waiting to be posted, and the path to acting on them
 *   Payments    money in, and money in that is not settling anything
 *   Subsidy     expected funding, submitted-claim suppression, and unresolved variance
 *   Activity    what happened lately — explanatory history, never a balance
 *
 * ── AND WHAT IS STILL ABSENT ──
 *
 * There is no P&L section and no Revenue figure anywhere in this workspace. Recognised revenue
 * needs a revenue-recognition policy, deferral and a chart of accounts posting policy for every
 * childcare consequence. The platform's double-entry `gl_*` tables belong to the job vertical
 * and are dormant. P&L requires accounting-domain ownership beyond current Financials V1, and a
 * tab that implied otherwise would create the accounting semantics by pretending to report them.
 */

export type FinancialsMode = "work" | "studio";

export type FinancialsWorkSection =
    | "overview"
    | "accounts"
    | "charges"
    | "payments"
    | "subsidy"
    | "activity";

/** Studio has one surface: the launch board over the canonical configuration owners. */
export type FinancialsStudioSection = "setup";

export type FinancialsSection = FinancialsWorkSection | FinancialsStudioSection;

export const FINANCIALS_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
] as const;

export const FINANCIALS_WORK_SECTIONS: { key: FinancialsWorkSection; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "accounts", label: "Accounts" },
    { key: "charges", label: "Charges" },
    { key: "payments", label: "Payments" },
    { key: "subsidy", label: "Subsidy" },
    { key: "activity", label: "Activity" },
];

export const FINANCIALS_STUDIO_SECTIONS: { key: FinancialsStudioSection; label: string }[] = [
    { key: "setup", label: "Setup" },
];

const WORK_KEYS = new Set(FINANCIALS_WORK_SECTIONS.map((s) => s.key));

export function financialsSectionsForMode(mode: FinancialsMode): { key: FinancialsSection; label: string }[] {
    return mode === "studio" ? FINANCIALS_STUDIO_SECTIONS : FINANCIALS_WORK_SECTIONS;
}

/** The section a mode lands on when it is entered. */
export function defaultFinancialsSection(mode: FinancialsMode): FinancialsSection {
    return mode === "studio" ? "setup" : "overview";
}

export function isFinancialsWorkSection(value: unknown): value is FinancialsWorkSection {
    return typeof value === "string" && WORK_KEYS.has(value as FinancialsWorkSection);
}

export function isFinancialsSection(value: unknown): value is FinancialsSection {
    return isFinancialsWorkSection(value) || value === "setup";
}
