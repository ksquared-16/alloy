/**
 * Person drawer layout runtime body API.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { isLayoutRuntimePersonDrawerBodyEnabledServer } from "@/lib/layout/featureFlag";
import { evaluatePersonLayoutRuntimeBody } from "@/lib/layout/runtime/evaluatePersonLayoutRuntimeBody";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
    if (!isLayoutRuntimePersonDrawerBodyEnabledServer()) {
        return NextResponse.json({ error: "layout_runtime_body_disabled" }, { status: 404 });
    }

    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const personId = req.nextUrl.searchParams.get("personId")?.trim() ?? "";
    if (!personId) return NextResponse.json({ error: "missing_person_id" }, { status: 400 });

    const opportunityId = req.nextUrl.searchParams.get("opportunityId")?.trim() ?? null;

    const result = await evaluatePersonLayoutRuntimeBody({
        personId,
        gate,
        supabase: createAdminClient(),
        opportunityId,
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
