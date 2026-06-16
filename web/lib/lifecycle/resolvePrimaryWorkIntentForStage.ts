/**
 * Explicit V1 primary work intent per builder stage.
 * When a saved operating plan exists, primary work template drives runtime (with legacy fallback).
 */

import type { StageOperatingPlanV1, StageWorkDuePolicy, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveEffectivePrimaryWorkTemplate } from "@/lib/lifecycle/stageOperatingPlanConvergence";

export type PrimaryWorkIntentV1 = {
    work_intent_key: string;
    label: string;
    work_definition_key: string;
    due_policy: StageWorkDuePolicy;
    /** Set when resolved from operating plan work template. */
    template_key?: string;
    provenance: "operating_plan" | "legacy_stage_map";
};

const PRIMARY_WORK_INTENT_BY_STAGE: Record<string, Omit<PrimaryWorkIntentV1, "provenance">> = {
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

function primaryIntentFromWorkTemplate(template: StageWorkTemplateV1): PrimaryWorkIntentV1 {
    return {
        work_intent_key: template.template_key,
        label: template.label,
        work_definition_key: template.work_definition_key?.trim() || template.template_key,
        due_policy: template.due_policy,
        template_key: template.template_key,
        provenance: "operating_plan",
    };
}

export function resolvePrimaryWorkIntentForStage(
    builderStageKey: string,
    operatingPlan?: Pick<StageOperatingPlanV1, "work_templates"> | null,
): PrimaryWorkIntentV1 | null {
    const key = builderStageKey.trim();
    if (!key || NO_SPAWN_STAGES.has(key)) return null;

    const fromPlan = resolveEffectivePrimaryWorkTemplate(operatingPlan ?? null);
    if (fromPlan) return primaryIntentFromWorkTemplate(fromPlan);

    const legacy = PRIMARY_WORK_INTENT_BY_STAGE[key];
    if (!legacy) return null;
    return { ...legacy, provenance: "legacy_stage_map" };
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
