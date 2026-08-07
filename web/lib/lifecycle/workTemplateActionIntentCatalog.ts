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
        description: "Applies to: Child → Waitlist",
        category: "lifecycle",
        aliases: ["move_to_waitlist", "waitlist_child", "move_family_to_waitlist"],
        /**
         * Waitlist is child-grain. Family-context Helpful Actions still store the intent
         * `move_to_waitlist`, but execution is always the child capability `waitlist_child`
         * (related-subject resolution), never the legacy opportunity status mutator.
         */
        refBySubjectGrain: {
            opportunity: "waitlist_child",
            opportunity_customer_member: "waitlist_child",
            process_subject: "waitlist_child",
        },
        defaultRef: "waitlist_child",
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

/** Canonical intent ref stored on Work Templates — aliases normalize to intentKey. */
export function normalizeActionRefToIntentKey(actionRef: string): string {
    const ref = actionRef.trim();
    if (!ref) return ref;
    return workTemplateActionIntentForKey(ref)?.intentKey ?? ref;
}

/** True when key is a grain-specific alias, not the canonical intent ref. */
export function isNonCanonicalIntentAlias(actionKey: string): boolean {
    const key = actionKey.trim();
    const intent = workTemplateActionIntentForKey(key);
    if (!intent) return false;
    return key !== intent.intentKey;
}

/** Operator-facing label for an action ref or alias. */
export function intentOperatorLabel(actionRef: string, overrideLabel?: string | null): string | null {
    const override = overrideLabel?.trim();
    if (override) return override;
    const intent = workTemplateActionIntentForKey(actionRef);
    if (intent) return intent.label;
    return null;
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
