/**
 * Queue Row layout defaults — starter configs for builder + runtime fallback.
 */

import {
    defaultLeadQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
    type QueueRowVariant,
} from "@/lib/layout/queueRecordLayoutV3";

function cloneLayoutColumns(config: QueueRecordLayoutConfigV3): QueueRecordLayoutConfigV3["columns"] {
    return structuredClone(config.columns);
}

/** Starter variants for Enrollment — configured rules, not runtime hardcoding. */
export function starterEnrollmentQueueRowVariants(
    defaultColumns: QueueRecordLayoutConfigV3,
): QueueRowVariant[] {
    const baseColumns = cloneLayoutColumns(defaultColumns);
    return [
        {
            id: "variant-tour",
            label: "Tour",
            priority: 10,
            subjectFocus: "household",
            appliesWhen: {
                stage_key: ["tour_scheduled", "tour", "tour_completed"],
            },
            columns: baseColumns,
            fixedControls: defaultColumns.fixedControls,
        },
        {
            id: "variant-waitlist",
            label: "Waitlist",
            priority: 20,
            subjectFocus: "placement_candidate_child",
            appliesWhen: {
                stage_key: ["waiting", "waitlist", "waitlisted"],
                grain: ["candidate", "child"],
            },
            columns: cloneLayoutColumns(defaultColumns),
            fixedControls: defaultColumns.fixedControls,
        },
        {
            id: "variant-enrolling",
            label: "Enrolling",
            priority: 30,
            subjectFocus: "active_child",
            appliesWhen: {
                stage_key: ["enrolling", "registration", "enrolled"],
            },
            columns: cloneLayoutColumns(defaultColumns),
            fixedControls: defaultColumns.fixedControls,
        },
    ];
}

/** Default Enrollment queue row: Default columns + starter Tour/Waitlist/Enrolling variants. */
export function defaultEnrollmentQueueRowLayoutWithVariantsV1(): QueueRecordLayoutConfigV3 {
    const base = defaultLeadQueueLayoutV3();
    return {
        ...base,
        variants: starterEnrollmentQueueRowVariants(base),
    };
}
