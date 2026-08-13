/**
 * The one place a PLANNED staffing verdict becomes colour and words.
 *
 * Colour doctrine, which is the whole reason this is centralised:
 *
 *   sufficient  Bend Pine — and ONLY here. Green means "evaluated, and met".
 *   short       the existing attention treatment.
 *   unknown     NEUTRAL stone. The platform could not resolve staffing demand,
 *               and painting that green is a lie the operator cannot see through.
 *   idle        NEUTRAL stone. An empty register is not a satisfied one; a closed
 *               campus rendered uniformly green hides the rooms that matter.
 *
 * Two surfaces owned private copies of this and drifted: the day roster honoured
 * the doctrine while the week board had no staffing colour at all and showed a
 * CAPACITY-derived "Healthy" chip instead, so a room short every day of the week
 * rendered green. Capacity chrome is deliberately not in this file — it is a
 * different verdict and must never borrow this vocabulary.
 */

export type StaffingSufficiencyVerdict = "sufficient" | "short" | "unknown" | "idle";

/** Chip chrome for a staffing verdict. */
export function staffingChipChrome(verdict: StaffingSufficiencyVerdict | undefined): string {
    if (verdict === "sufficient") return "bg-[#00A283]/10 text-[#00715C] ring-1 ring-[#00A283]/25";
    if (verdict === "short") return "bg-alloy-gold/15 text-alloy-midnight ring-1 ring-alloy-gold/40";
    return "bg-alloy-stone/15 text-alloy-midnight/55 ring-1 ring-alloy-stone/25";
}

/** Inline text chrome for a staffing line inside a dense cell. */
export function staffingTextChrome(verdict: StaffingSufficiencyVerdict | undefined): string {
    if (verdict === "sufficient") return "text-[#00715C]";
    if (verdict === "short") return "font-semibold text-alloy-gold-dark";
    return "text-alloy-midnight/45";
}

/** Operator wording. `unknown` and `idle` say what they are, never "fine". */
export function staffingVerdictLabel(verdict: StaffingSufficiencyVerdict | undefined): string {
    if (verdict === "sufficient") return "Staffed";
    if (verdict === "short") return "Short";
    if (verdict === "idle") return "No one expected";
    return "Unknown";
}
