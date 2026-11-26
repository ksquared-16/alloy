/**
 * Stage-scoped lifecycle work unit identity for Lifecycle Builder setup.
 * Identity: org + department + lifecycle_wu_{stageKey} (not display name).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveAssignedStatusKeysForStage } from "@/lib/lifecycle/lifecycleActivationStep3";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { configuredStageKeysForMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { statusKeysForBuilderStageQueueSync, stageStatusKeysForDepartmentStage } from "@/lib/lifecycle/lifecycleStageWorkUnitQueueSync";
import { defaultWorkUnitQueueNameForStageKey } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import {
    mergeInertQueueMembershipIntoQueueDefinition,
    mergeLifecycleStageWorkUnitMetadataWithMembership,
    resolveMembershipForWorkUnitDenormalization,
} from "@/lib/lifecycle/persistQueueMembershipV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    buildLifecycleStageQueueDefinition,
    lifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
    type LifecycleStageWorkUnitRow,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    lifecycleStageQueueHasExecutableStatusFilters,
    requireLifecycleStageQueueStatusKeys,
} from "@/lib/lifecycle/lifecycleStageQueueFilters";
import {
    queueStatusKeysForLifecycleWorkUnitValidation,
    queueFilterIncludesExpectedStatuses,
    expectedStatusKeysForLifecycleStageValidation,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    snapshotEnrollmentPipelineWorkUnit,
    type EnrollmentPipelineWorkUnitSnapshot,
} from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

export type LifecycleStageWorkUnitIdentityInput = {
    orgId: string;
    departmentId: string;
    stageKey: string;
    processId?: string | null;
};

export type LifecycleStageWorkUnitIdentityState = "not_created" | "created" | "conflict";

export type LifecycleStageWorkUnitIdentity = {
    stageKey: string;
    workUnitKey: string;
    processId: string | null;
    state: LifecycleStageWorkUnitIdentityState;
    /** Single canonical active row for this stage key, when state is `created`. */
    workUnit: LifecycleStageWorkUnitRow | null;
    /** More than one active row with the same lifecycle_wu_* key in this department. */
    conflictingActiveRows: LifecycleStageWorkUnitRow[];
};

export class LifecycleStageWorkUnitIdentityConflictError extends Error {
    readonly identity: LifecycleStageWorkUnitIdentity;

    constructor(identity: LifecycleStageWorkUnitIdentity) {
        super(
            `Multiple active work unit queues exist for stage “${identity.stageKey}” (key ${identity.workUnitKey}). Run repair to dedupe.`
        );
        this.name = "LifecycleStageWorkUnitIdentityConflictError";
        this.identity = identity;
    }
}

export function normalizeLifecycleStageKeyForIdentity(stageKey: string): string {
    return stageKey.trim();
}

export function processIdFromDepartmentMetadata(metadata: unknown): string | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as { lifecycle_builder_owned_v1?: { process_id?: string | null } })
        .lifecycle_builder_owned_v1?.process_id;
    const id = typeof raw === "string" ? raw.trim() : "";
    return id || null;
}

/** Resolve identity from already-loaded rows (same department, matching work_units.key). */
export function resolveLifecycleStageWorkUnitIdentity(
    input: LifecycleStageWorkUnitIdentityInput,
    rows: readonly LifecycleStageWorkUnitRow[]
): LifecycleStageWorkUnitIdentity {
    const stageKey = normalizeLifecycleStageKeyForIdentity(input.stageKey);
    const workUnitKey = lifecycleStageWorkUnitKey(stageKey);
    const processId =
        input.processId !== undefined && input.processId !== null
            ? String(input.processId).trim() || null
            : null;

    const withKey = rows.filter(
        (r) =>
            String(r.key ?? "").trim() === workUnitKey &&
            String(r.department_id ?? "").trim() === input.departmentId.trim()
    );
    const active = withKey.filter((r) => r.is_active !== false);

    if (active.length > 1) {
        return {
            stageKey,
            workUnitKey,
            processId,
            state: "conflict",
            workUnit: null,
            conflictingActiveRows: active,
        };
    }

    if (active.length === 1) {
        return {
            stageKey,
            workUnitKey,
            processId,
            state: "created",
            workUnit: active[0]!,
            conflictingActiveRows: [],
        };
    }

    return {
        stageKey,
        workUnitKey,
        processId,
        state: "not_created",
        workUnit: null,
        conflictingActiveRows: [],
    };
}

