/**
 * Queue record layout editor model — v3 scoped column composer.
 */

import type { LayoutCatalogField, LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import {
    catalogFieldToQueueRecordFieldConfig,
    createColumnFromScope,
    createFieldGroupBlock,
    createRepeatedBlock,
    createWidgetBlock,
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    parseScopePresetKey,
    type QueueRecordBlockConfig,
    type QueueRecordColumnConfig,
    type QueueRecordFieldConfig,
    type QueueRecordLayoutConfigV3,
    type QueueRecordScope,
} from "@/lib/layout/queueRecordLayoutV3";
import { migrateToQueueRecordLayoutV3 } from "@/lib/layout/queueRecordLayoutMigration";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import { buildOperationalQueueRowContentGridFromColumns } from "@/lib/layout/operationalQueueRowShell";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";
import {
    buildOperationalQueueRecordViewModelFromCrmSlots,
    type OperationalQueueRecordViewModel,
} from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";

export type QueueRecordLayoutEditorConfig = QueueRecordLayoutConfigV3;

export function createDefaultEditorConfig(isWaitlist = false): QueueRecordLayoutEditorConfig {
    return isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
}

export function resolveEditorConfigFromDoc(raw: unknown, isWaitlist = false): QueueRecordLayoutEditorConfig {
    return normalizeQueueRecordLayoutConfig(migrateToQueueRecordLayoutV3(raw, isWaitlist));
}

/** Runtime config for row renderer — same shape as editor in v3. */
export function editorConfigToRuntimeConfig(editor: QueueRecordLayoutEditorConfig): QueueRecordLayoutEditorConfig {
    return editor;
}

export function addColumn(config: QueueRecordLayoutEditorConfig, scopeKey: string, label: string): QueueRecordLayoutEditorConfig {
    const scope = parseScopePresetKey(scopeKey);
    const col = createColumnFromScope(scope, label);
    return { ...config, columns: [...config.columns, col] };
}

export function removeColumn(config: QueueRecordLayoutEditorConfig, columnId: string): QueueRecordLayoutEditorConfig {
    return { ...config, columns: config.columns.filter((c) => c.id !== columnId) };
}

export function moveColumn(config: QueueRecordLayoutEditorConfig, index: number, dir: -1 | 1): QueueRecordLayoutEditorConfig {
    const cols = config.columns.slice();
    const target = index + dir;
    if (target < 0 || target >= cols.length) return config;
    const tmp = cols[index]!;
    cols[index] = cols[target]!;
    cols[target] = tmp;
    return { ...config, columns: cols };
}

export function patchColumn(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    patch: Partial<Pick<QueueRecordColumnConfig, "label" | "width" | "scope">>,
): QueueRecordLayoutEditorConfig {
    return {
        ...config,
        columns: config.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)),
    };
}

export function addBlockToColumn(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    block: QueueRecordBlockConfig,
): QueueRecordLayoutEditorConfig {
    return {
        ...config,
        columns: config.columns.map((c) => (c.id === columnId ? { ...c, blocks: [...c.blocks, block] } : c)),
    };
}

export function removeBlockFromColumn(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    blockId: string,
): QueueRecordLayoutEditorConfig {
    return {
        ...config,
        columns: config.columns.map((c) =>
            c.id === columnId ? { ...c, blocks: c.blocks.filter((b) => b.id !== blockId) } : c,
        ),
    };
}

function patchBlockFields(
    blocks: QueueRecordBlockConfig[],
    blockId: string,
    patchFields: (fields: QueueRecordFieldConfig[]) => QueueRecordFieldConfig[],
): QueueRecordBlockConfig[] {
    return blocks.map((b) => {
        if (b.id !== blockId || b.type === "widget") return b;
        return { ...b, fields: patchFields(b.fields) };
    });
}

export function addFieldToBlock(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    blockId: string,
    catalogField: LayoutCatalogField,
): QueueRecordLayoutEditorConfig {
    const next = catalogFieldToQueueRecordFieldConfig(catalogField);
    return {
        ...config,
        columns: config.columns.map((c) => {
            if (c.id !== columnId) return c;
            return {
                ...c,
                blocks: patchBlockFields(c.blocks, blockId, (fields) => {
                    if (fields.some((f) => f.fieldKey === next.fieldKey)) return fields;
                    return [...fields, next];
                }),
            };
        }),
    };
}

export function addWidgetToBlock(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    blockId: string,
    widget: LayoutCatalogWidget,
): QueueRecordLayoutEditorConfig {
    const block = createWidgetBlock(widget.widgetKey, widget.label);
    return addBlockToColumn(config, columnId, block);
}

