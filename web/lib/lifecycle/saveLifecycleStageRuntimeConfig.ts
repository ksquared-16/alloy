/**
 * Canonical Lifecycle Builder stage setup transaction.
 * Status assignments, work unit upsert, and queue filters share selectedStatusKeys.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    activeLifecycleProcess,
    configuredStageKeysForMetadata,
    isConfiguredStageKey,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { requireLifecycleStageQueueStatusKeys } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { effectiveLifecycleStageStatusKeys } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import type {
    LifecycleStageRuntimeConfigSnapshot,
    LifecycleStageSetupDebugTrace,
} from "@/lib/lifecycle/lifecycleStageRuntimeConfigTypes";
import { persistStageStatusAssignments } from "@/lib/lifecycle/persistEnrollmentStageStatusAssignments";
import { resolveQueueMembershipForStage } from "@/lib/businessProcesses/resolveQueueMembership";
import {
    queueMembershipSubjectForStatusOptions,
    statusEntityTypeForSubject,
} from "@/lib/lifecycle/stageStatusRollup";
import {
    lifecycleStageWorkUnitNeedsQueueFilterSync,
    queueFilterKeysFromAssignedStatusKeys,
    resolveLifecycleStageWorkUnitIdentityForDepartment,
    upsertLifecycleStageWorkUnitForDepartment,
    processIdFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import {
    lifecycleStageWorkUnitKey,
    type LifecycleStageWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    queueStatusKeysForLifecycleWorkUnitValidation,
    validateLifecycleStageWorkUnitQueueFilter,
    type LifecycleStageQueueFilterValidation,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { persistLifecycleStageFieldRules } from "@/lib/lifecycle/persistLifecycleStageFieldRules";
import { deriveQueueKeysFromQueueDefinition } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import { persistPerspectivesForLifecycleStageSave } from "@/lib/lifecycle/persistPerspectivesV1";
import { persistQueueMembershipForLifecycleStageSave } from "@/lib/lifecycle/persistQueueMembershipV1";
import { persistStageOperatingPlanForLifecycleStageSave } from "@/lib/lifecycle/persistStageOperatingPlanV1";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import { parseQueueMembershipV1, type QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { persistStatusRollupForLifecycleStageSave } from "@/lib/lifecycle/persistStatusRollupV1";
import {
    coercePerspectivesV1ForLanes,
    parsePerspectivesV1,
    type PerspectiveConfigV1Stored,
} from "@/lib/lifecycle/perspectiveConfigV1";
import { parseStageOperatingPlanV1, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStatusRollupV1, type StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";

export type SaveLifecycleStageRuntimeConfigInput = {
    orgId: string;
    departmentId: string;
    processId?: string | null;
    stageKey: string;
    /** Source of truth for this transaction — never re-resolved from an empty DB bucket. */
    selectedStatusKeys: readonly string[];
    workUnitName?: string | null;
    /** When set, persisted in the same transaction before status/queue setup. */
    fieldRules?: LifecycleStageFieldRules | LifecycleStageFieldRulesStored | null;
    queueMembership?: QueueMembershipV1 | unknown | null;
    stageOperatingPlan?: StageOperatingPlanV1 | unknown | null;
    statusRollup?: StatusRollupV1 | unknown | null;
    perspectivesV1?: readonly PerspectiveConfigV1Stored[] | unknown | null;
};

function mapStatusRows(rows: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>) {
    return rows.map((r) => ({
        status_key: r.status_key,
        status_label: r.status_label,
        sort_order: Number(r.sort_order) ?? 100,
        metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    }));
}

function readMetadataStatusKeys(metadata: unknown): string[] {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const keys = (metadata as LifecycleStageWorkUnitMetadata).status_keys;
    if (!Array.isArray(keys)) return [];
    return keys.map((k) => String(k ?? "").trim()).filter(Boolean);
}