export async function fetchWorkUnitRowsForLifecycleStageIdentity(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string
): Promise<LifecycleStageWorkUnitRow[]> {
    const workUnitKey = lifecycleStageWorkUnitKey(stageKey);
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, name, department_id, queue_definition, is_active, metadata")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("key", workUnitKey);
    if (error) throw new Error(error.message);
    return (data ?? []) as LifecycleStageWorkUnitRow[];
}

export async function resolveLifecycleStageWorkUnitIdentityForDepartment(
    supabase: SupabaseClient,
    input: LifecycleStageWorkUnitIdentityInput
): Promise<LifecycleStageWorkUnitIdentity> {
    const rows = await fetchWorkUnitRowsForLifecycleStageIdentity(
        supabase,
        input.orgId,
        input.departmentId,
        input.stageKey
    );
    return resolveLifecycleStageWorkUnitIdentity(input, rows);
}

/** Assigned status keys for a builder stage (same source as queue sync). */
export async function resolveLifecycleStageAssignedStatusKeys(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string
): Promise<string[]> {
    return stageStatusKeysForDepartmentStage(supabase, orgId, departmentId, stageKey);
}

/** Status keys written to queue_definition filters (same source as sync + validation). */
export async function resolveLifecycleStageQueueFilterKeys(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string
): Promise<string[]> {
    const assigned = await resolveLifecycleStageAssignedStatusKeys(
        supabase,
        orgId,
        departmentId,
        stageKey
    );
    return queueFilterKeysFromAssignedStatusKeys(stageKey, assigned);
}

export function queueFilterKeysFromAssignedStatusKeys(
    stageKey: string,
    assignedStatusKeys: readonly string[]
): string[] {
    return statusKeysForBuilderStageQueueSync(stageKey, assignedStatusKeys);
}

export function lifecycleStageWorkUnitNeedsQueueFilterSync(params: {
    stageKey: string;
    assignedStatusKeys: readonly string[];
    workUnit: { key: string; queue_definition: unknown } | null;
}): boolean {
    const assigned = params.assignedStatusKeys.map((k) => k.trim()).filter(Boolean);
    if (!assigned.length) return false;
    if (!params.workUnit) return true;
    const expected = queueFilterKeysFromAssignedStatusKeys(params.stageKey, assigned);
    if (!lifecycleStageQueueHasExecutableStatusFilters(params.workUnit, params.stageKey)) {
        return true;
    }
    const queueKeys = queueStatusKeysForLifecycleWorkUnitValidation(
        params.workUnit,
        params.stageKey
    );
    return !queueFilterIncludesExpectedStatuses(queueKeys, expected);
}

export type LifecycleStageWorkUnitIdentityAudit = {
    department_id: string;
    process_id: string | null;
    stage_key: string;
    stage_label: string | null;
    selected_status_keys: string[];
    work_unit_key: string;
    rows_by_key: Array<{
        id: string;
        key: string;
        name: string;
        is_active: boolean;
        metadata_stage_key: string | null;
        queue_filter_keys: string[];
    }>;
    rows_by_display_name: Array<{
        id: string;
        key: string;
        name: string;
        is_active: boolean;
    }>;
    identity_state: LifecycleStageWorkUnitIdentityState;
    validation_expected_filter_keys: string[];
    validation_actual_filter_keys: string[];
    validation_pass: boolean;
};

