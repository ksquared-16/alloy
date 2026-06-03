import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { logAdminAudit } from "@/lib/adminAuth";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    ENROLLMENT_OPERATOR_STAGE_UNASSIGNED,
    mergeEnrollmentOperatorStageMetadata,
    parseEnrollmentOperatorStageFromMetadata,
} from "@/lib/lifecycle/enrollmentOperatorStage";
import {
    assertValidEnrollmentStageStatusKeys,
    persistEnrollmentStageStatusAssignments,
} from "@/lib/lifecycle/persistEnrollmentStageStatusAssignments";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    configuredStageKeysForMetadata,
    isConfiguredStageKey,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { syncDepartmentQueueForStage } from "@/lib/lifecycle/syncDepartmentQueueForStage";
import { syncLifecycleStageWorkUnitQueueForDepartment } from "@/lib/lifecycle/lifecycleStageWorkUnitQueueSync";
import { logLifecycleBuilderSaveTiming } from "@/lib/lifecycle/lifecycleBuilderSaveTiming";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

async function loadDepartmentMetadata(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.metadata ?? null;
}

function mapStatusRows(rows: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>) {
    return rows.map((r) => ({
        status_key: r.status_key,
        status_label: r.status_label,
        sort_order: Number(r.sort_order) ?? 100,
        metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    }));
}

async function stageKeysForRequest(orgId: string, departmentId: string | null): Promise<string[]> {
    if (!departmentId) return [...LIFECYCLE_STAGE_ORDER];
    const metadata = await loadDepartmentMetadata(orgId, departmentId);
    const keys = configuredStageKeysForMetadata(metadata);
    return keys.length ? keys : [...LIFECYCLE_STAGE_ORDER];
}

async function validateStageKey(orgId: string, departmentId: string | null, stage: string): Promise<boolean> {
    if (!departmentId) return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(stage);
    const metadata = await loadDepartmentMetadata(orgId, departmentId);
    return isConfiguredStageKey(metadata, stage);
}

/** GET — opportunity statuses grouped by lifecycle stage. ?department_id= for configured stages. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const departmentId = new URL(request.url).searchParams.get("department_id")?.trim() || null;
    if (departmentId) {
        const access = await getAdminAccessContextCached();
        if (!access.ok) return adminContextFailureResponse(access);
        const dim = scopeDimensionsFromAccess(access);
        if (!departmentIdAllowed(dim, departmentId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    const supabase = createAdminClient();
    const rows = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });
    const stageKeys = await stageKeysForRequest(ctx.orgId, departmentId);

    return NextResponse.json(buildEnrollmentStatusStagesPayload(mapStatusRows(rows), stageKeys));
}

/** PATCH — replace statuses assigned to one stage, or reset stage metadata overrides. */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { stage?: string; status_keys?: string[]; reset_stage?: string; department_id?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : null;
    if (departmentId) {
        const access = await getAdminAccessContextCached();
        if (!access.ok) return adminContextFailureResponse(access);
        const dim = scopeDimensionsFromAccess(access);
        if (!departmentIdAllowed(dim, departmentId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    const resetStage = typeof body.reset_stage === "string" ? body.reset_stage.trim() : "";
    if (resetStage) {
        if (!(await validateStageKey(ctx.orgId, departmentId, resetStage))) {
            return NextResponse.json({ error: "Invalid reset_stage" }, { status: 400 });
        }
        return resetStageMetadata(ctx, resetStage, departmentId);
    }

    const saveStartedAt = Date.now();
    const stage = typeof body.stage === "string" ? body.stage.trim() : "";
    if (!(await validateStageKey(ctx.orgId, departmentId, stage))) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    let statusKeys: string[];
    try {
        if (!Array.isArray(body.status_keys)) {
            return NextResponse.json({ error: "status_keys array is required" }, { status: 400 });
        }
        statusKeys = assertValidEnrollmentStageStatusKeys(body.status_keys);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Invalid status_keys" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const { changedIds } = await persistEnrollmentStageStatusAssignments(
        supabase,
        ctx.orgId,
        stage,
        statusKeys
    );

    logAdminAudit({
        entity: "status_definitions",
        id: stage,
        changed_fields: ["enrollment_operator_stage", ...changedIds],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    const rows = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });
    const stageKeys = await stageKeysForRequest(ctx.orgId, departmentId);

    if (departmentId && (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(stage)) {
        try {
            await syncDepartmentQueueForStage(
                supabase,
                ctx.orgId,
                departmentId,
                stage as LifecycleOperatorStage
            );
        } catch {
            /* queue sync is best-effort when pipeline missing */
        }
    }

    if (departmentId) {
        try {
            await syncLifecycleStageWorkUnitQueueForDepartment(
                supabase,
                ctx.orgId,
                departmentId,
                stage,
                { stageKeys, statusKeys }
            );
        } catch {
            /* per-stage WU sync is best-effort */
        }
    }

    logLifecycleBuilderSaveTiming("status-stages-patch", saveStartedAt, { stage, departmentId });
    return NextResponse.json(buildEnrollmentStatusStagesPayload(mapStatusRows(rows), stageKeys));
}

async function resetStageMetadata(
    ctx: { orgId: string; userId: string; role: string },
    stage: string,
    departmentId: string | null
) {
    const supabase = createAdminClient();
    const orgId = ctx.orgId;
    const { data: orgRows, error } = await supabase
        .from("status_definitions")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const changedIds: string[] = [];
    for (const row of orgRows ?? []) {
        const meta =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        if (parseEnrollmentOperatorStageFromMetadata(meta) !== stage) continue;
        const nextMeta = mergeEnrollmentOperatorStageMetadata(meta, null);
        const { error: upErr } = await supabase
            .from("status_definitions")
            .update({ metadata: normalizeStatusDefinitionMetadata(nextMeta) })
            .eq("id", row.id)
            .eq("org_id", orgId);
        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
        changedIds.push(String(row.id));
    }

    logAdminAudit({
        entity: "status_definitions",
        id: stage,
        changed_fields: ["reset_enrollment_operator_stage", ...changedIds],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const stageKeys = await stageKeysForRequest(orgId, departmentId);
    return NextResponse.json(buildEnrollmentStatusStagesPayload(mapStatusRows(rows), stageKeys));
}
