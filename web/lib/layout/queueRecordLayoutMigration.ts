/**
 * Migrate queue_record_layout v1/v2 role-based configs → v3 scoped composer.
 */

import type {
    QueueRecordColumnRole,
    QueueRecordLayoutColumn,
    QueueRecordLayoutConfig,
    QueueRecordLayoutEditorColumn,
    QueueRecordLayoutField,
} from "@/lib/layout/queueRecordLayoutConfig";
import {
    createColumnFromScope,
    createFieldGroupBlock,
    createRepeatedBlock,
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
    type QueueRecordBlockConfig,
    type QueueRecordColumnConfig,
    type QueueRecordFieldConfig,
    type QueueRecordLayoutConfigV3,
    type QueueRecordScope,
} from "@/lib/layout/queueRecordLayoutV3";
import { nextQueueRecordBlockId, nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";
import { queueRecordFieldRefKey } from "@/lib/layout/queueRecordLayoutCatalogBridge";

function roleToScope(role?: QueueRecordColumnRole | string): QueueRecordScope {
    switch (role) {
        case "identity":
            return { type: "main_record" };
        case "related":
            return { type: "repeated_related", relationshipKey: "children" };
        case "status":
        case "attention":
        case "date":
            return { type: "lifecycle_context" };
        default:
            return { type: "main_record" };
    }
}

function mapLegacyDisplay(field: QueueRecordLayoutField): QueueRecordFieldConfig["display"] {
    if (field.display) return field.display as QueueRecordFieldConfig["display"];
    if (field.type === "status") return "pill";
    if (field.type === "date") return "date";
    if (field.type === "related-record-chips") return "chip";
    return "text";
}

function v2FieldToV3(field: QueueRecordLayoutField, index: number, prev?: QueueRecordLayoutField): QueueRecordFieldConfig {
    const fieldKey = queueRecordFieldRefKey(field) ?? field.catalogId;
    const inlineWithPrevious = field.rowLayout === "inline" || (prev && field.rowId === (prev.rowId ?? prev.id));
    const link =
        field.linkBehavior === "open-drawer" ?
            field.entityType === "child" || fieldKey.startsWith("child.") ?
                { target: "child_drawer" as const, idFieldKey: "child.id" }
            : field.entityType === "person" || fieldKey.startsWith("person.") ?
                { target: "person_drawer" as const, idFieldKey: "opportunity.primary_person_id" }
            :   { target: "opportunity_drawer" as const, idFieldKey: "opportunity.id" }
        :   undefined;
    const display = mapLegacyDisplay(field);
    return {
        id: field.id,
        fieldKey,
        label: field.label,
        showLabel: display === "phone" || display === "email" ? false : undefined,
        display,
        inlineWithPrevious: inlineWithPrevious || undefined,
        visibleWhen: field.visibleWhen,
        icon: field.adornment?.icon,
        link,
    };
}

function v2ColumnToV3(col: QueueRecordLayoutEditorColumn): QueueRecordColumnConfig {
    const scope = roleToScope(col.role);
    const fields = col.fields ?? [];
    const hasChildrenChips = fields.some(
        (f) => f.type === "related-record-chips" || (f.refKey ?? "").includes("children"),
    );

    if (scope.type === "repeated_related" || hasChildrenChips) {
        const repeat = createRepeatedBlock("children");
        if (repeat.type === "repeated_record_block") {
            repeat.display = "chips";
            repeat.maxItems = repeat.maxItems ?? 5;
            repeat.fields = fields
                .filter((f) => f.type !== "related-record-chips")
                .map((f, i, arr) => v2FieldToV3(f, i, arr[i - 1]));
            if (!repeat.fields.length) {
                repeat.fields = [
                    {
                        id: nextQueueRecordFieldId("child-name"),
                        fieldKey: "child.name",
                        label: "Child name",
                        icon: "child",
                        display: "link",
                        link: { target: "child_drawer", idFieldKey: "child.id" },
                    },
                ];
            }
        }
        return {
            id: col.id,
            label: col.label,
            width: col.width,
            scope: { type: "repeated_related", relationshipKey: "children" },
            blocks: [repeat],
        };
    }

    const widgets = fields.filter((f) => f.kind === "widget");
    const plainFields = fields.filter((f) => f.kind !== "widget");
    const blocks: QueueRecordBlockConfig[] = [];
    if (plainFields.length) {
        blocks.push({
            type: "field_group",
            id: nextQueueRecordBlockId("migrated"),
            fields: plainFields.map((f, i, arr) => v2FieldToV3(f, i, arr[i - 1])),
            layout: "stack",
        });
    }
    for (const w of widgets) {
        blocks.push({
            type: "widget",
            id: w.id,
            widgetKey: w.widgetKey ?? w.catalogId.replace("widget:", ""),
            label: w.label,
        });
    }
    if (!blocks.length) blocks.push(createFieldGroupBlock());

    return { id: col.id, label: col.label, width: col.width, scope, blocks };
}

function v1ColumnToV3(col: QueueRecordLayoutColumn): QueueRecordColumnConfig {
    const scope = roleToScope(col.role ?? col.key);
    const base = createColumnFromScope(scope, col.label ?? col.key);
    base.id = col.id ?? col.key;
    base.width = col.widthToken ?? "medium";
    return base;
}

export function isQueueRecordLayoutV3(raw: unknown): raw is QueueRecordLayoutConfigV3 {
    if (!raw || typeof raw !== "object") return false;
    const o = raw as Record<string, unknown>;
    return o.variant === "operational-row" && o.version === 3 && Array.isArray(o.columns);
}

export function migrateToQueueRecordLayoutV3(raw: unknown, isWaitlist = false): QueueRecordLayoutConfigV3 {
    if (isQueueRecordLayoutV3(raw)) {
        return raw as QueueRecordLayoutConfigV3;
    }
    if (!raw || typeof raw !== "object") {
        return isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
    }
    const o = raw as Record<string, unknown>;
    if (o.variant !== "operational-row") {
        return isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
    }

    if (o.version === 2 && Array.isArray(o.columns)) {
        const cols = (o.columns as QueueRecordLayoutEditorColumn[]).map(v2ColumnToV3);
        return {
            variant: "operational-row",
            version: 3,
            columns: cols.length ? cols : (isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3()).columns,
            fixedControls: (o.fixedControls as QueueRecordLayoutConfigV3["fixedControls"]) ?? {
                actionsMenu: true,
                workWithBos: true,
            },
        };
    }

    if (Array.isArray(o.columns)) {
        const cols = (o.columns as QueueRecordLayoutColumn[]).map(v1ColumnToV3);
        return {
            variant: "operational-row",
            version: 3,
            columns: cols.length ? cols : (isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3()).columns,
            fixedControls: (o.fixedControls as QueueRecordLayoutConfigV3["fixedControls"]) ?? {
                actionsMenu: true,
                workWithBos: true,
            },
        };
    }

    return isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
}
