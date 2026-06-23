/**
 * Queue / waitlist v3 composer — widget allow-list (picker ↔ validator invariant).
 *
 * Mirrors drawer surface allow-list pattern without LayoutDoc sections.
 */

export const QUEUE_RECORD_PIPELINE_WIDGET_KEYS = [
    "current_work",
    "attention",
    "activity_timeline",
    "tasks",
] as const;

/** Widgets shown in queue row composer picker (excludes legacy tasks alias). */
export const QUEUE_RECORD_PICKER_WIDGET_KEYS = [
    "current_work",
    "attention",
    "activity_timeline",
] as const;

/** Waitlist queue rows share pipeline widgets; placement-specific widgets remain field keys until renderers ship. */
export const QUEUE_RECORD_WAITLIST_WIDGET_KEYS = [...QUEUE_RECORD_PIPELINE_WIDGET_KEYS] as const;

export type QueueRecordPipelineWidgetKey = (typeof QUEUE_RECORD_PIPELINE_WIDGET_KEYS)[number];
export type QueueRecordWaitlistWidgetKey = (typeof QUEUE_RECORD_WAITLIST_WIDGET_KEYS)[number];

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

import type { LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";

/** Catalog widgets selectable in queue row composer picker (no legacy tasks). */
export function filterCatalogWidgetsForQueueRecord(
    widgets: readonly LayoutCatalogWidget[],
    _isWaitlist = false,
): LayoutCatalogWidget[] {
    const allowed = new Set(QUEUE_RECORD_PICKER_WIDGET_KEYS);
    return widgets.filter((w) => allowed.has(w.widgetKey as (typeof QUEUE_RECORD_PICKER_WIDGET_KEYS)[number]));
}
