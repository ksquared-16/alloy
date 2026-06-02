/**
 * Shared queue-filter + records-query validation for lifecycle activation runtime.
 * Uses the same normalized status keys as lifecycle stage work unit queue_definition.
 */

import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { stageSavedStatusKeys } from "@/lib/lifecycle/lifecycleActivationStep3";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { statusKeysForOperatorStageQueueSync } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    queueStatusKeysForStageWorkUnitSnapshot,
    type LifecycleStageWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    snapshotEnrollmentPipelineWorkUnit,
    type EnrollmentPipelineWorkUnitSnapshot,
} from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

export const LIFECYCLE_RECORDS_QUERY_ZERO_COPY =
    "No records match these statuses yet. Create or update a record with one of these statuses to see rows." as const;

export const LIFECYCLE_RECORDS_QUERY_ZERO_EXISTING_COPY =
    "No existing records match these statuses yet." as const;

/** Builder-owned lifecycle with zero records visible by lifecycle filter (not a broken queue). */
export const LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY =
    "No records are visible by lifecycle filters yet. Create a Lead from this lifecycle to see it here." as const;

export function lifecycleRecordsVisibleNotAssignedCopy(count: number): string {
    return `${count} visible by lifecycle filter with assignment home elsewhere.`;
}

/** @deprecated Prefer lifecycleRecordsVisibleNotAssignedCopy — informational only. */
export function lifecycleRecordsMisassignedCopy(count: number): string {
    return lifecycleRecordsVisibleNotAssignedCopy(count);
}

function isOperatorStage(stage: string): stage is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(stage);
}

export function normalizedStatusKeySet(keys: readonly string[]): Set<string> {
    return new Set(keys.map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean));
}

/** True when every expected status appears in the work unit queue filter set (case-insensitive). */
export function queueFilterIncludesExpectedStatuses(
    queueStatusKeys: readonly string[],
    expectedStatusKeys: readonly string[]
): boolean {
    if (!expectedStatusKeys.length) return true;
    const inQueue = normalizedStatusKeySet(queueStatusKeys);
    const expected = normalizedStatusKeySet(expectedStatusKeys);
    return [...expected].every((k) => inQueue.has(k));
}

/** Status keys selected for a stage — same normalization as queue sync / /work-unit runtime. */
export function expectedStatusKeysForLifecycleStageValidation(
    stageKey: string,
    statusPayload: EnrollmentStatusStagesPayload | null,
    activation: LifecycleActivationV1,
    workUnitMetadata?: unknown
): string[] {
    const explicit = stageSavedStatusKeys(statusPayload, stageKey, { explicitAssignmentsOnly: true });
    if (explicit.length) {
        const operator = asOperatorStageKey(stageKey);
        return operator ? statusKeysForOperatorStageQueueSync(operator, explicit) : explicit;
    }
    if (activation.stage_key.trim() === stageKey.trim() && activation.status_keys.length) {
        const operator = isOperatorStage(activation.stage_key) ? activation.stage_key : null;
        return operator
            ? statusKeysForOperatorStageQueueSync(operator, activation.status_keys)
            : activation.status_keys;
    }
    if (workUnitMetadata != null && typeof workUnitMetadata === "object" && !Array.isArray(workUnitMetadata)) {
        const fromMeta = (workUnitMetadata as LifecycleStageWorkUnitMetadata).status_keys;
        if (Array.isArray(fromMeta) && fromMeta.length) {
            const operator = asOperatorStageKey(stageKey);
            const keys = fromMeta.map((k) => String(k ?? "").trim()).filter(Boolean);
            return operator ? statusKeysForOperatorStageQueueSync(operator, keys) : keys;
        }
    }
    return [];
}

export function queueStatusKeysForLifecycleWorkUnitValidation(
    workUnit: {
        id?: string;
        key: string;
        name?: string;
        is_active?: boolean;
        queue_definition: unknown;
    },
    stageKey: string
): string[] {
    const snapshot = snapshotEnrollmentPipelineWorkUnit({
        id: workUnit.id ?? "validation",
        key: workUnit.key,
        name: workUnit.name ?? workUnit.key,
        is_active: workUnit.is_active ?? true,
        queue_definition: workUnit.queue_definition,
    });
    const operator = asOperatorStageKey(stageKey);
    return queueStatusKeysForStageWorkUnitSnapshot(snapshot, operator);
}

export type LifecycleStageQueueFilterValidation = {
    stage_key: string;
    work_unit_id: string;
    work_unit_key: string;
    work_unit_name: string;
    expected_status_keys: string[];
    queue_status_keys: string[];
    pass: boolean;
    detail: string;
};

export function validateLifecycleStageWorkUnitQueueFilter(params: {
    stageKey: string;
    workUnit: { id: string; key: string; name: string; queue_definition: unknown; metadata?: unknown };
    statusPayload: EnrollmentStatusStagesPayload | null;
    activation: LifecycleActivationV1;
}): LifecycleStageQueueFilterValidation {
    const { stageKey, workUnit, statusPayload, activation } = params;
    const expected = expectedStatusKeysForLifecycleStageValidation(
        stageKey,
        statusPayload,
        activation,
        workUnit.metadata
    );
    const queueKeys = queueStatusKeysForLifecycleWorkUnitValidation(workUnit, stageKey);
    if (!expected.length) {
        return {
            stage_key: stageKey,
            work_unit_id: workUnit.id,
            work_unit_key: workUnit.key,
            work_unit_name: workUnit.name,
            expected_status_keys: [],
            queue_status_keys: queueKeys,
            pass: true,
            detail: `Stage “${stageKey}”: work unit exists; assign statuses to validate queue filters.`,
        };
    }
    const pass = queueFilterIncludesExpectedStatuses(queueKeys, expected);
    const missing = expected.filter(
        (k) => !normalizedStatusKeySet(queueKeys).has(k.trim().toLowerCase())
    );
    return {
        stage_key: stageKey,
        work_unit_id: workUnit.id,
        work_unit_key: workUnit.key,
        work_unit_name: workUnit.name,
        expected_status_keys: expected,
        queue_status_keys: queueKeys,
        pass,
        detail: pass
            ? `Stage “${stageKey}” (${workUnit.name}): queue filters include all ${expected.length} selected status(es).`
            : `Stage “${stageKey}” (${workUnit.name}): queue filters missing [${missing.join(", ")}].`,
    };
}

export function summarizeBuilderOwnedQueueFilterValidation(
    rows: LifecycleStageQueueFilterValidation[]
): { pass: boolean; detail: string } {
    if (!rows.length) {
        return {
            pass: false,
            detail: "No lifecycle_wu_* work units found. Create or repair stage queues.",
        };
    }
    const withExpected = rows.filter((r) => r.expected_status_keys.length > 0);
    if (!withExpected.length) {
        return {
            pass: true,
            detail: `${rows.length} lifecycle work unit(s) exist; assign statuses per stage to connect queue filters.`,
        };
    }
    const failed = withExpected.filter((r) => !r.pass);
    if (failed.length) {
        return { pass: false, detail: failed.map((r) => r.detail).join(" ") };
    }
    return {
        pass: true,
        detail: `Queue filters match selected statuses for ${withExpected.length} stage work unit(s).`,
    };
}
