/**
 * C1a — production opportunity drawer shadow mount API.
 *
 * GET /api/admin/layout-runtime/opportunity-drawer-shadow?opportunityId=<uuid>
 *
 * Gated by LAYOUT_RUNTIME_ENABLED + LAYOUT_RUNTIME_OPPORTUNITY_DRAWER (default off).
 * Read-only shadow parity evaluation — never mounts visible layout runtime body.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { logDrawerVmRuntimeServer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled } from "@/lib/layout/featureFlag";
import { runRealOpportunityShadowValidation } from "@/lib/layout/runtime/shadow/runRealOpportunityShadowValidation";
import { buildOpportunityDrawerShadowTelemetry } from "@/lib/layout/runtime/shadow/opportunityDrawerShadowTelemetry";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
    if (!isLayoutRuntimeOpportunityDrawerShadowReadPathEnabled()) {
        return NextResponse.json({ error: "shadow_read_path_disabled" }, { status: 404 });
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
        shadow_mount: "c1a_opportunity_drawer",
        opportunity_id: opportunityId,
    });

    try {
        const result = await runRealOpportunityShadowValidation({
            opportunityId,
            gate,
            supabase,
            departmentId: departmentId ?? null,
            workUnitId: workUnitId ?? null,
            readPathGate: "c1a_opportunity_drawer",
        });

        if (!result.ok) {
            logDrawerVmRuntimeServer("compose_skip", {
                shadow_mount: "c1a_opportunity_drawer",
                opportunity_id: opportunityId,
                reason: result.reason,
            });
            return NextResponse.json({ error: result.reason }, { status: result.status });
        }

        const telemetry = buildOpportunityDrawerShadowTelemetry(result.report, {
            composeMs: result.composeMs,
        });

        logDrawerVmRuntimeServer("compose_ok", {
            shadow_mount: "c1a_opportunity_drawer",
            opportunity_id: opportunityId,
            parity_score: telemetry.parityScore,
            readiness: telemetry.readinessLevel,
            field_coverage_percent: telemetry.fieldCoveragePercent,
        });

        return NextResponse.json({
            ok: true,
            telemetry,
            report: result.report,
        });
    } catch (err) {
        logDrawerVmRuntimeServer("compose_error", {
            shadow_mount: "c1a_opportunity_drawer",
            opportunity_id: opportunityId,
            message: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json({ error: "shadow_evaluation_failed" }, { status: 500 });
    }
}
