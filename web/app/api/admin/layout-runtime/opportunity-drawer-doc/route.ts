/**
 * Opportunity drawer layout doc — compose-free resolution endpoint.
 *
 * GET /api/admin/layout-runtime/opportunity-drawer-doc
 *
 * Returns ONLY the resolved opportunity drawer LayoutDoc for the caller's org
 * (no VM compose). The client already holds the VM and builds the runtime record
 * locally via OpportunityLayoutRuntimeAdapter, so the body path never needs a
 * second server-side compose. Resolution is cached by org/entity/surface/version.
 *
 * Capability-gated by org auth only — not a feature flag. Returns renderable=false
 * when the resolved doc cannot drive the production body (the capability fallback).
 */

import { NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { isOpportunityLayoutDocRenderable } from "@/lib/layout/runtime/evaluateOpportunityLayoutRuntimeBody";
import { resolveLayoutForOrg } from "@/lib/layout/resolveLayoutRuntime";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET() {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const supabase = createAdminClient();

    try {
        const resolution = await resolveLayoutForOrg({
            orgId: gate.orgId,
            entityType: "opportunities",
            surface: "drawer",
            supabase,
            fetchPublishedLayouts: true,
        });

        const renderable = isOpportunityLayoutDocRenderable(resolution.doc);

        return NextResponse.json({
            ok: true,
            renderable,
            doc: renderable ? resolution.doc : null,
            layoutSource: resolution.source,
            version: resolution.record?.version ?? null,
            cacheHit: resolution.cacheHit ?? false,
        });
    } catch (err) {
        return NextResponse.json(
            {
                ok: false,
                error: "layout_doc_resolve_failed",
                message: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        );
    }
}
