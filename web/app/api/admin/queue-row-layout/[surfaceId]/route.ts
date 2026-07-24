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
import { invalidateConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";
import {
    resolveQueueRowLayoutServer,
    resolveQueueRowSurfaceSpec,
    envelopeFromResolution,
    type QueueRowSurfaceSpec,
} from "@/lib/layout/runtime/queueRowLayoutServer";
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
    queueRowSurfaceId,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import {
    buildDefaultQueueRowSurfaceEnvelope,
    normalizeQueueRowSurfaceEnvelope,
    queueRowSurfaceHasConfiguredColumns,
    readQueueRowSurfaceFromDocMetadata,
    QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE,
    type QueueRowSurfaceEnvelope,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import {
    diagnoseIneffectiveQueueRowFieldKeys,
    QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE,
} from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";





function buildLayoutDoc(
    spec: QueueRowSurfaceSpec,
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

    // ONE owner: this route and the D1 Provisioning Answer resolve published queue-row layout
    // through the same server function, so builder and runtime cannot drift.
    try {
        const resolved = await resolveQueueRowLayoutServer({
            supabase: createAdminClient(),
            orgId: ctx.orgId,
            surfaceId,
            processKeyHint,
        });
        if (!resolved) return NextResponse.json({ error: "Unknown surface" }, { status: 404 });
        return NextResponse.json({
            envelope: resolved.envelope,
            config: resolved.config,
            placementOverrideEnabled: resolved.placementOverrideEnabled,
            source: resolved.source,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
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
    const spec = resolveQueueRowSurfaceSpec(surfaceId, processKeyHint);
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

    if (!queueRowSurfaceHasConfiguredColumns(envelope.layout)) {
        return NextResponse.json({ error: QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE }, { status: 400 });
    }

    // Compact CondensedQueueRow contract — reject fields the Work View row cannot render.
    // Full allow-list validation stays on the visual editor path; Surfaces publish must not
    // silently accept non-compact keys (e.g. child.date_of_birth) that omit at runtime.
    const ineffective = diagnoseIneffectiveQueueRowFieldKeys(envelope.layout);
    if (ineffective.length > 0) {
        return NextResponse.json(
            {
                error: `${QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE} (field: ${ineffective[0]})`,
                details: ineffective.map((fieldKey) => ({
                    path: `fieldKey:${fieldKey}`,
                    message: `${QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE} (field: ${fieldKey})`,
                })),
            },
            { status: 400 },
        );
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
            // B5 — a queue-row layout publish changes the `qrl:` config the provisioning answer caches
            // (its dominant ~700ms read). Bust this tenant's `qrl:` entries so the next operator
            // navigation reflects the publish immediately, not after the TTL.
            invalidateConfigReadCache(`qrl:${ctx.orgId}:`);
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
        // B5 — see above: invalidate this tenant's cached `qrl:` config on publish.
        invalidateConfigReadCache(`qrl:${ctx.orgId}:`);
        return NextResponse.json(published, { status: latestPublished ? 200 : 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export function queueRowSurfaceIdForProcessKey(processKey: string, catalogId?: string | null): string {
    if (catalogId?.trim()) return queueRowSurfaceId(catalogId);
    return LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID;
}
