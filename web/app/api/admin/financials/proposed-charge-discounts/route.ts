import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readExcludedPolicyIds } from "@/lib/financials/reductions/commercialPolicyExceptionService";
import { billingPeriodBounds } from "@/lib/financials/reductions/reductionPeriod";
import {
    REDUCTION_KINDS,
    resolveFinancialReductions,
    type ReductionPolicy,
    type ReductionPolicyKind,
} from "@/lib/financials/reductions/resolveFinancialReductions";
import { resolveHouseholdEligibility } from "@/lib/financials/reductions/resolveReductionEligibility";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/proposed-charge-discounts
 *     ?customer_id=…&customer_member_id=…&category_key=…&amount_cents=…&service_date=…
 *
 * WHICH DISCOUNTS WOULD ACTUALLY REDUCE A CHARGE THAT DOES NOT EXIST YET.
 *
 * ── WHY THE FORECAST COULD NOT ANSWER THIS ────────────────────────────────────────────────────
 *
 * `readAssignmentDiscountPosition` asks about TUITION, because that is the obligation an
 * enrolment produces. Add Charge can raise a Registration Fee, a field trip or a late pickup, and
 * a policy's `applies_to` may cover one and not another — so "what does this child receive" is
 * the wrong question for a selector that has to be honest about THIS charge.
 *
 * ── AND WHY THIS IS NOT A SECOND RESOLVER ─────────────────────────────────────────────────────
 *
 * It calls `resolveFinancialReductions` — the one canonical path — with a hypothetical gross
 * obligation built from what the operator has typed. Every gate that decides a real charge
 * decides this one: the policy's own `applies_to`, the category's discountability, the
 * relationship's eligibility facts, an explicit assignment, and any live exception. Nothing is
 * re-implemented here and no rate is computed; the answer is the resolver's, about a charge that
 * is about to exist.
 *
 * This is why an assigned discount cannot be forced onto an ineligible charge type: the selector
 * never offers it, because the resolver never returned it.
 *
 * READ ONLY. `fin.read`, like every other Financials read.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const params = request.nextUrl.searchParams;
    const customerId = (params.get("customer_id") ?? "").trim();
    const customerMemberId = (params.get("customer_member_id") ?? "").trim();
    const categoryKey = (params.get("category_key") ?? "").trim();
    const amountCents = Number(params.get("amount_cents") ?? "0");
    const serviceDate = (params.get("service_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
    if (!customerId) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    if (!categoryKey) return NextResponse.json({ error: "category_key is required" }, { status: 400 });

    try {
        /* The month the charge lands in — the same grain reductions resolve at. */
        const period = billingPeriodBounds(serviceDate.slice(0, 7));
        const all = await readPolicies({ supabase, orgId: ctx.orgId } as never);
        const policies: ReductionPolicy[] = all
            .filter((p) => p.isActive)
            .filter((p) => (REDUCTION_KINDS as readonly string[]).includes(p.kind))
            .filter((p) => !p.effective.start || p.effective.start <= period.end)
            .filter((p) => !p.effective.end || p.effective.end >= period.start)
            .map((p) => ({
                id: p.id,
                kind: p.kind as ReductionPolicyKind,
                params: p.params,
                label: p.label ?? (p.params.label as string | undefined) ?? p.kind,
            }));

        const household = await resolveHouseholdEligibility(supabase, {
            orgId: ctx.orgId,
            customerId,
            periodStart: period.start,
            periodEnd: period.end,
        });
        /*
         * A HOUSEHOLD CHARGE HAS NO CHILD, and therefore no child's facts. Answering with one
         * child's sibling rank would hand the account a discount that belongs to a person.
         */
        const facts = customerMemberId ? household.byMember.get(customerMemberId) ?? null : null;
        if (!facts) {
            return NextResponse.json({ ok: true, options: [], wouldApplyPolicyId: null });
        }

        /*
         * Live exceptions still suppress, exactly as they do for a real charge. A relationship
         * somebody waived is not offered the discount again by a selector.
         */
        /*
         * THE RELATIONSHIP IS RESOLVED HERE, not asked of the caller. Exceptions are keyed by
         * `opportunity_customer_member_id` and the Financials card's subject list carries only
         * the child — so requiring it would have meant either teaching that view model a second
         * key or, worse, skipping the exception check and offering a discount somebody had
         * already waived for this family.
         */
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("customer_member_id", customerMemberId)
            .limit(1);
        const ocmId = ((ocmRows ?? []) as Array<{ id: string }>)[0]?.id ?? "";
        const excludedPolicyIds = ocmId
            ? await readExcludedPolicyIds(supabase, {
                  orgId: ctx.orgId,
                  opportunityCustomerMemberId: ocmId,
                  onDate: serviceDate,
              }).catch(() => [] as string[])
            : [];

        const decision = resolveFinancialReductions({
            gross: {
                chargeId: "proposed",
                customerMemberId,
                enrollmentAgreementId: "proposed",
                amountCents: Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0,
                currencyCode: "USD",
                categoryKey,
                periodKey: period.start.slice(0, 7),
            },
            policies,
            facts,
            excludedPolicyIds,
        });

        const applied = decision.kind === "applied" ? decision.reductions : [];
        return NextResponse.json({
            ok: true,
            /* Exactly the policies that WOULD reduce this charge, named and rated by the resolver. */
            options: applied.map((r) => ({
                policyId: r.policyId,
                label: policies.find((p) => p.id === r.policyId)?.label ?? r.policyKind,
                basis: r.basis,
                basisValue: r.basisValue,
                expectedCents: r.amountCents,
            })),
            /*
             * THE ONE THAT WOULD APPLY IF THE OPERATOR CHANGED NOTHING. Present, choosing "No
             * discount" is a suppression and carries a reason; absent, it is simply the truth.
             */
            wouldApplyPolicyId: applied.length === 1 ? applied[0]!.policyId : null,
        });
    } catch (e) {
        /* FAIL CLOSED: an empty selector reads as "no discount applies", which an operator acts on. */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
