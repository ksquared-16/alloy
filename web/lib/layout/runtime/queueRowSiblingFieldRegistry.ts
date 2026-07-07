/**
 * Queue row sibling + household child vocabulary — registry metadata and visibility presets.
 *
 * Operator-facing fields backed by waitlist candidate projection / household facts.
 * Signal paths (`_sibling.*`, `_household.*`) support layout visibleWhen only — not picker fields.
 */

import type { LayoutCondition } from "@/lib/layout/layoutV2";

/** First-class sibling / household child fields on waitlist candidate-grain queue rows. */
export const QUEUE_ROW_SIBLING_FIELD_KEYS = [
    "sibling.names",
    "sibling.count",
    "sibling.enrolled",
    "sibling.waitlisted",
    "sibling.location",
    "sibling.program",
    "household.otherChildren",
] as const;

export type QueueRowSiblingFieldKey = (typeof QUEUE_ROW_SIBLING_FIELD_KEYS)[number];

export type QueueRowSiblingFieldMetadata = {
    label: string;
    description: string;
    /** Recommended default visibility for new layouts. */
    defaultVisibleWhen?: LayoutCondition;
};

export const QUEUE_ROW_SIBLING_FIELD_METADATA: Record<QueueRowSiblingFieldKey, QueueRowSiblingFieldMetadata> = {
    "sibling.names": {
        label: "Sibling names",
        description: "Names of other children in the family (waitlisted or enrolled), excluding the row child.",
        defaultVisibleWhen: { type: "exists", path: "sibling.names" },
    },
    "sibling.count": {
        label: "Sibling count",
        description: "Number of other children with waitlist or enrolled sibling context on this row.",
        defaultVisibleWhen: { type: "exists", path: "sibling.count" },
    },
    "sibling.enrolled": {
        label: "Sibling enrolled",
        description: "Whether another child in the family is enrolled, with program when available.",
        defaultVisibleWhen: { type: "equals", path: "_sibling.hasEnrolled", value: "true" },
    },
    "sibling.waitlisted": {
        label: "Sibling waitlisted",
        description: "Whether another child in the family is also on the waitlist for this opportunity.",
        defaultVisibleWhen: { type: "equals", path: "_sibling.hasWaitlisted", value: "true" },
    },
    "sibling.location": {
        label: "Sibling location",
        description: "Campus or location for enrolled siblings when known.",
        defaultVisibleWhen: { type: "exists", path: "sibling.location" },
    },
    "sibling.program": {
        label: "Sibling program",
        description: "Program or room cohort for waitlisted or enrolled siblings.",
        defaultVisibleWhen: { type: "exists", path: "sibling.program" },
    },
    "household.otherChildren": {
        label: "Other children",
        description: "Other children linked to the family record, excluding the row child.",
        defaultVisibleWhen: { type: "equals", path: "_household.hasMultipleChildren", value: "true" },
    },
};

/** Internal signal paths populated on waitlist queue row records for visibility conditions. */
export const QUEUE_ROW_SIBLING_SIGNAL_PATHS = {
    hasWaitlisted: "_sibling.hasWaitlisted",
    hasEnrolled: "_sibling.hasEnrolled",
    hasMultipleChildren: "_household.hasMultipleChildren",
} as const;

/** Operator-facing visibility presets backed by runtime signal paths. */
export const QUEUE_ROW_SIBLING_VISIBILITY_PRESETS = {
    always: undefined,
    hideWhenEmpty: (fieldPath: string): LayoutCondition => ({ type: "exists", path: fieldPath }),
    showWhenSiblingWaitlisted: {
        type: "equals",
        path: QUEUE_ROW_SIBLING_SIGNAL_PATHS.hasWaitlisted,
        value: "true",
    } satisfies LayoutCondition,
    showWhenSiblingEnrolled: {
        type: "equals",
        path: QUEUE_ROW_SIBLING_SIGNAL_PATHS.hasEnrolled,
        value: "true",
    } satisfies LayoutCondition,
    showWhenMultipleChildren: {
        type: "equals",
        path: QUEUE_ROW_SIBLING_SIGNAL_PATHS.hasMultipleChildren,
        value: "true",
    } satisfies LayoutCondition,
} as const;

export function isQueueRowSiblingFieldKey(fieldKey: string): fieldKey is QueueRowSiblingFieldKey {
    return (QUEUE_ROW_SIBLING_FIELD_KEYS as readonly string[]).includes(fieldKey.trim());
}

export function isQueueRowSiblingSignalPath(path: string): boolean {
    const key = path.trim();
    return (
        key === QUEUE_ROW_SIBLING_SIGNAL_PATHS.hasWaitlisted ||
        key === QUEUE_ROW_SIBLING_SIGNAL_PATHS.hasEnrolled ||
        key === QUEUE_ROW_SIBLING_SIGNAL_PATHS.hasMultipleChildren
    );
}
