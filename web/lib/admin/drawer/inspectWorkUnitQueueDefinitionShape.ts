import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { extractDrawerLifecycleExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { unwrapWorkUnitQueueDefinitionRaw } from "@/lib/admin/drawer/unwrapWorkUnitQueueDefinitionRaw";

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export type WorkUnitQueueDefinitionShapeProbe = {
    top_level_keys: string[];
    has_stages: boolean;
    has_sections: boolean;
    has_queue_pills: boolean;
    has_lifecycle: boolean;
    has_ui: boolean;
    has_ui_lifecycle: boolean;
    has_definition: boolean;
    has_definition_stages: boolean;
    has_queues_array: boolean;
    queues_array_length: number;
    bundle_load_ok: boolean;
    bundle_is_v2: boolean;
    ui_layout_after_coerce: string | null;
    pipeline_lane_count: number;
    stage_array_lengths: { stages?: number; definition_stages?: number; lifecycle?: number };
};

/** Dev-oriented shape probe — no full payload dump. */
export function inspectWorkUnitQueueDefinitionShape(raw: unknown): WorkUnitQueueDefinitionShapeProbe {
    const doc = unwrapWorkUnitQueueDefinitionRaw(raw);
    const top_level_keys = isPlainObject(doc) ? Object.keys(doc).sort() : [];
    const ui = isPlainObject(doc) && isPlainObject(doc.ui) ? doc.ui : null;
    const definition = isPlainObject(doc) && isPlainObject(doc.definition) ? doc.definition : null;
    const uiLifecycle = ui && isPlainObject(ui.lifecycle) ? ui.lifecycle : null;

    let bundle_load_ok = false;
    let bundle_is_v2 = false;
    let ui_layout_after_coerce: string | null = null;
    let pipeline_lane_count = 0;

    try {
        const bundle = tryLoadWorkUnitQueueDefinitionBundle(doc);
        if (bundle) {
            bundle_load_ok = true;
            bundle_is_v2 = bundle.normalized.isV2;
            ui_layout_after_coerce = getQueueUiConfig(bundle.def).layout;
            pipeline_lane_count = extractDrawerLifecycleExecutionLanes(bundle.def).length;
        }
    } catch {
        /* probe only */
    }

    const stagesLen = isPlainObject(doc) && Array.isArray(doc.stages) ? doc.stages.length : undefined;
    const defStagesLen =
        definition && Array.isArray(definition.stages) ? definition.stages.length : undefined;
    const lifecycleLen =
        isPlainObject(doc) && Array.isArray(doc.lifecycle) ? doc.lifecycle.length
        : uiLifecycle && Array.isArray(uiLifecycle.stages) ? uiLifecycle.stages.length
        : undefined;

    return {
        top_level_keys,
        has_stages: stagesLen != null,
        has_sections: Boolean(ui && Array.isArray(ui.sections)),
        has_queue_pills: Boolean(
            (isPlainObject(doc) && Array.isArray(doc.queue_pills)) ||
                (ui && Array.isArray(ui.queue_pills))
        ),
        has_lifecycle: Boolean(isPlainObject(doc) && doc.lifecycle != null),
        has_ui: ui != null,
        has_ui_lifecycle: uiLifecycle != null,
        has_definition: definition != null,
        has_definition_stages: defStagesLen != null,
        has_queues_array: Boolean(isPlainObject(doc) && Array.isArray(doc.queues)),
        queues_array_length:
            isPlainObject(doc) && Array.isArray(doc.queues) ? doc.queues.length : 0,
        bundle_load_ok,
        bundle_is_v2,
        ui_layout_after_coerce,
        pipeline_lane_count,
        stage_array_lengths: {
            ...(stagesLen != null ? { stages: stagesLen } : {}),
            ...(defStagesLen != null ? { definition_stages: defStagesLen } : {}),
            ...(lifecycleLen != null ? { lifecycle: lifecycleLen } : {}),
        },
    };
}
