/**
 * GROSS STAYS GROSS — the reduction is a second consequence, written beside it.
 *
 * This is Thread 10's write path. It reads the gross tuition charges a period already produced,
 * asks `resolveFinancialReductions` what legitimately reduces each of them, and records the answer
 * twice: once as money (a `discount`-category charge, negative, against the SAME billable source so
 * the family's card picks it up in the same period) and once as a decision
 * (`financial_reduction_applications`, carrying the policy, the basis and the snapshot).
 *
 * Nothing here re-prices anything. The accepted pricing term is still what a month costs; the
 * catalog is not consulted; `charges.amount_cents` on the gross row is never touched.
 *
 * ── WHY THE POSTED CASE IS CHECKED FIRST ──
 *
 * Thread 7 learned this at cost: a pipeline that writes before it checks leaves a settled month's
 * provenance rewritten under money that cannot move. So a gross charge whose reduction is already
 * POSTED is reported and skipped before anything is written. A DRAFT reduction may be recalculated
 * in place — that is what a draft is for — and a posted one is corrected by appending, never by
 * an update.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { billingPeriodBounds } from "@/lib/financials/reductions/reductionPeriod";
import { createChildcareDraftCharge, recalculateDraftCharge } from "@/lib/financials/childcareChargeService";
import { resolveHouseholdEligibility } from "@/lib/financials/reductions/resolveReductionEligibility";
import {
    reductionKey,
    resolveFinancialReductions,
    type AppliedReduction,
    type ReductionPolicy,
    type ReductionPolicyKind,
} from "@/lib/financials/reductions/resolveFinancialReductions";

const REDUCTION_KINDS: readonly ReductionPolicyKind[] = ["waiver", "sibling_discount", "discount"];
/** The category a policy reduction posts through — contra-revenue, already in the code-owned taxonomy. */
const REDUCTION_CATEGORY = "discount";

export type ReductionOutcome =
    | { kind: "applied"; chargeId: string; sourceChargeId: string; customerMemberId: string; amountCents: number; policyIds: string[] }
    | { kind: "unchanged"; sourceChargeId: string; customerMemberId: string }
    | { kind: "already_posted"; sourceChargeId: string; customerMemberId: string }
    | { kind: "not_eligible"; sourceChargeId: string; customerMemberId: string; reason: string }
    | { kind: "refused"; sourceChargeId: string; customerMemberId: string; reason: string; detail: string };

export type ReductionRunResult = {
    periodKey: string;
    servicePeriod: { start: string; end: string };
    counts: { applied: number; unchanged: number; alreadyPosted: number; notEligible: number; refused: number };
    outcomes: ReductionOutcome[];
};

type GrossChargeRow = {
    id: string;
    billable_source_id: string;
    amount_cents: number;
    currency_code: string;
    charge_category: string;
    status: string;
    service_date: string | null;
    billable_on: string | null;
};

