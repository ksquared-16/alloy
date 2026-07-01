/**
 * Read queue lanes from a work unit's queue_definition for Enrollment Process hub (no JSON in UI).
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_QUEUE_KEYS } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";

export type WorkUnitQueueRow = {
    key: string;
    label: string;
    description?: string;
};

export type EnrollmentPipelineWorkUnitSnapshot = {
    id: string;
    key: string;
    name: string;
    is_active: boolean;
    queues: WorkUnitQueueRow[];
    /** Retained for lane status-key resolution — not shown in Settings UI. */
    queueDefinitionRaw: unknown;
};

export type StageQueueMapping = {
    pipelineExists: boolean;
    pipelineActive: boolean;
    workUnitName: string;
    lanes: { label: string; description?: string; queueKey: string; foundInDefinition: boolean }[];
};

function parseQueuesFromDefinition(raw: unknown): WorkUnitQueueRow[] {
    if (!raw || typeof raw !== "object") return [];
    const doc = raw as { queues?: unknown };
    if (!Array.isArray(doc.queues)) return [];
    const out: WorkUnitQueueRow[] = [];
    for (const q of doc.queues) {
        if (!q || typeof q !== "object") continue;
        const row = q as { key?: unknown; label?: unknown; description?: unknown };
        const key = typeof row.key === "string" ? row.key : "";
        if (!key || key === "pipeline_total" || key === "needs_attention") continue;
        const label =
            typeof row.label === "string" && row.label.trim()
                ? row.label.trim()
                : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const description = typeof row.description === "string" ? row.description : undefined;
        out.push({ key, label, description });
    }
    return out;
}

export function snapshotEnrollmentPipelineWorkUnit(row: {
    id: string;
    key: string;
    name: string;
    is_active: boolean;
    queue_definition: unknown;
}): EnrollmentPipelineWorkUnitSnapshot {
    return {
        id: row.id,
        key: row.key,
        name: row.name,
        is_active: row.is_active,
        queues: parseQueuesFromDefinition(row.queue_definition),
        queueDefinitionRaw: row.queue_definition,
    };
}

function queueStatusKeysByQueueKey(raw: unknown): Map<string, string[]> {
    const map = new Map<string, string[]>();
    if (!raw || typeof raw !== "object") return map;
    const doc = raw as { queues?: unknown };
    if (!Array.isArray(doc.queues)) return map;
    for (const q of doc.queues) {
        if (!q || typeof q !== "object") continue;
        const row = q as { key?: unknown; filters?: unknown; filters_compat_v1?: unknown };
        const key = typeof row.key === "string" ? row.key : "";
        if (!key) continue;
        const fromFilters = extractStatusKeysFromFilterList(row.filters);
        const fromCompat = extractStatusKeysFromFilterList(row.filters_compat_v1);
        const merged = [...new Set([...fromFilters, ...fromCompat])];
        if (merged.length) map.set(key, merged);
    }
    return map;
}

function extractStatusKeysFromFilterList(filters: unknown): string[] {
    if (!Array.isArray(filters)) return [];
    const keys: string[] = [];
    for (const f of filters) {
        if (!f || typeof f !== "object") continue;
        const row = f as { type?: string; values?: unknown };
        const t = String(row.type ?? "");
        if (t !== "case_status" && t !== "status") continue;
        if (!Array.isArray(row.values)) continue;
        for (const v of row.values) {
            const k = String(v ?? "").trim();
            if (k) keys.push(k);
        }
    }
    return keys;
}

/** Status keys referenced by queue lanes for an operator stage (from live queue_definition). */
export function queueStatusKeysForOperatorStage(
    stage: LifecycleOperatorStage,
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null
): string[] {
    if (!pipeline) return [];
    const laneKeys = ENROLLMENT_STAGE_QUEUE_KEYS[stage];
    const byQueue = queueStatusKeysByQueueKey(pipeline.queueDefinitionRaw);
    const out = new Set<string>();
    for (const laneKey of laneKeys) {
        for (const sk of byQueue.get(laneKey) ?? []) out.add(sk);
    }
    return [...out];
}

export function stageQueueMappingForPipeline(
    stage: LifecycleOperatorStage,
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null
): StageQueueMapping {
    const keys = ENROLLMENT_STAGE_QUEUE_KEYS[stage];
    if (!pipeline) {
        return {
            pipelineExists: false,
            pipelineActive: false,
            workUnitName: "Enrollment Pipeline",
            lanes: keys.map((queueKey) => ({
                queueKey,
                label: queueKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                foundInDefinition: false,
            })),
        };
    }
    const byKey = new Map(pipeline.queues.map((q) => [q.key, q]));
    return {
        pipelineExists: true,
        pipelineActive: pipeline.is_active,
        workUnitName: pipeline.name,
        lanes: keys.map((queueKey) => {
            const q = byKey.get(queueKey);
            return {
                queueKey,
                label: q?.label ?? queueKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                description: q?.description,
                foundInDefinition: !!q,
            };
        }),
    };
}
