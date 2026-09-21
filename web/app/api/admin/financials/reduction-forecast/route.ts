import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readAssignmentDiscountPosition } from "@/lib/financials/reductions/readAssignmentDiscountPosition";
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
 *
 * The body of this lives in `readAssignmentDiscountPosition` so the FAMILY-grain reader can ask
 * the same question of each of a household's relationships without a second implementation of it
 * existing. This route is the assignment-grain door onto that one reader.
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
        const position = await readAssignmentDiscountPosition(supabase, {
            orgId: ctx.orgId,
            opportunityCustomerMemberId: ocmId,
        });
        /* The 404 an assignment-grain caller has always received for a relationship that is not one. */
        if (position.reason === "no_assignment") return NextResponse.json({ error: "no_assignment" }, { status: 404 });
        if (position.reason) return NextResponse.json({ ok: true, forecast: null, reason: position.reason });
        return NextResponse.json({ ok: true, forecast: position.forecast, exceptions: position.exceptions });
    } catch (e) {
        /* FAIL CLOSED: "no discount expected" is a claim an operator acts on. */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
