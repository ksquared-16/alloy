import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    departmentIdAllowed,
    effectiveDepartmentScopeDimensions,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import {
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    persistWorkViewsForProcessSave,
    readWorkViewsForEditor,
} from "@/lib/lifecycle/persistWorkViewsV1";
import { summarizeBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { BusinessProcessDraftEditConflictError } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { resolveProcessWorkViews } from "@/lib/lifecycle/workViewsCompatibility";
import { parseWorkViewsV1, type WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { lifecycleBuilderDepartmentNotFoundError, lifecycleBuilderDepartmentScopeError } from "@/lib/lifecycle/lifecycleBuilderRouteErrors";

async function loadDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("id, org_id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; metadata?: unknown } | null;
}

function findProcess(config: ReturnType<typeof lifecycleBuilderFromDepartmentMetadata>, processId: string): LifecycleBuilderProcessRecord | null {
    return config.processes.find((p) => p.id === processId.trim()) ?? null;
}

/** GET — process-level Work Views (saved + compatibility seed). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = effectiveDepartmentScopeDimensions(scopeDimensionsFromAccess(access), access.roleKeys);

    const departmentId = request.nextUrl.searchParams.get("department_id")?.trim() ?? "";
    const processId = request.nextUrl.searchParams.get("process_id")?.trim() ?? "";
    if (!departmentId || !processId) {
        return NextResponse.json({ error: "department_id and process_id are required" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: lifecycleBuilderDepartmentScopeError(departmentId) }, { status: 404 });
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json({ error: lifecycleBuilderDepartmentNotFoundError(departmentId) }, { status: 404 });
        }
        // The DRAFT is what a save lands in, so it is what the editor must show. Reading the
        // published projection here would make an operator's saved edit vanish on reload.
        const { builderMetadata, editorState } = await readWorkViewsForEditor(createAdminClient(), {
            orgId: ctx.orgId,
            departmentId,
            processId,
            actorUserId: ctx.userId,
        });
        const config = lifecycleBuilderFromDepartmentMetadata(builderMetadata);
        const process = findProcess(config, processId);
        if (!process) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        const saved = process.work_views_v1 ?? null;
        const effective = resolveProcessWorkViews({ process, saved });
        // Stage options for the typed "Opportunity Stage" condition field — the configured process
        // lifecycle stages (the process spine), NOT a status set.
        const stages = [...process.stages]
            .filter((s) => s.is_active)
            .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
            .map((s) => ({ value: s.key, label: s.label }));
        return NextResponse.json({
            work_views_v1: effective,
            saved_work_views_v1: saved,
            compatibility_seed: !saved?.length,
            stages,
            // The editor needs both to save safely and to tell the operator where runtime stands.
            configuration_state: summarizeBusinessProcessEditorState(editorState),
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load work views" }, { status: 500 });
    }
}

/** POST — persist process-level work_views_v1. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = effectiveDepartmentScopeDimensions(scopeDimensionsFromAccess(access), access.roleKeys);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
    if (!departmentId || !processId) {
        return NextResponse.json({ error: "department_id and process_id are required" }, { status: 400 });
    }
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: lifecycleBuilderDepartmentScopeError(departmentId) }, { status: 404 });
    }

    const parsed = parseWorkViewsV1(body.work_views_v1);
    if (!parsed) {
        return NextResponse.json({ error: "Invalid work_views_v1" }, { status: 400 });
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json({ error: lifecycleBuilderDepartmentNotFoundError(departmentId) }, { status: 404 });
        }
        const result = await persistWorkViewsForProcessSave(createAdminClient(), {
            orgId: ctx.orgId,
            departmentId,
            processId,
            workViews: parsed as WorkViewConfigV1Stored[],
            actorUserId: ctx.userId,
            expectedDraftRevision:
                typeof body.draft_revision === "number" ? body.draft_revision : undefined,
        });

        return NextResponse.json({
            ok: true,
            work_views_v1: result.workViews,
            draft: { draft_revision: result.draftRevision },
            // Said plainly, because the runtime will NOT change until someone publishes.
            publication_required: result.publicationRequired,
        });
    } catch (e) {
        // A colleague editing the same draft is a conflict the operator can resolve, not a 500.
        if (e instanceof BusinessProcessDraftEditConflictError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save work views" }, { status: 500 });
    }
}
