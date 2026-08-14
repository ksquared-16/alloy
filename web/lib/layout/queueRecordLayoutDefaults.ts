/**
 * Queue Row layout defaults — starter configs for builder + runtime fallback.
 */

import type { QueueRecordLayoutConfigV3, QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";

/** Optional starter variant rules — empty columns; operator configures slots. */
export function starterEnrollmentQueueRowVariants(): QueueRowVariant[] {
    const fixedControls = { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" as const };
    return [
        {
            id: "variant-tour",
            label: "Tour",
            priority: 10,
            subjectFocus: "household",
            appliesWhen: { stage_key: ["tour_scheduled", "tour", "tour_completed"] },
            columns: [],
            fixedControls,
        },
        {
            id: "variant-waitlist",
            label: "Waitlist",
            priority: 20,
            subjectFocus: "placement_candidate_child",
            appliesWhen: { stage_key: ["waiting", "waitlist", "waitlisted"], grain: ["candidate", "child"] },
            columns: [],
            fixedControls,
        },
        {
            id: "variant-enrolling",
            label: "Enrolling",
            priority: 30,
            subjectFocus: "active_child",
            appliesWhen: { stage_key: ["enrolling", "registration", "enrolled"], grain: ["candidate", "child"] },
            columns: [],
            fixedControls,
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

/** Optional starter template — Tour / Waitlist / Enrolling variant rules only (empty slots). */
export function defaultEnrollmentQueueRowLayoutWithVariantsV1(): QueueRecordLayoutConfigV3 {
    return { ...emptyQueueRowLayoutV3(), variants: starterEnrollmentQueueRowVariants() };
}

/** Enrollment starter template envelope (explicit opt-in — not used for new surfaces). */
export function enrollmentQueueRowStarterTemplateLayout(): QueueRecordLayoutConfigV3 {
    return defaultEnrollmentQueueRowLayoutWithVariantsV1();
}
