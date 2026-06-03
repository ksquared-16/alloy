/**
 * Builder-owned lifecycle departments — runtime mode for /dept and validation.
 * Never use enrollment_pipeline pipeline_lanes when this mode is active.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    activeLifecycleProcess,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    buildLifecycleStageQueueDefinition,
    buildLifecycleStageWorkUnitMetadata,
    isLifecycleStageWorkUnitKey,
    lifecycleStageWorkUnitKey,
    loadLifecycleStageWorkUnitForDepartment,
    type LifecycleStageWorkUnitRow,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { statusKeysForBuilderStageQueueSync } from "@/lib/lifecycle/lifecycleStageWorkUnitQueueSync";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    mergeLifecycleStageRowPreviewIntoQueueDefinition,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { stageSavedStatusKeys } from "@/lib/lifecycle/lifecycleActivationStep3";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    lifecycleActivationFromMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { defaultWorkUnitQueueNameForStageKey } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";

export type WorkUnitListRow = {
    id: string;
    name: string | null;
    key: string | null;
    metadata?: unknown;
    is_active?: boolean;
    sort_order?: number | null;
};

export function isBuilderOwnedLifecycleDepartmentMetadata(metadata: unknown): boolean {
    return isLifecycleBuilderOwnedDepartmentMetadata(metadata);
}

export function isLifecycleStageWorkUnitRow(row: {
    key?: string | null;
    metadata?: unknown;
}): boolean {
    if (isLifecycleStageWorkUnitKey(row.key)) return true;
    const meta = row.metadata;
    if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return false;
    const stageKey = (meta as { lifecycle_stage_key?: unknown }).lifecycle_stage_key;
    return typeof stageKey === "string" && stageKey.trim().length > 0;
}

/** True when /dept must not render enrollment_pipeline pipeline_lanes. */
export function deptUsesBuilderOwnedLifecycleRuntime(
    departmentMetadata: unknown,
    workUnits: readonly { key?: string | null; metadata?: unknown }[]
): boolean {
    if (isBuilderOwnedLifecycleDepartmentMetadata(departmentMetadata)) return true;
    return workUnits.some((w) => isLifecycleStageWorkUnitRow(w));
}

/** Enrollment and builder-owned lifecycle departments reserve the operational actions rail shell. */
export function departmentReservesOperationalActionsRail(params: {
    departmentKey?: string | null;
    departmentMetadata?: unknown;
    workUnits?: readonly { key?: string | null; metadata?: unknown }[];
}): boolean {
    if (isEnrollmentLikeDepartmentKey(params.departmentKey)) return true;
    return deptUsesBuilderOwnedLifecycleRuntime(params.departmentMetadata, params.workUnits ?? []);
}

export function filterWorkUnitsForBuilderOwnedDeptDisplay(
    workUnits: WorkUnitListRow[]
): WorkUnitListRow[] {
    return workUnits.filter((w) => isLifecycleStageWorkUnitRow(w));
}

export function filterSummaryWorkUnitIdsForDept(
    workUnitIds: string[],
    workUnits: WorkUnitListRow[],
    departmentMetadata: unknown
): string[] {
    if (!deptUsesBuilderOwnedLifecycleRuntime(departmentMetadata, workUnits)) {
        return workUnitIds;
    }
    const allowed = new Set(
        filterWorkUnitsForBuilderOwnedDeptDisplay(workUnits).map((w) => w.id)
    );
    return workUnitIds.filter((id) => allowed.has(id));
}

const LEGACY_PIPELINE_LANE_LABELS = [
    "new leads",
    "tours",
    "follow up",
    "waitlist",
    "enrolling",
    "enrolled",
] as const;

export function deptPipelineSurfaceShowsLegacyEnrollmentLanes(
    lanes: readonly { label?: string | null }[] | undefined
): boolean {
    if (!lanes?.length) return false;
    const labels = lanes.map((l) => (l.label ?? "").trim().toLowerCase()).filter(Boolean);
    const legacyHits = LEGACY_PIPELINE_LANE_LABELS.filter((t) => labels.includes(t)).length;
    return legacyHits >= 3;
}

