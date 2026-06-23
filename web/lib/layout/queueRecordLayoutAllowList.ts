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

/** Catalog widgets selectable in queue row composer picker. */
export function filterCatalogWidgetsForQueueRecord(
    widgets: readonly { widgetKey: string }[],
    isWaitlist: boolean,
): typeof widgets {
    const allowed = new Set(allowedQueueRecordWidgetKeys(isWaitlist));
    return widgets.filter((w) => allowed.has(w.widgetKey));
}
