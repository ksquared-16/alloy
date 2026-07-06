/**
 * Queue Row Surface — builder persistence endpoint.
 *
 *   GET  /api/admin/queue-row-layout/[surfaceId]
 *   POST /api/admin/queue-row-layout/[surfaceId]
 *
 * Process-backed surfaces use ids `queue-row-{departmentId}-{processId}`.
 * Legacy ids `pipeline-queue-row` / `waitlist-queue-row` still resolve for migration.
 *
 * POST upserts a single published layout per (org, layout_key) — publish twice succeeds.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { isLayoutV2ConfigEnabledServer } from "@/lib/layout/featureFlag";
import {
    createDraft,
    listDefaultLayouts,
    listOrgLayouts,
    publishLayout,
    updateDraft,
} from "@/lib/layout/entityLayoutsRepo";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import {
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { defaultEnrollmentQueueRowLayoutWithVariantsV1 } from "@/lib/layout/queueRecordLayoutDefaults";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutDoc, LayoutSurface } from "@/lib/layout/layoutV2";
import { WAITLIST_CANDIDATE_ENTITY_TYPE } from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import {
    LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID,
    LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID,
    catalogIdFromQueueRowSurfaceId,
    queueRowLayoutKeyForProcessKey,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import {
    buildDefaultQueueRowSurfaceEnvelope,
    normalizeQueueRowSurfaceEnvelope,
    readQueueRowSurfaceFromDocMetadata,
    type QueueRowSurfaceEnvelope,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";

type SurfaceSpec = {
    entityType: string;
    isWaitlist: boolean;
    layoutKey: string;
    queueType: string;
    defaultEnvelope: () => QueueRowSurfaceEnvelope;
};

function legacyPipelineSpec(): SurfaceSpec {
    return {
        entityType: "opportunities",
        isWaitlist: false,
        layoutKey: "pipeline_queue_row",
        queueType: "pipeline",
        defaultEnvelope: () =>
            buildDefaultQueueRowSurfaceEnvelope({
                catalogId: "",
                processKey: "enrollment",
                processName: "Enrollment",
            }),
    };
}

function resolveSurfaceSpec(surfaceId: string, processKeyHint?: string | null): SurfaceSpec | null {
    if (surfaceId === LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID) {
        return legacyPipelineSpec();
    }
    if (surfaceId === LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID) {
        return {
            entityType: WAITLIST_CANDIDATE_ENTITY_TYPE,
            isWaitlist: true,
            layoutKey: "waitlist_queue_row",
            queueType: "waitlist",
            defaultEnvelope: () => ({
                name: "Waitlist Queue Row",
                catalogId: "",
                processKey: "enrollment",
                layout: defaultWaitlistQueueLayoutV3(),
            }),
        };
    }

    const catalogId = catalogIdFromQueueRowSurfaceId(surfaceId);
    if (!catalogId) return null;

    const processKey = processKeyHint?.trim() || "enrollment";
    return {
        entityType: "opportunities",
        isWaitlist: false,
        layoutKey: queueRowLayoutKeyForProcessKey(processKey),
        queueType: "pipeline",
        defaultEnvelope: () =>
            buildDefaultQueueRowSurfaceEnvelope({
                catalogId,
                processKey,
                processName: "Enrollment",
            }),
    };
}

function envelopeFromResolution(
    spec: SurfaceSpec,
    doc: LayoutDoc | null | undefined,
    catalogId: string,
    processKey: string,
): QueueRowSurfaceEnvelope {
    const fromMeta = readQueueRowSurfaceFromDocMetadata(
        (doc?.metadata ?? {}) as Record<string, unknown>,
    );
    if (fromMeta?.layout) {
        return {
            ...fromMeta,
            catalogId: fromMeta.catalogId || catalogId,
            processKey: fromMeta.processKey || processKey,
        };
    }

    const layout = resolveQueueRecordLayoutConfig(doc) ?? defaultEnrollmentQueueRowLayoutWithVariantsV1();
    return {
        name: spec.isWaitlist ? "Waitlist Queue Row" : "Enrollment Queue Row",
        catalogId,
        processKey,
        layout,
    };
}

function buildLayoutDoc(
    spec: SurfaceSpec,
    envelope: QueueRowSurfaceEnvelope,
    placementOverrideEnabled: boolean,
): LayoutDoc {
    return {
        formatVersion: 1,
        surface: "queue",
        entityType: spec.entityType,
        sections: [],
        metadata: {
            queueRowSurface: envelope,
            queue_record_layout: envelope.layout,
            queue_context: {
                queue_type: spec.queueType,
                placement_override_enabled: spec.isWaitlist ? placementOverrideEnabled : undefined,
            },
        },
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ surfaceId: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { surfaceId } = await params;
    const processKeyHint = _request.nextUrl.searchParams.get("processKey");
    const spec = resolveSurfaceSpec(surfaceId, processKeyHint);
    if (!spec) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });

    const catalogId = catalogIdFromQueueRowSurfaceId(surfaceId) ?? "";
    const processKey = processKeyHint?.trim() || "enrollment";
    const surface: LayoutSurface = "queue";

    if (isLayoutV2ConfigEnabledServer()) {
        try {
            const supabase = createAdminClient();
            const [orgRecords, defaultRecords] = await Promise.all([
                listOrgLayouts(supabase, ctx.orgId, spec.entityType, surface),
                listDefaultLayouts(supabase, spec.entityType, surface),
            ]);
            const resolution = resolveLayout({ entityType: spec.entityType, surface, orgRecords, defaultRecords });
            const matchingPublished = orgRecords
                .filter((r) => r.layoutKey === spec.layoutKey && r.status === "published")
                .sort((a, b) => b.version - a.version)[0];
            const legacyPipeline =
                !matchingPublished && spec.layoutKey.startsWith("queue_row_")
                    ? orgRecords
                          .filter((r) => r.layoutKey === "pipeline_queue_row" && r.status === "published")
                          .sort((a, b) => b.version - a.version)[0]
                    : null;
            const published = matchingPublished ?? legacyPipeline;
            const doc = published?.doc ?? resolution.doc;
            const envelope = published
                ? envelopeFromResolution(spec, doc, catalogId, processKey)
                : spec.defaultEnvelope();
            const queueCtx = (doc?.metadata as Record<string, unknown> | undefined)?.queue_context as
                | { placement_override_enabled?: boolean }
                | undefined;
            const placementOverrideEnabled = queueCtx?.placement_override_enabled ?? false;
            return NextResponse.json({
                envelope,
                config: envelope.layout,
                placementOverrideEnabled,
                source: published ? "published" : resolution.source,
            });
        } catch (e) {
            return NextResponse.json({ error: (e as Error).message }, { status: 500 });
        }
    }

    const fallback = spec.defaultEnvelope();
    return NextResponse.json({
        envelope: fallback,
        config: fallback.layout,
        placementOverrideEnabled: false,
        source: "builtin_default",
    });
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

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const processKeyHint =
        typeof body.processKey === "string"
            ? body.processKey
            : (body.envelope as QueueRowSurfaceEnvelope | undefined)?.processKey;
    const spec = resolveSurfaceSpec(surfaceId, processKeyHint);
    if (!spec) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });

    const catalogId = catalogIdFromQueueRowSurfaceId(surfaceId) ?? "";

    let envelope = normalizeQueueRowSurfaceEnvelope(body.envelope);
    if (!envelope && body.config) {
        const config = body.config as QueueRecordLayoutConfigV3;
        if (config?.variant === "operational-row" && Array.isArray(config.columns)) {
            envelope = {
                name: typeof body.name === "string" ? body.name.trim() : "Queue Row",
                catalogId,
                processKey: processKeyHint?.trim() || "enrollment",
                layout: config,
            };
        }
    }
    if (!envelope) {
        return NextResponse.json({ error: "envelope or config is required" }, { status: 400 });
    }

    const placementOverrideEnabled = body.placementOverrideEnabled === true;
    const doc = buildLayoutDoc(spec, envelope, placementOverrideEnabled);
    const validated = parseLayoutDoc(doc, { inferSurfaceKey: true });
    if (!validated.ok || !validated.doc) {
        return NextResponse.json({ error: "Invalid layout doc", details: validated.errors }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();
        const records = await listOrgLayouts(supabase, ctx.orgId, spec.entityType, "queue");
        const sameKey = records.filter((r) => r.layoutKey === spec.layoutKey);
        const existingDraft = sameKey.find((r) => r.status === "draft");
        const latestPublished = sameKey
            .filter((r) => r.status === "published")
            .sort((a, b) => b.version - a.version)[0];

        let draftId: string;
        const layoutName = envelope.name.trim() || "Queue Row";

        if (existingDraft) {
            await updateDraft(supabase, existingDraft.id, {
                name: layoutName,
                doc: validated.doc,
                metadata: { source: "queue_row_surface_builder_v1" },
            });
            draftId = existingDraft.id;
        } else if (latestPublished) {
            const { data, error } = await supabase
                .from("entity_layouts")
                .update({
                    name: layoutName,
                    doc: validated.doc,
                    metadata: { source: "queue_row_surface_builder_v1" },
                    published_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    status: "published",
                })
                .eq("id", latestPublished.id)
                .select(
                    "id, org_id, industry_key, entity_type, surface, layout_key, name, version, status, is_system_default, doc, metadata, created_by, created_at, updated_at, published_at",
                )
                .single();
            if (error) throw new Error(error.message);
            return NextResponse.json(data, { status: 200 });
        } else {
            const draft = await createDraft(supabase, {
                orgId: ctx.orgId,
                entityType: spec.entityType,
                surface: "queue",
                layoutKey: spec.layoutKey,
                name: layoutName,
                doc: validated.doc,
                createdBy: ctx.userId,
                metadata: { source: "queue_row_surface_builder_v1" },
            });
            draftId = draft.id;
        }

        for (const row of sameKey) {
            if (row.id !== draftId && row.status === "published") {
                await supabase
                    .from("entity_layouts")
                    .update({ status: "draft", updated_at: new Date().toISOString() })
                    .eq("id", row.id);
            }
        }

        const published = await publishLayout(supabase, draftId);
        return NextResponse.json(published, { status: latestPublished ? 200 : 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export function queueRowSurfaceIdForProcessKey(processKey: string, catalogId?: string | null): string {
    if (catalogId?.trim()) return queueRowSurfaceId(catalogId);
    return LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID;
}
