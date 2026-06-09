/**
 * Scope-aware field resolution for queue record row composer (v3).
 */

import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { formatQueueRecordDateDisplay } from "@/lib/adminFormatters";
import type {
    QueueRecordFieldConfig,
    QueueRecordFieldLinkTarget,
    QueueRecordScope,
} from "@/lib/layout/queueRecordLayoutV3";

export type QueueRecordResolvedField = {
    field: QueueRecordFieldConfig;
    item: LayoutItem;
    display: string | null;
    isPlaceholder: boolean;
    visible: boolean;
};

const PLACEHOLDER_DISPLAY = "—";

const HOUSEHOLD_DISPLAY_FIELD_KEYS = [
    "customer.display_name",
    "customer.name",
    "household.name",
    "opportunity.title",
    "name",
] as const;

function hasResolvableValue(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    const text = String(v).trim();
    return text.length > 0 && text !== PLACEHOLDER_DISPLAY;
}

function isHouseholdDisplayFieldKey(fieldKey: string): boolean {
    return HOUSEHOLD_DISPLAY_FIELD_KEYS.some((k) => k === fieldKey)
        || /^(customer\.(display_name|name)|household\.name|opportunity\.title)$/.test(fieldKey);
}

/** Date-like queue row fields — format as MM-DD-YYYY regardless of display mode when value is date-shaped. */
export function isQueueRecordDateFieldKey(fieldKey: string): boolean {
    const rk = fieldKey.toLowerCase();
    return /date_of_birth|\.dob$|tour_date|appointment|created_at|updated_at|desired_start|_date$|\.date$/.test(rk)
        || (/date/.test(rk) && !/update/.test(rk));
}

function shouldFormatQueueRecordDateField(field: QueueRecordFieldConfig): boolean {
    return field.display === "date" || isQueueRecordDateFieldKey(field.fieldKey);
}

function formatQueueRecordFieldValue(rawDisplay: string, field: QueueRecordFieldConfig): string {
    if (!shouldFormatQueueRecordDateField(field)) return rawDisplay;
    const formatted = formatQueueRecordDateDisplay(rawDisplay) || rawDisplay;
    // Queue rows: dates render as MM-DD-YYYY only (no time segment).
    return formatted.split(" · ")[0]?.trim() || formatted;
}

/** Resolve queue row field display with household/title fallbacks across common ref keys. */
export function resolveQueueRecordFieldDisplay(
    record: ProofRuntimeRecord,
    field: QueueRecordFieldConfig,
): { display: string | null; isPlaceholder: boolean } {
    const item = queueRecordFieldToLayoutItem(field);
    const resolved = resolveItemValue(record, item);
    if (hasResolvableValue(resolved.display) && !resolved.isPlaceholder) {
        const rawDisplay = String(resolved.display).trim();
        return { display: formatQueueRecordFieldValue(rawDisplay, field), isPlaceholder: false };
    }

    if (isHouseholdDisplayFieldKey(field.fieldKey)) {
        for (const key of HOUSEHOLD_DISPLAY_FIELD_KEYS) {
            const raw = record[key];
            if (hasResolvableValue(raw)) {
                return { display: String(raw).trim(), isPlaceholder: false };
            }
        }
    }

    if (/attention/.test(field.fieldKey)) {
        const attentionDisplay =
            record["_attention_reason_label"]
            ?? record["opportunity.attention_reason"]
            ?? record._attention;
        if (hasResolvableValue(attentionDisplay)) {
            return { display: String(attentionDisplay).trim(), isPlaceholder: false };
        }
    }

    const statusFieldKey =
        /(?:^|\.)(?:status|lifecycle_status|stage)(?:_key|_label|_name)?$/i.test(field.fieldKey)
        && !/tour_status/i.test(field.fieldKey);
    if (statusFieldKey) {
        const statusDisplay = record["_status_display"] ?? record["opportunity.status_label"];
        if (hasResolvableValue(statusDisplay)) {
            const rawDisplay = String(statusDisplay).trim();
            return { display: formatQueueRecordFieldValue(rawDisplay, field), isPlaceholder: false };
        }
    }

    const fallbackDisplay = resolved.display;
    if (hasResolvableValue(fallbackDisplay) && !resolved.isPlaceholder) {
        const rawDisplay = String(fallbackDisplay).trim();
        return { display: formatQueueRecordFieldValue(rawDisplay, field), isPlaceholder: false };
    }

    return {
        display: fallbackDisplay,
        isPlaceholder: resolved.isPlaceholder || !hasResolvableValue(fallbackDisplay),
    };
}

function childrenRepeaterItem(): LayoutItem {
    return {
        id: "children",
        kind: "related_list",
        refKey: "children",
        source: "children",
        related: { entityType: "child" },
    } as LayoutItem;
}

