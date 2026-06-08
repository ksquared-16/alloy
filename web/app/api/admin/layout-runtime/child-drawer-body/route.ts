/**
 * Child drawer layout runtime body API.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { isLayoutRuntimeChildDrawerBodyEnabledServer } from "@/lib/layout/featureFlag";
import { evaluateChildLayoutRuntimeBody } from "@/lib/layout/runtime/evaluateChildLayoutRuntimeBody";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
    if (!isLayoutRuntimeChildDrawerBodyEnabledServer()) {
        return NextResponse.json({ error: "layout_runtime_body_disabled" }, { status: 404 });
    }

    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const childId = req.nextUrl.searchParams.get("childId")?.trim() ?? "";
    if (!childId) return NextResponse.json({ error: "missing_child_id" }, { status: 400 });

    const result = await evaluateChildLayoutRuntimeBody({
        childId,
        gate,
        supabase: createAdminClient(),
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: result.status });
    }

    return NextResponse.json({
        ok: true,
        doc: result.doc,
        record: result.record,
        layoutSource: result.layoutSource,
        plan: { layoutKey: result.plan.layoutKey, entityType: result.plan.entityType },
    });
}
