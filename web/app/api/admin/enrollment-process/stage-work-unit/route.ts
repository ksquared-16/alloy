import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { requireAdminOrOps } from "@/lib/adminAuth";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    applyStageStatusKeysToQueueDefinition,
    defaultEnrollmentPipelineQueueDefinition,
    stageStatusesNeedQueueSync,
    validateEnrollmentPipelineQueueDefinition,
} from "@/lib/lifecycle/lifecycleStageQueueSync";
import {
    defaultWorkUnitQueueNameForStageKey,
    statusKeysForOperatorStageQueueSync,
} from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    buildLifecycleStageQueueDefinition,
    buildLifecycleStageWorkUnitMetadata,
    lifecycleStageWorkUnitKey,
    loadLifecycleStageWorkUnitForDepartment,
    loadStageWorkUnitSnapshotForDepartment,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { syncDepartmentQueueForStage } from "@/lib/lifecycle/syncDepartmentQueueForStage";
import { deactivateBuilderOwnedWorkUnit } from "@/lib/lifecycle/lifecycleActivationOwned";
import {
    snapshotEnrollmentPipelineWorkUnit,
    stageQueueMappingForPipeline,
} from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import {
    isLifecycleStageWorkUnitKey,
    queueStatusKeysForStageWorkUnitSnapshot,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

async function loadPipelineForDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, name, is_active, queue_definition, department_id")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", ENROLLMENT_PIPELINE_WORK_UNIT_KEY)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as
        | {
              id: string;
              key: string;
              name: string;
              is_active: boolean;
              queue_definition: unknown;
              department_id: string;
          }
        | null;
}

async function stageStatusKeysForOrg(orgId: string, stage: LifecycleOperatorStage): Promise<string[]> {
    const supabase = createAdminClient();
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const payload = buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        }))
    );
    return (payload.stages[stage]?.statuses ?? []).map((s) => s.status_key);
}

