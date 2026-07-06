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

/** Blank queue row layout — configuration-first builder default (no pre-seeded columns). */
export function emptyQueueRowLayoutV3(): QueueRecordLayoutConfigV3 {
    return {
        variant: "operational-row",
        version: 3,
        columns: [],
        variants: [],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    };
}

/** Optional starter template — Tour / Waitlist / Enrolling variants with stage rules (not the builder default). */
export function defaultEnrollmentQueueRowLayoutWithVariantsV1(): QueueRecordLayoutConfigV3 {
    const base = defaultLeadQueueLayoutV3();
    return {
        ...base,
        variants: starterEnrollmentQueueRowVariants(base),
    };
}

/** Enrollment starter template envelope (explicit opt-in — not used for new surfaces). */
export function enrollmentQueueRowStarterTemplateLayout(): QueueRecordLayoutConfigV3 {
    return defaultEnrollmentQueueRowLayoutWithVariantsV1();
}
