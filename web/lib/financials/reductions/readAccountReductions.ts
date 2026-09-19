/**
 * THE MANUAL REDUCTIONS ON A HOUSEHOLD'S ACCOUNT, AS RECORDS AN OPERATOR CAN ACT ON.
 *
 * `financial_reduction_applications` already holds every reduction, but nothing rendered them. The
 * reconciliation shows what they came to — a `discountsCents` and an `adjustmentsCents` total — and
 * a total cannot be reversed. Reversing one needs its `application_id`, and an operator cannot be
 * asked to know that, so the records have to reach the surface.
 *
 * ── ONLY THE MANUAL ONES ──
 *
 * `reduction_kind` separates a decision somebody made by hand from the output of authored policy.
 * Both lower what a family owes and both land in the same reconciliation bucket, but only one of
 * them is anybody's to reverse: undoing a policy application by hand would leave the policy still
 * saying the family qualifies, and the next billing run would simply apply it again. Policy rows are
 * therefore read for CONTEXT and never offered a reversal.
 *
 * ── SCOPED BY AGREEMENT, NOT BY CUSTOMER ──
 *
 * `customer_id` is nullable on these rows — the writer passes it through as `?? null` — so scoping a
 * household by that column silently loses the reductions that carry only an agreement. The caller
 * already resolved this household's agreements to build its subjects; the same set scopes this, and
 * there is no second answer to "whose account is this".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountReduction = {
    applicationId: string;
    /** `manual` was decided by a person; `policy` came from authored commercial policy. */
    kind: string;
    agreementId: string | null;
    customerMemberId: string | null;
    /** The category the reduction was written under: credit, adjustment, discount, subsidy_offset. */
    category: string | null;
    /** SIGNED cents, exactly as stored. Negative lowers what the family owes. */
    amountCents: number;
    currencyCode: string;
    reason: string | null;
    periodKey: string | null;
    createdAt: string | null;
    /** The charge row this reduction wrote — how it reaches the ledger. */
    chargeId: string | null;
    /**
     * The obligation this reduction is ABOUT, when it names one.
     *
     * This is the field every reader that answers "what does this charge still owe" nets against. A
     * reduction without it moves the ledger's signed total and reduces no obligation, so whether it
     * is present is the difference between two authorities agreeing and disagreeing.
     */
    sourceChargeId: string | null;
    /**
     * The status of that charge: `draft` until somebody posts it.
     *
     * This is load-bearing, not decoration. A manual reduction is written as a DRAFT, and a draft is
     * not owed — so the decision exists and what the family owes has not moved yet. A surface that
     * showed the amount without the status would be telling an operator the money had changed.
     */
    chargeStatus: string | null;
    /** Set once this reduction has been reversed. Its presence is the reverse-once bound. */
    reversedByApplicationId: string | null;
    /** Set on a reversal, naming the reduction it undoes. */
    reversesApplicationId: string | null;

    /*
     * ── THE PROVENANCE THE TABLE ALWAYS STORED AND THIS READER USED TO DROP ────────────────────
     *
     * `financial_reduction_applications` exists precisely so a reduction is not money without a
     * reason: it records which authored policy produced the number, what the number was calculated
     * on, whether a cap bound it, and the policy AS IT WAS at the moment of application. The select
     * asked for none of it, so an operator looking at -$260.06 in the ledger could see the money and
     * not the decision — which is the question the table was created to answer.
     *
     * Nothing here is inferred. Every field below is a column, read as stored.
     */

    /** The authored `commercial_policies` row that produced this, when a policy did. */
    commercialPolicyId: string | null;
    /** `discount` | `sibling_discount` | `waiver` — what KIND of reduction the policy is. */
    policyKind: string | null;
    /** `percentage` | `amount` — how the number was reached. */
    basis: string | null;
    /** The authored value: 10 for 10%, or cents for a fixed amount. */
    basisValue: number | null;
    /** What the percentage was taken ON, in cents. */
    basisAmountCents: number | null;
    /** True when a configured cap bound the result below what the basis would have given. */
    capped: boolean;
    /** The human sentence the applier wrote, where it wrote one. */
    explanation: string | null;
    /** The service period the reduction belongs to, where it names one. */
    periodStart: string | null;
    periodEnd: string | null;
};

