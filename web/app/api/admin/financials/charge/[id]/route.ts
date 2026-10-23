import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { FINANCIALS_READ_PERMISSION_KEY, requireFinancialsCapability } from "@/lib/financials/financialsPermissions";
import { financialItemReadable, financialReadScopeFromAccess } from "@/lib/financials/workspace/financialReadScope";
import { resolveChargeDetail } from "@/lib/financials/workspace/resolveChargeDetail";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/charge/:id — one obligation, explained.
 *
 * Everything the operator sees about a charge comes from `resolveChargeDetail`, which composes the
 * services that already own each figure rather than deriving any of them. This route resolves the
 * caller's org and asks; it holds no financial opinion of its own.
 *
 * TENANCY IS THE ORG FILTER, not the id. A charge id is a uuid a caller could hold from anywhere,
 * so the org comes from the resolved gate and never from the request — a charge belonging to some
 * other tenant resolves to nothing and answers 404, which is also what a charge that never existed
 * answers. The two are deliberately indistinguishable from outside.
 *
 * Reading a charge is `fin.read` AND the charge's location being visible to the caller — the same
 * `isFinancialWorkVisible` decision every list reader makes before reading money (BP V2 D4). A charge at
 * a site the caller does not hold, or a household-sourced charge for a site-restricted caller, answers the
 * same 404 as a charge that does not exist. This route executes nothing.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    /*
     * W7-F029: the gate already carries the caller's capabilities; re-reading the grants from the
     * database cost two serialized round trips on every Charge Details open. Same key, same refusal.
     */
    const denied = requireFinancialsCapability(ctx, FINANCIALS_READ_PERMISSION_KEY);
    if (denied) return denied;
    const supabase = createAdminClient();

    const { id } = await context.params;
    try {
        const scope = financialReadScopeFromAccess(ctx);
        const readable = await financialItemReadable(supabase, { orgId: ctx.orgId, scope, table: "charges", id: (id ?? "").trim() });
        if (readable !== "readable" && readable !== "not_governed") return NextResponse.json({ ok: false, error: "No such charge." }, { status: 404 });
        const detail = await resolveChargeDetail(supabase, { orgId: ctx.orgId, chargeId: (id ?? "").trim() });
        if (!detail) return NextResponse.json({ ok: false, error: "No such charge." }, { status: 404 });
        return NextResponse.json({ ok: true, detail });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
