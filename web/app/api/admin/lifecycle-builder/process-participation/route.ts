import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    departmentIdAllowed,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import {
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    persistParticipationForProcessSave,
    readParticipationForEditor,
} from "@/lib/lifecycle/persistParticipationV1";
import {
    draftAsDepartmentMetadata,
} from "@/lib/businessProcesses/configuration/editProcessInDraft";
import { summarizeBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { BusinessProcessDraftEditConflictError } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { parseParticipationConfigV1 } from "@/lib/process/participationConfig";
import { DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG } from "@/lib/process/definitions/enrollment";
import {
    lifecycleBuilderDepartmentNotFoundError,
    lifecycleBuilderDepartmentScopeError,
} from "@/lib/lifecycle/lifecycleBuilderRouteErrors";

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

function findProcess(
    config: ReturnType<typeof lifecycleBuilderFromDepartmentMetadata>,
    processId: string,
): LifecycleBuilderProcessRecord | null {
    return config.processes.find((p) => p.id === processId.trim()) ?? null;
}

/** GET — the process's Participation definition (saved or the default seed) + its stages. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

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
        // The DRAFT, not the projection — an editor must read from where its saves land.
        const { editorState } = await readParticipationForEditor(createAdminClient(), {
            orgId: ctx.orgId,
            departmentId,
            processId,
            actorUserId: ctx.userId,
        });
        const config = lifecycleBuilderFromDepartmentMetadata(draftAsDepartmentMetadata(editorState));
        const process = findProcess(config, processId);
        if (!process) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }
        const saved = process.participation_v1 ?? null;
        const effective = saved ?? DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG;
        const stages = [...process.stages]
            .filter((s) => s.is_active)
            .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
            .map((s) => ({ key: s.key, label: s.label }));
        return NextResponse.json({
            participation_v1: effective,
            saved_participation_v1: saved,
            is_default: !saved,
            stages,
            configuration_state: summarizeBusinessProcessEditorState(editorState),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load participation" },
            { status: 500 },
        );
    }
}

/** POST — publish the process's Participation definition. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

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

    const parsed = parseParticipationConfigV1(body.participation_v1);
    if (!parsed) {
        return NextResponse.json({ error: "Invalid participation_v1" }, { status: 400 });
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json({ error: lifecycleBuilderDepartmentNotFoundError(departmentId) }, { status: 404 });
        }
        const result = await persistParticipationForProcessSave(createAdminClient(), {
            orgId: ctx.orgId,
            departmentId,
            processId,
            participation: parsed,
            actorUserId: ctx.userId,
            expectedDraftRevision:
                typeof body.draft_revision === "number" ? body.draft_revision : undefined,
        });
        return NextResponse.json({
            ok: true,
            participation_v1: result.participation,
            draft: { draft_revision: result.draftRevision },
            publication_required: result.publicationRequired,
        });
    } catch (e) {
        if (e instanceof BusinessProcessDraftEditConflictError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to save participation" },
            { status: 500 },
        );
    }
}
