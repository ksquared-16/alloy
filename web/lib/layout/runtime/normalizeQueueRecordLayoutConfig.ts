/**
 * Normalize saved queue_record_layout for runtime fidelity.
 * Fills missing display modes and repeated-block defaults without overriding explicit config.
 */

import type {
    QueueRecordBlockConfig,
    QueueRecordFieldConfig,
    QueueRecordFieldDisplay,
    QueueRecordFixedControls,
    QueueRecordLayoutConfigV3,
    QueueRowVariant,
} from "@/lib/layout/queueRecordLayoutV3";
import { sanitizeQueueRowVariantRule } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { normalizeQueueRecordFieldDisplay } from "@/lib/layout/runtime/queueRecordFieldDisplayBridge";
import { normalizeQueueRecordWidgetBlockConfig } from "@/lib/layout/runtime/queueRecordWidgetConfig";

const DEFAULT_REPEATED_MAX_ITEMS = 5;

const DEFAULT_FIXED_CONTROLS: QueueRecordFixedControls = {
    actionsMenu: true,
    workWithBos: true,
    actionRailStyle: "stacked",
};

function normalizeFixedControls(fixedControls?: Partial<QueueRecordFixedControls>): QueueRecordFixedControls {
    return {
        actionsMenu: fixedControls?.actionsMenu ?? DEFAULT_FIXED_CONTROLS.actionsMenu,
        workWithBos: fixedControls?.workWithBos ?? DEFAULT_FIXED_CONTROLS.workWithBos,
        actionRailStyle: fixedControls?.actionRailStyle ?? DEFAULT_FIXED_CONTROLS.actionRailStyle,
    };
}

function inferMissingFieldDisplay(field: QueueRecordFieldConfig): QueueRecordFieldConfig {
    if (field.display) return normalizeQueueRecordFieldDisplay(field);
    return normalizeQueueRecordFieldDisplay(inferMissingFieldDisplayLegacy(field));
}

function inferMissingFieldDisplayLegacy(field: QueueRecordFieldConfig): QueueRecordFieldConfig {
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
    if (block.type === "widget") {
        return normalizeQueueRecordWidgetBlockConfig(block);
    }
    return block;
}

function normalizeVariant(variant: QueueRowVariant): QueueRowVariant {
    const appliesWhen = sanitizeQueueRowVariantRule(variant.appliesWhen);
    if (appliesWhen === variant.appliesWhen) return variant;
    return { ...variant, appliesWhen };
}

/** Apply runtime-safe defaults to saved queue record layout config. */
export function normalizeQueueRecordLayoutConfig(config: QueueRecordLayoutConfigV3): QueueRecordLayoutConfigV3 {
    const variants = config.variants?.map(normalizeVariant);
    return {
        ...config,
        fixedControls: normalizeFixedControls(config.fixedControls),
        columns: config.columns.map((col) => ({
            ...col,
            blocks: col.blocks.map(normalizeBlock),
        })),
        ...(variants ? { variants } : {}),
    };
}
