/**
 * Sync per-stage lifecycle work unit queue_definition from status stage assignments.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    requireLifecycleStageQueueStatusKeys,
} from "@/lib/lifecycle/lifecycleStageQueueFilters";
import {
    LifecycleStageStatusAssignmentHandoffError,
    resolveLifecycleStageStatusKeysForQueueSync,
} from "@/lib/lifecycle/lifecycleStageStatusKeysHandoff";
import {
    processIdFromDepartmentMetadata,
    queueFilterKeysFromAssignedStatusKeys,
    resolveLifecycleStageWorkUnitIdentityForDepartment,
    LifecycleStageWorkUnitIdentityConflictError,
} from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import {
    activeLifecycleProcess,
    asOperatorStageKey,
    configuredStageKeysForMetadata,
    isConfiguredStageKey,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { statusKeysForOperatorStageQueueSync } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    buildLifecycleStageWorkUnitMetadata,
    buildLifecycleStageQueueDefinition,
    lifecycleStageWorkUnitKey,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { syncDepartmentQueueForStage } from "@/lib/lifecycle/syncDepartmentQueueForStage";

function mapStatusRows(rows: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>) {
    return rows.map((r) => ({
        status_key: r.status_key,
        status_label: r.status_label,
        sort_order: Number(r.sort_order) ?? 100,
        metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    }));
}

export function statusKeysForBuilderStageQueueSync(
    builderStageKey: string,
    assignedStatusKeys: readonly string[]
): string[] {
    const operator = asOperatorStageKey(builderStageKey);
    if (operator) {
        return statusKeysForOperatorStageQueueSync(operator, assignedStatusKeys);
    }
    return [...new Set(assignedStatusKeys.map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

/** Status keys assigned to a builder stage (metadata + canonical bucket). */
export function assignedStatusKeysForBuilderStage(
    payload: ReturnType<typeof buildEnrollmentStatusStagesPayload>,
    builderStageKey: string
): string[] {
    return resolveLifecycleStageStatusKeysForQueueSync({
        stageKey: builderStageKey,
        statusStagesPayload: payload,
    }).keys;
}

/**
 * Apply current status assignments to the lifecycle_wu_* row for a configured builder stage.
 */
export async function syncLifecycleStageWorkUnitQueueForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    builderStageKey: string,
    opts?: { stageKeys?: readonly string[]; statusKeys?: readonly string[] }
): Promise<{ updated: boolean; created: boolean }> {
    const stageKey = builderStageKey.trim();
    if (!stageKey) return { updated: false, created: false };

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) return { updated: false, created: false };
    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    if (!isConfiguredStageKey(metadata, stageKey)) {
        return { updated: false, created: false };
    }

    const stageKeys = opts?.stageKeys ?? configuredStageKeysForMetadata(metadata);
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const payload = buildEnrollmentStatusStagesPayload(mapStatusRows(rows), stageKeys);
    const resolution = resolveLifecycleStageStatusKeysForQueueSync({
        stageKey,
        explicitStatusKeys: opts?.statusKeys,
        statusStagesPayload: payload,
    });
    const stageStatusKeys = resolution.keys;
    if (!stageStatusKeys.length) {
        throw new LifecycleStageStatusAssignmentHandoffError(stageKey, {
            explicitKeys: resolution.explicitKeys,
            payloadKeys: resolution.payloadKeys,
        });
    }

    const filterKeys = queueFilterKeysFromAssignedStatusKeys(
        stageKey,
        requireLifecycleStageQueueStatusKeys(stageKey, stageStatusKeys)
    );
    const operator = asOperatorStageKey(stageKey);
    if (operator) {
        try {
            await syncDepartmentQueueForStage(supabase, orgId, departmentId, operator);
        } catch {
            /* legacy pipeline sync is best-effort */
        }
    }

    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active);
    const queueName = stageRecord?.label.trim() || stageKey.replace(/_/g, " ");
    const now = new Date().toISOString();
    const processId = process?.id ?? processIdFromDepartmentMetadata(metadata);

    const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(supabase, {
        orgId,
        departmentId,
        stageKey,
        processId,
    });
    if (identity.state === "conflict") {
        throw new LifecycleStageWorkUnitIdentityConflictError(identity);
    }

    let row = identity.workUnit;
    if (!row) {
        const wuKey = lifecycleStageWorkUnitKey(stageKey);
        const queue_definition = buildLifecycleStageQueueDefinition({
            stageKey,
            label: queueName,
            statusKeys: filterKeys,
        });
        const { error: insErr } = await supabase.from("work_units").insert({
            org_id: orgId,
            department_id: departmentId,
            key: wuKey,
            name: queueName,
            description: `Lifecycle stage queue (${stageKey}).`,
            sort_order: stageRecord?.sort_order ?? 0,
            is_active: true,
            queue_definition,
            metadata: buildLifecycleStageWorkUnitMetadata(stageKey, {
                processId: processId ?? undefined,
                statusKeys: filterKeys,
                stageLabel: stageRecord?.label,
            }),
            updated_at: now,
        });
        if (insErr) throw new Error(insErr.message);
        return { updated: true, created: true };
    }

    const queue_definition = applyStatusKeysToLifecycleStageQueueDefinition(
        row.queue_definition,
        filterKeys,
        stageKey
    );
    const { error: upErr } = await supabase
        .from("work_units")
        .update({
            queue_definition,
            metadata: buildLifecycleStageWorkUnitMetadata(stageKey, {
                processId: processId ?? undefined,
                statusKeys: filterKeys,
                stageLabel: stageRecord?.label,
            }),
            updated_at: now,
        })
        .eq("id", row.id)
        .eq("org_id", orgId);
    if (upErr) throw new Error(upErr.message);
    return { updated: true, created: false };
}

/** Status keys in the builder stage bucket for a department. */
export async function stageStatusKeysForDepartmentStage(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    builderStageKey: string
): Promise<string[]> {
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) return [];
    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const stageKeys = configuredStageKeysForMetadata(metadata);
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const payload = buildEnrollmentStatusStagesPayload(mapStatusRows(rows), stageKeys);
    return assignedStatusKeysForBuilderStage(payload, builderStageKey);
}
