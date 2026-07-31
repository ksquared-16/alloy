/**
 * Delta-aware draft validation for the stage operating plan (decision D3, save half).
 *
 * THE DEFECT THIS REPLACES
 *
 * `stageOperatingPlanDraftToPersisted` THREW on any blocking issue, and the board called it while
 * assembling the request body. So a stage carrying ANY pre-existing defect could not be saved at
 * all — the throw happened before the POST, the operator saw nothing, and the Save button appeared
 * dead. A tenant whose graph was already imperfect was frozen out of repairing it, which is exactly
 * the pressure that pushes people onto unvalidated write paths.
 *
 * That is the same all-or-nothing shape D3 already removed from the PUBLISH gate, one level below
 * it. Decision D3, in full:
 *
 *   drafting  block only what THIS edit introduced or worsened; carry the rest as warnings
 *   publish   the whole graph must resolve
 *
 * This module is the drafting half. It does not weaken publish validation — nothing here is
 * consulted at publish, and no finding is discarded: an untouched blocker becomes a *warning the
 * operator can see*, not a defect that stops existing.
 *
 * WHY BEFORE-AND-AFTER, NOT A TOUCHED-OBJECT LIST
 *
 * "Which objects did this edit touch?" is answerable, but answering it by inspecting the edit is
 * fragile — a save carries the whole plan, and any list of touched paths would have to be kept in
 * step with every future control. Validating the plan as it WAS and as it WOULD BE, then diffing
 * the findings, derives the same answer from the only two states that actually matter. An edit
 * that introduces a defect necessarily produces a finding that was not there before.
 *
 * FINDING IDENTITY IS STRUCTURAL, NOT TEXTUAL
 *
 * Keys are `code` + `controlId` + the object identifiers, never the message. Operator copy is
 * meant to be rewritten; a finding that changes wording is the same finding, and a diff keyed on
 * text would report a copy edit as a newly introduced defect.
 */

import {
    validateStageOperatingPlanOperatingContract,
    type StageOperatingContractIssue,
    type ValidateStageOperatingPlanOperatingContractInput,
} from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import { validateStageOperatingPlanWorkDefinitions } from "@/lib/lifecycle/validateStageOperatingPlanWorkDefinitions";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * Work-definition findings, expressed as operating-contract findings so one delta covers both.
 *
 * They were the other thing `stageOperatingPlanDraftToPersisted` threw on, so leaving them out
 * would just move the freeze rather than remove it.
 */
function workDefinitionFindings(
    plan: Pick<StageOperatingPlanV1, "stage_key" | "work_templates">,
): StageOperatingContractIssue[] {
    const result = validateStageOperatingPlanWorkDefinitions(plan);
    if (result.ok) return [];
    return result.issues.map((issue) => ({
        code: "outcome_follow_up_template_invalid" as const,
        severity: "error" as const,
        message: issue.message,
        controlId: `work-template-definition-${issue.template_key}`,
        template_key: issue.template_key,
    }));
}

/**
 * Stable identity for a validation finding.
 *
 * `controlId` already names the object the finding is about — `stage-transition-lead_to_tour`,
 * `work-template-primary-action-contact_family`, `<outcome>-transition` — so the pair
 * (code, controlId) identifies "this kind of defect, on this object". The optional keys
 * disambiguate findings that share a control.
 */
export function stageOperatingContractFindingKey(issue: StageOperatingContractIssue): string {
    return [issue.code, issue.controlId, issue.template_key ?? "", issue.outcome_key ?? ""].join("|");
}

export type StageDraftFindingDelta = {
    /** Not present before this edit. */
    introduced: StageOperatingContractIssue[];
    /** Present before, but escalated from warning to error by this edit. */
    worsened: StageOperatingContractIssue[];
    /** Present before, gone after — the edit repaired it. */
    resolved: StageOperatingContractIssue[];
    /** Present before and after, unchanged in severity. Not this edit's doing. */
    preexisting: StageOperatingContractIssue[];
};

