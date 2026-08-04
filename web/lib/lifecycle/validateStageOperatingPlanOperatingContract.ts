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
    statusDomainOperatorLabel,
    type OutcomeStatusConfiguredRow,
} from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";

export type StageOperatingContractIssueCode =
    | "primary_action_missing"
    | "primary_action_invalid"
    | "outcome_transition_missing"
    /** Stage-scoped: this stage has no outgoing transition at all. Reported once, never per outcome. */
    | "stage_transition_missing"
    | "outcome_transition_invalid"
    | "outcome_close_status_missing"
    | "outcome_close_status_invalid"
    | "outcome_follow_up_template_missing"
    | "outcome_follow_up_template_invalid"
    | "outcome_ref_unknown"
    | "transition_identity_duplicate"
    | "transition_identity_invalid"
    | "transition_source_invalid"
    | "transition_destination_invalid"
    | "transition_destination_self"
    | "transition_status_noncanonical"
    | "transition_close_status_invalid"
    | "outcome_transition_unavailable"
    | "legacy_status_close_invalid"
    | "legacy_work_completion_invalid";

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
    processStageKeys?: ReadonlySet<string> | readonly string[];
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
            // Deliberately silent. "This stage has no outgoing transition" is one fact about the
            // stage, not five facts about five outcomes; emitting it per outcome printed the same
            // sentence once for every outcome that wanted to move, which read as five unrelated
            // problems. The stage-scoped `stage_transition_missing` below says it once. Genuinely
            // outcome-scoped transition problems — unselected, or pointing at a non-edge — still
            // report here, because those differ per outcome.
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
        const domainLabel = statusDomainOperatorLabel(entityType);
        const stageLabel = plan.stage_key?.trim() || "this stage";
        const outcomeLabel = outcomeKey.trim() || "this outcome";
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses,
            purpose: "close_record",
            entityType,
            selectedStatusKey: draft.status_key,
        });
        if (!resolved.available) {
            // Actionable guidance — not a blocking picker error nobody can clear here.
            issues.push({
                code: "outcome_close_status_missing",
                severity: "warning",
                message:
                    `Outcome "${outcomeLabel}" on stage "${stageLabel}" is configured to close the record, `
                    + `but no closed ${domainLabel} values are configured. `
                    + `Add a closed status under Organization → Statuses (${domainLabel}), then return here to select it.`,
                controlId,
                outcome_key: outcomeKey,
            });
        } else if (!resolved.selectedValid) {
            issues.push({
                code: "outcome_close_status_invalid",
                severity: "error",
                message: resolved.invalidSelectedStatusKey
                    ? `Status "${resolved.invalidSelectedStatusKey}" is not a configured closed ${domainLabel} — select a closed status for outcome "${outcomeLabel}" on stage "${stageLabel}".`
                    : `Select a configured closed ${domainLabel} for outcome "${outcomeLabel}" on stage "${stageLabel}".`,
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
    const transitionRefs = new Set<string>();
    const processStageKeys = asSet(input.processStageKeys);
    if (!processStageKeys.size) {
        processStageKeys.add(plan.stage_key);
        for (const option of transitionOptions) processStageKeys.add(option.target_stage_key);
    }
    for (const transition of plan.outgoing_transitions ?? []) {
        const controlId = `stage-transition-${transition.transition_ref || "new"}`;
        const ref = transition.transition_ref.trim();
        if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(ref)) {
            issues.push({ code: "transition_identity_invalid", severity: "error", message: "Transition identity must be a stable non-empty key.", controlId });
        } else if (transitionRefs.has(ref)) {
            issues.push({ code: "transition_identity_duplicate", severity: "error", message: `Transition identity "${ref}" is duplicated.`, controlId });
        }
        transitionRefs.add(ref);
        if (transition.source_stage_key !== plan.stage_key) {
            issues.push({ code: "transition_source_invalid", severity: "error", message: "Transition source must be the stage that owns it.", controlId });
        }
        if (transition.target_stage_key === plan.stage_key) {
            issues.push({ code: "transition_destination_self", severity: "error", message: "An outgoing transition cannot target its own stage.", controlId });
        } else if (!transition.target_stage_key.trim() || !processStageKeys.has(transition.target_stage_key)) {
            issues.push({ code: "transition_destination_invalid", severity: "error", message: "Select a configured destination stage.", controlId });
        }
        if (transition.status_key) {
            const statusResolution = resolveOutcomeStatusOptions({
                configuredStatuses,
                purpose: "status_effect",
                entityType,
                selectedStatusKey: transition.status_key,
            });
            if (!statusResolution.selectedValid) {
                issues.push({ code: "transition_status_noncanonical", severity: "error", message: `Status "${transition.status_key}" is not a configured canonical status.`, controlId });
            } else {
                const closed = resolveOutcomeStatusOptions({
                    configuredStatuses,
                    purpose: "close_record",
                    entityType,
                    selectedStatusKey: transition.status_key,
                }).selectedValid;
                if (transition.closes_record === true && !closed) {
                    issues.push({ code: "transition_close_status_invalid", severity: "error", message: "Close semantics require a configured closed status.", controlId });
                }
                if (closed && transition.closes_record !== true) {
                    issues.push({ code: "transition_close_status_invalid", severity: "error", message: "A configured closed status must carry derived close semantics.", controlId });
                }
            }
        } else if (transition.closes_record === true) {
            issues.push({ code: "transition_close_status_invalid", severity: "error", message: "Close semantics require a configured closed status.", controlId });
        }
    }

    for (const work of plan.work_templates) {
        try {
            issues.push(...validatePrimaryAction(work, validPrimaryRefs));
            for (const ref of work.outcome_refs ?? []) {
                const outcomeRef = ref.outcome_ref?.trim();
                if (outcomeRef && !outcomeKeys.has(outcomeRef)) {
                    issues.push({
                        code: "outcome_ref_unknown",
                        severity: "error",
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

    // One stage cannot leave itself in five different ways, so it must not say so five times.
    let anyOutcomeWantsMovement = false;

    for (const outcomeKey of outcomeKeysFromRules) {
        try {
            const draft = readOutcomeAutomationDraft(outcomeKey, plan.outcome_rules, {
                transitionOptions: [...transitionOptions],
                configuredStatuses,
                entityType,
            });
            if (draft.kind === "none") continue;
            if (draft.kind === "move_to_stage") anyOutcomeWantsMovement = true;
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

    if (anyOutcomeWantsMovement && !transitionOptions.length) {
        issues.push({
            code: "stage_transition_missing",
            severity: "error",
            // "this stage", never `plan.stage_key` — the key is `lead`, and printing it puts a raw
            // configuration identifier in front of a director. The editor already names the stage.
            message: "No outgoing transitions are configured for this stage.",
            controlId: "stage-outgoing-transitions",
        });
    }

    for (const rule of plan.outcome_rules) {
        const outcomeKey = rule.when_outcome_key?.trim();
        for (const target of rule.targets) {
            if (target.kind === "move_to_stage" && plan.outgoing_transitions !== undefined) {
                const ref = target.transition_ref?.trim() ?? "";
                const transition = plan.outgoing_transitions.find((row) => row.transition_ref === ref);
                if (!ref || !transition) {
                    issues.push({
                        code: "outcome_transition_invalid",
                        severity: "error",
                        message: "Outcome movement must reference a configured transition identity.",
                        controlId: `stage-outcome-automation-${outcomeKey ?? "unknown"}-transition`,
                        ...(outcomeKey ? { outcome_key: outcomeKey } : {}),
                    });
                } else if (!transition.available) {
                    issues.push({
                        code: "outcome_transition_unavailable",
                        severity: "error",
                        message: `Transition "${ref}" is unavailable.`,
                        controlId: `stage-outcome-automation-${outcomeKey ?? "unknown"}-transition`,
                        ...(outcomeKey ? { outcome_key: outcomeKey } : {}),
                    });
                }
                if (target.stage_key || target.status_key) {
                    issues.push({
                        code: "outcome_transition_invalid",
                        severity: "error",
                        message: "New outcome movement stores transition identity only; destination and status belong to the transition.",
                        controlId: `stage-outcome-automation-${outcomeKey ?? "unknown"}-transition`,
                    });
                }
            }
            if (
                plan.outgoing_transitions !== undefined
                && (target.kind === "update_family_case_status" || target.kind === "update_child_enrollment_status")
            ) {
                issues.push({
                    code: "legacy_status_close_invalid",
                    severity: "error",
                    message: "Newly edited outcomes must move through a transition for status and close behavior.",
                    controlId: `stage-outcome-automation-${outcomeKey ?? "unknown"}-transition`,
                });
            }
            if (plan.outgoing_transitions !== undefined && target.kind === "mark_stage_work_complete") {
                issues.push({
                    code: "legacy_work_completion_invalid",
                    severity: "error",
                    message: "Work completion belongs to the Outcome Definition, not after-recording automation.",
                    controlId: `stage-outcome-definition-${outcomeKey ?? "unknown"}`,
                });
            }
            if (target.kind === "create_next_work") {
                const templateKey = target.template_key?.trim() ?? "";
                if (!templateKey || !plan.work_templates.some((work) => work.template_key === templateKey)) {
                    issues.push({
                        code: templateKey ? "outcome_follow_up_template_invalid" : "outcome_follow_up_template_missing",
                        severity: "error",
                        message: templateKey
                            ? `Follow-up Work Template "${templateKey}" is not on this stage.`
                            : "Select a Work Template for follow-up work.",
                        controlId: `stage-outcome-automation-${outcomeKey ?? "unknown"}-work-template`,
                    });
                }
            }
        }
    }

    // One problem, reported once.
    //
    // Two passes can reach the same conclusion about the same control by different routes: an
    // outcome whose `transition_ref` is not an edge fails both the behaviour check and the
    // rule-target check, and each phrases it its own way ("not a valid outgoing edge" /
    // "must reference a configured transition identity"). One control, one code, one problem —
    // two sentences about it is the same restatement noise as a warning printed per outcome, and
    // the surface keys its list by `controlId:code`, so the pair also collided as a React key.
    //
    // Deliberately NOT part of the identity: `message`. Two wordings of one diagnosis are still
    // one diagnosis, and keeping both is what produced the duplicate. Genuinely different problems
    // differ by code, control, or grain — all of which are kept.
    const seen = new Set<string>();
    return issues.filter((issue) => {
        const identity = `${issue.code}|${issue.controlId}|${issue.outcome_key ?? ""}|${issue.template_key ?? ""}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
    });
}

export function stageOperatingContractHasBlockingErrors(
    issues: ReadonlyArray<StageOperatingContractIssue>,
): boolean {
    return issues.some((issue) => issue.severity === "error");
}
