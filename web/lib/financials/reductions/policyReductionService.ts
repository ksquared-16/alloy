/**
 * A FINANCIAL POLICY DECIDED THIS, AND THE ROW SAYS SO.
 *
 * Operational Consumption resolves an obligation — a vacation day an organisation's policy says
 * earns a credit — and values it against the tuition the family actually agreed to. This is the
 * last step: turning that decision into money, once, through the same engine a manual credit and a
 * commercial discount already use.
 *
 * ── WHY IT IS NOT `applyManualReduction` ──
 *
 * Because it would be a lie. A manual reduction is one an operator granted by hand, and its reason
 * IS its record. This was granted by a `financial_policies` row of type `vacation_credit`, and the
 * row now has somewhere truthful to say that: `financial_policy_id`, beside the commercial sibling
 * rather than instead of it. Writing it as manual would make an automated commercial consequence
 * indistinguishable from an operator's discretion, and no later reader could tell them apart.
 *
 * ── WHY THE OBLIGATION IS THE IDENTITY ──
 *
 * Not the child, not the date, not the policy. Those repeat. The resolved obligation is the one
 * thing that means "this specific consequence, decided once" — it is what the consumption grain
 * already treats as canonical downstream identity, and anchoring here means a replay of the whole
 * chain converges on the same reduction rather than crediting a family twice for one vacation.
 *
 * ── GROSS STAYS GROSS ──
 *
 * Nothing here touches the tuition charge. The credit is a second consequence written beside it: a
 * negative contra charge plus the decision row that explains it. The family's net position moves;
 * what they were billed does not.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyReductionCore, ReductionCoreError, type ReductionCoreResult } from "@/lib/financials/reductions/reductionCore";

export class PolicyReductionError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

/** The category a policy reduction posts through — contra-revenue, already code-owned taxonomy. */
const REDUCTION_CATEGORY = "discount";

export type VacationCreditReductionInput = {
    orgId: string;
    actorUserId: string | null;
    /** The obligation this answers. The lineage anchor across corrections. */
    resolvedObligationId: string;
    /** The consumption event under which the obligation became financially current. */
    materializingEventId: string;
    /** The `financial_policies` row that authorised it. Required — see the authority rule below. */
    financialPolicyId: string;
    enrollmentAgreementId: string;
    customerId?: string | null;
    customerMemberId?: string | null;
    /** The gross this reduces, when the period's tuition charge is known. */
    sourceChargeId?: string | null;
    /** POSITIVE cents. The magnitude of the credit; the row is written negative. */
    amountCents: number;
    currencyCode?: string | null;
    /** The date the credit belongs to, so it lands in the period it reduces. */
    effectiveDate: string;
    periodKey: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    /** The structured valuation, so the figure can be reconstructed without today's config. */
    valuation: {
        acceptedTermId: string | null;
        acceptedPeriodAmountCents: number | null;
        periodDays: number | null;
        creditedDays: number;
    };
    /** The policy AS IT WAS when it decided. */
    policySnapshot?: Record<string, unknown>;
    explanation?: string | null;
};

export type PolicyReductionResult = {
    applicationId: string;
    chargeId: string;
    amountCents: number;
    idempotent: boolean;
};

/**
 * ONE CONSEQUENCE, ONE CREDIT — and a consequence is not the same thing as an obligation.
 *
 * The obligation is the lineage anchor and it survives correction: a day corrected to attended and
 * corrected back again reinstates the SAME obligation row, which is right, because it is the same
 * logical thing being argued about. But its money is not the same money. The first credit was
 * withdrawn when the child turned out to have attended, and withdrawn money is settled — reviving
 * it would rewrite a decision rather than make a new one.
 *
 * So the identity carries the incarnation: the obligation, AND the consumption event under which it
 * became financially current. Replaying one version converges on its own credit; restoring a
 * consequence after it was withdrawn mints a new one beside the old, and both stay readable.
 *
 * Both halves come from persisted lineage — `resolved_obligations.consumption_event_id` is what
 * reconciliation reparents — so an auditor can reconstruct the key rather than having to trust it.
 * Deliberately not a timestamp or a random id: those would dodge idempotency instead of expressing
 * it, and a replay would mint money every time.
 */
export function vacationCreditReductionKey(resolvedObligationId: string, materializingEventId: string): string {
    return `fred:policy:vacation_credit:${resolvedObligationId}:${materializingEventId}`;
}