/** GET ?department_id=&stage= — enrollment pipeline work unit + stage queue mapping. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const departmentId = new URL(request.url).searchParams.get("department_id")?.trim() || "";
    const stageRaw = new URL(request.url).searchParams.get("stage")?.trim() || "";
    if (!departmentId) return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    if (!isStageKey(stageRaw)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const deptOk = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    try {
        const snapshot = await loadStageWorkUnitSnapshotForDepartment(
            supabase,
            ctx.orgId,
            departmentId,
            stageRaw
        );
        const stageStatusKeys = await stageStatusKeysForOrg(ctx.orgId, stageRaw);
        const queueStatusKeys = queueStatusKeysForStageWorkUnitSnapshot(snapshot, stageRaw);
        const mapping = stageQueueMappingForPipeline(stageRaw, snapshot);

        return NextResponse.json({
            work_unit: snapshot
                ? {
                      id: snapshot.id,
                      key: snapshot.key,
                      name: snapshot.name,
                      is_active: snapshot.is_active,
                  }
                : null,
            stage: stageRaw,
            stage_status_keys: stageStatusKeys,
            queue_status_keys: queueStatusKeys,
            needs_sync: stageStatusesNeedQueueSync(stageRaw, snapshot, stageStatusKeys),
            mapping,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
    }
}

/** POST — create per-stage lifecycle work unit (builder-owned) or legacy enrollment_pipeline. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { department_id?: string; name?: string; stage?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const department_id = typeof body.department_id === "string" ? body.department_id.trim() : "";
    if (!department_id) return NextResponse.json({ error: "department_id is required" }, { status: 400 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (!departmentIdAllowed(dim, department_id)) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data: deptRow, error: deptLoadErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", department_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (deptLoadErr) return NextResponse.json({ error: deptLoadErr.message }, { status: 400 });
    if (!deptRow) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    const stageRaw = typeof body.stage === "string" ? body.stage.trim() : "";
    const stageRawForName = stageRaw;
    const name =
        typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : defaultWorkUnitQueueNameForStageKey(stageRawForName);
    const now = new Date().toISOString();
    const builderOwned = isLifecycleBuilderOwnedDepartmentMetadata(
        (deptRow as { metadata?: unknown }).metadata
    );
    const usePerStageWu = builderOwned && isStageKey(stageRaw);

    if (usePerStageWu) {
        const wuKey = lifecycleStageWorkUnitKey(stageRaw);
        const existingStage = await loadLifecycleStageWorkUnitForDepartment(
            supabase,
            ctx.orgId,
            department_id,
            stageRaw
        );
        if (existingStage) {
            return NextResponse.json(
                { error: `Work Unit Queue already exists for stage “${stageRaw}”.` },
                { status: 409 }
            );
        }
        const stageStatusKeys = await stageStatusKeysForOrg(ctx.orgId, stageRaw);
        const filterKeys =
            stageStatusKeys.length > 0
                ? statusKeysForOperatorStageQueueSync(stageRaw, stageStatusKeys)
                : [];
        const queue_definition = buildLifecycleStageQueueDefinition({
            stageKey: stageRaw,
            label: name,
            statusKeys: filterKeys,
        });
        const ownedMeta = (deptRow as { metadata?: unknown }).metadata;
        const processId =
            ownedMeta != null && typeof ownedMeta === "object" && !Array.isArray(ownedMeta)
                ? String(
                      (
                          ownedMeta as {
                              lifecycle_builder_owned_v1?: { process_id?: string | null };
                          }
                      ).lifecycle_builder_owned_v1?.process_id ?? ""
                  ).trim() || undefined
                : undefined;

        const { data: created, error } = await supabase
            .from("work_units")
            .insert({
                org_id: ctx.orgId,
                department_id,
                key: wuKey,
                name,
                description: `Lifecycle stage queue (${stageRaw}).`,
                sort_order: 0,
                is_active: true,
                queue_definition,
                metadata: buildLifecycleStageWorkUnitMetadata(stageRaw, {
                    processId,
                    statusKeys: filterKeys,
                }),
                updated_at: now,
            })
            .select("id, key, name, is_active, queue_definition")
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        const row = created as {
            id: string;
            key: string;
            name: string;
            is_active: boolean;
            queue_definition: unknown;
        };

        const { data: legacyPipeline } = await supabase
            .from("work_units")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("department_id", department_id)
            .eq("key", ENROLLMENT_PIPELINE_WORK_UNIT_KEY)
            .eq("is_active", true)
            .maybeSingle();
        if (legacyPipeline) {
            const { count } = await supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .eq("org_id", ctx.orgId)
                .eq("work_unit_id", (legacyPipeline as { id: string }).id);
            if ((count ?? 0) === 0) {
                await supabase
                    .from("work_units")
                    .update({ is_active: false, updated_at: now })
                    .eq("id", (legacyPipeline as { id: string }).id)
                    .eq("org_id", ctx.orgId);
            }
        }

        const snapshot = snapshotEnrollmentPipelineWorkUnit(row);
        return NextResponse.json({
            work_unit: { id: row.id, key: row.key, name: row.name, is_active: row.is_active },
            snapshot,
        });
    }

    if (builderOwned) {
        return NextResponse.json(
            { error: "Builder-owned lifecycles require a valid stage when creating a work unit queue." },
            { status: 400 }
        );
    }

    const existing = await loadPipelineForDepartment(ctx.orgId, department_id);
    if (existing) {
        return NextResponse.json({ error: "Enrollment pipeline work unit already exists for this department" }, { status: 409 });
    }

    const queue_definition = defaultEnrollmentPipelineQueueDefinition();

    const { data: created, error } = await supabase
        .from("work_units")
        .insert({
            org_id: ctx.orgId,
            department_id,
            key: ENROLLMENT_PIPELINE_WORK_UNIT_KEY,
            name,
            description:
                "Enrollment lifecycle pipeline — queue lanes are driven by lifecycle stage statuses.",
            sort_order: 0,
            is_active: true,
            queue_definition,
            metadata: {},
            updated_at: now,
        })
        .select("id, key, name, is_active, queue_definition")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const row = created as { id: string; key: string; name: string; is_active: boolean; queue_definition: unknown };
    if (isStageKey(stageRaw)) {
        try {
            await syncDepartmentQueueForStage(supabase, ctx.orgId, department_id, stageRaw);
        } catch {
            /* best-effort */
        }
    }
    const refreshed = await loadPipelineForDepartment(ctx.orgId, department_id);
    const snapshot = refreshed ? snapshotEnrollmentPipelineWorkUnit(refreshed) : snapshotEnrollmentPipelineWorkUnit(row);
    return NextResponse.json({
        work_unit: { id: row.id, key: row.key, name: row.name, is_active: row.is_active },
        snapshot,
    });
}

