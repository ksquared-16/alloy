import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialPaymentFlow } from "@/lib/financials/workspace/resolveFinancialPaymentFlow";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/payment-flow?site_location_id=…&received_from=…&received_to=…
 *
 * Money in, and money in that is not settling anything: posted inbound childcare payments,
 * their active applications, and what each has left unapplied.
 *
 * The window bounds RECEIPTS only. Unapplied is point-in-time on purpose — a receipt sitting
 * unapplied since last month is precisely the one an operator needs, and windowing it away
 * would make the oldest problem the most invisible.
 *
 * Scope is the gate's; `site_location_id` narrows and can never widen. `fin.read`.
 */
export async function GET(request: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            // `error` is what the operator reads; `required_permission` is for diagnostics,
            // logging and tests — the grant key is not operator vocabulary.
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const params = new URL(request.url).searchParams;
    try {
        const flow = await resolveFinancialPaymentFlow(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: params.get("site_location_id")?.trim() || null,
            receivedFromIso: params.get("received_from")?.trim() || null,
            receivedToIso: params.get("received_to")?.trim() || null,
        });
        return NextResponse.json({ ok: true, ...flow });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