export function removeFieldFromBlock(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    blockId: string,
    fieldId: string,
): QueueRecordLayoutEditorConfig {
    return {
        ...config,
        columns: config.columns.map((c) => {
            if (c.id !== columnId) return c;
            return {
                ...c,
                blocks: patchBlockFields(c.blocks, blockId, (fields) => fields.filter((f) => f.id !== fieldId)),
            };
        }),
    };
}

export function patchFieldInBlock(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    blockId: string,
    fieldId: string,
    patch: Partial<QueueRecordFieldConfig>,
): QueueRecordLayoutEditorConfig {
    return {
        ...config,
        columns: config.columns.map((c) => {
            if (c.id !== columnId) return c;
            return {
                ...c,
                blocks: patchBlockFields(c.blocks, blockId, (fields) =>
                    fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
                ),
            };
        }),
    };
}

export function moveFieldInBlock(
    config: QueueRecordLayoutEditorConfig,
    columnId: string,
    blockId: string,
    fieldIndex: number,
    dir: -1 | 1,
): QueueRecordLayoutEditorConfig {
    return {
        ...config,
        columns: config.columns.map((c) => {
            if (c.id !== columnId) return c;
            return {
                ...c,
                blocks: patchBlockFields(c.blocks, blockId, (fields) => {
                    const next = fields.slice();
                    const target = fieldIndex + dir;
                    if (target < 0 || target >= next.length) return fields;
                    const tmp = next[fieldIndex]!;
                    next[fieldIndex] = next[target]!;
                    next[target] = tmp;
                    return next;
                }),
            };
        }),
    };
}

export function collectUsedFieldKeysInBlock(fields: QueueRecordFieldConfig[]): Set<string> {
    return new Set(fields.map((f) => f.fieldKey));
}

/** @deprecated Actions rail is outside the content grid — see operationalQueueRowShell. */
export const QUEUE_RECORD_FIXED_CONTROLS_GRID_WIDTH = "168px";

export function columnGridTemplate(
    config: QueueRecordLayoutEditorConfig,
    _options?: { includeFixedControls?: boolean },
): string {
    return buildOperationalQueueRowContentGridFromColumns(config.columns);
}

const PREVIEW_SLOTS: CrmCompactRowSemanticSlots = {
    primaryIdentity: "Harper Household",
    childName: null,
    contactDisplayName: "Jordan Harper",
    contactPersonId: "person-preview",
    contactPhoneDisplay: "(503) 555-4729",
    contactEmail: "jordan.harper@example.com",
    programContext: "Preschool AM",
    statusLabel: "Contact Attempted",
    stageLabel: null,
    nextStep: "Call family within one business day",
    lastActivity: null,
    commercialValue: null,
    contactSnippet: null,
    roomContext: null,
    ageContext: null,
    attentionReason: "Call family within one business day to confirm interest.",
    familyNote: null,
    tourContext: null,
    locationContext: "South Campus",
    childrenLines: [
        { primary: "Avery Brooks", personId: "child-1", secondary: "(6m)" },
        { primary: "Casey Lee", personId: "child-2", secondary: "(4y)" },
    ],
};

export function buildQueueRecordLayoutPreviewVm(): OperationalQueueRecordViewModel {
    return buildOperationalQueueRecordViewModelFromCrmSlots(PREVIEW_SLOTS);
}

export const PREVIEW_ROW_ACTIONS = [
    { id: "registry-create_lead", label: "Create Lead", actionId: "create_lead" },
    { id: "registry-schedule_tour", label: "Schedule Tour", actionId: "schedule_tour" },
    { id: "registry-ask_bos", label: "Ask BOS", actionId: "ask_bos" },
];

export function buildQueueRecordPreviewRecord(): Record<string, unknown> {
    return {
        id: "preview-opp",
        "opportunity.id": "preview-opp",
        "opportunity.primary_person_id": "person-preview",
        "opportunity.status_key": "contact_attempted",
        "opportunity.attention_reason": "Call family within one business day",
        "opportunity.next_step": "Schedule tour",
        "opportunity.tour_date": "2026-06-15",
        "customer.display_name": "Harper Household",
        "person.id": "person-preview",
        "person.primary_contact_name": "Jordan Harper",
        "person.phone": "(503) 555-4729",
        "person.email": "jordan.harper@example.com",
        _inquiry_children: [
            {
                "child.id": "child-1",
                "child.name": "Avery Brooks",
                "child.age_band": "(6m)",
                "inquiry_child.status": "Active",
                "inquiry_child.program": "Toddler",
            },
            {
                "child.id": "child-2",
                "child.name": "Casey Lee",
                "child.age_band": "(2y)",
                "inquiry_child.status": "Waitlist",
                "inquiry_child.program": "Preschool",
            },
        ],
    };
}

/** @deprecated v3 uses scope presets */
export function editorColumnTemplates(): { role: string; label: string }[] {
    return [];
}