export async function buildLifecycleStageWorkUnitIdentityAudit(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    stageKey: string;
    stageLabel?: string | null;
    activation?: LifecycleActivationV1 | null;
    statusPayload?: EnrollmentStatusStagesPayload | null;
}): Promise<LifecycleStageWorkUnitIdentityAudit> {
    const stageKey = normalizeLifecycleStageKeyForIdentity(params.stageKey);
    const { data: dept } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const metadata = dept?.metadata;
    const processId = processIdFromDepartmentMetadata(metadata);
    const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(params.supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        stageKey,
        processId,
    });

    const workUnitKey = identity.workUnitKey;
    const { data: byNameRows } = await params.supabase
        .from("work_units")
        .select("id, key, name, is_active, metadata")
        .eq("org_id", params.orgId)
        .eq("department_id", params.departmentId)
        .ilike("name", params.stageLabel?.trim() || stageKey.replace(/_/g, " "));

    const keyRows = await fetchWorkUnitRowsForLifecycleStageIdentity(
        params.supabase,
        params.orgId,
        params.departmentId,
        stageKey
    );

    const assigned = await resolveLifecycleStageAssignedStatusKeys(
        params.supabase,
        params.orgId,
        params.departmentId,
        stageKey
    );
    const expectedFilter = queueFilterKeysFromAssignedStatusKeys(stageKey, assigned);

    let statusPayload = params.statusPayload ?? null;
    if (!statusPayload) {
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const process = builder ? activeLifecycleProcess(builder) : null;
        const stageKeys =
            process?.stages.map((s) => s.key.trim()).filter(Boolean) ??
            configuredStageKeysForMetadata(metadata);
        const statusRows = await fetchEffectiveStatusDefinitions(
            params.supabase,
            params.orgId,
            "opportunities",
            { activeOnly: true }
        );
        statusPayload = buildEnrollmentStatusStagesPayload(
            statusRows.map((r) => ({
                status_key: r.status_key,
                status_label: r.status_label,
                sort_order: Number(r.sort_order) ?? 100,
                metadata: (r.metadata ?? null) as Record<string, unknown> | null,
            })),
            stageKeys.length ? stageKeys : undefined
        );
    }

    const activation = params.activation ?? null;
    const validationExpected = activation
        ? expectedStatusKeysForLifecycleStageValidation(
              stageKey,
              statusPayload,
              activation,
              identity.workUnit?.metadata
          )
        : expectedFilter;

    const actualFilter = identity.workUnit
        ? queueStatusKeysForLifecycleWorkUnitValidation(identity.workUnit, stageKey)
        : [];

    const validationPass =
        validationExpected.length === 0 ||
        queueFilterIncludesExpectedStatuses(actualFilter, validationExpected);

    return {
        department_id: params.departmentId,
        process_id: processId,
        stage_key: stageKey,
        stage_label: params.stageLabel?.trim() ?? null,
        selected_status_keys: assigned,
        work_unit_key: workUnitKey,
        rows_by_key: keyRows.map((r) => ({
            id: r.id,
            key: r.key,
            name: r.name,
            is_active: r.is_active !== false,
            metadata_stage_key: stageKeyFromLifecycleWorkUnitMetadata(r.metadata),
            queue_filter_keys: queueStatusKeysForLifecycleWorkUnitValidation(r, stageKey),
        })),
        rows_by_display_name: (byNameRows ?? []).map((r) => ({
            id: String((r as { id: string }).id),
            key: String((r as { key?: string }).key ?? ""),
            name: String((r as { name?: string }).name ?? ""),
            is_active: (r as { is_active?: boolean }).is_active !== false,
        })),
        identity_state: identity.state,
        validation_expected_filter_keys: validationExpected,
        validation_actual_filter_keys: actualFilter,
        validation_pass: validationPass,
    };
}

