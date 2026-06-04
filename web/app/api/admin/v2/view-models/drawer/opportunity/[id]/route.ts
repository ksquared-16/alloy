import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import { logOpportunityDrawerViewModelComposeFailureShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET — Server-composed opportunity drawer View Model (Phase 1 shadow path).
 * Returns a settled above-fold contract for workflow_v1 inquiry drawers only.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const routeT0 = Date.now();
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { id: opportunityId } = await context.params;
    if (!opportunityId?.trim()) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const oppOrg = await assertRowOrg(supabase, "opportunities", opportunityId, gate.orgId);
    if (!oppOrg.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sp = request.nextUrl.searchParams;
    try {
        const result = await composeOpportunityDrawerViewModel({
            supabase,
            gate,
            opportunityId: opportunityId.trim(),
            departmentId: (sp.get("department_id") ?? "").trim() || null,
            workUnitId: (sp.get("work_unit_id") ?? "").trim() || null,
            hintOperTrustHeadline: (sp.get("hint_oper_trust_headline") ?? "").trim() || null,
            hintOperTrustUrgency: (sp.get("hint_oper_trust_urgency") ?? "").trim() || null,
        });

        if (!result.ok) {
            return NextResponse.json(result.skipped, {
                status: 422,
                headers: {
                    "X-Alloy-Drawer-VM-Structure-Settled": "false",
                    "X-Alloy-Server-Duration": String(Date.now() - routeT0),
                },
            });
        }

        return NextResponse.json(result.viewModel, {
            headers: {
                "X-Alloy-Drawer-VM-Structure-Settled": "true",
                "X-Alloy-Drawer-VM-Generation": result.viewModel.generation,
                "X-Alloy-Drawer-VM-Compose-Ms": String(result.viewModel.timing.compose_ms),
                "X-Alloy-Server-Duration": String(Date.now() - routeT0),
            },
        });
    } catch (e) {
        logOpportunityDrawerViewModelComposeFailureShadowSummary(opportunityId.trim(), Date.now() - routeT0);
        const msg = e instanceof Error ? e.message : "Drawer view model compose failed";
        const status = /not found/i.test(msg) ? 404 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
