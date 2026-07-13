/**
 * Process Builder operating-contract validation.
 * Associates issues with exact controls; never throws during partial editing.
 */

import type { StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    readOutcomeAutomationDraft,
    type OutcomeAutomationKind,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import { resolveWorkTemplateExecutionMode } from "@/lib/lifecycle/resolveWorkTemplateExecutionMode";
import {
    resolveOutcomeStatusOptions,
    type OutcomeStatusConfiguredRow,
} from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";

export type StageOperatingContractIssueCode =
    | "primary_action_missing"
    | "primary_action_invalid"
    | "outcome_transition_missing"
    | "outcome_transition_invalid"
    | "outcome_close_status_missing"
    | "outcome_close_status_invalid"
    | "outcome_follow_up_template_missing"
    | "outcome_follow_up_template_invalid"
    | "outcome_ref_unknown";

export type StageOperatingContractIssue = {
    code: StageOperatingContractIssueCode;
    severity: "error" | "warning";
    message: string;
    /** Stable control association for editor surfacing. */
    controlId: string;
    template_key?: string;
    outcome_key?: string;
};

export type ValidateStageOperatingPlanOperatingContractInput = {
    plan: StageOperatingPlanV1;
    /** Valid executable Primary Action refs for this stage context. */
    validPrimaryActionRefs?: ReadonlySet<string> | readonly string[];
    transitionOptions?: ReadonlyArray<StageOutcomeTransitionOption>;
    configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
    entityType?: string;
};

function asSet(value: ReadonlySet<string> | readonly string[] | undefined): Set<string> {
    if (!value) return new Set();
    if (value instanceof Set) return value;
    return new Set([...value].map((v) => v.trim()).filter(Boolean));
}

function entityTypeForPlan(plan: StageOperatingPlanV1, override?: string): string {
    if (override?.trim()) return override.trim();
    return plan.journey_segment === "child" ? "opportunity_customer_members" : "opportunities";
}

function validatePrimaryAction(
    work: StageWorkTemplateV1,
    validRefs: Set<string>,
): StageOperatingContractIssue[] {
    const issues: StageOperatingContractIssue[] = [];
    const mode = resolveWorkTemplateExecutionMode(work);
    const controlId = `work-template-primary-action-${work.template_key}`;
    const ref = work.primary_action?.action_ref?.trim() ?? "";

    if (mode === "direct_action") {
        if (!ref) {
            issues.push({
                code: "primary_action_missing",
                severity: "error",
                message: "Select a Primary Action, or switch to No direct action.",
                controlId,
                template_key: work.template_key,
            });
        } else if (validRefs.size > 0 && !validRefs.has(ref)) {
            issues.push({
                code: "primary_action_invalid",
                severity: "error",
                message: `Primary Action "${ref}" is not valid for this stage — repair or clear it.`,
                controlId,
                template_key: work.template_key,
            });
        }
    }
    return issues;
}

function validateOutcomeBehavior(
    plan: StageOperatingPlanV1,
    outcomeKey: string,
    kind: OutcomeAutomationKind,
    draft: ReturnType<typeof readOutcomeAutomationDraft>,
    transitionOptions: ReadonlyArray<StageOutcomeTransitionOption>,
    configuredStatuses: ReadonlyArray<OutcomeStatusConfiguredRow>,
    entityType: string,
): StageOperatingContractIssue[] {
    const issues: StageOperatingContractIssue[] = [];
    const controlBase = `stage-outcome-automation-${outcomeKey}`;

    if (kind === "move_to_stage") {
        const controlId = `${controlBase}-transition`;
        if (!transitionOptions.length) {
            issues.push({
                code: "outcome_transition_missing",
                severity: "error",
                message: "No outgoing transitions are configured for this stage.",
                controlId,
                outcome_key: outcomeKey,
            });
        } else {
            const ref = draft.transition_ref?.trim() ?? "";
            if (!ref) {
                issues.push({
                    code: "outcome_transition_missing",
                    severity: "error",
                    message: "Select a configured outgoing transition.",
                    controlId,
                    outcome_key: outcomeKey,
                });
            } else if (!transitionOptions.some((opt) => opt.transition_ref === ref)) {
                issues.push({
                    code: "outcome_transition_invalid",
                    severity: "error",
                    message: "Selected transition is not a valid outgoing edge — repair it.",
                    controlId,
                    outcome_key: outcomeKey,
                });
            }
        }
    }

    if (kind === "close_record") {
        const controlId = `${controlBase}-status`;
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses,
            purpose: "close_record",
            entityType,
            selectedStatusKey: draft.status_key,
        });
        if (!resolved.available) {
            issues.push({
                code: "outcome_close_status_missing",
                severity: "error",
                message: resolved.unavailableReason ?? "Close record is unavailable.",
                controlId,
                outcome_key: outcomeKey,
            });
        } else if (!resolved.selectedValid) {
            issues.push({
                code: "outcome_close_status_invalid",
                severity: "error",
                message: resolved.invalidSelectedStatusKey
                    ? `Status "${resolved.invalidSelectedStatusKey}" is not a configured closed status — repair it.`
                    : "Select a configured closed status.",
                controlId,
                outcome_key: outcomeKey,
            });
        }
    }

    if (kind === "repeat_work") {
        const controlId = `${controlBase}-work-template`;
        const templateKey = draft.repeat_template_key?.trim() ?? "";
        const validKeys = new Set(plan.work_templates.map((t) => t.template_key));
        if (!templateKey) {
            issues.push({
                code: "outcome_follow_up_template_missing",
                severity: "error",
                message: "Select a Work Template for follow-up work.",
                controlId,
                outcome_key: outcomeKey,
            });
        } else if (!validKeys.has(templateKey)) {
            issues.push({
                code: "outcome_follow_up_template_invalid",
                severity: "error",
                message: `Follow-up Work Template "${templateKey}" is not on this stage — repair it.`,
                controlId,
                outcome_key: outcomeKey,
            });
        }
    }

    return issues;
}

