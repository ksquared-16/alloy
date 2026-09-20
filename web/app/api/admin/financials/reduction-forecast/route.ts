import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { buildAssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import { acceptedTermBillingPeriods } from "@/lib/financials/billingPeriod";
import { forecastAssignmentReductions } from "@/lib/financials/reductions/forecastAssignmentReductions";
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

        /* The period the forecast reasons about is the one the assignment is billing now. */
        const periods = acceptedTermBillingPeriods(
            { cadenceKey: accepted.cadenceKey, effectiveStart: accepted.effectiveStart, effectiveEnd: accepted.effectiveEnd },
            new Date().toISOString().slice(0, 10),
        );
        const periodKey = periods?.current.key ?? new Date().toISOString().slice(0, 7);

        const forecast = await forecastAssignmentReductions(supabase, {
            orgId: ctx.orgId,
            customerId: row.customer_id,
            customerMemberId: accepted.customerMemberId,
            enrollmentAgreementId: row.id,
            grossCents: accepted.amountCents,
            currencyCode: accepted.currencyCode,
            periodKey,
            categoryKey: "tuition",
        });
        return NextResponse.json({ ok: true, forecast });
    } catch (e) {
        /* FAIL CLOSED: "no discount expected" is a claim an operator acts on. */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
