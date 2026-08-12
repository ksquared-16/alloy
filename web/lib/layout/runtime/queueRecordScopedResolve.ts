/**
 * Scope-aware field resolution for queue record row composer (v3).
 */

import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { formatFocusPanelDobAgeLine } from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import { formatDisplayDate, formatQueueRecordDateDisplay } from "@/lib/adminFormatters";
import { stripParentheticalAgeFromChildDisplayName } from "@/lib/layout/runtime/splitQueuePreviewChildPrimaryLabel";
import type {
    QueueRecordFieldConfig,
    QueueRecordFieldLinkTarget,
    QueueRecordScope,
} from "@/lib/layout/queueRecordLayoutV3";
import { formatQueueRowNameDisplay, isQueueRowNameFieldKey } from "@/lib/presentation/formatQueueRowNameDisplay";
import { isCollectionFieldKey } from "@/lib/presentation/collectionFieldPresentation";
import { resolveQueueRowChildrenFieldFromContext } from "@/lib/layout/runtime/queueRowChildrenFieldRegistry";
import { readQueueRowContextFromRow } from "@/lib/workUnits/resolveQueueRowContextPresentation";
import { formatQueueRecordStatusDisplay } from "@/lib/layout/runtime/queueRecordFieldDisplayBridge";
import { isQueueRowSubjectFieldVisible } from "@/lib/layout/runtime/queueRowSubjectPresentation";

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

/** Date-like queue row fields — format as compact display dates regardless of display mode when value is date-shaped. */
export function isQueueRecordDateFieldKey(fieldKey: string): boolean {
    const rk = fieldKey.toLowerCase();
    return /date_of_birth|\.dob$|tour_date|appointment|created_at|updated_at|desired_start|_date$|\.date$/.test(rk)
        || (/date/.test(rk) && !/update/.test(rk));
}

/** DOB / birth-date fields always include year — never compact `Jan 1` without year. */
export function isQueueRecordDobFieldKey(fieldKey: string): boolean {
    const rk = fieldKey.toLowerCase();
    return /date_of_birth|\.dob$/.test(rk);
}

function shouldFormatQueueRecordDateField(field: QueueRecordFieldConfig): boolean {
    return field.display === "date" || isQueueRecordDateFieldKey(field.fieldKey);
}

function formatQueueRecordFieldValue(rawDisplay: string, field: QueueRecordFieldConfig): string {
    let display = rawDisplay;
    if (field.nameDisplay && isQueueRowNameFieldKey(field.fieldKey)) {
        display = formatQueueRowNameDisplay(display, field.nameDisplay, field.fieldKey);
    }
    if (!shouldFormatQueueRecordDateField(field)) return display;
    if (isQueueRecordDobFieldKey(field.fieldKey)) {
        // Child DOB doctrine: `3/15/2026 (4m)` — not raw ISO or `Mar 15, 2026` alone.
        return (
            formatFocusPanelDobAgeLine(rawDisplay)
            || formatDisplayDate(rawDisplay)
            || rawDisplay
        );
    }
    const formatted = formatQueueRecordDateDisplay(rawDisplay) || rawDisplay;
    // Queue rows: date values omit time segment in the field column (time stays in popover/title when needed).
    return formatted.split(" · ")[0]?.trim() || formatted;
}

/** Resolve queue row field display with household/title fallbacks across common ref keys. */
export function resolveQueueRecordFieldDisplay(
    record: ProofRuntimeRecord,
    field: QueueRecordFieldConfig,
): { display: string | null; isPlaceholder: boolean } {
    const item = queueRecordFieldToLayoutItem(field);
    const resolved = resolveItemValue(record, item);

    if (isCollectionFieldKey(field.fieldKey)) {
        const context = readQueueRowContextFromRow(record);
        if (context) {
            const display = resolveQueueRowChildrenFieldFromContext(field.fieldKey, context, {
                collectionPresentation: field.collectionPresentation,
                nameDisplay: field.nameDisplay,
                record,
            });
            if (hasResolvableValue(display)) {
                return { display: String(display).trim(), isPlaceholder: false };
            }
        }
    }

    if (hasResolvableValue(resolved.display) && !resolved.isPlaceholder) {
        let rawDisplay = String(resolved.display).trim();
        if (field.fieldKey === "child.name" || field.fieldKey === "child.display_name") {
            rawDisplay = stripParentheticalAgeFromChildDisplayName(rawDisplay);
        }
        // Prefer unresolved raw for date/DOB doctrine formatting — resolveItemValue may
        // already have turned ISO into `Mar 15, 2024`, which blocks numeric DOB + age.
        const dateSource =
            shouldFormatQueueRecordDateField(field) && hasResolvableValue(resolved.raw)
                ? String(resolved.raw).trim()
                : rawDisplay;
        return { display: formatQueueRecordFieldValue(dateSource, field), isPlaceholder: false };
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
            return {
                display: formatQueueRecordStatusDisplay(rawDisplay, field.fieldKey),
                isPlaceholder: false,
            };
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
    let visible = evaluateLayoutCondition(record, field.visibleWhen);
    if (visible && !isQueueRowSubjectFieldVisible(record, field.fieldKey)) {
        visible = false;
    }
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
        return (
            /status|attention|next_step|stage|tour|lifecycle|work_unit|queue_row/.test(fieldKey)
            || fieldKey.startsWith("opportunity.")
            || fieldKey.startsWith("waitlist.")
            || fieldKey.startsWith("overrides.")
        );
    }
    if (scope.type === "main_record") {
        return (
            fieldKey.startsWith("opportunity.")
            || fieldKey.startsWith("customer.")
            || fieldKey.startsWith("person.")
            || fieldKey.startsWith("queue_row.")
        );
    }
    return true;
}
