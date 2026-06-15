/**
 * Primary work intent per builder stage — operating plan templates with legacy fallback.
 */

import type { StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkDuePolicy } from "@/lib/lifecycle/stageOperatingPlanV1";

export type PrimaryWorkIntentSource = "operating_plan_template" | "legacy_map";

export type PrimaryWorkIntentV1 = {
    work_intent_key: string;
    label: string;
    description?: string | null;
    work_definition_key: string;
    due_policy: StageWorkDuePolicy;
    template_key?: string;
    required?: boolean;
    source: PrimaryWorkIntentSource;
};

const PRIMARY_WORK_INTENT_BY_STAGE: Record<
    string,
    Omit<PrimaryWorkIntentV1, "source" | "template_key" | "required" | "description">
> = {
    lead: {
        work_intent_key: "make_contact",
        label: "Make Contact",
        work_definition_key: "contact_family",
        due_policy: { kind: "same_day" },
    },
    qualification: {
        work_intent_key: "gather_enrollment_information",
        label: "Gather Enrollment Information",
        work_definition_key: "collect_missing_information",
        due_policy: { kind: "offset_days", days: 1 },
    },
    tour: {
        work_intent_key: "complete_tour_process",
        label: "Complete Tour Process",
        work_definition_key: "record_tour_outcome",
        due_policy: { kind: "offset_days", days: 1 },
    },
    enrolling: {
        work_intent_key: "complete_enrollment",
        label: "Complete Enrollment",
        work_definition_key: "collect_missing_information",
        due_policy: { kind: "offset_days", days: 1 },
    },
};

const NO_SPAWN_STAGES = new Set(["enrolled", "waitlist", "decision", "closed", "closed_withdrawn"]);

/** Select primary work template: primary=true → first required → null. */
export function selectPrimaryWorkTemplateFromPlan(plan: StageOperatingPlanV1): StageWorkTemplateV1 | null {
    const primary = plan.work_templates.find((t) => t.primary === true);
    if (primary) return primary;
    const firstRequired = plan.work_templates.find((t) => t.required);
    if (firstRequired) return firstRequired;
    return null;
}

function intentFromTemplate(stageKey: string, template: StageWorkTemplateV1): PrimaryWorkIntentV1 {
    const legacy = PRIMARY_WORK_INTENT_BY_STAGE[stageKey];
    const workDefinitionKey =
        (typeof template.work_definition_key === "string" && template.work_definition_key.trim()) ||
        legacy?.work_definition_key ||
        "contact_family";

    return {
        work_intent_key: template.template_key,
        template_key: template.template_key,
        label: template.label,
        description: template.description ?? null,
        work_definition_key: workDefinitionKey,
        due_policy: template.due_policy,
        required: template.required,
        source: "operating_plan_template",
    };
}

export function resolvePrimaryWorkIntentForStage(
    builderStageKey: string,
    plan?: StageOperatingPlanV1 | null,
): PrimaryWorkIntentV1 | null {
    const key = builderStageKey.trim();
    if (!key || NO_SPAWN_STAGES.has(key)) return null;

    if (plan) {
        const template = selectPrimaryWorkTemplateFromPlan(plan);
        if (template) return intentFromTemplate(key, template);
    }

    const legacy = PRIMARY_WORK_INTENT_BY_STAGE[key];
    if (!legacy) return null;
    return { ...legacy, source: "legacy_map" };
}

export function buildLifecycleIntentIdempotencyKey(params: {
    orgId: string;
    opportunityId: string;
    stageKey: string;
    workIntentKey: string;
}): string {
    return `lifecycle_intent:${params.orgId.trim()}:${params.opportunityId.trim()}:${params.stageKey.trim()}:${params.workIntentKey.trim()}`;
}

export function buildLifecycleIntentSubjectFingerprint(params: {
    orgId: string;
    opportunityId: string;
    stageKey: string;
}): string {
    return `${params.orgId.trim()}:opportunities:${params.opportunityId.trim()}:stage:${params.stageKey.trim()}`;
}
