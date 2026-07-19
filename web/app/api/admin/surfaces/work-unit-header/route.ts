/**
 * Work Unit Header Surface — builder persistence endpoint.
 *
 *   GET  /api/admin/surfaces/work-unit-header
 *   PUT  /api/admin/surfaces/work-unit-header
 *
 * Upserts `entity_layouts` (surface="workspace", layoutKey="work_unit_header") with
 * config in doc.metadata.workUnitHeaderSurface. At most one published row per org.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    createDraft,
    listOrgLayouts,
    publishLayout,
    updateDraft,
} from "@/lib/layout/entityLayoutsRepo";
import { invalidateConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    WORK_UNIT_HEADER_LAYOUT_KEY,
    normalizeWorkUnitHeaderSurfaceConfig,
    type WorkUnitHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";

const WORKSPACE_SURFACE = "workspace" as const;
const WORKSPACE_ENTITY_TYPE = "workspace";

function readConfigFromMetadata(doc: LayoutDoc | null | undefined): WorkUnitHeaderSurfaceConfig {
    const metadata = (doc?.metadata ?? {}) as { workUnitHeaderSurface?: unknown };
    return normalizeWorkUnitHeaderSurfaceConfig(metadata.workUnitHeaderSurface);
}

function buildDoc(config: WorkUnitHeaderSurfaceConfig): LayoutDoc {
    return {
        formatVersion: 1,
        surface: WORKSPACE_SURFACE,
        entityType: WORKSPACE_ENTITY_TYPE,
        sections: [],
        metadata: { workUnitHeaderSurface: config },
    };
}

export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const supabase = createAdminClient();
        const records = await listOrgLayouts(supabase, ctx.orgId, WORKSPACE_ENTITY_TYPE, WORKSPACE_SURFACE);
        const published = records
            .filter((r) => r.layoutKey === WORK_UNIT_HEADER_LAYOUT_KEY && r.status === "published")
            .sort((a, b) => b.version - a.version)[0];
        if (!published) {
            return NextResponse.json({
                config: DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
                source: "builtin_default",
            });
        }
        return NextResponse.json({ config: readConfigFromMetadata(published.doc), source: "published" });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const config = normalizeWorkUnitHeaderSurfaceConfig(body.config);
    const doc = buildDoc(config);

    try {
        const supabase = createAdminClient();
        const records = await listOrgLayouts(supabase, ctx.orgId, WORKSPACE_ENTITY_TYPE, WORKSPACE_SURFACE);
        const sameKey = records.filter((r) => r.layoutKey === WORK_UNIT_HEADER_LAYOUT_KEY);
        const existingDraft = sameKey.find((r) => r.status === "draft");
        const latestPublished = sameKey
            .filter((r) => r.status === "published")
            .sort((a, b) => b.version - a.version)[0];

        let draftId: string;
        if (existingDraft) {
            await updateDraft(supabase, existingDraft.id, {
                name: "Work Unit Header",
                doc,
                metadata: { source: "work_unit_header_builder" },
            });
            draftId = existingDraft.id;
        } else if (latestPublished) {
            const { data, error } = await supabase
                .from("entity_layouts")
                .update({
                    name: "Work Unit Header",
                    doc,
                    metadata: { source: "work_unit_header_builder" },
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
            // B5 — a header publish changes the `hdr:` config the provisioning answer caches. Bust it
            // now so the next operator navigation reflects the publish without waiting for the TTL.
            invalidateConfigReadCache(`hdr:${ctx.orgId}:`);
            return NextResponse.json(data, { status: 200 });
        } else {
            const draft = await createDraft(supabase, {
                orgId: ctx.orgId,
                entityType: WORKSPACE_ENTITY_TYPE,
                surface: WORKSPACE_SURFACE,
                layoutKey: WORK_UNIT_HEADER_LAYOUT_KEY,
                name: "Work Unit Header",
                doc,
                createdBy: ctx.userId,
                metadata: { source: "work_unit_header_builder" },
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
        // B5 — see above: a header publish invalidates the cached `hdr:` config for this tenant.
        invalidateConfigReadCache(`hdr:${ctx.orgId}:`);
        return NextResponse.json(published, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
