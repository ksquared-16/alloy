/**
 * Draft helpers for stage_operating_plan_v1 editor.
 */

import type {
    StageCompletionOutcomeV1,
    StageOperatingPlanV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

export type StageOperatingPlanEditorDraft = {
    purpose: string;
    journey_segment: "family" | "child";
    work_templates: StageWorkTemplateV1[];
    outcomes: StageCompletionOutcomeV1[];
    /** Rules preserved from saved plan — edited via advanced path later. */
    outcome_rules: StageOperatingPlanV1["outcome_rules"];
    attention_rules: StageOperatingPlanV1["attention_rules"];
};

export function stageOperatingPlanDraftFromSaved(
    saved: StageOperatingPlanV1 | null | undefined,
    stageKey: string,
): StageOperatingPlanEditorDraft {
    const plan = saved ?? defaultStageOperatingPlanForEnrollmentStage(stageKey);
    if (!plan) {
        return {
            purpose: "",
            journey_segment: "family",
            work_templates: [],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        };
    }
    return {
        purpose: plan.purpose ?? "",
        journey_segment: plan.journey_segment,
        work_templates: structuredClone(plan.work_templates),
        outcomes: structuredClone(plan.outcomes),
        outcome_rules: structuredClone(plan.outcome_rules),
        attention_rules: structuredClone(plan.attention_rules),
    };
}

export function stageOperatingPlanDraftToPersisted(
    draft: StageOperatingPlanEditorDraft,
    stageKey: string,
    lifecycleKey: string = ENROLLMENT_PROCESS_KEY,
): StageOperatingPlanV1 | null {
    const sk = stageKey.trim();
    if (!sk) return null;

    const plan: StageOperatingPlanV1 = {
        version: 1,
        lifecycle_key: lifecycleKey,
        stage_key: sk,
        journey_segment: draft.journey_segment,
        work_templates: draft.work_templates.map((t) => structuredClone(t)),
        outcomes: draft.outcomes.map((o) => structuredClone(o)),
        outcome_rules: draft.outcome_rules.map((r) => structuredClone(r)),
        attention_rules: draft.attention_rules.map((r) => structuredClone(r)),
    };
    const purpose = draft.purpose.trim();
    if (purpose) plan.purpose = purpose;

    return parseStageOperatingPlanV1(plan);
}

export function stageOperatingPlanDraftDirty(
    saved: StageOperatingPlanV1 | null | undefined,
    draft: StageOperatingPlanEditorDraft,
    stageKey: string,
): boolean {
    const persisted = stageOperatingPlanDraftToPersisted(draft, stageKey);
    const savedNorm = saved ? parseStageOperatingPlanV1(saved) : null;
    return JSON.stringify(persisted) !== JSON.stringify(savedNorm);
}

export function newWorkTemplateDraft(index: number): StageWorkTemplateV1 {
    return {
        template_key: `work_${index + 1}`,
        label: `Work item ${index + 1}`,
        required: false,
        due_policy: { kind: "offset_days", days: 1 },
        owner_strategy: "record_owner",
    };
}

export function newOutcomeDraft(index: number): StageCompletionOutcomeV1 {
    return {
        outcome_key: `outcome_${index + 1}`,
        label: `Outcome ${index + 1}`,
    };
}