export async function applyVacationCreditReduction(
    supabase: SupabaseClient,
    input: VacationCreditReductionInput,
): Promise<PolicyReductionResult> {
    /*
     * EXACTLY ONE AUTHORITY, CHECKED HERE AND NOT ONLY IN THE DATABASE.
     *
     * The CHECK constraint enforces the same rule and stays as defence in depth for anything
     * arriving another way. But a caller that forgot the policy should be told what it forgot, in
     * the domain's words, before a draft charge exists to clean up — and this path's answer is
     * never ambiguous: a vacation credit is decided by a financial policy, so that id is required
     * and the commercial one must be absent.
     */
    if (!input.financialPolicyId) {
        throw new PolicyReductionError(
            "missing_policy_authority",
            "A vacation credit is decided by a financial policy. Without naming it, the reduction could not explain what authorised the money.",
        );
    }
    if (!input.resolvedObligationId || !input.materializingEventId) {
        throw new PolicyReductionError(
            "missing_obligation",
            "A policy reduction answers a resolved obligation under a particular consumption event. Without both there is nothing to be idempotent against, and a replay would credit the family twice.",
        );
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new PolicyReductionError(
            "invalid_amount",
            "A vacation credit needs a whole, positive amount in cents; the reduction is written as its negative.",
        );
    }

    let result: ReductionCoreResult;
    try {
        result = await applyReductionCore(supabase, {
            orgId: input.orgId,
            actorUserId: input.actorUserId,
            subject: {
                enrollmentAgreementId: input.enrollmentAgreementId,
                customerId: input.customerId ?? null,
                customerMemberId: input.customerMemberId ?? null,
                sourceChargeId: input.sourceChargeId ?? null,
                periodKey: input.periodKey,
                periodStart: input.periodStart ?? null,
                periodEnd: input.periodEnd ?? null,
            },
            charge: {
                chargeCategory: REDUCTION_CATEGORY,
                description: "vacation credit",
                serviceDate: input.effectiveDate,
                currencyCode: input.currencyCode ?? "USD",
                metadata: {
                    source: "policy_reduction",
                    policy_kind: "vacation_credit",
                    resolved_obligation_id: input.resolvedObligationId,
                    materializing_event_id: input.materializingEventId,
                    reduces_charge_id: input.sourceChargeId ?? null,
                    period_key: input.periodKey,
                },
            },
            applications: [{
                reductionKind: "policy",
                policyKind: "vacation_credit",
                financialPolicyId: input.financialPolicyId,
                commercialPolicyId: null,
                resolvedObligationId: input.resolvedObligationId,
                /*
                 * THE FIGURE, RECONSTRUCTABLE. `basis_amount_cents` is what a full period cost,
                 * `basis_value` how many days were credited out of it, and the snapshot carries the
                 * accepted term and the period length. Together they answer "why this number"
                 * without rerunning today's pricing configuration — which is the point, because
                 * today's configuration is exactly what will have changed by the time anyone asks.
                 */
                basis: "amount",
                basisValue: input.valuation.creditedDays,
                basisAmountCents: input.valuation.acceptedPeriodAmountCents,
                policySnapshot: {
                    ...(input.policySnapshot ?? {}),
                    accepted_term_id: input.valuation.acceptedTermId,
                    accepted_period_amount_cents: input.valuation.acceptedPeriodAmountCents,
                    period_days_used: input.valuation.periodDays,
                    credited_days: input.valuation.creditedDays,
                    period_key: input.periodKey,
                    snapshot_at: new Date().toISOString(),
                },
                explanation: input.explanation
                    ?? `vacation credit — ${input.valuation.creditedDays} day(s) of ${input.periodKey}`,
                // NEGATIVE: the reduction is written beside the gross, not into it.
                amountCents: -input.amountCents,
                idempotencyKey: vacationCreditReductionKey(input.resolvedObligationId, input.materializingEventId),
            }],
            // The obligation is re-derived each run, so a draft whose valuation moved reconciles.
            onExisting: "reconcile",
        });
    } catch (error) {
        if (error instanceof ReductionCoreError) throw new PolicyReductionError(error.code, error.message);
        throw error;
    }

    return {
        applicationId: result.applicationIds[0]!,
        chargeId: result.chargeId,
        amountCents: result.amountCents,
        idempotent: result.kind !== "applied",
    };
}
