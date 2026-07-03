/**
 * Workspace Process Surface — builder persistence endpoint.
 *
 *   GET  /api/admin/surfaces/workspace-processes
 *        Returns the resolved WorkspaceProcessSurfaceConfig for the org.
 *        Falls back to the built-in default when nothing is published.
 *
 *   PUT  /api/admin/surfaces/workspace-processes
 *        Body: { config: WorkspaceProcessSurfaceConfig }
 *        Creates a draft on entity_layouts (surface="workspace",
 *        entityType="workspace", layoutKey="workspace_processes") with the config in
 *        doc.metadata.workspaceProcessSurface, and immediately publishes it. Atomic.
 *
 * First-class workspace surface — no drawer/queue carrier, no metric_placements, no
 * new table. The doc carries no field/section layout (the process cards derive content
 * from live runtime data); only the behavior config lives in metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createDraft, listOrgLayouts, publishLayout } from "@/lib/layout/entityLayoutsRepo";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    normalizeWorkspaceProcessSurfaceConfig,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

const WORKSPACE_SURFACE = "workspace" as const;
const WORKSPACE_ENTITY_TYPE = "workspace";
const WORKSPACE_PROCESSES_LAYOUT_KEY = "workspace_processes";

/** Read the published config from the org's workspace_processes layout, if any. */
function readConfigFromMetadata(doc: LayoutDoc | null | undefined): WorkspaceProcessSurfaceConfig {
    const metadata = (doc?.metadata ?? {}) as { workspaceProcessSurface?: unknown };
    return normalizeWorkspaceProcessSurfaceConfig(metadata.workspaceProcessSurface);
}

export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const supabase = createAdminClient();
        const records = await listOrgLayouts(supabase, ctx.orgId, WORKSPACE_ENTITY_TYPE, WORKSPACE_SURFACE);
        const published = records
            .filter((r) => r.layoutKey === WORKSPACE_PROCESSES_LAYOUT_KEY && r.status === "published")
            .sort((a, b) => b.version - a.version)[0];
        if (!published) {
            return NextResponse.json({ config: DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG, source: "builtin_default" });
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

    const config = normalizeWorkspaceProcessSurfaceConfig(body.config);

    const doc: LayoutDoc = {
        formatVersion: 1,
        surface: WORKSPACE_SURFACE,
        entityType: WORKSPACE_ENTITY_TYPE,
        sections: [],
        metadata: { workspaceProcessSurface: config },
    };

    try {
        const supabase = createAdminClient();
        const draft = await createDraft(supabase, {
            orgId: ctx.orgId,
            entityType: WORKSPACE_ENTITY_TYPE,
            surface: WORKSPACE_SURFACE,
            layoutKey: WORKSPACE_PROCESSES_LAYOUT_KEY,
            name: "Workspace Processes",
            doc,
            createdBy: ctx.userId,
            metadata: { source: "workspace_processes_builder" },
        });
        const published = await publishLayout(supabase, draft.id);
        return NextResponse.json(published, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
