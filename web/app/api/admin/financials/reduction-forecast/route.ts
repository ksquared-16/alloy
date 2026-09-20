import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { buildAssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import { acceptedTermBillingPeriods } from "@/lib/financials/billingPeriod";
import { forecastAssignmentReductions } from "@/lib/financials/reductions/forecastAssignmentReductions";
import { exceptionAppliesOn, readExceptionHistory } from "@/lib/financials/reductions/commercialPolicyExceptionService";
import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/reduction-forecast?opportunity_customer_member_id=…
 *
 * What discounts are expected to apply to this commercial relationship, projected from the
 * accepted tuition. READ ONLY: `fin.read`, and the projection writes no reduction, charge,
 * adjustment or ledger row.
 *
 * The hypothetical gross is the ACCEPTED term, not the recommendation — a forecast against a
 * price nobody has agreed would answer a question nobody asked. An assignment with no accepted
 * term therefore has no forecast, and says so.
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

    const ocmId = (request.nextUrl.searchParams.get("opportunity_customer_member_id") ?? "").trim();
    if (!ocmId) return NextResponse.json({ error: "opportunity_customer_member_id is required" }, { status: 400 });

    try {
        const view = await buildAssignmentTuitionView(supabase, { orgId: ctx.orgId, opportunityCustomerMemberId: ocmId });
        if (!view) return NextResponse.json({ error: "no_assignment" }, { status: 404 });
        const accepted = view.accepted;
        if (!accepted) return NextResponse.json({ ok: true, forecast: null, reason: "no_accepted_term" });

        /* The household the agreement belongs to — the facts are a household's, not a child's. */
        const { data: agreement } = await supabase
            .from("child_enrollment_agreements")
            .select("id, customer_id, customer_member_id")
            .eq("org_id", ctx.orgId)
            .eq("id", accepted.enrollmentAgreementId ?? "")
            .maybeSingle();
        const row = agreement as { id: string; customer_id: string | null; customer_member_id: string | null } | null;
        if (!row?.customer_id) return NextResponse.json({ ok: true, forecast: null, reason: "no_household" });

        /*
         * ── THE REDUCTION PERIOD IS MONTHLY, EVEN WHEN THE COMMERCIAL ONE IS NOT ──────────────
         *
         * `billingPeriodBounds` takes `YYYY-MM`, and reductions are resolved per calendar month
         * by the same doctrine that keeps `placeInBillingPeriod` monthly by default. A weekly
         * assignment's current commercial period is `2026-09-15~2026-09-21`, which is not that
         * shape — passing it refused the whole forecast with "period_key must be YYYY-MM".
         *
         * So the forecast asks about the MONTH the current commercial period starts in. That is
         * the month the application path will resolve the same charge under, which is the only
         * reason the two can be expected to agree.
         */
        const periods = acceptedTermBillingPeriods(
            { cadenceKey: accepted.cadenceKey, effectiveStart: accepted.effectiveStart, effectiveEnd: accepted.effectiveEnd },
            new Date().toISOString().slice(0, 10),
        );
        const periodKey = (periods?.current.start ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
        /* The date an exception is judged against: the start of the period being forecast. */
        const periodStartForExceptions = periods?.current.start ?? `${periodKey}-01`;

        const forecast = await forecastAssignmentReductions(supabase, {
            orgId: ctx.orgId,
            opportunityCustomerMemberId: ocmId,
            customerId: row.customer_id,
            customerMemberId: accepted.customerMemberId,
            enrollmentAgreementId: row.id,
            grossCents: accepted.amountCents,
            currencyCode: accepted.currencyCode,
            periodKey,
            categoryKey: "tuition",
        });
        /*
         * ── WHAT THIS RELATIONSHIP IS EXCEPTED FROM ───────────────────────────────────────────
         *
         * Returned beside the forecast rather than folded into it. The forecast answers "what
         * would happen"; this answers "what did somebody decide, and why" — and an operator
         * looking at a discount that is not applying needs the second to make sense of the first.
         *
         * The window is the same `period.start` the forecast reasoned under, so an exception that
         * has not started yet, or has already ended, is reported as history and not as the reason
         * this period looks the way it does.
         */
        const history = await readExceptionHistory(supabase, {
            orgId: ctx.orgId,
            opportunityCustomerMemberId: ocmId,
        }).catch(() => []);
        const policyLabels = new Map(
            (await readPolicies({ supabase, orgId: ctx.orgId } as never).catch(() => []))
                .map((p) => [p.id, (p.params?.label as string | undefined) ?? p.kind] as const),
        );
        const onDate = periodStartForExceptions;
        const exceptions = history.map((e) => ({
            id: e.id,
            policyId: e.policyId,
            policyLabel: policyLabels.get(e.policyId) ?? "Discount policy",
            effectiveStart: e.effectiveStart,
            effectiveEnd: e.effectiveEnd,
            reason: e.reason,
            /* In force FOR THE PERIOD THE FORECAST USED — not merely "not yet superseded". */
            appliesNow: exceptionAppliesOn(e, onDate),
            superseded: Boolean(e.supersededAt),
        }));
        return NextResponse.json({ ok: true, forecast, exceptions });
    } catch (e) {
        /* FAIL CLOSED: "no discount expected" is a claim an operator acts on. */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
