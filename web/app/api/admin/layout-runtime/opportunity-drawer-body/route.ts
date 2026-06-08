/**
 * C1b — production opportunity drawer layout runtime body API.
 *
 * GET /api/admin/layout-runtime/opportunity-drawer-body?opportunityId=<uuid>
 *
 * Gated by LAYOUT_RUNTIME_ENABLED + LAYOUT_RUNTIME_OPPORTUNITY_DRAWER (default off).
 * Read-only — returns resolved layout doc + operator-safe record for overview body.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { logDrawerVmRuntimeServer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { isLayoutRuntimeOpportunityDrawerBodyEnabledServer } from "@/lib/layout/featureFlag";
import { evaluateOpportunityLayoutRuntimeBody } from "@/lib/layout/runtime/evaluateOpportunityLayoutRuntimeBody";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
    if (!isLayoutRuntimeOpportunityDrawerBodyEnabledServer()) {
        return NextResponse.json({ error: "layout_runtime_body_disabled" }, { status: 404 });
    }

    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const opportunityId = req.nextUrl.searchParams.get("opportunityId")?.trim() ?? "";
    if (!opportunityId) {
        return NextResponse.json({ error: "missing_opportunity_id" }, { status: 400 });
    }

    const departmentId = req.nextUrl.searchParams.get("departmentId");
    const workUnitId = req.nextUrl.searchParams.get("workUnitId");
    const supabase = createAdminClient();

    logDrawerVmRuntimeServer("compose_start", {
        layout_runtime_body: "c1b_opportunity_drawer",
        opportunity_id: opportunityId,
    });

    try {
        const result = await evaluateOpportunityLayoutRuntimeBody({
            opportunityId,
            gate,
            supabase,
            departmentId: departmentId ?? null,
            workUnitId: workUnitId ?? null,
        });

        if (!result.ok) {
            logDrawerVmRuntimeServer("compose_skip", {
                layout_runtime_body: "c1b_opportunity_drawer",
                opportunity_id: opportunityId,
                reason: result.reason,
            });
            return NextResponse.json({ error: result.reason }, { status: result.status });
        }

        logDrawerVmRuntimeServer("compose_ok", {
            layout_runtime_body: "c1b_opportunity_drawer",
            opportunity_id: opportunityId,
            layout_source: result.layoutSource,
            section_count: result.doc.sections.length,
        });

        return NextResponse.json({
            ok: true,
            doc: result.doc,
            record: result.record,
            layoutSource: result.layoutSource,
            plan: {
                layoutKey: result.plan.layoutKey,
                entityType: result.plan.entityType,
            },
        });
    } catch (err) {
        logDrawerVmRuntimeServer("compose_error", {
            layout_runtime_body: "c1b_opportunity_drawer",
            opportunity_id: opportunityId,
            message: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json({ error: "layout_runtime_body_failed" }, { status: 500 });
    }
}
