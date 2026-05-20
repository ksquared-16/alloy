import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { loadOpportunityDrawerOperationalBootstrap } from "@/lib/admin/loadOpportunityDrawerOperationalBootstrap";
import { logOpportunityDrawerOperationalBootstrapPerf } from "@/lib/admin/opportunityDrawerOperationalBootstrapPerf";

function parseHintMetadata(raw: string | null): Record<string, unknown> | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    try {
        const parsed = JSON.parse(s) as unknown;
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/**
 * GET — Single auth pass for opportunity drawer oper-critical shell (entity visible + layout + header actions + WU scope).
 * v1: oper_trust_preview is client-hint echo only; no server attention resolver work.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const routeT0 = Date.now();
    const tGate0 = Date.now();
    const gate = await loadAdminRouteGate();
    const routeGateMs = Date.now() - tGate0;
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
        const bootstrap = await loadOpportunityDrawerOperationalBootstrap({
            supabase,
            gate,
            opportunityId,
            departmentId: (sp.get("department_id") ?? "").trim() || null,
            workUnitId: (sp.get("work_unit_id") ?? "").trim() || null,
            hintOpportunityStatusKey: (sp.get("hint_opportunity_status_key") ?? "").trim() || null,
            hintOpportunityMetadata: parseHintMetadata(sp.get("hint_opportunity_metadata")),
            hintOperTrustHeadline: (sp.get("hint_oper_trust_headline") ?? "").trim() || null,
            hintOperTrustUrgency: (sp.get("hint_oper_trust_urgency") ?? "").trim() || null,
            routeGateMs,
        });
        logOpportunityDrawerOperationalBootstrapPerf({
            opportunityId,
            routeGateMs,
            phases: bootstrap.timing.phases_ms,
            totalMs: Date.now() - routeT0,
        });
        return NextResponse.json(bootstrap);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Bootstrap failed";
        const status = /not found/i.test(msg) ? 404 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}
