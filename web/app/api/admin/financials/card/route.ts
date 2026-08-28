import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/card?customer_id=…&customer_member_id=…&date=…
 *
 * ONE composed VM for all three Financials densities. The alternative was six client calls — charges,
 * allocations, GL configuration, templates, period, payment setup — and the card would have rendered
 * a balance before it knew the discounts, which is the one thing a financial surface must never do.
 *
 * The org comes from the authenticated session, never the query, so a household id from another
 * tenant resolves to nothing rather than to that tenant's ledger.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id")?.trim() || null;
    const customerMemberId = searchParams.get("customer_member_id")?.trim() || null;
    if (!customerId && !customerMemberId) {
        return NextResponse.json(
            { error: "customer_id or customer_member_id is required" },
            { status: 400 },
        );
    }

    try {
        const vm = await buildFinancialsCardVM(createAdminClient(), {
            orgId: ctx.orgId,
            customerId,
            customerMemberId,
            today: searchParams.get("date")?.trim() || null,
        });
        return NextResponse.json({ ok: true, vm });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