async function statusPayloadForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    metadata: unknown
): Promise<EnrollmentStatusStagesPayload> {
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageKeys = process?.stages.map((s) => s.key) ?? [];
    return buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        stageKeys.length ? stageKeys : undefined
    );
}

function explicitStatusKeysForStage(
    payload: EnrollmentStatusStagesPayload,
    stageKey: string
): string[] {
    return stageSavedStatusKeys(payload, stageKey, { explicitAssignmentsOnly: true });
}

/** Stage has operator-saved Work Unit Queue config (statuses and/or activation bundle for that stage). */
export function stageHasSavedWorkUnitQueueConfig(
    stageKey: string,
    payload: EnrollmentStatusStagesPayload,
    activation: LifecycleActivationV1 | null
): boolean {
    if (explicitStatusKeysForStage(payload, stageKey).length > 0) return true;
    if (!activation) return false;
    const key = stageKey.trim();
    if (!key || activation.stage_key.trim() !== key) return false;
    return Boolean(activation.work_unit_name?.trim() || activation.work_unit_id?.trim());
}

export function countStagesWithSavedWorkUnitQueueConfig(
    stages: readonly LifecycleBuilderStageRecord[],
    payload: EnrollmentStatusStagesPayload,
    activation: LifecycleActivationV1 | null
): number {
    return stages.filter((s) => s.is_active && stageHasSavedWorkUnitQueueConfig(s.key, payload, activation)).length;
}

export type LifecycleWorkUnitDeptRuntimeDebug = {
    builder_owned_department: boolean;
    active_stages_count: number;
    stage_work_unit_configs_count: number;
    lifecycle_wu_rows_count: number;
    repair_attempted: boolean;
    repair_ok?: boolean;
    repair_actions?: string[];
    reason_no_work_units_rendered: string | null;
};

export function buildLifecycleWorkUnitDeptRuntimeDebug(params: {
    builderOwned: boolean;
    activeStagesCount: number;
    stageWorkUnitConfigsCount: number;
    lifecycleWuRowsCount: number;
    repairAttempted: boolean;
    repairOk?: boolean;
    repairActions?: string[];
    repairError?: string | null;
}): LifecycleWorkUnitDeptRuntimeDebug {
    const {
        builderOwned,
        activeStagesCount,
        stageWorkUnitConfigsCount,
        lifecycleWuRowsCount,
        repairAttempted,
        repairOk,
        repairActions,
        repairError,
    } = params;

    let reason: string | null = null;
    if (lifecycleWuRowsCount > 0) {
        reason = null;
    } else if (!builderOwned) {
        reason = "not_builder_owned_lifecycle_department";
    } else if (stageWorkUnitConfigsCount === 0) {
        reason = "no_stage_work_unit_queue_configuration";
    } else if (repairAttempted && repairOk === false) {
        reason = repairError?.trim()
            ? `auto_repair_failed: ${repairError.trim()}`
            : "auto_repair_failed";
    } else if (repairAttempted && repairOk === true && lifecycleWuRowsCount === 0) {
        reason = "auto_repair_succeeded_but_no_lifecycle_wu_rows";
    } else if (repairAttempted) {
        reason = "repair_attempted_work_units_still_empty";
    } else {
        reason = "lifecycle_wu_rows_missing_repair_not_attempted";
    }

    return {
        builder_owned_department: builderOwned,
        active_stages_count: activeStagesCount,
        stage_work_unit_configs_count: stageWorkUnitConfigsCount,
        lifecycle_wu_rows_count: lifecycleWuRowsCount,
        repair_attempted: repairAttempted,
        repair_ok: repairOk,
        repair_actions: repairActions,
        reason_no_work_units_rendered: reason,
    };
}