export function buildLifecycleStageSetupDebugTrace(opts: {
    stageKey: string;
    selectedStatusKeysFromUi: readonly string[];
    snapshot: LifecycleStageRuntimeConfigSnapshot;
    validation: LifecycleStageQueueFilterValidation;
}): LifecycleStageSetupDebugTrace {
    return {
        stageKey: opts.stageKey,
        selectedStatusKeysFromUi: [...opts.selectedStatusKeysFromUi],
        savedStatusKeysFromApi: [...opts.snapshot.selectedStatusKeys],
        statusKeysPassedToWorkUnitSave: [...opts.snapshot.selectedStatusKeys],
        queueDefinitionFilterKeys: [...opts.snapshot.queueFilterKeys],
        metadataStatusKeys: [...opts.snapshot.metadataStatusKeys],
        validationExpectedKeys: [...opts.validation.expected_status_keys],
        validationActualKeys: [...opts.validation.queue_status_keys],
    };
}

/** Validate queue filters using the contract snapshot (not independent resolvers). */
export function validateLifecycleStageRuntimeConfigSnapshot(
    snapshot: LifecycleStageRuntimeConfigSnapshot,
    activation: LifecycleActivationV1
): LifecycleStageQueueFilterValidation {
    const stageKey = snapshot.stageKey;
    if (!snapshot.workUnitId) {
        return {
            stage_key: stageKey,
            work_unit_id: "",
            work_unit_key: snapshot.workUnitKey,
            work_unit_name: snapshot.workUnitName ?? stageKey,
            expected_status_keys: snapshot.selectedStatusKeys,
            queue_status_keys: [],
            pass: false,
            detail: `Stage “${stageKey}”: work unit queue not created yet.`,
        };
    }
    return validateLifecycleStageWorkUnitQueueFilter({
        stageKey,
        workUnit: {
            id: snapshot.workUnitId,
            key: snapshot.workUnitKey,
            name: snapshot.workUnitName ?? stageKey,
            queue_definition: snapshot.queueDefinitionRaw,
            metadata: {
                lifecycle_stage_key: stageKey,
                status_keys: snapshot.metadataStatusKeys,
                lifecycle_builder_owned_v1: { builder_owned: true },
            },
        },
        statusPayload: snapshot.statusStagesPayload,
        activation,
        contractSelectedStatusKeys: snapshot.selectedStatusKeys,
    });
}

export async function loadLifecycleStageStatusStagesPayload(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
) {
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) return buildEnrollmentStatusStagesPayload([], []);
    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const stageKeys = configuredStageKeysForMetadata(metadata);
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    return buildEnrollmentStatusStagesPayload(mapStatusRows(rows), stageKeys);
}

/**
 * Full stage setup: persist statuses, upsert lifecycle_wu_{stageKey}, align queue_definition + metadata.
 */
