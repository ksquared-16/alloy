import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { extractDrawerLifecycleExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";

export type RecordLifecycleRailStepState = "complete" | "current" | "future" | "unknown";

export type RecordLifecycleRailStep = {
    key: string;
    label: string;
    state: RecordLifecycleRailStepState;
};

export type RecordLifecycleRailModel = {
    steps: RecordLifecycleRailStep[];
    currentIndex: number;
};

function statusKeysForQueueEntry(queue: QueueDefinitionV1["queues"][number] & Record<string, unknown>): string[] {
    const keys = new Set<string>();

    const addFromFilters = (filters: unknown) => {
        if (!Array.isArray(filters)) return;
        for (const f of filters) {
            if (!f || typeof f !== "object") continue;
            const ff = f as { type?: unknown; operator?: unknown; values?: unknown };
            if (ff.operator !== "in" || !Array.isArray(ff.values)) continue;
            const type = String(ff.type ?? "").trim();
            if (type === "status" || type === "case_status") {
                for (const v of ff.values) {
                    if (typeof v === "string" && v.trim()) keys.add(v.trim());
                }
            }
        }
    };

    addFromFilters(queue.filters_compat_v1);
    addFromFilters(queue.filters);

    const aliases = queue.aliases;
    if (Array.isArray(aliases)) {
        for (const alias of aliases) {
            if (typeof alias === "string" && alias.trim()) keys.add(alias.trim());
        }
    }

    return [...keys];
}

function sectionLabelForQueueKey(def: QueueDefinitionV1, queueKey: string, fallback: string): string {
    const ui = getQueueUiConfig(def);
    for (const section of ui.sections) {
        if (section.tone === "critical") continue;
        if (section.queue_keys.includes(queueKey)) {
            const label = section.label?.trim();
            if (label) return label;
        }
    }
    return fallback;
}

function stepState(index: number, currentIndex: number): RecordLifecycleRailStepState {
    if (currentIndex < 0) return "unknown";
    if (index < currentIndex) return "complete";
    if (index === currentIndex) return "current";
    return "future";
}

/**
 * Config-driven lifecycle rail for record drawers — uses work-unit queue_definition lanes
 * and matches current stage via queue filters (v1 status + v2 filters_compat_v1 / aliases).
 */
export function resolveRecordLifecycleRailModel(input: {
    queueDefinition: QueueDefinitionV1 | null | undefined;
    currentStatusKey: string | null | undefined;
}): RecordLifecycleRailModel | null {
    const def = input.queueDefinition;
    if (!def || def.entity_type !== "opportunity") return null;

    const lanes = extractDrawerLifecycleExecutionLanes(def);
    if (!lanes.length) return null;

    const queueByKey = new Map(def.queues.map((q) => [q.key, q as QueueDefinitionV1["queues"][number] & Record<string, unknown>]));
    const statusKey = input.currentStatusKey?.trim().toLowerCase() ?? "";

    let currentIndex = -1;
    if (statusKey) {
        currentIndex = lanes.findIndex((lane) => {
            const queue = queueByKey.get(lane.key);
            if (!queue) return false;
            return statusKeysForQueueEntry(queue).some((k) => k.toLowerCase() === statusKey);
        });
    }

    const steps: RecordLifecycleRailStep[] = lanes.map((lane, index) => ({
        key: lane.key,
        label: sectionLabelForQueueKey(def, lane.key, lane.label),
        state: stepState(index, currentIndex),
    }));

    return { steps, currentIndex };
}
