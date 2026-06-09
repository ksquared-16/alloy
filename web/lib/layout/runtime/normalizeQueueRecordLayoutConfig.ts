/**
 * Normalize saved queue_record_layout for runtime fidelity.
 * Fills missing display modes and repeated-block defaults without overriding explicit config.
 */

import type {
    QueueRecordBlockConfig,
    QueueRecordFieldConfig,
    QueueRecordFieldDisplay,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";

const DEFAULT_REPEATED_MAX_ITEMS = 5;

function isQueueStatusFieldKey(fieldKey: string): boolean {
    return (
        /(?:^|\.)(?:status|lifecycle_status|stage)(?:_key|_label|_name)?$/i.test(fieldKey)
        && !/tour_status/i.test(fieldKey)
    );
}

function inferMissingFieldDisplay(field: QueueRecordFieldConfig): QueueRecordFieldConfig {
    if (field.display) return field;
    const rk = field.fieldKey.toLowerCase();
    let display: QueueRecordFieldDisplay = "text";
    if (/status/.test(rk) && !/tour_status/.test(rk)) display = "pill";
    else if (/email/.test(rk)) display = "email";
    else if (/phone/.test(rk)) display = "phone";
    else if (/date|tour|appointment|created_at|updated_at|desired_start|date_of_birth|\.dob$/.test(rk)) display = "date";
    else if (/name|contact|household|title/.test(rk)) display = "link";
    else if (/source|updated_at|\.id$/.test(rk)) display = "muted";
    return { ...field, display };
}

function normalizeBlock(block: QueueRecordBlockConfig): QueueRecordBlockConfig {
    if (block.type === "repeated_record_block") {
        return {
            ...block,
            maxItems: block.maxItems ?? DEFAULT_REPEATED_MAX_ITEMS,
            fields: block.fields.map(inferMissingFieldDisplay),
        };
    }
    if (block.type === "field_group") {
        return { ...block, fields: block.fields.map(inferMissingFieldDisplay) };
    }
    return block;
}

/** Apply runtime-safe defaults to saved queue record layout config. */
export function normalizeQueueRecordLayoutConfig(config: QueueRecordLayoutConfigV3): QueueRecordLayoutConfigV3 {
    return {
        ...config,
        columns: config.columns.map((col) => ({
            ...col,
            blocks: col.blocks.map(normalizeBlock),
        })),
    };
}
