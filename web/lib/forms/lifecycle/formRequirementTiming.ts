/**
 * Which configured requirements a FORM is responsible for capturing.
 *
 * Process configuration already says *when* a field is needed (`rule_meta_v1.timing`:
 * record_creation | stage_progress | stage_exit | process_completion), and
 * `requirementTimingEvaluation.selectRequirementRulesForMoment` is the platform's single authority
 * on what that timing means. Forms coverage used to ignore timing entirely and treat every
 * `required` rule as "must be on this form", so the only way to stop a stage-exit field from
 * blocking an intake form was to demote it to `recommended` — which throws away the fact that it
 * is genuinely required later in the process.
 *
 * This module is an ADAPTER, not a second engine: it maps a form's (stage, intent) to an
 * evaluation moment and asks the canonical selector which rules that moment owns. All timing
 * semantics — including "untagged defaults to stage_progress" — live there.
 *
 * The rule in one sentence: **a form is responsible for what the record needs at the moment that
 * form is submitted.** Requirements owned by a later moment stay real requirements; they are simply
 * advisory *for this form*, and surface through progression / What's Next instead of blocking it.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { selectRequirementRulesForMoment } from "@/lib/lifecycle/requirementTimingEvaluation";
import { ruleMetaForRule } from "@/lib/lifecycle/requirementTimingMeta";
import type {
    PublishedLifecycleFieldRules,
    PublishedRequirementRuleMeta,
    RequirementEvaluationMoment,
    RequirementTiming,
} from "@/lib/lifecycle/requirementTimingTypes";

/**
 * Timing a required rule is judged as when it carries no explicit `rule_meta_v1.timing`.
 * Mirrors the canonical selector's legacy default (`stage_progress`) — restated here only so the
 * operator-facing "why isn't this blocking" copy can name a timing for untagged rules.
 */
export const DEFAULT_REQUIREMENT_TIMING: RequirementTiming = "stage_progress";

/**
 * Intents whose forms bring the record into existence. Their moment is `record_creation`.
 * Mirrors `operationalIntentRequiresLifecycleRecordCoverage` — record-creating intents only.
 */
const RECORD_CREATING_INTENT_STAGE: Readonly<Record<string, LifecycleOperatorStage>> = {
    enrollment_lead: "lead",
    waitlist: "waitlist",
};

/**
 * The evaluation moment a form's submission represents.
 *
 * A record-creating intent sitting on its own creation stage creates the record, so it answers to
 * `record_creation`. Every other form is working an existing record through a stage.
 *
 * Note this deliberately uses plain `stage_progress` rather than
 * `selectRulesForStageProgressReadiness` (which folds in `stage_exit`): a field needed *before
 * leaving* a stage is not a gap in a form that *works* the stage.
 */
export function formRequirementMoment(
    stage: LifecycleOperatorStage,
    intent: string | null | undefined
): RequirementEvaluationMoment {
    const creationStage = RECORD_CREATING_INTENT_STAGE[(intent ?? "").trim()];
    if (creationStage && creationStage === stage) return { kind: "record_creation" };
    return { kind: "stage_progress", stageKey: stage };
}

/** Convenience for callers that only need to name the moment (copy, tests). */
export function formRequirementMomentTiming(
    stage: LifecycleOperatorStage,
    intent: string | null | undefined
): RequirementTiming {
    return formRequirementMoment(stage, intent).kind === "record_creation"
        ? "record_creation"
        : "stage_progress";
}

/** Configured timings for a rule, normalized to an array. Empty when untagged. */
export function configuredTimingsForRule(
    ruleId: string,
    ruleMeta: PublishedRequirementRuleMeta
): RequirementTiming[] {
    const timing = ruleMetaForRule(ruleMeta, ruleId)?.timing;
    if (!timing) return [];
    return Array.isArray(timing) ? [...timing] : [timing];
}

export type FormRequirementTimingSplit = {
    /** Required rules the form must capture — this form's moment owns them. */
    blockingRuleIds: string[];
    /**
     * Required rules owned by a later moment. Still required by the process; advisory for this
     * form, and carried with the timing that owns them so the UI can say so.
     */
    deferredRuleIds: string[];
    /** Timing that deferred each rule, for operator-facing copy. */
    deferredTimingByRuleId: Record<string, RequirementTiming[]>;
};

/**
 * Split a stage's configured `required` rule ids into what this form must capture now and what a
 * later moment owns. Order is preserved so operator-facing lists stay stable.
 *
 * Selection is delegated to {@link selectRequirementRulesForMoment}; this only intersects the
 * canonical result with the stage's required list and records why each deferral happened.
 */
export function splitRequiredRulesByFormMoment(input: {
    requiredRuleIds: readonly string[];
    rules: PublishedLifecycleFieldRules;
    ruleMeta: PublishedRequirementRuleMeta;
    moment: RequirementEvaluationMoment;
}): FormRequirementTimingSplit {
    const ownedByMoment = new Set(
        selectRequirementRulesForMoment({
            rules: input.rules,
            ruleMeta: input.ruleMeta,
            moment: input.moment,
        }).map((r) => r.ruleId)
    );

    const blockingRuleIds: string[] = [];
    const deferredRuleIds: string[] = [];
    const deferredTimingByRuleId: Record<string, RequirementTiming[]> = {};

    for (const ruleId of input.requiredRuleIds) {
        if (ownedByMoment.has(ruleId)) {
            if (!blockingRuleIds.includes(ruleId)) blockingRuleIds.push(ruleId);
            continue;
        }
        if (deferredRuleIds.includes(ruleId)) continue;
        deferredRuleIds.push(ruleId);
        const configured = configuredTimingsForRule(ruleId, input.ruleMeta);
        deferredTimingByRuleId[ruleId] = configured.length ? configured : [DEFAULT_REQUIREMENT_TIMING];
    }

    return { blockingRuleIds, deferredRuleIds, deferredTimingByRuleId };
}

const TIMING_LABELS: Record<RequirementTiming, string> = {
    record_creation: "when the record is created",
    stage_progress: "while working this stage",
    stage_exit: "before leaving this stage",
    process_completion: "before the process completes",
};

/** Operator-facing phrase for why a required rule is not blocking this form. */
export function deferredTimingLabel(timings: readonly RequirementTiming[]): string {
    const labels = timings.map((t) => TIMING_LABELS[t]).filter(Boolean);
    if (!labels.length) return TIMING_LABELS[DEFAULT_REQUIREMENT_TIMING];
    if (labels.length === 1) return labels[0]!;
    return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}