export function validateStageOperatingPlanOperatingContract(
    input: ValidateStageOperatingPlanOperatingContractInput,
): StageOperatingContractIssue[] {
    const { plan } = input;
    const issues: StageOperatingContractIssue[] = [];
    const validPrimaryRefs = asSet(input.validPrimaryActionRefs);
    const transitionOptions = input.transitionOptions ?? [];
    const configuredStatuses = input.configuredStatuses ?? [];
    const entityType = entityTypeForPlan(plan, input.entityType);

    const outcomeKeys = new Set(plan.outcomes.map((o) => o.outcome_key));

    for (const work of plan.work_templates) {
        try {
            issues.push(...validatePrimaryAction(work, validPrimaryRefs));
            for (const ref of work.outcome_refs ?? []) {
                const outcomeRef = ref.outcome_ref?.trim();
                if (outcomeRef && !outcomeKeys.has(outcomeRef)) {
                    issues.push({
                        code: "outcome_ref_unknown",
                        severity: "warning",
                        message: `Available Outcome "${outcomeRef}" is not defined on this stage.`,
                        controlId: `work-template-outcome-ref-${work.template_key}`,
                        template_key: work.template_key,
                        outcome_key: outcomeRef,
                    });
                }
            }
        } catch {
            // Partial editing must never throw.
        }
    }

    const outcomeKeysFromRules = new Set(
        plan.outcome_rules
            .map((r) => r.when_outcome_key?.trim())
            .filter((k): k is string => Boolean(k)),
    );

    for (const outcomeKey of outcomeKeysFromRules) {
        try {
            const draft = readOutcomeAutomationDraft(outcomeKey, plan.outcome_rules, {
                transitionOptions: [...transitionOptions],
            });
            if (draft.kind === "none") continue;
            issues.push(
                ...validateOutcomeBehavior(
                    plan,
                    outcomeKey,
                    draft.kind,
                    draft,
                    transitionOptions,
                    configuredStatuses,
                    entityType,
                ),
            );
        } catch {
            // Partial editing must never throw.
        }
    }

    return issues;
}

export function stageOperatingContractHasBlockingErrors(
    issues: ReadonlyArray<StageOperatingContractIssue>,
): boolean {
    return issues.some((issue) => issue.severity === "error");
}
