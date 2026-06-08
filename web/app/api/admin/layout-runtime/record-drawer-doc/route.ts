/**
 * Record drawer layout doc — compose-free resolution for non-opportunity drawers.
 *
 * GET /api/admin/layout-runtime/record-drawer-doc?entityType=person|child
 *
 * Returns ONLY the resolved drawer LayoutDoc for the caller's org + entity type
 * (org-published from /settings/layouts, else curated default). No VM compose —
 * the client adapts its VM record to the doc's refKeys locally. Cached by
 * org/entity/surface/version. Capability-gated by org auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { resolveLayoutForOrg } from "@/lib/layout/resolveLayoutRuntime";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ALLOWED_ENTITY_TYPES = new Set(["person", "child"]);

export async function GET(req: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const entityType = req.nextUrl.searchParams.get("entityType")?.trim() ?? "";
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
        return NextResponse.json({ error: "unsupported_entity_type" }, { status: 400 });
    }

    const supabase = createAdminClient();

    try {
        const resolution = await resolveLayoutForOrg({
            orgId: gate.orgId,
            entityType,
            surface: "drawer",
            supabase,
            fetchPublishedLayouts: true,
        });

        const doc = resolution.doc;
        const renderable = doc?.surface === "drawer" && Array.isArray(doc.sections) && doc.sections.length > 0;

        return NextResponse.json({
            ok: true,
            renderable,
            doc: renderable ? doc : null,
            layoutSource: resolution.source,
            version: resolution.record?.version ?? null,
            cacheHit: resolution.cacheHit ?? false,
        });
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: "record_doc_resolve_failed", message: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
