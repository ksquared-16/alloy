/**
 * WHERE A PAYMENT MAY GO — the chooser's data, resolved on the server.
 *
 * GET /api/admin/financials/eligible-target-charges?payment_id=…&exclude_charge_id=…
 *
 * The Move and Apply panels need a list of charges this receipt could answer. That list is a product
 * of household identity and canonical outstanding balances, so it is resolved here rather than by a
 * component assembling charges and working out what is still owed.
 *
 * ── THIS IS A CHOOSER, NOT A GATE ──
 *
 * Omitting a charge here is a courtesy to the operator. `applyPaymentToCharge` is what actually
 * refuses another household's charge, and it refuses one this route never mentioned just the same. The
 * org comes from the authenticated session and never from the query, so a payment id from another
 * tenant resolves to nothing rather than to that tenant's charges.
 */
import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveEligibleTargetCharges } from "@/lib/financials/eligibleTargetCharges";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    /* Reading which charges a family still owes is reading their financial position. */
    const allowedRead = await assertFinancialsReadAllowed({
        supabase: createAdminClient(),
        orgId: ctx.orgId,
        userId: ctx.userId,
    });
    if (!allowedRead.ok) {
        return NextResponse.json(
            { error: allowedRead.message, required_permission: allowedRead.requiredPermission },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("payment_id")?.trim() || "";
    if (!paymentId) {
        return NextResponse.json({ error: "payment_id is required" }, { status: 400 });
    }
    // The charge the money is being moved OFF, so the panel never offers it as a destination.
    const exclude = searchParams.getAll("exclude_charge_id").map((v) => v.trim()).filter(Boolean);

    try {
        const charges = await resolveEligibleTargetCharges(createAdminClient(), {
            orgId: ctx.orgId,
            paymentId,
            excludeChargeIds: exclude,
        });
        return NextResponse.json({ ok: true, charges });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