/** Primary person record overlay for primary_related scope. */
export function resolvePrimaryRelatedRecord(main: ProofRuntimeRecord): ProofRuntimeRecord {
    const personId = String(main["opportunity.primary_person_id"] ?? main["person.id"] ?? main.person_id ?? "").trim();
    return {
        ...main,
        "person.id": personId || main["person.id"],
    };
}

export function resolveRepeatedRelatedRows(
    relationshipKey: string,
    main: ProofRuntimeRecord,
    maxItems?: number,
): ProofRuntimeRecord[] {
    if (relationshipKey !== "children") return [];
    const rows = readLayoutRuntimeRepeaterRows(main, childrenRepeaterItem());
    return maxItems ? rows.slice(0, maxItems) : rows;
}

export function linkTargetEntity(target: QueueRecordFieldLinkTarget): "person" | "child" | "opportunity" | null {
    if (target === "person_drawer") return "person";
    if (target === "child_drawer" || target === "related_record_drawer") return "child";
    if (target === "opportunity_drawer") return "opportunity";
    return null;
}

export function queueRecordFieldToLayoutItem(field: QueueRecordFieldConfig): LayoutItem {
    const statusFieldKey =
        /(?:^|\.)(?:status|lifecycle_status|stage)(?:_key|_label|_name)?$/i.test(field.fieldKey)
        && !/tour_status/i.test(field.fieldKey);
    const renderHint =
        field.display === "pill" || field.display === "badge" || statusFieldKey ? "status"
        : field.display === "link" ? "link"
        : field.display === "phone" ? "phone"
        : field.display === "date" ? "date"
        : "text";
    const linkEntity = field.link?.target ? linkTargetEntity(field.link.target) : null;
    const defaultIcon =
        linkEntity === "child" ? "child"
        : linkEntity === "person" ? "person"
        : linkEntity === "opportunity" ? "home"
        : field.icon;
    const adornment: LayoutFieldAdornment | undefined =
        field.icon || linkEntity ?
            {
                position: "left",
                icon: (field.icon ?? defaultIcon ?? "home") as LayoutFieldAdornment["icon"],
                ...(linkEntity ?
                    {
                        action: {
                            type: "open_drawer",
                            entity: linkEntity,
                            idPath: field.link?.idFieldKey ?? (linkEntity === "child" ? "child.id" : "opportunity.primary_person_id"),
                        },
                    }
                :   {}),
            }
        :   undefined;
    return {
        id: field.id,
        kind: "field",
        refKey: field.fieldKey,
        label: field.label,
        renderHint,
        adornment,
        visibleWhen: field.visibleWhen,
    };
}

export function resolveQueueRecordField(
    field: QueueRecordFieldConfig,
    record: ProofRuntimeRecord,
): QueueRecordResolvedField {
    const item = queueRecordFieldToLayoutItem(field);
    const visible = evaluateLayoutCondition(record, field.visibleWhen);
    const resolved = resolveQueueRecordFieldDisplay(record, field);
    return {
        field,
        item,
        display: resolved.display,
        isPlaceholder: resolved.isPlaceholder,
        visible,
    };
}

export function resolveQueueRecordFieldsForRecord(
    fields: QueueRecordFieldConfig[],
    record: ProofRuntimeRecord,
): QueueRecordResolvedField[] {
    const out: QueueRecordResolvedField[] = [];
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i]!;
        const resolved = resolveQueueRecordField(field, record);
        if (!resolved.visible) continue;
        out.push(resolved);
    }
    return out;
}

export function groupResolvedFieldsInline(rows: QueueRecordResolvedField[]): QueueRecordResolvedField[][] {
    const groups: QueueRecordResolvedField[][] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const inline = row.field.inlineWithPrevious && groups.length > 0;
        if (inline) {
            groups[groups.length - 1]!.push(row);
        } else {
            groups.push([row]);
        }
    }
    return groups;
}

export function resolveLinkId(record: ProofRuntimeRecord, field: QueueRecordFieldConfig): string | null {
    const key = field.link?.idFieldKey ?? "child.id";
    const raw = record[key];
    return raw == null ? null : String(raw).trim() || null;
}

/** @internal test helper — ensure child-scoped fields read child.* keys only. */
export function assertChildScopedFieldKey(fieldKey: string, relationshipKey: string): boolean {
    if (relationshipKey !== "children") return true;
    return (
        fieldKey.startsWith("child.") ||
        fieldKey.startsWith("inquiry_child.") ||
        fieldKey === "child.name"
    );
}

export function scopeAllowsFieldKey(scope: QueueRecordScope, fieldKey: string): boolean {
    if (scope.type === "repeated_related") {
        return assertChildScopedFieldKey(fieldKey, scope.relationshipKey);
    }
    if (scope.type === "primary_related") {
        return fieldKey.startsWith("person.");
    }
    if (scope.type === "lifecycle_context") {
        return /status|attention|next_step|stage|tour|lifecycle|work_unit/.test(fieldKey);
    }
    if (scope.type === "main_record") {
        return fieldKey.startsWith("opportunity.") || fieldKey.startsWith("customer.");
    }
    return true;
}
