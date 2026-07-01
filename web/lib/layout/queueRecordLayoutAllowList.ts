/**
 * Queue / waitlist v3 composer — widget allow-list (picker ↔ validator invariant).
 *
 * Picker options are never filtered by column scope. Validator accepts legacy
 * widget keys on existing layouts while the picker hides deprecated aliases.
 */

import { GLOBAL_WIDGET_CATALOG, type LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";

/** Widgets validated on saved queue row layouts (includes legacy tasks). */
export const QUEUE_RECORD_PIPELINE_WIDGET_KEYS = [
    "current_work",
    "attention",
    "activity_timeline",
    "follow_ups",
    "tasks",
] as const;

/** Widgets shown in queue row composer picker — scope-independent. */
export const QUEUE_RECORD_PICKER_WIDGET_KEYS = [
    "current_work",
    "attention",
    "activity_timeline",
    "follow_ups",
] as const;

/** Waitlist queue rows share pipeline widget validation/picker sets. */
export const QUEUE_RECORD_WAITLIST_WIDGET_KEYS = [...QUEUE_RECORD_PIPELINE_WIDGET_KEYS] as const;

export type QueueRecordPipelineWidgetKey = (typeof QUEUE_RECORD_PIPELINE_WIDGET_KEYS)[number];
export type QueueRecordWaitlistWidgetKey = (typeof QUEUE_RECORD_WAITLIST_WIDGET_KEYS)[number];
export type QueueRecordPickerWidgetKey = (typeof QUEUE_RECORD_PICKER_WIDGET_KEYS)[number];

/** Drawer widgets intentionally excluded from queue row picker (documented). */
export const QUEUE_RECORD_WIDGET_PICKER_EXCLUSIONS: Record<string, string> = {
    tasks: "Legacy alias — preserved on existing layouts; use Current Work or Follow-ups for new rows",
    reminders: "Needs drawer vertical area — queue row record does not carry reminders[]",
    actions: "Platform-owned row chrome — not a column widget",
    notes: "Needs edit session and drawer vertical area",
    recent_communication: "Needs large feed area — use Activity Timeline on queue rows",
    documents: "No compact queue row document summary renderer",
    children_list: "Use child fields or repeated child block on queue rows",
    tour_summary: "Use opportunity.tour_date field on queue rows",
    household_members: "Needs drawer household scope — no queue row compact renderer",
    related_children_for_person: "Person-drawer scoped — no queue row data",
    guardians_for_child: "Child-drawer scoped — use repeated child block on queue rows",
    emergency_contacts_for_child: "Child-drawer scoped — no queue row compact renderer",
    billing_contacts_for_child: "Child-drawer scoped — no queue row compact renderer",
    authorized_pickup_for_child: "Child-drawer scoped — no queue row compact renderer",
    waitlist_position: "Use waitlist.positionLabel field on waitlist queue rows",
    waitlist_tier: "Use waitlist.tierLabel field on waitlist queue rows",
    waitlisted_since: "Use waitlist.waitSince field on waitlist queue rows",
    waitlist_adjustment: "Operator control — not a layout column widget",
};

export function allowedQueueRecordWidgetKeys(isWaitlist: boolean): readonly string[] {
    return isWaitlist ? QUEUE_RECORD_WAITLIST_WIDGET_KEYS : QUEUE_RECORD_PIPELINE_WIDGET_KEYS;
}

export function isAllowedQueueRecordWidgetKey(widgetKey: string, isWaitlist = false): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    return allowedQueueRecordWidgetKeys(isWaitlist).includes(trimmed);
}

export function isAllowedQueueRecordPickerWidgetKey(widgetKey: string): boolean {
    const trimmed = widgetKey.trim();
    if (!trimmed) return false;
    return (QUEUE_RECORD_PICKER_WIDGET_KEYS as readonly string[]).includes(trimmed);
}

const PICKER_WIDGET_LABEL_OVERRIDES: Record<string, string> = {
    follow_ups: "Follow-ups",
    current_work: "Current Work",
};

/** Build queue row widget picker options — independent of column scope. */
export function buildQueueRecordWidgetPickerCatalog(
    widgets: readonly LayoutCatalogWidget[] = GLOBAL_WIDGET_CATALOG,
): LayoutCatalogWidget[] {
    const byKey = new Map(widgets.map((w) => [w.widgetKey, w] as const));
    return QUEUE_RECORD_PICKER_WIDGET_KEYS.flatMap((widgetKey) => {
        const base = byKey.get(widgetKey);
        if (!base) return [];
        const label = PICKER_WIDGET_LABEL_OVERRIDES[widgetKey] ?? base.label;
        return [{ ...base, label, description: base.description ?? QUEUE_RECORD_WIDGET_PICKER_EXCLUSIONS[widgetKey] }];
    });
}

/** @deprecated Prefer buildQueueRecordWidgetPickerCatalog — kept for call-site compat. */
export function filterCatalogWidgetsForQueueRecord(
    widgets: readonly LayoutCatalogWidget[],
    _isWaitlist = false,
): LayoutCatalogWidget[] {
    return buildQueueRecordWidgetPickerCatalog(widgets);
}
