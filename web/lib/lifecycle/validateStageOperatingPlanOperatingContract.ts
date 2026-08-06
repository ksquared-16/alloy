/**
 * Process Builder operating-contract validation.
 * Associates issues with exact controls; never throws during partial editing.
 */

import {
    STAGE_PARTICIPANT_DECISION_BINDING_ACCEPTORS,
    type StageOperatingPlanV1,
    type StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
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
import { resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";

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
    /** A saved exit path points at a stage on the other journey track. */
    | "transition_destination_grain_mismatch"
    /** A saved exit path points at a stage whose grain cannot be resolved or is contradictory. */
    | "transition_destination_grain_unresolved"
    /** An outcome moves through a path that lands on the other journey track. */
    | "outcome_movement_grain_mismatch"
    /** An outcome moves through a path whose destination grain cannot be resolved. */
    | "outcome_movement_grain_unresolved"
    /** A per-child decision moves a child onto a stage that belongs to the family case. */
    | "participant_decision_destination_grain_mismatch"
    /** A per-child decision moves a child onto a stage whose grain cannot be resolved. */
    | "participant_decision_destination_grain_unresolved"
    /** A per-child decision names a destination stage this process does not configure. */
    | "participant_decision_destination_invalid"
    /** A required input binds to a target field none of the decision's targets can carry. */
    | "participant_decision_binding_unsupported"
    /** A required select input offers no options to choose from. */
    | "participant_decision_input_options_missing"
    /** Work completion is gated on participants being resolved, but nothing resolves them. */
    | "participant_resolution_gate_without_decisions";

export type StageOperatingContractIssue = {
    code: StageOperatingContractIssueCode;
    severity: "error" | "warning";
    message: string;
    /** Stable control association for editor surfacing. */
    controlId: string;
    template_key?: string;
    outcome_key?: string;
    /** Present on per-child decision findings, so the editor can mark the right row. */
    decision_key?: string;
};

export type ValidateStageOperatingPlanOperatingContractInput = {
    plan: StageOperatingPlanV1;
    /** Valid executable Primary Action refs for this stage context. */
    validPrimaryActionRefs?: ReadonlySet<string> | readonly string[];
    transitionOptions?: ReadonlyArray<StageOutcomeTransitionOption>;
    /**
     * The case-status catalog. UNDEFINED means "the caller cannot resolve it" — status-domain
     * checks are skipped rather than guessed. An empty ARRAY means "there are none", which is a
     * finding. A pure caller such as publication validation has no database and must pass nothing.
     */
    configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
    entityType?: string;
    processStageKeys?: ReadonlySet<string> | readonly string[];
    /**
     * Configured stages with their declared grain and operator label. Supplied so a saved exit path
     * that crosses journey tracks is reported HERE, at authoring time, rather than only refused at
     * execution. Absent → grain checks are skipped, never guessed.
     */
    processStages?: ReadonlyArray<{ key: string; label?: string | null; grain?: string | null }>;
};

/** Operator words for a journey grain. Never "family"/"child" bare — those read as jargon. */
function grainInOperatorWords(grain: "family" | "child"): string {
    return grain === "family" ? "the family case" : "individual children";
}

function grainSubjectWords(grain: "family" | "child"): string {
    return grain === "family" ? "a family" : "a child";
}

function asSet(value: ReadonlySet<string> | readonly string[] | undefined): Set<string> {
    if (!value) return new Set();
    if (value instanceof Set) return value;
    return new Set([...value].map((v) => v.trim()).filter(Boolean));
}

function entityTypeForPlan(plan: StageOperatingPlanV1, override?: string): string {
    if (override?.trim()) return override.trim();
    return plan.journey_segment === "child" ? "opportunity_customer_members" : "opportunities";
}

/**
 * Per-child decisions, checked at AUTHORING time.
 *
 * The runtime refuses these same shapes — the grain guard on the target executor, the binding check
 * in the input applier — but a refusal at click time is a defect the operator discovers on a real
 * family. Everything decidable from configuration alone is decided here instead.
 *
 * Grain is judged with the SHARED resolver, so a decision's destination is weighed exactly as an
 * outcome's destination is. The asymmetry that makes this feature work — a family-grain stage
 * hosting child-grain decisions — is legitimate for the STAGE and illegitimate for the DESTINATION:
 * moving a child onto a family stage is the cross-grain write the platform has spent this whole
 * program learning to refuse.
 */
function validateParticipantDecisions(
    work: StageWorkTemplateV1,
    processStages: ReadonlyArray<{ key: string; label?: string | null; grain?: string | null }> | undefined,
): StageOperatingContractIssue[] {
    const issues: StageOperatingContractIssue[] = [];
    const decisions = work.participant_decisions ?? [];

    if (work.completion_policy?.requires_all_participants_resolved && !decisions.length) {
        issues.push({
            code: "participant_resolution_gate_without_decisions",
            severity: "error",
            message:
                `"${work.label}" cannot be completed until every child has a path, but no per-child `
                + `paths are configured on it — so it could never be completed.`,
            controlId: `work-template-participant-gate-${work.template_key}`,
            template_key: work.template_key,
        });
    }

    if (!decisions.length) return issues;

    const stageByKey = new Map((processStages ?? []).map((s) => [s.key, s]));

    for (const decision of decisions) {
        const controlId = `work-template-participant-decision-${work.template_key}-${decision.decision_key}`;

        for (const input of decision.required_inputs ?? []) {
            if (input.type === "select" && !(input.options?.length)) {
                issues.push({
                    code: "participant_decision_input_options_missing",
                    severity: "error",
                    message: `"${input.label}" asks the operator to choose, but no options are configured.`,
                    controlId: `${controlId}-input-${input.key}`,
                    template_key: work.template_key,
                    decision_key: decision.decision_key,
                });
            }
            if (!input.binds_to_target_field) continue;
            const acceptors = STAGE_PARTICIPANT_DECISION_BINDING_ACCEPTORS[input.binds_to_target_field];
            if (!decision.targets.some((t) => acceptors.includes(t.kind))) {
                issues.push({
                    code: "participant_decision_binding_unsupported",
                    severity: "error",
                    message:
                        `"${input.label}" is collected but nothing this option does can record it. `
                        + `Remove the input, or give the option a step that can carry it.`,
                    controlId: `${controlId}-input-${input.key}`,
                    template_key: work.template_key,
                    decision_key: decision.decision_key,
                });
            }
        }

        // Destination grain is only decidable when the caller supplied the stage inventory.
        if (!processStages) continue;

        for (const target of decision.targets) {
            if (target.kind !== "move_to_stage") continue;
            const targetKey =
                target.stage_key?.trim()
                ?? (target.transition_ref?.startsWith("move_to_stage:")
                    ? target.transition_ref.slice("move_to_stage:".length).trim()
                    : null);
            if (!targetKey) continue;

            if (!stageByKey.has(targetKey)) {
                issues.push({
                    code: "participant_decision_destination_invalid",
                    severity: "error",
                    message: `"${decision.label ?? decision.decision_key}" sends children to a stage this process does not have.`,
                    controlId,
                    template_key: work.template_key,
                    decision_key: decision.decision_key,
                });
                continue;
            }

            const resolution = resolveStageGrain({
                stageKey: targetKey,
                configuredMetadataGrain: stageByKey.get(targetKey)?.grain,
            });
            const destinationLabel = stageByKey.get(targetKey)?.label?.trim() || targetKey;

            if (!resolution.ok) {
                issues.push({
                    code: "participant_decision_destination_grain_unresolved",
                    severity: "error",
                    message: `"${destinationLabel}" does not say clearly whether it holds families or children, so a child cannot be sent there.`,
                    controlId,
                    template_key: work.template_key,
                    decision_key: decision.decision_key,
                });
                continue;
            }

            if (resolution.grain !== "child") {
                issues.push({
                    code: "participant_decision_destination_grain_mismatch",
                    severity: "error",
                    message:
                        `"${destinationLabel}" belongs to ${grainInOperatorWords(resolution.grain)}, so a `
                        + `single child cannot be moved onto it. Per-child paths must lead to a stage that `
                        + `holds ${grainSubjectWords("child")}.`,
                    controlId,
                    template_key: work.template_key,
                    decision_key: decision.decision_key,
                });
            }
        }
    }

    return issues;
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
    configuredStatuses: ReadonlyArray<OutcomeStatusConfiguredRow> | undefined,
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

    if (kind === "close_record" && configuredStatuses !== undefined) {
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
    // Preserved as-is: `undefined` (cannot resolve) and `[]` (none configured) mean different
    // things to the status-domain checks below.
    const configuredStatuses = input.configuredStatuses;
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
        if (transition.status_key && configuredStatuses !== undefined) {
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
            issues.push(...validateParticipantDecisions(work, input.processStages));
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
                configuredStatuses: configuredStatuses ?? [],
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

    /**
     * SAVED exit paths that cross journey tracks.
     *
     * The editor filters the destination picker so a new path cannot be authored across grains,
     * and the executor refuses the write. Neither helps a plan that ALREADY holds such a path: the
     * picker only shapes new choices, and an execution-time refusal arrives long after publish.
     * This reports it at authoring time, where it can be fixed.
     *
     * Nothing is filtered, replaced or normalised. The saved transition and the outcome rule are
     * left exactly as written and stay visible — a blocking issue is added beside them. Silently
     * "repairing" configuration an operator authored is how intent gets lost.
     *
     * Skipped entirely unless the plan states its own grain and the caller supplied the configured
     * stages. An absent declaration is not evidence of a mismatch, and guessing here would flag
     * every legacy plan that predates `journey_segment`.
     */
    const planGrain =
        plan.journey_segment === "child" ? "child"
        : plan.journey_segment === "family" ? "family"
        : null;
    const configuredStages = input.processStages ?? [];

    if (planGrain && configuredStages.length) {
        const stageByKey = new Map(configuredStages.map((stage) => [stage.key, stage]));
        const destinationLabel = (key: string) => stageByKey.get(key)?.label?.trim() || key;

        /** Grain verdict for a destination, using the ONE shared resolver. */
        const destinationGrainFor = (targetStageKey: string) =>
            resolveStageGrain({
                stageKey: targetStageKey,
                configuredMetadataGrain: stageByKey.get(targetStageKey)?.grain,
            });

        const incompatibleRefs = new Set<string>();

        for (const transition of plan.outgoing_transitions ?? []) {
            const targetKey = transition.target_stage_key?.trim();
            if (!targetKey) continue; // already reported by transition_destination_invalid
            const resolution = destinationGrainFor(targetKey);
            const controlId = `stage-transition-${transition.transition_ref || "new"}`;

            if (!resolution.ok) {
                incompatibleRefs.add(transition.transition_ref);
                issues.push({
                    code: "transition_destination_grain_unresolved",
                    severity: "error",
                    message:
                        `"${destinationLabel(targetKey)}" does not say clearly whether it belongs to `
                        + `the family case or to individual children, so this path cannot be checked. `
                        + `Resolve the stage's configuration before publishing.`,
                    controlId,
                });
                continue;
            }
            if (resolution.grain !== planGrain) {
                incompatibleRefs.add(transition.transition_ref);
                issues.push({
                    code: "transition_destination_grain_mismatch",
                    severity: "error",
                    message:
                        `This path moves ${grainSubjectWords(planGrain)} to `
                        + `"${destinationLabel(targetKey)}", which is configured for `
                        + `${grainInOperatorWords(resolution.grain)}. `
                        + `Choose ${planGrain === "family" ? "a family" : "a child"} stage instead.`,
                    controlId,
                });
            }
        }

        // The same fact where the operator is actually working: on the outcome that moves.
        for (const rule of plan.outcome_rules) {
            const outcomeKey = rule.when_outcome_key?.trim();
            if (!outcomeKey) continue;
            for (const target of rule.targets) {
                if (target.kind !== "move_to_stage") continue;
                const ref = target.transition_ref?.trim() ?? "";
                if (!ref || !incompatibleRefs.has(ref)) continue;
                const transition = (plan.outgoing_transitions ?? []).find(
                    (row) => row.transition_ref === ref,
                );
                const targetKey = transition?.target_stage_key?.trim() ?? "";
                const resolution = targetKey ? destinationGrainFor(targetKey) : null;
                issues.push({
                    code:
                        resolution?.ok ?
                            "outcome_movement_grain_mismatch"
                        :   "outcome_movement_grain_unresolved",
                    severity: "error",
                    message:
                        resolution?.ok ?
                            `This outcome moves ${grainSubjectWords(planGrain)} to `
                            + `"${destinationLabel(targetKey)}", which is configured for `
                            + `${grainInOperatorWords(resolution.grain)}. `
                            + `Choose ${planGrain === "family" ? "a family" : "a child"} stage instead.`
                        :   `This outcome moves ${grainSubjectWords(planGrain)} to `
                            + `"${destinationLabel(targetKey)}", which does not say clearly whether it `
                            + `belongs to the family case or to individual children. Resolve the `
                            + `stage's configuration before publishing.`,
                    controlId: `stage-outcome-automation-${outcomeKey}-transition`,
                    outcome_key: outcomeKey,
                });
            }
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
            /*
             * REMOVED: `legacy_status_close_invalid` and `legacy_work_completion_invalid`.
             *
             * Both were gated on `plan.outgoing_transitions !== undefined`, read as "this plan was
             * re-authored under the newer outcome model, so legacy targets are no longer the
             * canonical way to write it". That proxy is false. The field means only "this stage has
             * at least one transition" — so authoring ONE unrelated exit path retroactively
             * condemned every pre-existing outcome on the stage.
             *
             * It fired for real: adding `lead_to_tour` and `enrolling_to_enrolled` produced seven
             * blocking errors against `reached_qualified`, `contact_closed_lost`,
             * `enrollment_complete` and `family_withdrew` — outcomes nobody had touched, whose
             * targets execute correctly. `update_family_case_status`,
             * `update_child_enrollment_status` and `mark_stage_work_complete` all have real
             * executors and remain supported runtime behaviour.
             *
             * A version-gated rule needs a version. The schema has none: `StageOperatingPlanV1
             * .version` is the literal `1` on legacy and new plans alike, and
             * `StageCompletionOutcomeV1` carries no authoring marker at all. Rather than invent a
             * second implicit heuristic to replace the first, these diagnostics are withdrawn until
             * the platform has an explicit authoring-version contract to gate them on.
             */
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
        const identity = `${issue.code}|${issue.controlId}|${issue.outcome_key ?? ""}|${issue.template_key ?? ""}|${issue.decision_key ?? ""}`;
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
