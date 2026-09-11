import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
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
 * Reading a charge is `fin.read`. This route executes nothing.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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

    const { id } = await context.params;
    try {
        const detail = await resolveChargeDetail(supabase, { orgId: ctx.orgId, chargeId: (id ?? "").trim() });
        if (!detail) return NextResponse.json({ ok: false, error: "No such charge." }, { status: 404 });
        return NextResponse.json({ ok: true, detail });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}
