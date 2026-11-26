/**
 * Provider cost units — the measured cost of one governed reasoning execution.
 *
 * A COUNT OF UNITS, not money. There is no currency here, no pricing table, no
 * token formula and no ledger semantics: the runtime records what a strategy
 * reports having spent, and nothing derives a figure of its own.
 *
 * Ownership follows ADR-2. Cost lives in Trust usage/economics telemetry
 * associated with a Decision Package. The package carries the cost VALUE
 * because it is provider-independent — a number of units says nothing about
 * which provider produced it — while provider and model IDENTITY stay out of
 * the package entirely.
 *
 * Pure. No I/O, no clock, no provider.
 *
 * @see docs/platform/trust/trust-economics.md — Cost Measurement
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.7
 */

/**
 * A validated cost: finite, non-negative, and zero-representable.
 *
 * The brand exists so a raw `number` cannot be assigned where a checked cost is
 * required — the only way to obtain one is through {@link parseProviderCostUnits}.
 */
export type ProviderCostUnits = number;

/** The cost of an execution in which no provider participated. */
export const ZERO_COST_UNITS: ProviderCostUnits = 0;

export const COST_UNITS_REJECTION_REASONS = [
    "not_a_number",
    "not_finite",
    "negative",
] as const;

export type CostUnitsRejectionReason = (typeof COST_UNITS_REJECTION_REASONS)[number];

export type ParseProviderCostUnitsResult =
    | { readonly ok: true; readonly value: ProviderCostUnits }
    | { readonly ok: false; readonly reason: CostUnitsRejectionReason; readonly detail: string };

/**
 * Validates a reported cost.
 *
 * Omission is not an error: a strategy that reports nothing spent nothing, and
 * `undefined`/`null` resolve to zero, preserving the pre-Slice-0.7 default.
 *
 * Everything else is refused rather than repaired. An invalid cost is never
 * clamped to zero, because silently recording "0" for a NaN would report a
 * provider-backed execution as free — the exact misstatement this validator
 * exists to prevent.
 */
export function parseProviderCostUnits(raw: unknown): ParseProviderCostUnitsResult {
    if (raw === undefined || raw === null) return { ok: true, value: ZERO_COST_UNITS };

    if (typeof raw !== "number") {
        return {
            ok: false,
            reason: "not_a_number",
            detail: `Provider cost units must be a number; received ${typeof raw}. A cost is never a string, an object or a pricing structure.`,
        };
    }
    // NaN and ±Infinity both fail here; NaN is reported distinctly because a
    // NaN usually means an arithmetic bug rather than an overflow.
    if (Number.isNaN(raw)) {
        return { ok: false, reason: "not_a_number", detail: "Provider cost units must not be NaN." };
    }
    if (!Number.isFinite(raw)) {
        return { ok: false, reason: "not_finite", detail: "Provider cost units must be finite." };
    }
    if (raw < 0) {
        return {
            ok: false,
            reason: "negative",
            detail: `Provider cost units must not be negative; received ${raw}. Reasoning cannot refund.`,
        };
    }
    return { ok: true, value: raw };
}

/** True when a value is a usable cost. Convenience over {@link parseProviderCostUnits}. */
export function isValidProviderCostUnits(raw: unknown): boolean {
    return parseProviderCostUnits(raw).ok;
}