export async function applyFinancialReductions(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        periodKey: string;
        actorUserId?: string | null;
        /** Narrow the run to one household. Absent, every household with gross tuition in the period. */
        customerIds?: readonly string[] | null;
    },
): Promise<ReductionRunResult> {
    const periodKey = args.periodKey.trim();
    const period = billingPeriodBounds(periodKey);

    // The org's winning-eligible policies. `readPolicies` is Commercial's reader, not a second one.
    const allPolicies = await readPolicies({ supabase, orgId: args.orgId } as never);
    const active = allPolicies.filter(
        (p) =>
            p.isActive
            && (REDUCTION_KINDS as readonly string[]).includes(p.kind)
            && (!p.effective.start || p.effective.start <= period.end)
            && (!p.effective.end || p.effective.end >= period.start),
    );

    // ── THE GROSS THIS PERIOD PRODUCED ──────────────────────────────────────────────────────
    const { data: chargeRows, error: chargeError } = await supabase
        .from("charges")
        .select("id, billable_source_id, amount_cents, currency_code, charge_category, status, service_date, billable_on")
        .eq("org_id", args.orgId)
        .eq("billable_source_type", "enrollment_agreement")
        .eq("charge_category", "tuition")
        .gte("service_date", period.start)
        .lte("service_date", period.end);
    if (chargeError) throw new Error(`gross read failed: ${chargeError.message}`);
    const gross = ((chargeRows ?? []) as GrossChargeRow[]).filter((c) => c.status !== "void" && c.amount_cents > 0);

    // Agreement → household + child. The reduction belongs to the same subject as the gross.
    const agreementIds = [...new Set(gross.map((c) => c.billable_source_id))];
    const { data: agreementRows, error: agreementError } = agreementIds.length
        ? await supabase
              .from("child_enrollment_agreements")
              .select("id, customer_id, customer_member_id")
              .eq("org_id", args.orgId)
              .in("id", agreementIds)
        : { data: [], error: null };
    if (agreementError) throw new Error(`agreement read failed: ${agreementError.message}`);
    const subjectByAgreement = new Map(
        ((agreementRows ?? []) as Array<{ id: string; customer_id: string | null; customer_member_id: string | null }>)
            .map((a) => [a.id, a]),
    );

    const scope = args.customerIds?.length ? new Set(args.customerIds) : null;
    const eligibilityByCustomer = new Map<string, Awaited<ReturnType<typeof resolveHouseholdEligibility>>>();
    const outcomes: ReductionOutcome[] = [];

    for (const charge of gross) {
        const subject = subjectByAgreement.get(charge.billable_source_id);
        const customerId = subject?.customer_id ?? null;
        const memberId = subject?.customer_member_id ?? null;
        if (!customerId || !memberId) continue;
        if (scope && !scope.has(customerId)) continue;

        if (!eligibilityByCustomer.has(customerId)) {
            eligibilityByCustomer.set(
                customerId,
                await resolveHouseholdEligibility(supabase, {
                    orgId: args.orgId,
                    customerId,
                    periodStart: period.start,
                    periodEnd: period.end,
                }),
            );
        }
        const facts = eligibilityByCustomer.get(customerId)!.byMember.get(memberId) ?? {
            siblingRank: 1,
            siblingCount: 1,
            employeeHousehold: eligibilityByCustomer.get(customerId)!.employeeHousehold,
        };

        const policies: ReductionPolicy[] = active.map((p) => ({
            id: p.id,
            kind: p.kind as ReductionPolicyKind,
            params: p.params,
            label: (p.params.label as string | undefined) ?? p.kind,
        }));

        const decision = resolveFinancialReductions({
            gross: {
                chargeId: charge.id,
                customerMemberId: memberId,
                enrollmentAgreementId: charge.billable_source_id,
                amountCents: charge.amount_cents,
                currencyCode: charge.currency_code,
                categoryKey: charge.charge_category,
                periodKey,
            },
            policies,
            facts,
        });

        if (decision.kind === "not_eligible") {
            outcomes.push({ kind: "not_eligible", sourceChargeId: charge.id, customerMemberId: memberId, reason: decision.reason });
            continue;
        }
        if (decision.kind === "refused") {
            outcomes.push({
                kind: "refused",
                sourceChargeId: charge.id,
                customerMemberId: memberId,
                reason: decision.reason,
                detail: decision.detail,
            });
            continue;
        }

        const written = await persistReductions(supabase, {
            orgId: args.orgId,
            actorUserId: args.actorUserId ?? null,
            charge,
            customerId,
            customerMemberId: memberId,
            periodKey,
            period,
            reductions: decision.reductions,
            policyById: new Map(active.map((p) => [p.id, p])),
        });
        outcomes.push(written);
    }

    return {
        periodKey,
        servicePeriod: period,
        counts: {
            applied: outcomes.filter((o) => o.kind === "applied").length,
            unchanged: outcomes.filter((o) => o.kind === "unchanged").length,
            alreadyPosted: outcomes.filter((o) => o.kind === "already_posted").length,
            notEligible: outcomes.filter((o) => o.kind === "not_eligible").length,
            refused: outcomes.filter((o) => o.kind === "refused").length,
        },
        outcomes,
    };
}

/**
 * ONE reduction charge per gross charge, carrying every policy that contributed.
 *
 * A family reading a ledger wants "Discounts −$250.00" against September's tuition, not four rows
 * they have to add up; the DECISION rows carry the per-policy detail. The charge is the money, the
 * applications are the explanation, and they are written from the same numbers.
 */
