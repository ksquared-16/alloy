/**
 * COMPENSATION TERMS — what this employment is paid, and since when.
 *
 * Pure. Every function here takes rows and a date and returns an answer; nothing
 * reads, writes or decides who may see it.
 *
 * ── THE CURRENT TERM IS A QUESTION ABOUT A DATE ──
 *
 * "What do they earn" has no answer without "on what day". A raise effective next
 * month is already recorded and is not current; a term that ended in March is not
 * current either, and both are true rows. So resolution is always as-of a date,
 * and the caller must supply one rather than receive today's answer by accident.
 */

export type PayBasis = "hourly" | "salary";
export type RateUnit = "hour" | "annual";

export type CompensationTermRow = {
    id: string;
    employment_id: string;
    pay_basis: PayBasis;
    rate_amount: number | string;
    rate_unit: RateUnit;
    rate_currency: string;
    effective_start: string;
    effective_end: string | null;
    supersedes_id: string | null;
    is_active: boolean;
    note: string | null;
};

export type CompensationTerm = {
    id: string;
    payBasis: PayBasis;
    /** Minor-unit-safe: the database stores numeric(12,2); this is a number for arithmetic. */
    rateAmount: number;
    rateUnit: RateUnit;
    currency: string;
    effectiveStart: string;
    effectiveEnd: string | null;
    supersedesId: string | null;
    isActive: boolean;
    note: string | null;
};

export function toCompensationTerm(row: CompensationTermRow): CompensationTerm {
    return {
        id: row.id,
        payBasis: row.pay_basis,
        rateAmount: typeof row.rate_amount === "string" ? Number(row.rate_amount) : row.rate_amount,
        rateUnit: row.rate_unit,
        currency: row.rate_currency,
        effectiveStart: row.effective_start,
        effectiveEnd: row.effective_end,
        supersedesId: row.supersedes_id,
        isActive: row.is_active,
        note: row.note,
    };
}

/** In force on `asOf`: started on or before it, and not yet ended. */
export function isTermInForce(term: CompensationTerm, asOf: string): boolean {
    if (!term.isActive) return false;
    if (term.effectiveStart > asOf) return false;
    return term.effectiveEnd == null || term.effectiveEnd >= asOf;
}

/**
 * The one term in force on a date.
 *
 * A unique index forbids two open-ended active terms per employment, so at most
 * one can match. When several somehow do, the latest start wins and the answer is
 * still deterministic rather than whichever row the database returned first.
 */
export function resolveCurrentTerm(
    terms: readonly CompensationTerm[],
    asOf: string,
): CompensationTerm | null {
    const inForce = terms.filter((t) => isTermInForce(t, asOf));
    if (inForce.length === 0) return null;
    return [...inForce].sort((a, b) => b.effectiveStart.localeCompare(a.effectiveStart))[0]!;
}

/** Terms that start after `asOf` — a recorded raise that has not taken effect. */
export function resolveFutureTerms(
    terms: readonly CompensationTerm[],
    asOf: string,
): CompensationTerm[] {
    return terms
        .filter((t) => t.isActive && t.effectiveStart > asOf)
        .sort((a, b) => a.effectiveStart.localeCompare(b.effectiveStart));
}

/** Everything that is no longer in force, newest first. History, never discarded. */
export function resolveHistoricalTerms(
    terms: readonly CompensationTerm[],
    asOf: string,
): CompensationTerm[] {
    return terms
        .filter((t) => t.effectiveEnd != null && t.effectiveEnd < asOf)
        .sort((a, b) => b.effectiveStart.localeCompare(a.effectiveStart));
}

/**
 * Operator copy for a rate. Never a raw key, and never a bare number.
 *
 * The unit is part of the fact: "24.50" is meaningless and "$24.50 / hour" is not,
 * and an annual figure shown without its unit reads as an hourly one.
 */
export function formatCompensationRate(term: CompensationTerm): string {
    const amount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: term.currency || "USD",
        minimumFractionDigits: term.payBasis === "salary" ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(term.rateAmount);
    return term.payBasis === "salary" ? `${amount} / year` : `${amount} / hour`;
}

/** The basis in the operator's words. */
export function payBasisLabel(basis: PayBasis): string {
    return basis === "salary" ? "Salary" : "Hourly";
}

/**
 * A validation verdict for a proposed term.
 *
 * `rate_unit` is derived from the basis rather than accepted from the caller: an
 * hourly term carrying an annual unit is a data-entry error that would read as a
 * thirty-fold pay cut, and the database rejects it anyway. Deriving it means the
 * caller cannot construct that row at all.
 */
export function rateUnitForBasis(basis: PayBasis): RateUnit {
    return basis === "salary" ? "annual" : "hour";
}
