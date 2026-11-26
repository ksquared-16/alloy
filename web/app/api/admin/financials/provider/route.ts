import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readInstallationState } from "@/lib/financials/payments/providerInstallation";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/provider
 *
 * Can this organization accept payments, what can it accept, and does anything need attention.
 *
 * READ ONLY. Connecting, refreshing and disconnecting are registered actions behind `fin.provider`,
 * because they decide where a family's money settles; SEEING the answer is an ordinary Financials
 * read. A route that also mutated would be a second authority over provider configuration.
 *
 * The organization comes from the authenticated gate, never the query, so one tenant cannot ask
 * about another's merchant.
 */
export const dynamic = "force-dynamic";

export async function GET() {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    try {
        const state = await readInstallationState(supabase, ctx.orgId);
        return NextResponse.json({ ok: true, state });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "The payment provider state could not be read." },
            { status: 500 },
        );
    }
}
