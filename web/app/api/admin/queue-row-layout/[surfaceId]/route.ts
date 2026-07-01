/**
 * Queue Row Layout — builder persistence endpoint.
 *
 *   GET  /api/admin/queue-row-layout/[surfaceId]
 *        Returns the resolved QueueRecordLayoutConfigV3 for the surface.
 *        Falls back to the built-in default when no published org layout exists.
 *
 *   POST /api/admin/queue-row-layout/[surfaceId]
 *        Body: { config: QueueRecordLayoutConfigV3, placementOverrideEnabled?: boolean }
 *        Creates a new draft layout with the config embedded in doc.metadata,
 *        immediately publishes it, and returns the published EntityLayoutRecord.
 *        Atomic: caller does not need a separate publish step.
 *
 * surfaceId values:
 *   "pipeline-queue-row"  → entityType=opportunities, queue_type=pipeline
 *   "waitlist-queue-row"  → entityType=placement_candidate, queue_type=waitlist
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import { createDraft, listDefaultLayouts, listOrgLayouts, publishLayout } from "@/lib/layout/entityLayoutsRepo";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import {
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutDoc, LayoutSurface } from "@/lib/layout/layoutV2";
import { WAITLIST_CANDIDATE_ENTITY_TYPE } from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import { resolveLayout } from "@/lib/layout/layoutResolver";

const PIPELINE_SURFACE_ID = "pipeline-queue-row";
const WAITLIST_SURFACE_ID = "waitlist-queue-row";

type SurfaceSpec = {
    entityType: string;
    isWaitlist: boolean;
    layoutKey: string;
    queueType: string;
};

function resolveSurfaceSpec(surfaceId: string): SurfaceSpec | null {
    if (surfaceId === PIPELINE_SURFACE_ID) {
        return {
            entityType: "opportunities",
            isWaitlist: false,
            layoutKey: "pipeline_queue_row",
            queueType: "pipeline",
        };
    }
    if (surfaceId === WAITLIST_SURFACE_ID) {
        return {
            entityType: WAITLIST_CANDIDATE_ENTITY_TYPE,
            isWaitlist: true,
            layoutKey: "waitlist_queue_row",
            queueType: "waitlist",
        };
    }
    return null;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ surfaceId: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { surfaceId } = await params;
    const spec = resolveSurfaceSpec(surfaceId);
    if (!spec) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });

    const surface: LayoutSurface = "queue";

    if (isLayoutV2ConfigEnabledServer()) {
        try {
            const supabase = createAdminClient();
            const [orgRecords, defaultRecords] = await Promise.all([
                listOrgLayouts(supabase, ctx.orgId, spec.entityType, surface),
                listDefaultLayouts(supabase, spec.entityType, surface),
            ]);
            const resolution = resolveLayout({ entityType: spec.entityType, surface, orgRecords, defaultRecords });
            const config = resolveQueueRecordLayoutConfig(resolution.doc);
            const queueCtx = (resolution.doc?.metadata as Record<string, unknown> | undefined)?.queue_context as
                | { placement_override_enabled?: boolean }
                | undefined;
            const placementOverrideEnabled = queueCtx?.placement_override_enabled ?? false;
            return NextResponse.json({ config, placementOverrideEnabled, source: resolution.source });
        } catch (e) {
            return NextResponse.json({ error: (e as Error).message }, { status: 500 });
        }
    }

    // Feature flag off — return built-in default.
    const config = spec.isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
    return NextResponse.json({ config, placementOverrideEnabled: false, source: "builtin_default" });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ surfaceId: string }> },
) {
    if (!isLayoutV2ConfigEnabledServer()) {
        return NextResponse.json({ error: "Layout V2 config is not enabled" }, { status: 403 });
    }

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { surfaceId } = await params;
    const spec = resolveSurfaceSpec(surfaceId);
    if (!spec) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const config = body.config as QueueRecordLayoutConfigV3 | undefined;
    if (!config || config.variant !== "operational-row" || !Array.isArray(config.columns)) {
        return NextResponse.json({ error: "config must be a QueueRecordLayoutConfigV3" }, { status: 400 });
    }

    const placementOverrideEnabled = body.placementOverrideEnabled === true;

    const doc: LayoutDoc = {
        formatVersion: 1,
        surface: "queue",
        entityType: spec.entityType,
        sections: [],
        metadata: {
            queue_record_layout: config,
            queue_context: {
                queue_type: spec.queueType,
                placement_override_enabled: spec.isWaitlist ? placementOverrideEnabled : undefined,
            },
        },
    };

    const validated = parseLayoutDoc(doc, { inferSurfaceKey: true });
    if (!validated.ok || !validated.doc) {
        return NextResponse.json({ error: "Invalid layout doc", details: validated.errors }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();

        const draft = await createDraft(supabase, {
            orgId: ctx.orgId,
            entityType: spec.entityType,
            surface: "queue",
            layoutKey: spec.layoutKey,
            name: spec.isWaitlist ? "Waitlist Queue Row" : "Pipeline Queue Row",
            doc: validated.doc,
            createdBy: ctx.userId,
            metadata: { source: "queue_row_builder_v1" },
        });

        const published = await publishLayout(supabase, draft.id);
        return NextResponse.json(published, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
