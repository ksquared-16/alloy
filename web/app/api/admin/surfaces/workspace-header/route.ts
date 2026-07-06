/**
 * Workspace Header Surface — builder persistence endpoint.
 *
 *   GET  /api/admin/surfaces/workspace-header
 *        Resolved WorkspaceHeaderSurfaceConfig for the org (builtin default when unpublished).
 *
 *   PUT  /api/admin/surfaces/workspace-header
 *        Body: { config: WorkspaceHeaderSurfaceConfig }
 *        Upserts `entity_layouts` (surface="workspace", entityType="workspace",
 *        layoutKey="workspace_header") with config in doc.metadata.workspaceHeaderSurface,
 *        and publishes immediately. At most one published row per org for this key.
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
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    WORKSPACE_HEADER_LAYOUT_KEY,
    normalizeWorkspaceHeaderSurfaceConfig,
    type WorkspaceHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

const WORKSPACE_SURFACE = "workspace" as const;
const WORKSPACE_ENTITY_TYPE = "workspace";

function readConfigFromMetadata(doc: LayoutDoc | null | undefined): WorkspaceHeaderSurfaceConfig {
    const metadata = (doc?.metadata ?? {}) as { workspaceHeaderSurface?: unknown };
    return normalizeWorkspaceHeaderSurfaceConfig(metadata.workspaceHeaderSurface);
}

function buildDoc(config: WorkspaceHeaderSurfaceConfig): LayoutDoc {
    return {
        formatVersion: 1,
        surface: WORKSPACE_SURFACE,
        entityType: WORKSPACE_ENTITY_TYPE,
        sections: [],
        metadata: { workspaceHeaderSurface: config },
    };
}

export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const supabase = createAdminClient();
        const records = await listOrgLayouts(supabase, ctx.orgId, WORKSPACE_ENTITY_TYPE, WORKSPACE_SURFACE);
        const published = records
            .filter((r) => r.layoutKey === WORKSPACE_HEADER_LAYOUT_KEY && r.status === "published")
            .sort((a, b) => b.version - a.version)[0];
        if (!published) {
            return NextResponse.json({
                config: DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
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

    const config = normalizeWorkspaceHeaderSurfaceConfig(body.config);
    const doc = buildDoc(config);

    try {
        const supabase = createAdminClient();
        const records = await listOrgLayouts(supabase, ctx.orgId, WORKSPACE_ENTITY_TYPE, WORKSPACE_SURFACE);
        const sameKey = records.filter((r) => r.layoutKey === WORKSPACE_HEADER_LAYOUT_KEY);
        const existingDraft = sameKey.find((r) => r.status === "draft");
        const latestPublished = sameKey
            .filter((r) => r.status === "published")
            .sort((a, b) => b.version - a.version)[0];

        let draftId: string;
        if (existingDraft) {
            await updateDraft(supabase, existingDraft.id, {
                name: "Workspace Header",
                doc,
                metadata: { source: "workspace_header_builder" },
            });
            draftId = existingDraft.id;
        } else if (latestPublished) {
            // Update published in place — one published row, publish-twice safe.
            const { data, error } = await supabase
                .from("entity_layouts")
                .update({
                    name: "Workspace Header",
                    doc,
                    metadata: { source: "workspace_header_builder" },
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
                entityType: WORKSPACE_ENTITY_TYPE,
                surface: WORKSPACE_SURFACE,
                layoutKey: WORKSPACE_HEADER_LAYOUT_KEY,
                name: "Workspace Header",
                doc,
                createdBy: ctx.userId,
                metadata: { source: "workspace_header_builder" },
            });
            draftId = draft.id;
        }

        // Ensure only this key's draft becomes the sole published row.
        for (const row of sameKey) {
            if (row.id !== draftId && row.status === "published") {
                await supabase
                    .from("entity_layouts")
                    .update({ status: "draft", updated_at: new Date().toISOString() })
                    .eq("id", row.id);
            }
        }

        const published = await publishLayout(supabase, draftId);
        return NextResponse.json(published, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
