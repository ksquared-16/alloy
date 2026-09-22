/**
 * WHEN IS THIS CHARGE DUE? — one answer, from the organisation's configured terms.
 *
 * ── THE FIVE DATES STAY FIVE DATES ────────────────────────────────────────────────────────────
 *
 * A charge already carries four, and they answer different questions that organisations genuinely
 * answer differently:
 *
 *   SERVICE DATE     when the chargeable event happened          (`occurs_on`)
 *   BILLING PERIOD   which commercial cycle owns the obligation  (derived from `billable_on`)
 *   INVOICE DATE     when the obligation is issued               (`billable_on`)
 *   DUE DATE         when payment is expected                    (`due_date`)
 *   PAYMENT DATE     when money actually arrived                 (`payments.received_at`)
 *
 * They MAY coincide and must not be assumed to. `Billing Period Oct 1–31, invoiced Sep 25, due Oct
 * 1` is an ordinary arrangement, and a model that collapsed any two of these would be unable to
 * express it. This module only computes the fourth from the second and third; it invents no date
 * and overrides none.
 *
 * ── WHY A RESOLVER RATHER THAN A DEFAULT ─────────────────────────────────────────────────────
 *
 * An unconfigured organisation must keep exactly today's behaviour. So `resolveDueDate` returns
 * `null` when no policy applies, and every caller treats null as "leave the due date as it was" —
 * not as "due today", and not as "due on the invoice date". Inventing a due date for a tenant that
 * has not stated its terms would put a collections consequence on a decision nobody made.
 *
 * ── AND WHY IT IS NOT A SECOND POLICY AUTHORITY ──────────────────────────────────────────────
 *
 * It resolves through `resolveFinancialPolicy`, the same narrowing every other financial policy
 * uses — org, location, service, rate plan, effective-dated — so a due-date rule scoped to one
 * service wins over the org's in exactly the way a proration rule does. There is no second
 * precedence order to keep in sync.
 */

import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";

export type DueDateInputs = {
    /** The invoice/bill date — `billable_on`, the date the obligation is issued. */
    invoiceDate: string | null;
    /** The commercial period this obligation belongs to. */
    periodStart: string | null;
    /** Narrowing, so a service-scoped rule can beat the organisation's. */
    serviceId?: string | null;
};

export type DueDateResolution = {
    /** `null` means NO CONFIGURED RULE — the caller must leave the due date untouched. */
    dueDate: string | null;
    /** Which strategy decided it, for evidence and for the operator's explanation. */
    strategy: string | null;
    /** Why there is no date, when there is none. */
    reason: "resolved" | "no_policy" | "missing_input" | "unknown_strategy";
};

function addDays(ymd: string, days: number): string {
    const t = Date.parse(`${ymd}T00:00:00Z`);
    if (!Number.isFinite(t)) return ymd;
    return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function wholeDays(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    // A malformed offset is ZERO, not NaN propagating into a date. An offset nobody can read is an
    // offset nobody intended, and "due on the anchor" is the least surprising reading of it.
    return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * Resolve the due date for one obligation.
 *
 * `asOf` is the date the policy window is evaluated at — the invoice date, so a rule that takes
 * effect in October does not retroactively re-date September's obligations.
 */
export function resolveDueDate(
    policies: readonly FinancialPolicyRow[],
    inputs: DueDateInputs,
): DueDateResolution {
    const asOf = inputs.invoiceDate ?? inputs.periodStart ?? null;
    if (!asOf) return { dueDate: null, strategy: null, reason: "missing_input" };

    const resolved = resolveFinancialPolicy(
        policies,
        "due_date",
        { serviceId: inputs.serviceId ?? undefined },
        asOf,
    );
    if (!resolved.resolved) return { dueDate: null, strategy: null, reason: "no_policy" };

    const value = (resolved.policy.value ?? {}) as { strategy?: string; offset_days?: unknown };
    const strategy = typeof value.strategy === "string" ? value.strategy.trim() : "";
    const offset = wholeDays(value.offset_days);

    switch (strategy) {
        case "on_invoice":
            return inputs.invoiceDate
                ? { dueDate: inputs.invoiceDate, strategy, reason: "resolved" }
                : { dueDate: null, strategy, reason: "missing_input" };
        case "days_after_invoice":
            return inputs.invoiceDate
                ? { dueDate: addDays(inputs.invoiceDate, offset), strategy, reason: "resolved" }
                : { dueDate: null, strategy, reason: "missing_input" };
        case "on_period_start":
            return inputs.periodStart
                ? { dueDate: inputs.periodStart, strategy, reason: "resolved" }
                : { dueDate: null, strategy, reason: "missing_input" };
        case "days_after_period_start":
            return inputs.periodStart
                ? { dueDate: addDays(inputs.periodStart, offset), strategy, reason: "resolved" }
                : { dueDate: null, strategy, reason: "missing_input" };
        default:
            /*
             * A stored strategy this build does not know is REPORTED, never guessed at. It means the
             * database permits a value the application has not caught up with — the same class of
             * drift `vacation_credit` documents having had — and guessing would put a date on a
             * family's obligation on the strength of a string nobody here understands.
             */
            return { dueDate: null, strategy: strategy || null, reason: "unknown_strategy" };
    }
}
