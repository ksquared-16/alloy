/**
 * Queue Row layout defaults — starter configs for builder + runtime fallback.
 */

import {
    defaultLeadQueueLayoutV3,
    type QueueRecordLayoutConfigV3,
    type QueueRowVariant,
} from "@/lib/layout/queueRecordLayoutV3";

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

/**
 * What an operator sees on a process queue row when NOTHING has been published for it.
 *
 * Household name · primary contact · phone · each child's name and age — plus the stage/status
 * and next-step columns of the Lead default. The builder still starts from
 * `emptyQueueRowLayoutV3()` (configuration-first); this is the RUNTIME answer for an unconfigured
 * surface, and an empty layout must never reach the row, because an empty config maps to "every
 * secondary slot hidden" and the row shows the household name and nothing else.
 */
export function defaultRuntimeQueueRowLayoutV3(): QueueRecordLayoutConfigV3 {
    const lead = defaultLeadQueueLayoutV3();
    const columns = lead.columns.map((column) => {
        if (column.scope.type === "repeated_related" && column.scope.relationshipKey === "children") {
            return {
                ...column,
                blocks: [
                    {
                        type: "field_group" as const,
                        id: "runtime-default-children",
                        fields: [
                            {
                                id: "runtime-default-children-field",
                                fieldKey: "children",
                                label: "Children",
                                display: "text" as const,
                                showLabel: false,
                                collectionPresentation: {
                                    displayMode: "list" as const,
                                    includedFields: ["first_name", "last_name", "age"] as const,
                                    listFormat: "comma" as const,
                                    maxDisplayed: "all" as const,
                                    overflowBehavior: "plus_n_more" as const,
                                },
                            },
                        ],
                    },
                ],
            };
        }
        return {
            ...column,
            blocks: column.blocks.map((block) =>
                block.type === "field_group"
                    ? { ...block, fields: block.fields.filter((field) => field.fieldKey !== "person.email") }
                    : block,
            ),
        };
    });
    return { ...lead, columns, variants: [] };
}

/** True when a queue row layout configures no field at all — i.e. nothing was authored. */
export function queueRowLayoutHasNoFields(config: QueueRecordLayoutConfigV3 | null | undefined): boolean {
    if (!config) return true;
    return !config.columns.some((column) =>
        column.blocks.some(
            (block) =>
                (block.type === "field_group" || block.type === "repeated_record_block")
                && block.fields.some((field) => field.fieldKey.trim().length > 0),
        ),
    );
}