type Row = Record<string, unknown>;

const t = (v: unknown): string => (v != null ? String(v).trim() : "");
const nullable = (v: unknown): string | null => {
    const s = t(v);
    return s === "" ? null : s;
};

/**
 * Every reduction recorded against these agreements, newest first.
 *
 * Returns [] for an empty agreement list rather than querying for nothing — a household with no
 * enrolment has no agreement-scoped reductions, and `.in()` on an empty array is a query that can
 * only ever answer nothing.
 */
export async function readAccountReductions(
    supabase: SupabaseClient,
    input: { orgId: string; agreementIds: readonly string[] },
): Promise<AccountReduction[]> {
    const ids = [...new Set(input.agreementIds.map((id) => t(id)).filter(Boolean))];
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from("financial_reduction_applications")
        .select(
            "id, reduction_kind, enrollment_agreement_id, customer_member_id, charge_id, "
            + "source_charge_id, amount_cents, currency_code, reason, period_key, created_at, "
            + "reversed_by_id, reverses_id, "
            // The decision behind the money — see the provenance note on the type.
            + "commercial_policy_id, policy_kind, basis, basis_value, basis_amount_cents, "
            + "capped, explanation, period_start, period_end",
        )
        .eq("org_id", input.orgId)
        .in("enrollment_agreement_id", ids);
    if (error) throw new Error(`reductions unavailable: ${error.message}`);

    const rows = (data ?? []) as unknown as Row[];
    const chargeIds = [...new Set(rows.map((r) => t(r.charge_id)).filter(Boolean))];

    /*
     * The CATEGORY lives on the charge the reduction wrote, not on the application row. Without it
     * the surface cannot tell a credit from an adjustment, and those are different decisions.
     */
    const categoryByCharge = new Map<string, string>();
    const statusByCharge = new Map<string, string>();
    if (chargeIds.length > 0) {
        const { data: chargeRows } = await supabase
            .from("charges")
            .select("id, charge_category, status")
            .eq("org_id", input.orgId)
            .in("id", chargeIds);
        for (const c of (chargeRows ?? []) as unknown as Row[]) {
            const id = t(c.id);
            if (id) {
                categoryByCharge.set(id, t(c.charge_category));
                statusByCharge.set(id, t(c.status));
            }
        }
    }

    return rows
        .map((r): AccountReduction => ({
            applicationId: t(r.id),
            kind: t(r.reduction_kind),
            agreementId: nullable(r.enrollment_agreement_id),
            customerMemberId: nullable(r.customer_member_id),
            category: categoryByCharge.get(t(r.charge_id)) ?? null,
            amountCents: Number(r.amount_cents) || 0,
            currencyCode: t(r.currency_code) || "USD",
            reason: nullable(r.reason),
            periodKey: nullable(r.period_key),
            createdAt: nullable(r.created_at),
            commercialPolicyId: nullable(r.commercial_policy_id),
            policyKind: nullable(r.policy_kind),
            basis: nullable(r.basis),
            basisValue: r.basis_value == null ? null : Number(r.basis_value),
            basisAmountCents: r.basis_amount_cents == null ? null : Number(r.basis_amount_cents),
            capped: r.capped === true,
            explanation: nullable(r.explanation),
            periodStart: nullable(r.period_start),
            periodEnd: nullable(r.period_end),
            chargeId: nullable(r.charge_id),
            chargeStatus: statusByCharge.get(t(r.charge_id)) ?? null,
            sourceChargeId: nullable(r.source_charge_id),
            reversedByApplicationId: nullable(r.reversed_by_id),
            reversesApplicationId: nullable(r.reverses_id),
        }))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
