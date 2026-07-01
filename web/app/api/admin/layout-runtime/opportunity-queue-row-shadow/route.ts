/**
 * C4 foundation — GET /api/admin/layout-runtime/opportunity-queue-row-shadow
 *
 * Shadow/proof queue layout resolution. Default off. Does not change visible queue rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { isLayoutRuntimeOpportunityQueueShadowReadPathEnabled } from "@/lib/layout/featureFlag";
import { evaluateOpportunityQueueRowLayoutShadow } from "@/lib/layout/runtime/queue/evaluateOpportunityQueueRowLayoutShadow";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
    if (!isLayoutRuntimeOpportunityQueueShadowReadPathEnabled()) {
        return NextResponse.json({ error: "queue_shadow_read_path_disabled" }, { status: 404 });
    }

    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const sp = req.nextUrl.searchParams;
    const isWaitlist = sp.get("waitlist") === "1" || sp.get("grain") === "candidate";

    try {
        const supabase = createAdminClient();
        const result = await evaluateOpportunityQueueRowLayoutShadow({
            orgId: gate.orgId,
            supabase,
            lane: {
                drillWorkUnitKey: sp.get("work_unit_key"),
                lifecycleKey: sp.get("lifecycle_key"),
                stageKey: sp.get("stage_key"),
                isWaitlistCandidate: isWaitlist,
                grain: sp.get("grain"),
            },
        });

        if (!result.ok) {
            return NextResponse.json({ error: result.reason }, { status: 422 });
        }

        return NextResponse.json({ ok: true, telemetry: result });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "queue_shadow_failed" },
            { status: 500 },
        );
    }
}
