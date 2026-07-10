/**
 * Queue row child summary runtime projections — compact evidence slots on queue rows.
 *
 * These are runtime presentation signals derived from child domain evidence modules,
 * not stored business fields on customer_members.
 *
 * @see web/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime.ts
 */

export const QUEUE_ROW_CHILD_SUMMARY_FIELD_KEYS = [
    "child.medical_summary",
    "child.documents_summary",
    "child.pickup_summary",
    "child.notes_summary",
    "child.communications_summary",
    "child.readiness_summary",
] as const;

export type QueueRowChildSummaryFieldKey = (typeof QUEUE_ROW_CHILD_SUMMARY_FIELD_KEYS)[number];

export const QUEUE_ROW_CHILD_SUMMARY_FIELD_METADATA: Record<
    QueueRowChildSummaryFieldKey,
    { label: string; resolverOwner: string }
> = {
    "child.medical_summary": {
        label: "Medical",
        resolverOwner: "web/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime.ts",
    },
    "child.documents_summary": {
        label: "Documents",
        resolverOwner: "web/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime.ts",
    },
    "child.pickup_summary": {
        label: "Pickup",
        resolverOwner: "web/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime.ts",
    },
    "child.notes_summary": {
        label: "Notes",
        resolverOwner: "web/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime.ts",
    },
    "child.communications_summary": {
        label: "Communications",
        resolverOwner: "web/lib/layout/runtime/queueRecordScopedResolve.ts",
    },
    "child.readiness_summary": {
        label: "Readiness",
        resolverOwner: "web/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime.ts",
    },
};

export function isQueueRowChildSummaryFieldKey(fieldKey: string): fieldKey is QueueRowChildSummaryFieldKey {
    return (QUEUE_ROW_CHILD_SUMMARY_FIELD_KEYS as readonly string[]).includes(fieldKey.trim());
}
