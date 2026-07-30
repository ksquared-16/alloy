import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { resolveOpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET — thin deferred stage-work (Current Work region) slice for an opportunity Focus Panel.
 *
 * Tier-2 of the selected-record view model. NOT a full record composition: it resolves ONLY the
 * stage-work projection the visible Current Work region needs, keyed by the identity the Tier-1 VM
 * already carries (`department_id`, `stage_key`). No Tier-1 work is recomputed. The org gate makes a
 * cross-tenant id 404, so results are tenant-scoped by construction.
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
    const departmentId = (sp.get("department_id") ?? "").trim() || null;
    const stageKey = (sp.get("stage_key") ?? "").trim() || null;
    const stageLabel = (sp.get("stage_label") ?? "").trim() || null;
    const customerMemberId = (sp.get("customer_member_id") ?? "").trim() || null;
    const opportunityCustomerMemberId =
        (sp.get("opportunity_customer_member_id") ?? "").trim() || null;
    const processInstanceId = (sp.get("process_instance_id") ?? "").trim() || null;

    try {
        const slice = await resolveOpportunityStageWorkSlice({
            supabase,
            orgId: gate.orgId,
            opportunityId: opportunityId.trim(),
            departmentId,
            stageKey,
            stageLabel,
            customerMemberId,
            opportunityCustomerMemberId,
            processInstanceId,
        });
        return NextResponse.json(slice, {
            headers: {
                "X-Alloy-Stage-Work-Status": slice.stage_work_runtime ? "ready" : "empty",
                "X-Alloy-Server-Duration": String(Date.now() - routeT0),
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Stage-work resolve failed";
        const status = /not found/i.test(msg) ? 404 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
