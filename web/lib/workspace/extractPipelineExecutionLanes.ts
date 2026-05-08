import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";

export type PipelineExecutionLaneDescriptor = {
    key: string;
    label: string;
    icon: string | null;
};

/**
 * Lanes for the department execution panel: `ui.sections` entry with `key === "pipeline"`, in `queue_keys` order.
 * Labels and icons come from the matching `queues[]` entries — not hardcoded in UI.
 */
export function extractPipelineExecutionLanes(def: QueueDefinitionV1): PipelineExecutionLaneDescriptor[] {
    const sections = def.ui?.sections;
    if (!sections?.length) return [];
    const pipe = sections.find((s) => s.key === "pipeline");
    if (!pipe?.queue_keys?.length) return [];
    const byKey = new Map(def.queues.map((q) => [q.key, q]));
    const out: PipelineExecutionLaneDescriptor[] = [];
    for (const key of pipe.queue_keys) {
        const q = byKey.get(key);
        if (!q) continue;
        const rawIcon = q.icon;
        const icon = typeof rawIcon === "string" && rawIcon.trim() ? rawIcon.trim() : null;
        out.push({ key, label: q.label, icon });
    }
    return out;
}
