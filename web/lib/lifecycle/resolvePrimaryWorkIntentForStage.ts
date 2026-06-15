/**
 * Explicit V1 primary work intent per builder stage — does not iterate work_templates.
 */

import type { StageWorkDuePolicy } from "@/lib/lifecycle/stageOperatingPlanV1";

export type PrimaryWorkIntentV1 = {
    work_intent_key: string;
    label: string;
    work_definition_key: string;
    due_policy: StageWorkDuePolicy;
};

const PRIMARY_WORK_INTENT_BY_STAGE: Record<string, PrimaryWorkIntentV1> = {
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

export function resolvePrimaryWorkIntentForStage(builderStageKey: string): PrimaryWorkIntentV1 | null {
    const key = builderStageKey.trim();
    if (!key || NO_SPAWN_STAGES.has(key)) return null;
    return PRIMARY_WORK_INTENT_BY_STAGE[key] ?? null;
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
