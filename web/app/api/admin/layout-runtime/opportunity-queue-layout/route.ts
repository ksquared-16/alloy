/**
 * Opportunity queue lane layout runtime API — returns resolved queue LayoutDoc for a lane.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { isLayoutRuntimeOpportunityQueueBodyEnabledServer } from "@/lib/layout/featureFlag";
import { evaluateOpportunityQueueLayoutRuntime } from "@/lib/layout/runtime/evaluateOpportunityQueueLayoutRuntime";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
    if (!isLayoutRuntimeOpportunityQueueBodyEnabledServer()) {
        return NextResponse.json({ error: "layout_runtime_queue_disabled" }, { status: 404 });
    }

    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const sp = req.nextUrl.searchParams;
    const isWaitlistCandidate = sp.get("waitlist") === "1";
    const result = await evaluateOpportunityQueueLayoutRuntime({
        orgId: gate.orgId,
        supabase: createAdminClient(),
        lane: {
            drillWorkUnitKey: sp.get("work_unit_key"),
            lifecycleKey: sp.get("lifecycle_key"),
            stageKey: sp.get("stage_key"),
            grain: sp.get("grain"),
            isWaitlistCandidate,
        },
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: 422 });
    }

    return NextResponse.json({
        ok: true,
        doc: result.doc,
        entityType: result.entityType,
        layoutSource: result.layoutSource,
        layoutKey: result.layoutKey,
        matchTier: result.matchTier,
    });
}
