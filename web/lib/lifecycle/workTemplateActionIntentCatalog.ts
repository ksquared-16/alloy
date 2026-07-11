/**
 * Intent-level action grouping for Work Template configuration.
 *
 * Multiple registry keys may express the same operator intent at different subject
 * grains. The editor exposes one intent; execution ref resolves from process config.
 */

import type { PlatformActionGrain } from "@/lib/platform/actions/platformActionCatalog";

export type WorkTemplateActionIntentCategory =
    | "communication"
    | "workflow"
    | "relationship"
    | "record"
    | "lifecycle"
    | "bos";

export type WorkTemplateActionIntentSpec = {
    intentKey: string;
    label: string;
    description?: string;
    category: WorkTemplateActionIntentCategory;
    /** Registry / catalog keys that express this intent. */
    aliases: readonly string[];
    /** Preferred execution ref per configured platform action grain. */
    refBySubjectGrain: Partial<Record<PlatformActionGrain | "process_subject", string>>;
    /** Fallback ref when grain does not match. */
    defaultRef: string;
};

export const WORK_TEMPLATE_ACTION_INTENT_SPECS: readonly WorkTemplateActionIntentSpec[] = [
    {
        intentKey: "move_to_waitlist",
        label: "Move to Waitlist",
        description: "Move the configured process subject to waitlist status.",
        category: "lifecycle",
        aliases: ["move_to_waitlist", "waitlist_child", "move_family_to_waitlist"],
        refBySubjectGrain: {
            opportunity: "move_to_waitlist",
            opportunity_customer_member: "waitlist_child",
            process_subject: "move_to_waitlist",
        },
        defaultRef: "move_to_waitlist",
    },
    {
        intentKey: "enroll_subject",
        label: "Enroll",
        description: "Confirm enrollment for the configured process subject.",
        category: "lifecycle",
        aliases: ["enroll_child", "approve_enrollment"],
        refBySubjectGrain: {
            opportunity: "approve_enrollment",
            opportunity_customer_member: "enroll_child",
            process_subject: "approve_enrollment",
        },
        defaultRef: "enroll_child",
    },
    {
        intentKey: "close_lead",
        label: "Close Lead",
        description: "Mark this lead as closed or lost.",
        category: "lifecycle",
        aliases: ["close_lead"],
        refBySubjectGrain: {
            opportunity: "close_lead",
            process_subject: "close_lead",
        },
        defaultRef: "close_lead",
    },
];

const ALIAS_TO_INTENT = new Map<string, WorkTemplateActionIntentSpec>();
for (const spec of WORK_TEMPLATE_ACTION_INTENT_SPECS) {
    for (const alias of spec.aliases) {
        ALIAS_TO_INTENT.set(alias, spec);
    }
}

export function workTemplateActionIntentForKey(actionKey: string): WorkTemplateActionIntentSpec | null {
    return ALIAS_TO_INTENT.get(actionKey.trim()) ?? null;
}

/** Map configured stage/process subject metadata to platform action grain. */
export function resolveWorkTemplateSubjectGrain(input: {
    processDefinition?: unknown;
    stageDefinition?: unknown;
}): PlatformActionGrain | "process_subject" {
    const stage = input.stageDefinition;
    if (stage != null && typeof stage === "object") {
        const journey = (stage as Record<string, unknown>).journey_segment;
        if (journey === "child") return "opportunity_customer_member";
        if (journey === "family") return "opportunity";
    }

    const process = input.processDefinition;
    if (process != null && typeof process === "object") {
        const primaryEntity = (process as Record<string, unknown>).primary_entity;
        if (primaryEntity === "opportunity_customer_member") return "opportunity_customer_member";
        if (primaryEntity === "opportunity") return "opportunity";
    }

    return "process_subject";
}

export function resolveIntentExecutionRef(
    spec: WorkTemplateActionIntentSpec,
    subjectGrain: PlatformActionGrain | "process_subject",
): string {
    return spec.refBySubjectGrain[subjectGrain] ?? spec.defaultRef;
}
