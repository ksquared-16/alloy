/**
 * Draft helpers for stage_operating_plan_v1 editor.
 */

import { MANUAL_AD_HOC_WORK_DEFINITION_KEY } from "@/lib/admin/operationalWork/operationalWorkDedupe";
import type {
    StageCompletionOutcomeV1,
    StageOperatingPlanV1,
    StageOutgoingTransitionV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { normalizeOperatingPlanDraftForPersist } from "@/lib/lifecycle/stageOperatingPlanConvergence";
import { normalizeOutcomeRulesOnPersist } from "@/lib/lifecycle/stageOutcomeAutomation";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { validateStageOperatingPlanWorkDefinitions } from "@/lib/lifecycle/validateStageOperatingPlanWorkDefinitions";
import {
    stageOperatingContractHasBlockingErrors,
    validateStageOperatingPlanOperatingContract,
    type ValidateStageOperatingPlanOperatingContractInput,
} from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";

export type StageOperatingPlanEditorDraft = {
    purpose: string;
    journey_segment: "family" | "child";
    /** Undefined preserves a legacy plan until the operator authors first-class transitions. */
    outgoing_transitions?: StageOutgoingTransitionV1[];
    work_templates: StageWorkTemplateV1[];
    outcomes: StageCompletionOutcomeV1[];
    /** Rules preserved from saved plan — edited via advanced path later. */
    outcome_rules: StageOperatingPlanV1["outcome_rules"];
    attention_rules: StageOperatingPlanV1["attention_rules"];
};

export function stageOperatingPlanDraftFromSaved(
    saved: StageOperatingPlanV1 | null | undefined,
    _stageKey?: string,
    options?: { templateDefault?: StageOperatingPlanV1 | null },
): StageOperatingPlanEditorDraft {
    const plan = saved ?? options?.templateDefault ?? null;
    if (!plan) {
        return {
            purpose: "",
            journey_segment: "family",
            outgoing_transitions: [],
            work_templates: [],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        };
    }
    return {
        purpose: plan.purpose ?? "",
        journey_segment: plan.journey_segment,
        ...(plan.outgoing_transitions !== undefined
            ? { outgoing_transitions: structuredClone(plan.outgoing_transitions) }
            : {}),
        work_templates: structuredClone(plan.work_templates),
        outcomes: structuredClone(plan.outcomes),
        outcome_rules: structuredClone(plan.outcome_rules),
        attention_rules: structuredClone(plan.attention_rules),
    };
}

export type StageOperatingPlanDraftPersistOptions = {
    /** When false, skip work-definition validation (editor dirty-state only). Default true. */
    validate?: boolean;
    /** Operating-contract context for Primary Action / outcome automation validation. */
    operatingContract?: Omit<ValidateStageOperatingPlanOperatingContractInput, "plan">;
};

export function stageOperatingPlanDraftToPersisted(
    draft: StageOperatingPlanEditorDraft,
    stageKey: string,
    lifecycleKey: string = ENROLLMENT_PROCESS_KEY,
    options?: StageOperatingPlanDraftPersistOptions,
): StageOperatingPlanV1 | null {
    const sk = stageKey.trim();
    if (!sk) return null;

    const normalized = normalizeOperatingPlanDraftForPersist(draft);

    const plan: StageOperatingPlanV1 = {
        version: 1,
        lifecycle_key: lifecycleKey,
        stage_key: sk,
        journey_segment: normalized.journey_segment,
        ...(normalized.outgoing_transitions !== undefined
            ? {
                outgoing_transitions: normalized.outgoing_transitions.map(
                    (transition) => structuredClone(transition),
                ),
            }
            : {}),
        work_templates: normalized.work_templates.map((t) => structuredClone(t)),
        outcomes: normalized.outcomes.map((o) => structuredClone(o)),
        outcome_rules: normalizeOutcomeRulesOnPersist(
            normalized.outcome_rules.map((r) => structuredClone(r)),
            normalized.outcomes,
        ),
        attention_rules: normalized.attention_rules.map((r) => structuredClone(r)),
    };
    const purpose = normalized.purpose.trim();
    if (purpose) plan.purpose = purpose;

    const shouldValidate = options?.validate !== false;
    if (shouldValidate) {
        const validation = validateStageOperatingPlanWorkDefinitions(plan);
        if (!validation.ok) {
            const first = validation.issues[0]!;
            throw new Error(first.message);
        }
        // Operating-contract checks require editor context (transitions / statuses / action refs).
        // Skip when callers use draftToPersisted without that context (runtime fixtures, dirty-diff).
        if (options?.operatingContract) {
            const operatingIssues = validateStageOperatingPlanOperatingContract({
                plan,
                ...options.operatingContract,
            });
            if (stageOperatingContractHasBlockingErrors(operatingIssues)) {
                throw new Error(operatingIssues.find((issue) => issue.severity === "error")!.message);
            }
        }
    }

    return parseStageOperatingPlanV1(plan);
}

export function stageOperatingPlanDraftDirty(
    saved: StageOperatingPlanV1 | null | undefined,
    draft: StageOperatingPlanEditorDraft,
    stageKey: string,
): boolean {
    const persisted = stageOperatingPlanDraftToPersisted(draft, stageKey, ENROLLMENT_PROCESS_KEY, {
        validate: false,
    });
    const savedNorm = saved ? parseStageOperatingPlanV1(saved) : null;
    return JSON.stringify(persisted) !== JSON.stringify(savedNorm);
}

export function newWorkTemplateDraft(index: number): StageWorkTemplateV1 {
    return {
        template_key: `work_${index + 1}`,
        label: "Untitled Work Template",
        required: false,
        due_policy: { kind: "offset_days", days: 1 },
        owner_strategy: "record_owner",
        work_definition_key: MANUAL_AD_HOC_WORK_DEFINITION_KEY,
        execution_mode: "outcome_led",
    };
}

export function newOutcomeDraft(
    index: number,
    options?: { work_template_key?: string | null },
): StageCompletionOutcomeV1 {
    return {
        outcome_key: `outcome_${index + 1}`,
        label: `Outcome ${index + 1}`,
        ...(options?.work_template_key?.trim() ?
            { work_template_key: options.work_template_key.trim() }
        :   {}),
    };
}

export function newOutgoingTransitionDraft(
    stageKey: string,
    index: number,
    targetStageKey: string = "",
): StageOutgoingTransitionV1 {
    return {
        transition_ref: `${stageKey.trim() || "stage"}_transition_${index + 1}`,
        source_stage_key: stageKey.trim(),
        target_stage_key: targetStageKey,
        label: "New transition",
        available: true,
    };
}