async function persistReductions(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        actorUserId: string | null;
        charge: GrossChargeRow;
        customerId: string;
        customerMemberId: string;
        periodKey: string;
        period: { start: string; end: string };
        reductions: AppliedReduction[];
        policyById: Map<string, { id: string; kind: string; params: Record<string, unknown>; effective: { start: string | null; end: string | null } }>;
    },
): Promise<ReductionOutcome> {
    const total = args.reductions.reduce((acc, r) => acc + r.amountCents, 0);
    if (total === 0) {
        return { kind: "unchanged", sourceChargeId: args.charge.id, customerMemberId: args.customerMemberId };
    }

    /*
     * WHAT ALREADY STANDS, READ BEFORE ANYTHING IS WRITTEN. The applications are keyed on
     * (policy, gross charge), so this answers both "has this run happened" and "is the money it
     * produced still movable".
     */
    const keys = args.reductions.map((r) => reductionKey(r.policyId, args.charge.id));
    const { data: existingRows, error: existingError } = await supabase
        .from("financial_reduction_applications")
        .select("id, charge_id, amount_cents, idempotency_key")
        .eq("org_id", args.orgId)
        .in("idempotency_key", keys);
    if (existingError) throw new Error(`application read failed: ${existingError.message}`);
    const existing = (existingRows ?? []) as Array<{ id: string; charge_id: string; amount_cents: number; idempotency_key: string }>;

    if (existing.length > 0) {
        const chargeId = existing[0]!.charge_id;
        const { data: reductionCharge, error: readError } = await supabase
            .from("charges")
            .select("id, status, amount_cents")
            .eq("org_id", args.orgId)
            .eq("id", chargeId)
            .maybeSingle();
        if (readError) throw new Error(`reduction charge read failed: ${readError.message}`);
        const row = reductionCharge as { id: string; status: string; amount_cents: number } | null;

        // POSTED money is history. Re-running the period reports it and touches nothing.
        if (!row || row.status === "posted") {
            return { kind: "already_posted", sourceChargeId: args.charge.id, customerMemberId: args.customerMemberId };
        }
        if (row.amount_cents === total) {
            return { kind: "unchanged", sourceChargeId: args.charge.id, customerMemberId: args.customerMemberId };
        }
        // A DRAFT reduction reconciles in place — the same rule Charge Resolution already applies
        // to a draft whose inputs moved.
        await recalculateDraftCharge(supabase, {
            orgId: args.orgId,
            chargeId: row.id,
            amountCents: total,
            actorUserId: args.actorUserId,
        } as never);
        await supabase
            .from("financial_reduction_applications")
            .update({ updated_at: new Date().toISOString(), updated_by: args.actorUserId })
            .eq("org_id", args.orgId)
            .in("idempotency_key", keys);
        return {
            kind: "applied",
            chargeId: row.id,
            sourceChargeId: args.charge.id,
            customerMemberId: args.customerMemberId,
            amountCents: total,
            policyIds: args.reductions.map((r) => r.policyId),
        };
    }

    const label = args.reductions.map((r) => r.explanation).join(" · ");
    const created = await createChildcareDraftCharge(supabase, {
        orgId: args.orgId,
        enrollmentAgreementId: args.charge.billable_source_id,
        chargeCategory: REDUCTION_CATEGORY,
        chargeType: "adjustment",
        amountCents: total,
        currencyCode: args.charge.currency_code,
        // The SAME dates as the gross, so the reduction lands in the period it reduces and Thread 5
        // attributes both to the same accounting period.
        serviceDate: args.charge.service_date,
        description: "discount",
        actorUserId: args.actorUserId,
        metadata: {
            source: "financial_reduction",
            reduces_charge_id: args.charge.id,
            period_key: args.periodKey,
            customer_member_id: args.customerMemberId,
            explanation: label,
        },
    } as never);

    const now = new Date().toISOString();
    const rows = args.reductions.map((r) => {
        const policy = args.policyById.get(r.policyId);
        return {
            org_id: args.orgId,
            reduction_kind: "policy",
            commercial_policy_id: r.policyId,
            policy_kind: r.policyKind,
            // The policy AS IT WAS. Editing it later must not rewrite what it already reduced.
            policy_snapshot: { params: policy?.params ?? {}, effective: policy?.effective ?? null, snapshot_at: now },
            charge_id: (created as { id: string }).id,
            source_charge_id: args.charge.id,
            customer_member_id: args.customerMemberId,
            customer_id: args.customerId,
            enrollment_agreement_id: args.charge.billable_source_id,
            period_key: args.periodKey,
            period_start: args.period.start,
            period_end: args.period.end,
            basis: r.basis,
            basis_value: r.basisValue,
            basis_amount_cents: r.basisAmountCents,
            capped: r.capped,
            amount_cents: r.amountCents,
            currency_code: args.charge.currency_code,
            explanation: r.explanation,
            idempotency_key: reductionKey(r.policyId, args.charge.id),
            created_by: args.actorUserId,
            updated_by: args.actorUserId,
        };
    });
    const { error: insertError } = await supabase.from("financial_reduction_applications").insert(rows);
    if (insertError) {
        /*
         * THE LOSER OF A RACE IS NOT AN ERROR. `financial_reduction_applications_idempotency_unique`
         * makes the database the authority on "this policy, once, per gross charge", so a
         * concurrent run collides here rather than reducing the family's bill twice. Its charge is
         * surplus and is removed — it is a DRAFT this call created moments ago and nothing has seen.
         */
        if ((insertError as { code?: string }).code === "23505") {
            await supabase.from("charges").delete().eq("org_id", args.orgId).eq("id", (created as { id: string }).id).eq("status", "draft");
            return { kind: "unchanged", sourceChargeId: args.charge.id, customerMemberId: args.customerMemberId };
        }
        throw new Error(`application write failed: ${insertError.message}`);
    }

    return {
        kind: "applied",
        chargeId: (created as { id: string }).id,
        sourceChargeId: args.charge.id,
        customerMemberId: args.customerMemberId,
        amountCents: total,
        policyIds: args.reductions.map((r) => r.policyId),
    };
}
