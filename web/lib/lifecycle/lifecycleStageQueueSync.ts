/**
 * Lifecycle stage → enrollment_pipeline queue lane sync (operator-facing, no JSON in UI).
 */

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_QUEUE_KEYS } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { queueStatusKeysForOperatorStage, type EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import {
    isLifecycleStageWorkUnitKey,
    queueStatusKeysForStageWorkUnitSnapshot,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function cloneQueueDefinition(raw: unknown): Record<string, unknown> {
    if (!isPlainObject(raw)) {
        return structuredClone(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2) as unknown as Record<string, unknown>;
    }
    return structuredClone(raw) as Record<string, unknown>;
}

function filterListWithValues(filters: unknown, type: string, values: string[]): unknown[] {
    const list = Array.isArray(filters) ? [...filters] : [];
    let replaced = false;
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!isPlainObject(f) || String(f.type ?? "") !== type) continue;
        list[i] = { ...f, operator: f.operator ?? "in", values: [...values] };
        replaced = true;
        break;
    }
    if (!replaced && values.length) {
        list.push({ type, operator: "in", values: [...values] });
    }
    return list;
}

/** Default enrollment pipeline queue_definition (validated v2 bundle). */
export function defaultEnrollmentPipelineQueueDefinition(): Record<string, unknown> {
    const doc = structuredClone(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2) as unknown as Record<string, unknown>;
    loadQueueDefinitionBundle(doc);
    return doc;
}

/**
 * Apply opportunity status keys to queue lanes for an operator stage.
 * Updates `filters_compat_v1` (status) and `case_status` filters where present.
 */
export function applyStageStatusKeysToQueueDefinition(
    queueDefinition: unknown,
    stage: LifecycleOperatorStage,
    statusKeys: readonly string[]
): Record<string, unknown> {
    const next = cloneQueueDefinition(queueDefinition);
    const laneKeys = ENROLLMENT_STAGE_QUEUE_KEYS[stage];
    const values = statusKeys.map((k) => k.trim()).filter(Boolean);
    const queuesRaw = next.queues;
    if (!Array.isArray(queuesRaw)) {
        throw new Error("queue_definition has no queues array");
    }

    for (const queueKey of laneKeys) {
        const idx = queuesRaw.findIndex((q) => isPlainObject(q) && String(q.key ?? "") === queueKey);
        if (idx < 0) continue;
        const queue = queuesRaw[idx] as Record<string, unknown>;
        queue.filters_compat_v1 = filterListWithValues(queue.filters_compat_v1, "status", values);
        queue.filters = filterListWithValues(queue.filters, "case_status", values);
        queuesRaw[idx] = queue;
    }

    loadQueueDefinitionBundle(next);
    return next;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

/** Whether stage-assigned status keys differ from queue lane filters for that stage. */
export function stageStatusesNeedQueueSync(
    stage: LifecycleOperatorStage,
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null,
    stageStatusKeys: readonly string[]
): boolean {
    if (!pipeline) return stageStatusKeys.length > 0;
    const inQueue = new Set(
        isLifecycleStageWorkUnitKey(pipeline.key)
            ? queueStatusKeysForStageWorkUnitSnapshot(pipeline, stage)
            : queueStatusKeysForOperatorStage(stage, pipeline)
    );
    const inStage = new Set(stageStatusKeys.map((k) => k.trim()).filter(Boolean));
    return !setsEqual(inQueue, inStage);
}

export function validateEnrollmentPipelineQueueDefinition(raw: unknown): Record<string, unknown> {
    if (!isPlainObject(raw)) {
        throw new Error("queue_definition must be an object");
    }
    loadQueueDefinitionBundle(raw);
    return raw;
}
