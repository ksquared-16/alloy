import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/work-queue?site_location_id=…
 *
 * The Financials workspace's cross-household cohort: draft childcare charges an operator could post.
 *
 * ── THE SCOPE IS THE SERVER'S, NOT THE CALLER'S ──
 *
 * `siteScope` and `allowedSiteLocationIds` come from the authenticated route gate. `site_location_id`
 * is a FILTER an operator may narrow with — it can never widen, because the projection intersects it
 * with the rights the gate resolved. A client asking for a site it does not hold gets nothing, and
 * asking for none gets only what org-wide rights would already have shown.
 *
 * Reading financial work is `fin.read`, enforced through `assertFinancialsReadAllowed` — a named
 * helper rather than an inline lookup, so the declared route-capability table can bind the claim to
 * the guard that actually makes it true. Acting on the work is the registered action's own
 * permission; this route executes nothing.
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
        const queue = await resolveFinancialWorkQueue(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: requestedSite,
        });
        return NextResponse.json({ ok: true, ...queue });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
