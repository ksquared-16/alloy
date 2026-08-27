import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import { logDrawerVmRuntimeServer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { logOpportunityDrawerViewModelComposeFailureShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import { logDrawerViewModelRuntimeFlagsServerSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelRuntimeFlagsServer";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET — Server-composed opportunity drawer View Model.
 * Canonical path: /api/admin/view-models/drawer/opportunity/[id]
 * Legacy alias:   /api/admin/v2/view-models/drawer/opportunity/[id] (next.config rewrite)
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
    logDrawerViewModelRuntimeFlagsServerSummary();
    logDrawerVmRuntimeServer("compose_start", {
        opportunity_id: opportunityId.trim(),
        department_id: (sp.get("department_id") ?? "").trim() || null,
        work_unit_id: (sp.get("work_unit_id") ?? "").trim() || null,
    });
    try {
        const result = await composeOpportunityDrawerViewModel({
            supabase,
            gate,
            opportunityId: opportunityId.trim(),
            departmentId: (sp.get("department_id") ?? "").trim() || null,
            workUnitId: (sp.get("work_unit_id") ?? "").trim() || null,
            hintOperTrustHeadline: (sp.get("hint_oper_trust_headline") ?? "").trim() || null,
            hintOperTrustUrgency: (sp.get("hint_oper_trust_urgency") ?? "").trim() || null,
            // The Activity embedded workspace lazily loads (and idle-prewarms) the family
            // communications preview, so it must not block the record's first paint. Opt out
            // unless a caller explicitly requests the seeded preview (`comms_preview=1`).
            deferCommunicationsPreview: sp.get("comms_preview") !== "1",
            /*
             * Stage work composes INLINE, because it no longer costs anything to.
             *
             * It was deferred to a thin `…/stage-work` resource so it could not block first paint,
             * and that was right while the compose awaited Module B after Module A. Now that the two
             * run together, B carrying stage-work measures 181-380 ms against A's ~650-800 ms, so the
             * slice finishes inside A and `max(A, B)` is unchanged.
             *
             * Deferring it, meanwhile, was never free on the client: every path derives the fetch key
             * from `vm.workspace.lifecycle_rail.current_stage_key`, so What's Next could not even ASK
             * for its data until the whole ~124 KB view model had landed — a second round-trip
             * measured at 209-2065 ms after the VM, for a card whose request needs one stage key.
             * The bytes are identical either way; the client fetched them regardless.
             *
             * `stage_work=0` restores the deferred contract.
             */
            deferStageWork: sp.get("stage_work") === "0",
        });

        if (!result.ok) {
            logDrawerVmRuntimeServer("compose_skip", {
                opportunity_id: opportunityId.trim(),
                reason: result.skipped.reason,
            });
            return NextResponse.json(result.skipped, {
                status: 422,
                headers: {
                    "X-Alloy-Drawer-VM-Structure-Settled": "false",
                    "X-Alloy-Server-Duration": String(Date.now() - routeT0),
                },
            });
        }

        logDrawerVmRuntimeServer("compose_ok", {
            opportunity_id: opportunityId.trim(),
            generation: result.viewModel.generation,
            compose_ms: result.viewModel.timing.compose_ms,
        });
        return NextResponse.json(result.viewModel, {
            headers: {
                "X-Alloy-Drawer-VM-Structure-Settled": "true",
                "X-Alloy-Drawer-VM-Generation": result.viewModel.generation,
                "X-Alloy-Drawer-VM-Compose-Ms": String(result.viewModel.timing.compose_ms),
                "X-Alloy-Server-Duration": String(Date.now() - routeT0),
            },
        });
    } catch (e) {
        logDrawerVmRuntimeServer("compose_error", {
            opportunity_id: opportunityId.trim(),
            message: e instanceof Error ? e.message : "unknown",
        });
        logOpportunityDrawerViewModelComposeFailureShadowSummary(opportunityId.trim(), Date.now() - routeT0);
        const msg = e instanceof Error ? e.message : "Drawer view model compose failed";
        const status = /not found/i.test(msg) ? 404 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
