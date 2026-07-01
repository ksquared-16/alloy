import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

export type PerspectiveLaneSource = {
    queueKey: string;
    label: string;
    description?: string;
    grain?: string;
    foundInDefinition: boolean;
    defaultDisplayOrder: number;
};

const SKIP_QUEUE_KEYS = new Set(["pipeline_total", "needs_attention"]);

function readGrainFromQueueDefinition(raw: unknown, queueKey: string): string | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const doc = raw as { queues?: unknown };
    if (!Array.isArray(doc.queues)) return undefined;
    for (const q of doc.queues) {
        if (!q || typeof q !== "object") continue;
        const row = q as { key?: unknown; grain?: unknown };
        if (String(row.key ?? "") !== queueKey) continue;
        const grain = typeof row.grain === "string" ? row.grain.trim() : "";
        return grain || undefined;
    }
    return undefined;
}

/** Derive editable perspective rows from synced work-unit queue lanes (no runtime merge). */
export function derivePerspectiveLanesFromPipeline(
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null,
): PerspectiveLaneSource[] {
    if (!pipeline?.queues?.length) return [];

    const lanes: PerspectiveLaneSource[] = [];
    let order = 1;
    for (const queue of pipeline.queues) {
        const queueKey = queue.key.trim();
        if (!queueKey || SKIP_QUEUE_KEYS.has(queueKey)) continue;
        lanes.push({
            queueKey,
            label: queue.label.trim() || queueKey,
            description: queue.description,
            grain: readGrainFromQueueDefinition(pipeline.queueDefinitionRaw, queueKey),
            foundInDefinition: true,
            defaultDisplayOrder: order,
        });
        order += 1;
    }
    return lanes;
}

/** Queue lane keys from work-unit queue_definition (excludes aggregate lanes). */
export function deriveQueueKeysFromQueueDefinition(raw: unknown): string[] {
    if (!raw || typeof raw !== "object") return [];
    const doc = raw as { queues?: unknown };
    if (!Array.isArray(doc.queues)) return [];
    const keys: string[] = [];
    for (const q of doc.queues) {
        if (!q || typeof q !== "object") continue;
        const key = String((q as { key?: unknown }).key ?? "").trim();
        if (!key || SKIP_QUEUE_KEYS.has(key)) continue;
        keys.push(key);
    }
    return keys;
}