function queueNamesByStageForRepair(
    stages: readonly LifecycleBuilderStageRecord[],
    payload: EnrollmentStatusStagesPayload,
    activation: LifecycleActivationV1 | null
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const stage of stages) {
        if (!stage.is_active) continue;
        const stageKey = stage.key.trim();
        if (!stageKey || !stageHasSavedWorkUnitQueueConfig(stageKey, payload, activation)) continue;
        const fromActivation =
            activation?.stage_key.trim() === stageKey ? activation.work_unit_name?.trim() : "";
        out[stageKey] =
            fromActivation ||
            stage.label.trim() ||
            defaultWorkUnitQueueNameForStageKey(stageKey) ||
            stageKey.replace(/_/g, " ");
    }
    return out;
}

export type RepairLifecycleWorkUnitsResult =
    | { ok: true; department_id: string; actions: string[]; work_units: Array<{ id: string; key: string; name: string }> }
    | { ok: false; error: string; actions?: string[] };

/** Ensure lifecycle_wu_* rows exist; sync filters; inactivate stale enrollment_pipeline on builder-owned depts. */
export async function repairLifecycleWorkUnits(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    opts?: {
        stages?: LifecycleBuilderStageRecord[];
        processId?: string;
        /** Map stage_key → configured queue display name from activation. */
        queueNamesByStage?: Record<string, string>;
        /** When true, only stages with saved Work Unit Queue config are repaired. */
        onlyStagesWithSavedWorkUnitConfig?: boolean;
    }
): Promise<RepairLifecycleWorkUnitsResult> {
    const actions: string[] = [];

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, error: deptErr.message };
    if (!dept) return { ok: false, error: "Department not found" };
    if (!isBuilderOwnedLifecycleDepartmentMetadata(dept.metadata)) {
        return { ok: false, error: "Department is not builder-owned lifecycle runtime." };
    }

    const metadata = dept.metadata;
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stages = opts?.stages ?? process?.stages ?? [];
    const processId = opts?.processId ?? process?.id;
    const statusPayload = await statusPayloadForDepartment(supabase, orgId, departmentId, metadata);
    const activation = lifecycleActivationFromMetadata(metadata);
    const queueNamesByStage =
        opts?.queueNamesByStage ??
        (opts?.onlyStagesWithSavedWorkUnitConfig
            ? queueNamesByStageForRepair(stages, statusPayload, activation)
            : undefined);
    const now = new Date().toISOString();

    const repaired: Array<{ id: string; key: string; name: string }> = [];

    for (const stage of stages) {
        if (!stage.is_active) continue;
        const stageKey = stage.key.trim();
        if (!stageKey) continue;
        if (
            opts?.onlyStagesWithSavedWorkUnitConfig &&
            !stageHasSavedWorkUnitQueueConfig(stageKey, statusPayload, activation)
        ) {
            continue;
        }
        const queueName =
            queueNamesByStage?.[stageKey]?.trim() ||
            opts?.queueNamesByStage?.[stageKey]?.trim() ||
            stage.label.trim() ||
            defaultWorkUnitQueueNameForStageKey(stageKey) ||
            stageKey.replace(/_/g, " ");
        const statusKeys = stageSavedStatusKeys(statusPayload, stageKey);
        const filterKeys = statusKeys.length
            ? statusKeysForBuilderStageQueueSync(stageKey, statusKeys)
            : statusKeys;

        let row = await loadLifecycleStageWorkUnitForDepartment(supabase, orgId, departmentId, stageKey);
        if (!row) {
            const wuKey = lifecycleStageWorkUnitKey(stageKey);
            const queue_definition = buildLifecycleStageQueueDefinition({
                stageKey,
                label: queueName,
                statusKeys: filterKeys,
            });
            const { data: created, error: insErr } = await supabase
                .from("work_units")
                .insert({
                    org_id: orgId,
                    department_id: departmentId,
                    key: wuKey,
                    name: queueName,
                    description: `Lifecycle stage queue (${stageKey}).`,
                    sort_order: stage.sort_order ?? 0,
                    is_active: true,
                    queue_definition,
                    metadata: buildLifecycleStageWorkUnitMetadata(stageKey, {
                        processId: processId ?? undefined,
                        statusKeys: filterKeys,
                        stageLabel: stage.label,
                    }),
                    updated_at: now,
                })
                .select("id, key, name")
                .single();
            if (insErr) return { ok: false, error: insErr.message, actions };
            row = created as LifecycleStageWorkUnitRow;
            actions.push(`created_${wuKey}`);
        } else if (filterKeys.length) {
            const queue_definition = applyStatusKeysToLifecycleStageQueueDefinition(
                row.queue_definition,
                filterKeys,
                stageKey
            );
            await supabase
                .from("work_units")
                .update({
                    name: queueName,
                    queue_definition,
                    metadata: buildLifecycleStageWorkUnitMetadata(stageKey, {
                        processId: processId ?? undefined,
                        statusKeys: filterKeys,
                        stageLabel: stage.label,
                    }),
                    updated_at: now,
                })
                .eq("id", row.id)
                .eq("org_id", orgId);
            actions.push(`synced_${row.key}`);
        } else {
            const queue_definition = mergeLifecycleStageRowPreviewIntoQueueDefinition(
                row.queue_definition,
                stageKey
            );
            await supabase
                .from("work_units")
                .update({ name: queueName, queue_definition, updated_at: now })
                .eq("id", row.id)
                .eq("org_id", orgId);
            actions.push(`row_preview_${row.key}`);
        }
        repaired.push({ id: row.id, key: row.key, name: queueName });
    }

    const { data: legacyPipeline } = await supabase
        .from("work_units")
        .select("id, key, is_active")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", ENROLLMENT_PIPELINE_WORK_UNIT_KEY)
        .eq("is_active", true)
        .maybeSingle();

    if (legacyPipeline && repaired.length > 0) {
        const { count } = await supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("work_unit_id", (legacyPipeline as { id: string }).id);
        const bound = count ?? 0;
        if (bound === 0) {
            await supabase
                .from("work_units")
                .update({ is_active: false, updated_at: now })
                .eq("id", (legacyPipeline as { id: string }).id)
                .eq("org_id", orgId);
            actions.push("inactivated_enrollment_pipeline");
        } else {
            actions.push("skipped_inactivate_enrollment_pipeline_has_opportunities");
        }
    }

    return { ok: true, department_id: departmentId, actions, work_units: repaired };
}

