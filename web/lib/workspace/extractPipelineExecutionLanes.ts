import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { getQueueUiConfig, partitionQueueUiSections } from "@/lib/ui-v2/queueUiConfig";

export type PipelineExecutionLaneDescriptor = {
    key: string;
    label: string;
    icon: string | null;
};

const INTERNAL_LANE_KEYS = new Set(["pipeline_total"]);

function isNeedsAttentionSectionKey(key: string): boolean {
    return key.trim().toLowerCase() === "needs_attention";
}

function laneKeysFromSections(
    def: QueueDefinitionV1,
    sections: Array<{ key: string; queue_keys: string[] }>
): string[] {
    const byKey = new Map(def.queues.map((q) => [q.key, q]));
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const section of sections) {
        for (const key of section.queue_keys) {
            if (!key || seen.has(key) || INTERNAL_LANE_KEYS.has(key)) continue;
            if (!byKey.has(key)) continue;
            seen.add(key);
            keys.push(key);
        }
    }
    return keys;
}

/**
 * Lanes for the department execution panel — config-driven from `ui.sections`.
 * v1: `sections` entry with `key === "pipeline"`.
 * v2 domain layout: all non-attention sections flattened in section order.
 */
export function extractPipelineExecutionLanes(def: QueueDefinitionV1): PipelineExecutionLaneDescriptor[] {
    const ui = getQueueUiConfig(def);
    if (ui.layout !== "pipeline_with_attention") return [];

    const byKey = new Map(def.queues.map((q) => [q.key, q]));
    const pipelineSection = ui.sections.find((s) => s.key === "pipeline");
    const keys = pipelineSection
        ? laneKeysFromSections(def, [pipelineSection])
        : laneKeysFromSections(def, partitionQueueUiSections(ui).throughput);

    const out: PipelineExecutionLaneDescriptor[] = [];
    for (const key of keys) {
        const q = byKey.get(key);
        if (!q || isNeedsAttentionSectionKey(q.key)) continue;
        const rawIcon = q.icon;
        const icon = typeof rawIcon === "string" && rawIcon.trim() ? rawIcon.trim() : null;
        out.push({ key, label: q.label, icon });
    }
    return out;
}

/** Panel title for dept pipeline throughput region — from config, not hardcoded. */
export function resolvePipelineExecPanelTitle(def: QueueDefinitionV1): string {
    const ui = getQueueUiConfig(def);
    const pipelineSection = ui.sections.find((s) => s.key === "pipeline");
    if (pipelineSection?.label?.trim()) return pipelineSection.label.trim();
    if (ui.primary_total_label?.trim()) return ui.primary_total_label.trim();
    const { throughput } = partitionQueueUiSections(ui);
    if (throughput.length === 1 && throughput[0]?.label?.trim()) return throughput[0].label.trim();
    return "Pipeline";
}
