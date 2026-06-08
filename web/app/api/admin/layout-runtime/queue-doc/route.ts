/**
 * Queue layout doc — compose-free resolution endpoint.
 *
 * GET /api/admin/layout-runtime/queue-doc?lifecycle_key=&queue_type=&grain=&stage_key=&work_unit_key=
 *
 * Returns the resolved opportunity `queue` LayoutDoc variant for the caller's org
 * and queue context (org-published layouts from /settings/layouts, falling back to
 * the builtin variant). No VM/queue compose — the client adapts queue row VMs to
 * the doc's refKeys locally. Resolution is cached by org/entity/surface/version.
 *
 * Capability-gated by org auth only. renderable=false signals the host queue to
 * keep its existing card for that context.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { resolveLayoutForOrg } from "@/lib/layout/resolveLayoutRuntime";
import type { QueueLayoutContextRequest } from "@/lib/layout/queueLayoutContext";
import { createAdminClient } from "@/lib/supabaseAdmin";

function readQueueContext(req: NextRequest): QueueLayoutContextRequest {
    const p = req.nextUrl.searchParams;
    const ctx: QueueLayoutContextRequest = {};
    const lifecycle = p.get("lifecycle_key")?.trim();
    const stage = p.get("stage_key")?.trim();
    const workUnit = p.get("work_unit_key")?.trim();
    const queueType = p.get("queue_type")?.trim();
    const grain = p.get("grain")?.trim();
    if (lifecycle) ctx.lifecycle_key = lifecycle;
    if (stage) ctx.stage_key = stage;
    if (workUnit) ctx.work_unit_key = workUnit;
    if (queueType) ctx.queue_type = queueType;
    if (grain) ctx.grain = grain;
    return ctx;
}

export async function GET(req: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const supabase = createAdminClient();
    const queueContext = readQueueContext(req);

    try {
        const resolution = await resolveLayoutForOrg({
            orgId: gate.orgId,
            entityType: "opportunities",
            surface: "queue",
            queueContext,
            supabase,
            fetchPublishedLayouts: true,
        });

        const doc = resolution.doc;
        const renderable = doc?.surface === "queue" && Array.isArray(doc.sections) && doc.sections.length > 0;

        return NextResponse.json({
            ok: true,
            renderable,
            doc: renderable ? doc : null,
            layoutSource: resolution.source,
            layoutKey: resolution.layoutKey ?? null,
            version: resolution.record?.version ?? null,
            cacheHit: resolution.cacheHit ?? false,
        });
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: "queue_doc_resolve_failed", message: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
