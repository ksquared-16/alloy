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
    isLifecycleBuilderOwnedDepartmentMetadata,
    mergeLifecycleBuilderOwnedIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    addStageToProcess,
    createLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    clampLifecycleDescription,
    lifecycleWorkspaceTileDescription,
    mergeLifecycleBuilderIntoMetadata,
    reorderStage,
    removeProcessFromConfig,
    removeStageFromProcess,
    renameStage,
    setActiveProcess,
    updateProcessName,
    updateProcessDescription,
    updateStageDescription,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { syncWorkUnitSortOrderFromBuilderStages } from "@/lib/lifecycle/syncWorkUnitSortOrderFromBuilder";
import { logLifecycleBuilderSaveTiming } from "@/lib/lifecycle/lifecycleBuilderSaveTiming";
import {
    departmentMetadataHasLifecycleBuilderV1,
    lifecycleBuilderDepartmentNotFoundError,
    lifecycleBuilderDepartmentScopeError,
    lifecycleBuilderProcessNotFoundError,
    lifecycleBuilderV1MissingError,
} from "@/lib/lifecycle/lifecycleBuilderRouteErrors";

function processIdInConfig(config: LifecycleBuilderV1, processId: string): boolean {
    const pid = processId.trim();
    return Boolean(pid && config.processes.some((p) => p.id === pid));
}

function requireProcessInConfig(
    config: LifecycleBuilderV1,
    processId: string,
    departmentId: string,
    metadata: unknown
): NextResponse | null {
    const pid = processId.trim();
    if (!pid) return null;
    if (processIdInConfig(config, pid)) return null;
    if (!departmentMetadataHasLifecycleBuilderV1(metadata)) {
        return NextResponse.json(
            { error: lifecycleBuilderV1MissingError(departmentId) },
            { status: 404 }
        );
    }
    return NextResponse.json(
        { error: lifecycleBuilderProcessNotFoundError(pid, departmentId) },
        { status: 404 }
    );
}

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

async function saveConfig(orgId: string, departmentId: string, config: LifecycleBuilderV1) {
    const row = await loadDepartment(orgId, departmentId);
    if (!row) return null;
    const metadata =
        row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
    let nextMeta = mergeLifecycleBuilderIntoMetadata(metadata, config);
    const active = activeLifecycleProcess(config);
    if (active?.id && isLifecycleBuilderOwnedDepartmentMetadata(nextMeta)) {
        nextMeta = mergeLifecycleBuilderOwnedIntoMetadata(nextMeta, { process_id: active.id });
    }
    const supabase = createAdminClient();
    const syncTileDescription =
        active && isLifecycleBuilderOwnedDepartmentMetadata(nextMeta)
            ? lifecycleWorkspaceTileDescription(active.description, active.name)
            : null;
    const { error } = await supabase
        .from("departments")
        .update({
            metadata: nextMeta,
            ...(syncTileDescription != null ? { description: syncTileDescription } : {}),
            updated_at: new Date().toISOString(),
        })
        .eq("id", departmentId)
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return config;
}

function payloadFromConfig(config: LifecycleBuilderV1) {
    const process = activeLifecycleProcess(config);
    return {
        config,
        active_process: process,
        stages: process ? activeStagesForProcess(process) : [],
    };
}

/** GET — lifecycle builder config for department (empty when never configured). */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = effectiveDepartmentScopeDimensions(scopeDimensionsFromAccess(access), access.roleKeys);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json(
            { error: lifecycleBuilderDepartmentScopeError(departmentId) },
            { status: 404 }
        );
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json(
                { error: lifecycleBuilderDepartmentNotFoundError(departmentId) },
                { status: 404 }
            );
        }

        let config = lifecycleBuilderFromDepartmentMetadata(row.metadata);

        return NextResponse.json(payloadFromConfig(config));
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
    }
}

/** PATCH — create/update lifecycle processes and stages. Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = effectiveDepartmentScopeDimensions(scopeDimensionsFromAccess(access), access.roleKeys);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json(
            { error: lifecycleBuilderDepartmentScopeError(departmentId) },
            { status: 404 }
        );
    }

        let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const saveStartedAt = Date.now();
    const actionName = typeof body.action === "string" ? body.action.trim() : "";

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json(
                { error: lifecycleBuilderDepartmentNotFoundError(departmentId) },
                { status: 404 }
            );
        }

        let config = lifecycleBuilderFromDepartmentMetadata(row.metadata);
        const action = typeof body.action === "string" ? body.action.trim() : "";

        switch (action) {
            case "create_process": {
                const name = typeof body.name === "string" ? body.name : "";
                const primary_entity = body.primary_entity === "opportunity" ? "opportunity" : "opportunity";
                const descriptionRaw = typeof body.description === "string" ? body.description : "";
                const description = descriptionRaw.trim()
                    ? clampLifecycleDescription(descriptionRaw)
                    : undefined;
                config = createLifecycleProcess(name, config, { primary_entity, description });
                break;
            }
            case "clear_active_process": {
                config = setActiveProcess(config, null);
                break;
            }
            case "update_process_name": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const name = typeof body.name === "string" ? body.name : "";
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = updateProcessName(config, processId, name);
                break;
            }
            case "update_process_description": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const description = clampLifecycleDescription(
                    typeof body.description === "string" ? body.description : ""
                );
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = updateProcessDescription(config, processId, description);
                break;
            }
            case "set_active_process": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = setActiveProcess(config, processId);
                break;
            }
            case "add_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const label = typeof body.label === "string" ? body.label : "New stage";
                const description = typeof body.description === "string" ? body.description : undefined;
                const pid = processId || config.active_process_id || "";
                if (!pid) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                const missingProcess = requireProcessInConfig(config, pid, departmentId, row.metadata);
                if (missingProcess) return missingProcess;
                config = addStageToProcess(config, pid, label, { description });
                break;
            }
            case "update_stage_description": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const description = typeof body.description === "string" ? body.description : "";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = updateStageDescription(config, pid, stageId, description);
                break;
            }
            case "rename_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const label = typeof body.label === "string" ? body.label : "";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = renameStage(config, pid, stageId, label);
                break;
            }
            case "reorder_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const direction = body.direction === "down" ? "down" : "up";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = reorderStage(config, pid, stageId, direction);
                break;
            }
            case "remove_process": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = removeProcessFromConfig(config, processId);
                break;
            }
            case "remove_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = removeStageFromProcess(config, pid, stageId);
                break;
            }
            default:
                return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }

        await saveConfig(ctx.orgId, departmentId, config);
        if (actionName === "reorder_stage") {
            const deptRow = await loadDepartment(ctx.orgId, departmentId);
            if (!deptRow) {
                return NextResponse.json(
                    { error: lifecycleBuilderDepartmentNotFoundError(departmentId) },
                    { status: 404 }
                );
            }
            const metadata =
                deptRow.metadata !== null && typeof deptRow.metadata === "object" && !Array.isArray(deptRow.metadata)
                    ? (deptRow.metadata as Record<string, unknown>)
                    : {};
            const supabase = createAdminClient();
            await syncWorkUnitSortOrderFromBuilderStages(supabase, ctx.orgId, departmentId, metadata);
        }
        logLifecycleBuilderSaveTiming("lifecycle-builder-patch", saveStartedAt, { action: actionName });
        return NextResponse.json(payloadFromConfig(config));
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
    }
}
