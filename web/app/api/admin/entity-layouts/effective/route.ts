/**
 * GET /api/admin/entity-layouts/effective
 *
 * Phase 0 runtime read path — resolves layout with optional queue context
 * discriminators. Does NOT affect live drawer/queue rendering (flag gated).
 *
 * Query params:
 *   entity_type (required)
 *   surface (required): drawer | queue
 *   lifecycle_key, stage_key, work_unit_key, queue_type, grain (optional queue context)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutRuntimeReadPathEnabled } from "@/lib/layout/featureFlag";
import { isLayoutSurface, type LayoutSurface } from "@/lib/layout/layoutV2";
import { resolveLayoutForOrg } from "@/lib/layout/resolveLayoutRuntime";
import type { QueueLayoutContextRequest } from "@/lib/layout/queueLayoutContext";

function notFound() {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function parseQueueContext(searchParams: URLSearchParams): QueueLayoutContextRequest {
    const pick = (key: string) => searchParams.get(key)?.trim() || undefined;
    return {
        lifecycle_key: pick("lifecycle_key"),
        stage_key: pick("stage_key"),
        work_unit_key: pick("work_unit_key"),
        queue_type: pick("queue_type"),
        grain: pick("grain"),
    };
}

export async function GET(request: NextRequest) {
    if (!isLayoutRuntimeReadPathEnabled()) return notFound();

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim();
    const surfaceParam = searchParams.get("surface")?.trim();

    if (!entityType || !surfaceParam) {
        return NextResponse.json({ error: "entity_type and surface are required" }, { status: 400 });
    }
    if (!isLayoutSurface(surfaceParam)) {
        return NextResponse.json({ error: "surface must be drawer|queue" }, { status: 400 });
    }

    const surface = surfaceParam as LayoutSurface;
    const queueContext = surface === "queue" ? parseQueueContext(searchParams) : undefined;

    try {
        const supabase = createAdminClient();
        const result = await resolveLayoutForOrg({
            orgId: ctx.orgId,
            entityType,
            surface,
            queueContext,
            supabase,
        });

        return NextResponse.json({
            resolved: result.doc,
            source: result.source,
            layoutKey: result.layoutKey ?? null,
            layoutRecordId: result.record?.id ?? null,
            layoutVersion: result.record?.version ?? null,
            matchTier: result.matchTier ?? null,
            matchedQueueContext: result.matchedQueueContext ?? null,
            runtimeReadPathEnabled: result.runtimeReadPathEnabled,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