export async function saveLifecycleStageRuntimeConfig(
    supabase: SupabaseClient,
    input: SaveLifecycleStageRuntimeConfigInput
): Promise<LifecycleStageRuntimeConfigSnapshot> {
    const stageKey = input.stageKey.trim();
    if (!stageKey) throw new Error("stageKey is required");

    const selectedStatusKeys = requireLifecycleStageQueueStatusKeys(
        stageKey,
        effectiveLifecycleStageStatusKeys(stageKey, input.selectedStatusKeys),
    );

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", input.departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) throw new Error("Department not found");
    let metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    if (!isConfiguredStageKey(metadata, stageKey)) {
        throw new Error(`Stage "${stageKey}" is not configured on this department.`);
    }

    if (input.fieldRules) {
        metadata = await persistLifecycleStageFieldRules(supabase, {
            orgId: input.orgId,
            departmentId: input.departmentId,
            stageKey,
            fieldRules: input.fieldRules,
            existingMetadata: metadata,
        });
    }

    const explicitMembership =
        input.queueMembership !== undefined && input.queueMembership !== null
            ? parseQueueMembershipV1(input.queueMembership)
            : null;

    const builderForMembership = lifecycleBuilderFromDepartmentMetadata(metadata);
    const processForMembership = builderForMembership ? activeLifecycleProcess(builderForMembership) : null;
    const stageRecord =
        processForMembership?.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const membershipForEntity =
        explicitMembership ??
        resolveQueueMembershipForStage(stageRecord ?? {}, stageKey) ??
        null;
    const subjectType = queueMembershipSubjectForStatusOptions({
        stageKey,
        trackKey: stageRecord?.track_key ?? null,
        queueMembership: membershipForEntity,
    });
    const statusEntityType = statusEntityTypeForSubject(subjectType);
    const parsedRollup = parseStatusRollupV1(input.statusRollup);

    if (parsedRollup) {
        const rollupPersist = await persistStatusRollupForLifecycleStageSave(supabase, {
            orgId: input.orgId,
            departmentId: input.departmentId,
            stageKey,
            metadata,
            rollup: parsedRollup,
        });
        metadata = rollupPersist.metadata;
    } else {
        await persistStageStatusAssignments(
            supabase,
            input.orgId,
            stageKey,
            selectedStatusKeys,
            statusEntityType
        );
    }
    const explicitOperatingPlan =
        input.stageOperatingPlan !== undefined && input.stageOperatingPlan !== null
            ? parseStageOperatingPlanV1(input.stageOperatingPlan)
            : null;

    const membershipPersist = await persistQueueMembershipForLifecycleStageSave(supabase, {
        orgId: input.orgId,
        departmentId: input.departmentId,
        stageKey,
        metadata,
        ...(explicitMembership ? { explicitMembership } : {}),
    });
    metadata = membershipPersist.metadata;

    const operatingPlanPersist = await persistStageOperatingPlanForLifecycleStageSave(supabase, {
        orgId: input.orgId,
        departmentId: input.departmentId,
        stageKey,
        metadata,
        ...(explicitOperatingPlan ? { explicitPlan: explicitOperatingPlan } : {}),
    });
    metadata = operatingPlanPersist.metadata;

    const statusStagesPayload = await loadLifecycleStageStatusStagesPayload(
        supabase,
        input.orgId,
        input.departmentId
    );

    const processId =
        input.processId !== undefined && input.processId !== null
            ? String(input.processId).trim() || null
            : processIdFromDepartmentMetadata(metadata);

    const filterKeys = queueFilterKeysFromAssignedStatusKeys(stageKey, selectedStatusKeys);
    const workUnitKey = lifecycleStageWorkUnitKey(stageKey);
    let workUnitId: string | null = null;
    let workUnitName: string | null = null;
    let queueDefinitionRaw: unknown = null;
    let metadataStatusKeys: string[] = [];
    let queueFilterKeys: string[] = [];

    const workUnitNameTrimmed = input.workUnitName?.trim() ?? null;
    if (workUnitNameTrimmed) {
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const process = builder ? activeLifecycleProcess(builder) : null;
        const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active);
        const { identity, snapshot } = await upsertLifecycleStageWorkUnitForDepartment(
            supabase,
            input.orgId,
            input.departmentId,
            stageKey,
            {
                name: workUnitNameTrimmed,
                processId,
                sortOrder: stageRecord?.sort_order,
                statusKeys: selectedStatusKeys,
                stageMembership: membershipPersist.membership,
            },
        );
        if (identity.state === "conflict" || !identity.workUnit) {
            throw new Error(`Work unit queue conflict for stage "${stageKey}".`);
        }
        workUnitId = identity.workUnit.id;
        workUnitName = identity.workUnit.name;
        queueDefinitionRaw = identity.workUnit.queue_definition;
        metadataStatusKeys = readMetadataStatusKeys(identity.workUnit.metadata);
        queueFilterKeys = queueStatusKeysForLifecycleWorkUnitValidation(
            {
                id: workUnitId,
                key: identity.workUnit.key,
                name: workUnitName,
                queue_definition: queueDefinitionRaw,
            },
            stageKey
        );
    } else {
        const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(supabase, {
            orgId: input.orgId,
            departmentId: input.departmentId,
            stageKey,
            processId,
        });
        if (identity.workUnit) {
            if (membershipPersist.membership) {
                const { identity: syncedIdentity } = await upsertLifecycleStageWorkUnitForDepartment(
                    supabase,
                    input.orgId,
                    input.departmentId,
                    stageKey,
                    {
                        name: identity.workUnit.name,
                        processId,
                        statusKeys: selectedStatusKeys,
                        stageMembership: membershipPersist.membership,
                    },
                );
                if (syncedIdentity.workUnit) {
                    workUnitId = syncedIdentity.workUnit.id;
                    workUnitName = syncedIdentity.workUnit.name;
                    queueDefinitionRaw = syncedIdentity.workUnit.queue_definition;
                    metadataStatusKeys = readMetadataStatusKeys(syncedIdentity.workUnit.metadata);
                } else {
                    workUnitId = identity.workUnit.id;
                    workUnitName = identity.workUnit.name;
                    queueDefinitionRaw = identity.workUnit.queue_definition;
                    metadataStatusKeys = readMetadataStatusKeys(identity.workUnit.metadata);
                }
            } else {
                workUnitId = identity.workUnit.id;
                workUnitName = identity.workUnit.name;
                queueDefinitionRaw = identity.workUnit.queue_definition;
                metadataStatusKeys = readMetadataStatusKeys(identity.workUnit.metadata);
            }
            if (workUnitId) {
                queueFilterKeys = queueStatusKeysForLifecycleWorkUnitValidation(
                    {
                        id: workUnitId,
                        key: identity.workUnit?.key ?? workUnitKey,
                        name: workUnitName,
                        queue_definition: queueDefinitionRaw,
                    },
                    stageKey,
                );
            }
        }
    }

    let explicitPerspectives: PerspectiveConfigV1Stored[] | undefined;
    if (input.perspectivesV1 !== undefined && input.perspectivesV1 !== null) {
        const parsed = parsePerspectivesV1(input.perspectivesV1);
        if (parsed === null) {
            throw new Error("Invalid perspectives_v1");
        }
        explicitPerspectives = parsed;
    }

    if (explicitPerspectives !== undefined) {
        const laneKeys = deriveQueueKeysFromQueueDefinition(queueDefinitionRaw);
        const coerced = laneKeys.length
            ? coercePerspectivesV1ForLanes(explicitPerspectives, laneKeys)
            : explicitPerspectives;
        const perspectivesPersist = await persistPerspectivesForLifecycleStageSave(supabase, {
            orgId: input.orgId,
            departmentId: input.departmentId,
            stageKey,
            metadata,
            explicitPerspectives: coerced,
        });
        metadata = perspectivesPersist.metadata;
    }

    const synced =
        Boolean(workUnitId) &&
        !lifecycleStageWorkUnitNeedsQueueFilterSync({
            stageKey,
            assignedStatusKeys: selectedStatusKeys,
            workUnit: workUnitId
                ? {
                      key: workUnitKey,
                      queue_definition: queueDefinitionRaw,
                  }
                : null,
        });

    const snapshot: LifecycleStageRuntimeConfigSnapshot = {
        stageKey,
        selectedStatusKeys,
        workUnitId,
        workUnitKey,
        workUnitName,
        queueFilterKeys,
        metadataStatusKeys: metadataStatusKeys.length ? metadataStatusKeys : [...filterKeys],
        synced,
        statusStagesPayload,
        queueDefinitionRaw,
    };

    if (isLifecycleDebugUiEnabled()) {
        const activationStub: LifecycleActivationV1 = {
            version: 1,
            lifecycle_name: "",
            primary_entity: "opportunity",
            primary_record_label: "Lead",
            process_id: processId ?? "",
            stage_key: stageKey,
            stage_label: stageKey,
            work_unit_id: workUnitId,
            work_unit_name: workUnitName,
            status_keys: selectedStatusKeys,
            status_labels: selectedStatusKeys,
            action_definition_id: null,
            action_placement_ids: [],
            activation_owned: true,
            completed_steps: 4,
            updated_at: new Date().toISOString(),
        };
        const validation = validateLifecycleStageRuntimeConfigSnapshot(snapshot, activationStub);
        console.info(
            "[lifecycle-stage-runtime-config]",
            buildLifecycleStageSetupDebugTrace({
                stageKey,
                selectedStatusKeysFromUi: selectedStatusKeys,
                snapshot,
                validation,
            })
        );
    }

    return snapshot;
}
