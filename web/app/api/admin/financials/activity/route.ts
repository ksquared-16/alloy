import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialActivity } from "@/lib/financials/workspace/resolveFinancialActivity";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/activity?site_location_id=…&limit=…
 *
 * Recent financial consequences across households — charges posted and corrected, payments
 * received, applied, reversed and refunded — placed under Thread 4's location contract.
 *
 * EXPLANATORY, NEVER AUTHORITATIVE. No total, movement or balance is returned. Each row's
 * `obligationDeltaCents` says what that event did to what is owed; summing them over a recent
 * slice is not a balance, and offering one beside Thread 8's would give an operator two numbers
 * and no way to choose. `fin.read`.
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
    const rawLimit = Number(params.get("limit"));
    try {
        const feed = await resolveFinancialActivity(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: params.get("site_location_id")?.trim() || null,
            limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined,
        });
        return NextResponse.json({ ok: true, ...feed });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