type WorkUnitDbRow = {
    id: string;
    key: string | null;
    name: string | null;
    queue_definition?: unknown;
    metadata?: unknown;
    department_id?: string | null;
};

/**
 * Read-only lifecycle work unit snapshot for dept bootstrap (no repair, no extra DB).
 * Repair belongs in Settings (manual) only — never on /dept navigation.
 */
export function inspectBuilderOwnedLifecycleWorkUnitsForDept(params: {
    departmentMetadata: unknown;
    wuRows: WorkUnitListRow[];
}): LifecycleWorkUnitDeptRuntimeDebug {
    const builderOwned = isBuilderOwnedLifecycleDepartmentMetadata(params.departmentMetadata);
    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const activeStages = (process?.stages ?? []).filter((s) => s.is_active);
    const displayRows = filterWorkUnitsForBuilderOwnedDeptDisplay(params.wuRows);
    const lifecycleWuCount = displayRows.length;
    const activation = lifecycleActivationFromMetadata(params.departmentMetadata);
    let stageConfigCount = 0;
    if (activation?.status_keys?.length) {
        stageConfigCount = 1;
    }
    return buildLifecycleWorkUnitDeptRuntimeDebug({
        builderOwned,
        activeStagesCount: activeStages.length,
        stageWorkUnitConfigsCount: stageConfigCount,
        lifecycleWuRowsCount: lifecycleWuCount,
        repairAttempted: false,
        repairError: null,
    });
}

