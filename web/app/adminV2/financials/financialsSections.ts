/**
 * FINANCIALS — the workspace product structure.
 *
 * Two sections, and only two, because only two are true today.
 *
 *   Overview   what financial work needs attention right now
 *   Charges    the draft charges waiting to be posted, and the operator's path to acting on them
 *
 * ── WHY THERE IS NO STUDIO ──
 *
 * Operations has Work | Studio because it both RUNS the operating day and CONFIGURES what the day is
 * made of. Financials configuration already exists and already has a home: `/organization/financials`
 * owns the commercial catalogue, policies, accounting calendars and the simulator. Adding a Studio
 * here would either move that product or duplicate it, and a mode rail with one position in it is
 * furniture — which is exactly the reasoning Operations records for the rail it removed.
 *
 * ── WHY THERE ARE NOT MORE WORK SECTIONS ──
 *
 * Collectible balances, unapplied payments, responsibility exceptions, subsidy claims and subsidy
 * variances are all real operator work and all have canonical owners. None of them has a
 * cross-household read seam yet, and a section that cannot be filled truthfully is a navigation
 * promise the product cannot keep. They are follow-on expansions of this same shell, not V1.
 */

export type FinancialsMode = "work";
export type FinancialsSection = "overview" | "charges";

export const FINANCIALS_MODES = [{ key: "work" as const, label: "Work" }] as const;

export const FINANCIALS_SECTIONS: { key: FinancialsSection; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "charges", label: "Charges" },
];

export function isFinancialsSection(value: unknown): value is FinancialsSection {
    return value === "overview" || value === "charges";
}
