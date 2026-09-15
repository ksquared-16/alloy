import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveFinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/subjects?site_location_id=…
 *
 * WHICH HOUSEHOLDS HAVE A FINANCIAL ACCOUNT IN SCOPE — identity and location, and no money.
 *
 * This is the left side of Accounts' `eligible financial subjects LEFT JOIN current financial
 * position`. It exists so a household with no transaction yet is still reachable on the surface an
 * operator looks families up on; the position read continues to own every figure.
 *
 * ── THE SCOPE IS THE SERVER'S, NOT THE CALLER'S ──
 *
 * Identical to `/api/admin/financials/position`: `siteScope` and `allowedSiteLocationIds` come from
 * the authenticated route gate, and `site_location_id` is a filter an operator may NARROW with. It
 * can never widen, because the projection intersects it with the rights the gate resolved.
 *
 * Reading financial subjects is `fin.read`. This route executes nothing.
 */
export async function GET(request: NextRequest) {
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

    const requestedSite = new URL(request.url).searchParams.get("site_location_id")?.trim() || null;
    try {
        const cohort = await resolveFinancialSubjectCohort(supabase, {
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
