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

/**
 * Has the OPERATOR changed anything, relative to the saved plan as this editor represents it?
 *
 * Both sides go through the same persist pipeline. Comparing a normalized draft against a merely
 * parsed `saved` made every persist-time convergence rule read as an operator edit: persist
 * "ensures exactly one primary flag when any work items exist"
 * (`normalizeOperatingPlanDraftForPersist`), so a published plan whose work templates carry no
 * explicit `primary` — Firefly's Decision stage is one — gained `primary: true` on load and the
 * editor reported `Unsaved changes` with Save enabled, on pure navigation, with zero requests
 * behind it, and never cleared (R-008).
 *
 * That also made the offered Save actively harmful: pressing it would persist a `primary` the
 * operator never chose.
 *
 * Normalizing both sides keeps genuine edits detectable and generalizes to any future
 * normalization rule, rather than special-casing `primary`.
 */
export function stageOperatingPlanDraftDirty(
    saved: StageOperatingPlanV1 | null | undefined,
    draft: StageOperatingPlanEditorDraft,
    stageKey: string,
): boolean {
    const toPersisted = (d: StageOperatingPlanEditorDraft) =>
        stageOperatingPlanDraftToPersisted(d, stageKey, ENROLLMENT_PROCESS_KEY, { validate: false });
    const persisted = toPersisted(draft);
    const baseline = toPersisted(stageOperatingPlanDraftFromSaved(saved, stageKey));
    return JSON.stringify(persisted) !== JSON.stringify(baseline);
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

/**
 * Append-safe transition draft: picks the first `transition_ref` this stage is not already using.
 *
 * `transition_ref` is the identity an outcome stores, and a duplicate one is rejected by the
 * operating contract (`transition_identity_duplicate`). Two surfaces now author exit paths — the
 * "Ways out of this stage" panel and the outcome editor — so ref allocation lives here rather
 * than being reimplemented next to each button, where the two copies could drift apart and mint
 * the same ref.
 */
export function nextOutgoingTransitionDraft(
    stageKey: string,
    transitions: ReadonlyArray<StageOutgoingTransitionV1>,
    targetStageKey: string = "",
): StageOutgoingTransitionV1 {
    const taken = new Set(transitions.map((transition) => transition.transition_ref));
    let index = transitions.length;
    while (taken.has(`${stageKey.trim() || "stage"}_transition_${index + 1}`)) index += 1;
    return newOutgoingTransitionDraft(stageKey, index, targetStageKey);
}

export type EnsureOutgoingTransitionResult = {
    transitions: StageOutgoingTransitionV1[];
    /** The path an outcome should reference, or null when the request was not answerable. */
    transition_ref: string | null;
    created: boolean;
};

/**
 * Find-or-create the exit path from `stageKey` to `targetStageKey`.
 *
 * Reuse before creation is the whole point: an outcome that needs a way out should adopt the one
 * the stage already has rather than mint a second path to the same destination every time someone
 * configures another outcome. Two paths to one stage remain a legitimate configuration (different
 * label, different resulting status) — this never removes or rewrites one, it only declines to add
 * a redundant one by accident.
 *
 * Returns the input array untouched when nothing is created, so callers can treat an unchanged
 * reference as "no draft edit needed".
 */
export function ensureOutgoingTransitionToStage(
    stageKey: string,
    /**
     * Undefined is meaningful, not missing: it marks a legacy plan whose first-class transitions
     * were never authored. Authoring one is precisely the moment that array should exist, so this
     * materialises it rather than refusing.
     */
    transitions: ReadonlyArray<StageOutgoingTransitionV1> | undefined,
    targetStageKey: string,
    targetStageLabel?: string,
): EnsureOutgoingTransitionResult {
    const source = stageKey.trim();
    const target = targetStageKey.trim();
    const current = [...(transitions ?? [])];

    // A stage cannot exit into itself; the operating contract rejects it as
    // `transition_destination_self`, so never author one here either.
    if (!source || !target || source === target) {
        return { transitions: current, transition_ref: null, created: false };
    }

    const existing = current.find((transition) => transition.target_stage_key === target);
    if (existing) return { transitions: current, transition_ref: existing.transition_ref, created: false };

    const created = {
        ...nextOutgoingTransitionDraft(source, current, target),
        // The standalone panel opens a row with no destination, so "New transition" is the right
        // placeholder there. Here the destination is the operator's answer, so the path can name
        // itself and read as a sentence in the exits list immediately.
        label: `Move to ${targetStageLabel?.trim() || target}`,
    };
    return {
        transitions: [...current, created],
        transition_ref: created.transition_ref,
        created: true,
    };
}