export function formatLifecycleStageWorkUnitIdentityAudit(audit: LifecycleStageWorkUnitIdentityAudit): string {
    const lines = [
        "--- Lifecycle stage work unit identity audit ---",
        `department_id: ${audit.department_id}`,
        `process_id: ${audit.process_id ?? "(none)"}`,
        `stage_key: ${audit.stage_key}`,
        `stage_label: ${audit.stage_label ?? "(none)"}`,
        `work_unit_key: ${audit.work_unit_key}`,
        `identity_state: ${audit.identity_state}`,
        `selected_status_keys: [${audit.selected_status_keys.join(", ")}]`,
        `validation_expected_filter_keys: [${audit.validation_expected_filter_keys.join(", ")}]`,
        `validation_actual_filter_keys: [${audit.validation_actual_filter_keys.join(", ")}]`,
        `validation_pass: ${audit.validation_pass}`,
        "",
        `rows where key = ${audit.work_unit_key}:`,
    ];
    for (const r of audit.rows_by_key) {
        lines.push(
            `  - id=${r.id} name="${r.name}" active=${r.is_active} metadata.lifecycle_stage_key=${r.metadata_stage_key ?? "(none)"} filters=[${r.queue_filter_keys.join(", ")}]`
        );
    }
    if (!audit.rows_by_key.length) lines.push("  (none)");
    lines.push("", `rows where name matches stage label (informational only):`);
    for (const r of audit.rows_by_display_name) {
        lines.push(`  - id=${r.id} key=${r.key} name="${r.name}" active=${r.is_active}`);
    }
    if (!audit.rows_by_display_name.length) lines.push("  (none)");
    return lines.join("\n");
}

/**
 * Create or update the canonical lifecycle_wu_* row for a stage (idempotent).
 */
export async function upsertLifecycleStageWorkUnitForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKey: string,
    opts: {
        name?: string;
        processId?: string | null;
        sortOrder?: number;
        statusKeys?: readonly string[];
        stageMembership?: QueueMembershipV1 | null;
        /**
         * Stage label from the caller's already-parsed builder. Supplying it (together with
         * processId and statusKeys) lets this helper skip its own `departments` read — the stage
         * save resolves those facts from the draft it is holding, so re-reading the published
         * projection here would reintroduce a read-after-write.
         */
        stageLabel?: string | null;
    },
): Promise<{
    identity: LifecycleStageWorkUnitIdentity;
    snapshot: EnrollmentPipelineWorkUnitSnapshot;
    created: boolean;
}> {
    const sk = normalizeLifecycleStageKeyForIdentity(stageKey);
    if (!sk) throw new Error("stage is required");

    const callerSuppliedBuilderFacts =
        opts.processId != null && opts.stageLabel != null && (opts.statusKeys?.length ?? 0) > 0;

    let metadata: Record<string, unknown> = {};
    if (!callerSuppliedBuilderFacts) {
        const { data: dept, error: deptErr } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (deptErr) throw new Error(deptErr.message);
        if (!dept) throw new Error("Department not found");
        metadata =
            dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
                ? (dept.metadata as Record<string, unknown>)
                : {};
    }

    const processId =
        opts.processId !== undefined && opts.processId !== null
            ? String(opts.processId).trim() || null
            : processIdFromDepartmentMetadata(metadata);

    let identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(supabase, {
        orgId,
        departmentId,
        stageKey: sk,
        processId,
    });
    if (identity.state === "conflict") {
        throw new LifecycleStageWorkUnitIdentityConflictError(identity);
    }

    let stageLabel = opts.stageLabel?.trim() || undefined;
    let stageSortOrder = opts.sortOrder;
    if (!callerSuppliedBuilderFacts) {
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const process = builder ? activeLifecycleProcess(builder) : null;
        const stageRecord = process?.stages.find((s) => s.key === sk && s.is_active);
        stageLabel = stageLabel ?? stageRecord?.label.trim();
        stageSortOrder = stageSortOrder ?? stageRecord?.sort_order;
    }

    const assignedKeys =
        opts.statusKeys && opts.statusKeys.length > 0
            ? [...opts.statusKeys]
            : await resolveLifecycleStageAssignedStatusKeys(supabase, orgId, departmentId, sk);
    const filterKeys = queueFilterKeysFromAssignedStatusKeys(sk, requireLifecycleStageQueueStatusKeys(sk, assignedKeys));
    const displayName = opts.name?.trim() || stageLabel || defaultWorkUnitQueueNameForStageKey(sk);
    const sortOrder = stageSortOrder ?? 0;
    const now = new Date().toISOString();
    const wuKey = lifecycleStageWorkUnitKey(sk);
    let created = false;

    const membershipForWorkUnit = resolveMembershipForWorkUnitDenormalization(
        sk,
        opts.stageMembership ?? null,
        identity.workUnit?.metadata ?? null,
    );
    const workUnitMetadata = mergeLifecycleStageWorkUnitMetadataWithMembership(
        sk,
        {
            processId: processId ?? undefined,
            statusKeys: filterKeys,
            stageLabel,
            queueMembership: membershipForWorkUnit,
        },
        identity.workUnit?.metadata ?? null,
    );

    if (identity.state === "not_created") {
        let queue_definition = mergeInertQueueMembershipIntoQueueDefinition(
            buildLifecycleStageQueueDefinition({
                stageKey: sk,
                label: displayName,
                statusKeys: filterKeys,
            }),
            membershipForWorkUnit,
        );
        const { data: inserted, error: insErr } = await supabase
            .from("work_units")
            .insert({
                org_id: orgId,
                department_id: departmentId,
                key: wuKey,
                name: displayName,
                description: `Lifecycle stage queue (${sk}).`,
                sort_order: sortOrder,
                is_active: true,
                queue_definition,
                metadata: workUnitMetadata,
                updated_at: now,
            })
            .select("id, key, name, department_id, queue_definition, is_active, metadata")
            .single();
        if (insErr) throw new Error(insErr.message);
        created = true;
        identity = resolveLifecycleStageWorkUnitIdentity(
            { orgId, departmentId, stageKey: sk, processId },
            [inserted as LifecycleStageWorkUnitRow]
        );
    } else {
        const row = identity.workUnit!;
        let queue_definition = applyStatusKeysToLifecycleStageQueueDefinition(
            row.queue_definition,
            filterKeys,
            sk,
        );
        queue_definition = mergeInertQueueMembershipIntoQueueDefinition(queue_definition, membershipForWorkUnit);
        const { data: updated, error: upErr } = await supabase
            .from("work_units")
            .update({
                name: displayName,
                sort_order: sortOrder,
                queue_definition,
                metadata: workUnitMetadata,
                is_active: true,
                updated_at: now,
            })
            .eq("id", row.id)
            .eq("org_id", orgId)
            .select("id, key, name, department_id, queue_definition, is_active, metadata")
            .single();
        if (upErr) throw new Error(upErr.message);
        identity = resolveLifecycleStageWorkUnitIdentity(
            { orgId, departmentId, stageKey: sk, processId },
            [updated as LifecycleStageWorkUnitRow]
        );
    }

    const canonical = identity.workUnit;
    if (!canonical) {
        throw new Error(`Work unit queue was not persisted for stage “${sk}”.`);
    }

    return {
        identity,
        snapshot: snapshotEnrollmentPipelineWorkUnit(canonical),
        created,
    };
}

/** Status keys from payload for validation (activation-owned explicit + bucket fallback). */
export function assignedStatusKeysFromPayloadForStage(
    payload: EnrollmentStatusStagesPayload | null,
    stageKey: string
): string[] {
    return resolveAssignedStatusKeysForStage(payload, stageKey, { activationOwned: true });
}