/** Settings / explicit repair only — not for runtime navigation bootstrap. */
export async function autoRepairBuilderOwnedLifecycleWorkUnitsForDept(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    departmentMetadata: unknown;
    wuRows: WorkUnitDbRow[];
}): Promise<{
    wuRows: WorkUnitDbRow[];
    debug: LifecycleWorkUnitDeptRuntimeDebug;
}> {
    const { supabase, orgId, departmentId, departmentMetadata, wuRows } = params;
    const builderOwned = isBuilderOwnedLifecycleDepartmentMetadata(departmentMetadata);
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const activeStages = (process?.stages ?? []).filter((s) => s.is_active);
    const displayRows = filterWorkUnitsForBuilderOwnedDeptDisplay(
        wuRows.map((w) => ({
            id: w.id,
            name: w.name,
            key: w.key,
            metadata: w.metadata,
        }))
    );
    const lifecycleWuCount = displayRows.length;

    const statusPayload = builderOwned
        ? await statusPayloadForDepartment(supabase, orgId, departmentId, departmentMetadata)
        : ({ stages: {} } as EnrollmentStatusStagesPayload);
    const activation = lifecycleActivationFromMetadata(departmentMetadata);
    const stageConfigCount = countStagesWithSavedWorkUnitQueueConfig(
        activeStages,
        statusPayload,
        activation
    );

    if (!builderOwned) {
        return {
            wuRows,
            debug: buildLifecycleWorkUnitDeptRuntimeDebug({
                builderOwned: false,
                activeStagesCount: activeStages.length,
                stageWorkUnitConfigsCount: stageConfigCount,
                lifecycleWuRowsCount: lifecycleWuCount,
                repairAttempted: false,
            }),
        };
    }
    if (lifecycleWuCount > 0) {
        return {
            wuRows,
            debug: buildLifecycleWorkUnitDeptRuntimeDebug({
                builderOwned: true,
                activeStagesCount: activeStages.length,
                stageWorkUnitConfigsCount: stageConfigCount,
                lifecycleWuRowsCount: lifecycleWuCount,
                repairAttempted: false,
                repairError: null,
            }),
        };
    }
    if (stageConfigCount === 0) {
        return {
            wuRows,
            debug: buildLifecycleWorkUnitDeptRuntimeDebug({
                builderOwned: true,
                activeStagesCount: activeStages.length,
                stageWorkUnitConfigsCount: 0,
                lifecycleWuRowsCount: 0,
                repairAttempted: false,
            }),
        };
    }

    const repair = await repairLifecycleWorkUnits(supabase, orgId, departmentId, {
        stages: activeStages,
        processId: process?.id,
        onlyStagesWithSavedWorkUnitConfig: true,
    });

    if (!repair.ok) {
        return {
            wuRows,
            debug: buildLifecycleWorkUnitDeptRuntimeDebug({
                builderOwned: true,
                activeStagesCount: activeStages.length,
                stageWorkUnitConfigsCount: stageConfigCount,
                lifecycleWuRowsCount: 0,
                repairAttempted: true,
                repairOk: false,
                repairActions: repair.actions,
                repairError: repair.error ?? null,
            }),
        };
    }

    const { data: refreshed, error: refreshErr } = await supabase
        .from("work_units")
        .select("id, key, name, queue_definition, metadata, department_id")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .order("sort_order", { ascending: true });

    const nextRows = refreshErr ? wuRows : ((refreshed ?? []) as WorkUnitDbRow[]);
    const nextLifecycleCount = filterWorkUnitsForBuilderOwnedDeptDisplay(
        nextRows.map((w) => ({
            id: w.id,
            name: w.name,
            key: w.key,
            metadata: w.metadata,
        }))
    ).length;

    return {
        wuRows: nextRows,
        debug: buildLifecycleWorkUnitDeptRuntimeDebug({
            builderOwned: true,
            activeStagesCount: activeStages.length,
            stageWorkUnitConfigsCount: stageConfigCount,
            lifecycleWuRowsCount: nextLifecycleCount,
            repairAttempted: true,
            repairOk: true,
            repairActions: repair.actions,
            repairError: refreshErr?.message ?? null,
        }),
    };
}