/** PATCH — update name and/or sync stage statuses to queue lanes. Admin only. */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
        work_unit_id?: string;
        name?: string;
        stage?: string;
        sync_statuses?: boolean;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const workUnitId = typeof body.work_unit_id === "string" ? body.work_unit_id.trim() : "";
    if (!workUnitId) return NextResponse.json({ error: "work_unit_id is required" }, { status: 400 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("work_units")
        .select("id, org_id, department_id, key, name, queue_definition")
        .eq("id", workUnitId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = existing as {
        id: string;
        department_id: string;
        key: string;
        name: string;
        queue_definition: unknown;
    };

    const isStageWu = isLifecycleStageWorkUnitKey(row.key);
    const isPipeline = row.key === ENROLLMENT_PIPELINE_WORK_UNIT_KEY;
    if (!isStageWu && !isPipeline) {
        return NextResponse.json({ error: "Work unit is not a lifecycle stage or enrollment pipeline queue" }, { status: 400 });
    }

    if (!departmentIdAllowed(dim, row.department_id)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
        updates.name = name;
    }

    if (body.sync_statuses) {
        const stageRaw = typeof body.stage === "string" ? body.stage.trim() : "";
        if (!isStageKey(stageRaw)) {
            return NextResponse.json({ error: "Valid stage is required for sync_statuses" }, { status: 400 });
        }
        const stageStatusKeys = await stageStatusKeysForOrg(ctx.orgId, stageRaw);
        if (!stageStatusKeys.length) {
            return NextResponse.json(
                { error: "Assign at least one status to this stage before syncing the queue." },
                { status: 400 }
            );
        }
        const filterKeys = statusKeysForOperatorStageQueueSync(stageRaw, stageStatusKeys);
        try {
            updates.queue_definition = isStageWu
                ? applyStatusKeysToLifecycleStageQueueDefinition(row.queue_definition, filterKeys)
                : applyStageStatusKeysToQueueDefinition(row.queue_definition, stageRaw, filterKeys);
            if (!isStageWu) {
                validateEnrollmentPipelineQueueDefinition(updates.queue_definition);
            }
        } catch (e) {
            return NextResponse.json(
                { error: e instanceof Error ? e.message : "Failed to sync queue filters" },
                { status: 400 }
            );
        }
    }

    if (Object.keys(updates).length <= 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("work_units")
        .update(updates)
        .eq("id", workUnitId)
        .eq("org_id", ctx.orgId)
        .select("id, key, name, is_active, queue_definition")
        .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    const out = updated as { id: string; key: string; name: string; is_active: boolean; queue_definition: unknown };
    const snapshot = snapshotEnrollmentPipelineWorkUnit(out);
    const stageTrimmed = typeof body.stage === "string" ? body.stage.trim() : "";
    const stageAfterSync: LifecycleOperatorStage | null = isStageKey(stageTrimmed) ? stageTrimmed : null;

    return NextResponse.json({
        work_unit: { id: out.id, key: out.key, name: out.name, is_active: out.is_active },
        snapshot,
        ...(stageAfterSync
            ? {
                  needs_sync: stageStatusesNeedQueueSync(
                      stageAfterSync,
                      snapshot,
                      await stageStatusKeysForOrg(ctx.orgId, stageAfterSync)
                  ),
              }
            : {}),
    });
}

/** DELETE — deactivate builder-owned enrollment pipeline work unit (test cleanup). */
export async function DELETE(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { work_unit_id?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const workUnitId = typeof body.work_unit_id === "string" ? body.work_unit_id.trim() : "";
    if (!workUnitId) return NextResponse.json({ error: "work_unit_id is required" }, { status: 400 });

    const supabase = createAdminClient();
    const result = await deactivateBuilderOwnedWorkUnit(supabase, ctx.orgId, workUnitId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
}
