/**
 * Effective-standing derivation (P1 · Wave C · C2).
 *
 * The Operational Expectation ledger is append-only, so a `proposed` row's standing
 * is NEVER mutated to `binding`. Binding is recorded by a separate, immutable
 * Ratification Act; the EFFECTIVE standing is DERIVED: an expectation is `binding`
 * iff its authored row is already binding (self-ratified at author time — a later
 * path) OR a ratification act exists for it; otherwise it keeps its authored
 * standing (`proposed` for a deontic awaiting ratification, `model` for predicted).
 *
 * Pure; no IO.
 */

import type { ExpectationStanding } from "@/lib/operationalExpectations/expectationLedgerContract";

/**
 * Derive the effective standing of an expectation from its authored (row) standing
 * and whether a ratification act exists for it.
 */
export function resolveEffectiveStanding(
    authoredStanding: ExpectationStanding,
    hasRatification: boolean,
): ExpectationStanding {
    if (authoredStanding === "binding") return "binding";
    // `model` = a predicted expectation: it imposes no obligation and NEVER binds,
    // even defensively (a ratification cannot target a predicted expectation).
    if (authoredStanding === "model") return "model";
    // proposed → binding iff a ratification act exists; else still proposed.
    return hasRatification ? "binding" : "proposed";
}

/** True iff the expectation is effectively binding (either authored binding or ratified). */
export function isEffectivelyBinding(
    authoredStanding: ExpectationStanding,
    hasRatification: boolean,
): boolean {
    return resolveEffectiveStanding(authoredStanding, hasRatification) === "binding";
}