/** Compare two validation runs by structural identity. */
export function classifyStageDraftFindings(
    before: ReadonlyArray<StageOperatingContractIssue>,
    after: ReadonlyArray<StageOperatingContractIssue>,
): StageDraftFindingDelta {
    const beforeByKey = new Map(before.map((i) => [stageOperatingContractFindingKey(i), i]));
    const afterKeys = new Set(after.map(stageOperatingContractFindingKey));

    const introduced: StageOperatingContractIssue[] = [];
    const worsened: StageOperatingContractIssue[] = [];
    const preexisting: StageOperatingContractIssue[] = [];

    for (const issue of after) {
        const key = stageOperatingContractFindingKey(issue);
        const prior = beforeByKey.get(key);
        if (!prior) {
            introduced.push(issue);
        } else if (prior.severity === "warning" && issue.severity === "error") {
            // Same defect, but this edit made it fatal. Treated as introduced for blocking.
            worsened.push(issue);
        } else {
            preexisting.push(issue);
        }
    }

    const resolved = before.filter((i) => !afterKeys.has(stageOperatingContractFindingKey(i)));

    return { introduced, worsened, resolved, preexisting };
}

export type StageDraftSaveAssessment = {
    /** Errors this edit introduced or worsened. Non-empty means DO NOT SAVE. */
    blocking: StageOperatingContractIssue[];
    /**
     * Everything else the graph still has wrong — pre-existing errors demoted to warnings for
     * drafting purposes, plus genuine warnings. Publication still refuses on the errors.
     */
    warnings: StageOperatingContractIssue[];
    /** Findings this edit repaired, so the surface can say the repair worked. */
    resolved: StageOperatingContractIssue[];
    /** Pre-existing errors that will block PUBLICATION even though they do not block this save. */
    blocking_publication_count: number;
    delta: StageDraftFindingDelta;
};

/**
 * Decide whether this edit may be saved.
 *
 * `before` is the validation of the plan as currently saved; `after` is the validation of the plan
 * the operator is proposing. Only what changed for the worse stops the save.
 */
export function assessStageDraftSave(input: {
    before: ReadonlyArray<StageOperatingContractIssue>;
    after: ReadonlyArray<StageOperatingContractIssue>;
}): StageDraftSaveAssessment {
    const delta = classifyStageDraftFindings(input.before, input.after);

    const blocking = [...delta.introduced, ...delta.worsened].filter((i) => i.severity === "error");
    const blockingKeys = new Set(blocking.map(stageOperatingContractFindingKey));
    const warnings = [...delta.introduced, ...delta.worsened, ...delta.preexisting].filter(
        (i) => !blockingKeys.has(stageOperatingContractFindingKey(i)),
    );

    return {
        blocking,
        warnings,
        resolved: delta.resolved,
        // What the operator still owes before publication — errors, wherever they came from.
        blocking_publication_count: [...delta.introduced, ...delta.worsened, ...delta.preexisting].filter(
            (i) => i.severity === "error",
        ).length,
        delta,
    };
}

/**
 * Validate the same plan twice — as saved and as proposed — under identical context.
 *
 * Both runs must use the SAME operating-contract context, or the diff measures the context change
 * rather than the operator's edit.
 */
export function assessStageOperatingPlanEdit(input: {
    savedPlan: StageOperatingPlanV1 | null | undefined;
    proposedPlan: StageOperatingPlanV1;
    operatingContract: Omit<ValidateStageOperatingPlanOperatingContractInput, "plan">;
}): StageDraftSaveAssessment {
    const before = input.savedPlan
        ? [
              ...validateStageOperatingPlanOperatingContract({
                  plan: input.savedPlan,
                  ...input.operatingContract,
              }),
              ...workDefinitionFindings(input.savedPlan),
          ]
        : // No saved plan means nothing pre-existed: every finding belongs to this edit.
          [];
    const after = [
        ...validateStageOperatingPlanOperatingContract({
            plan: input.proposedPlan,
            ...input.operatingContract,
        }),
        ...workDefinitionFindings(input.proposedPlan),
    ];
    return assessStageDraftSave({ before, after });
}

/** "Draft saved. This process still has 2 issues that must be repaired before publication." */
export function remainingIssuesSummary(assessment: StageDraftSaveAssessment): string | null {
    const n = assessment.blocking_publication_count;
    if (n <= 0) return null;
    return (
        `Draft saved. This stage still has ${n} issue${n === 1 ? "" : "s"} that must be repaired ` +
        `before publication.`
    );
}

/**
 * What the editor hands the board: the plan to persist, and what it costs.
 *
 * `assessment.blocking` non-empty means the edit itself is broken — do not send it. Everything
 * else may be saved as a draft, with the remaining issues reported honestly.
 */
export type StageOperatingPlanDraftSave = {
    plan: StageOperatingPlanV1;
    assessment: StageDraftSaveAssessment;
};
