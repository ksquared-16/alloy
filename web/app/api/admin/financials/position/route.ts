import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/position?site_location_id=…
 *
 * What posted childcare money is doing, across households in scope: outstanding, collectible
 * now, expected subsidy, suppression, and unresolved variance — every figure from
 * `computeCollectiblePosition`, the same arithmetic the account card renders.
 *
 * ── THE SCOPE IS THE SERVER'S, NOT THE CALLER'S ──
 *
 * `siteScope` and `allowedSiteLocationIds` come from the authenticated route gate.
 * `site_location_id` is a filter an operator may NARROW with; it can never widen, because the
 * projection intersects it with the rights the gate resolved.
 *
 * Reading financial position is `fin.read`. This route executes nothing.
 */
export async function GET(request: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json({ error: allowed.message }, { status: 403 });
    }

    const requestedSite = new URL(request.url).searchParams.get("site_location_id")?.trim() || null;
    try {
        const cohort = await resolveFinancialPositionCohort(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: requestedSite,
        });
        return NextResponse.json({ ok: true, ...cohort });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
