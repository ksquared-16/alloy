/**
 * Collect configured field keys from metadata.queue_record_layout (v3).
 * Drawer LayoutDoc sections are separate — queue row fidelity uses this list.
 */

import type { QueueRecordBlockConfig, QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

export type QueueRecordLayoutFieldBinding = {
    fieldKey: string;
    display: string;
    scopeType: string;
    blockType: string;
    columnId: string;
    widgetKey?: string;
};

function walkBlockFields(
    block: QueueRecordBlockConfig,
    columnId: string,
    scopeType: string,
    out: QueueRecordLayoutFieldBinding[],
): void {
    if (block.type === "widget") {
        out.push({
            fieldKey: `widget:${block.widgetKey}`,
            display: "widget",
            scopeType,
            blockType: "widget",
            columnId,
            widgetKey: block.widgetKey,
        });
        return;
    }
    const fields = block.type === "repeated_record_block" ? block.fields : block.fields;
    for (const field of fields) {
        out.push({
            fieldKey: field.fieldKey,
            display: field.display,
            scopeType,
            blockType: block.type,
            columnId,
        });
    }
}

/** All field/widget bindings from a saved queue record layout config. */
export function collectQueueRecordLayoutFieldBindings(
    config: QueueRecordLayoutConfigV3 | null | undefined,
): QueueRecordLayoutFieldBinding[] {
    if (!config?.columns?.length) return [];
    const out: QueueRecordLayoutFieldBinding[] = [];
    for (const col of config.columns) {
        for (const block of col.blocks) {
            walkBlockFields(block, col.id, col.scope.type, out);
        }
    }
    return out;
}

export function collectQueueRecordLayoutFieldKeys(
    config: QueueRecordLayoutConfigV3 | null | undefined,
): string[] {
    const seen = new Set<string>();
    for (const binding of collectQueueRecordLayoutFieldBindings(config)) {
        if (!binding.fieldKey.startsWith("widget:")) seen.add(binding.fieldKey);
    }
    return [...seen];
}
