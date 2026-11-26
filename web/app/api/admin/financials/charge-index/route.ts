import { NextRequest, NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import {
    applyChargeIndex,
    CHARGE_INDEX_STATUSES,
    isChargeIndexView,
} from "@/lib/financials/workspace/chargeIndex";
import { resolveFinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { readResponsibility } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/charge-index?view=&q=&type=&period=&site_location_id=
 *
 * FIND CHARGES ACROSS THE ORGANIZATION (W7-F021). The Charges workspace's list: every childcare
 * charge in the operator's scope, by view (needs attention · scheduled · posted · cancelled),
 * searchable by household, child or charge type, and filterable by charge type and billing period.
 *
 * The SAME resolver as the work queue, asked for every status — so a charge's household, child,
 * site visibility and awaiting-posting reason are decided once, by one read. Site scope is the
 * route gate's, never the caller's: `site_location_id` may narrow and can never widen. `fin.read`;
 * this route executes nothing and computes no money.
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

    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    try {
        const all = await resolveFinancialWorkQueue(supabase, {
            orgId: ctx.orgId,
            siteScope: ctx.siteScope === "restricted" ? "restricted" : "all",
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? (ctx.allowedSiteLocationIds ?? []) : [],
            activeSiteLocationId: params.get("site_location_id")?.trim() || null,
            statuses: CHARGE_INDEX_STATUSES,
            limit: 2000,
        });
        const result = applyChargeIndex(all.rows, {
            view: isChargeIndexView(view) ? view : "scheduled",
            query: params.get("q"),
            typeKey: params.get("type"),
            periodKey: params.get("period"),
        });
        /*
         * W7-F028: WHO OWES EACH LISTED CHARGE — the account ledger's own reader, indexed by charge,
         * asked only about the rows this view returns. A failed read is an absence, never a reason to
         * fail the list (the reader's own rule).
         */
        const owed = (await readResponsibility(supabase, ctx.orgId, result.rows.map((r) => r.chargeId))).responsibilityByCharge;
        return NextResponse.json({
            ok: true,
            ...result,
            rows: result.rows.map((r) => {
                const o = owed.get(r.chargeId);
                return {
                    ...r,
                    responsibility: o
                        ? { name: o.name, unassigned: o.unassigned, assignedCents: o.assignedCents, unassignedCents: o.unassignedCents }
                        : null,
                };
            }),
            /* Said, not hidden: the read is bounded, newest first. */
            truncated: all.rows.length >= 2000,
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
