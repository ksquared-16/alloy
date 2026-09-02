/**
 * Execute ONE configured participant decision against ONE explicit child.
 *
 * This is the single writer for per-child routing. It owns nothing durable itself: every effect
 * goes through `applyStageOutcomeRuleTarget`, the same target executor the stage-outcome path
 * uses, so the configured-stage guard and the grain guard apply here by construction rather than
 * by being remembered. What this module owns is the part that cannot be delegated —
 *
 *   which child        exactly one, supplied, never inferred
 *   may it move        the regression guard, reusing the existing state classifier
 *   with what inputs   validated and bound onto the targets the configuration named
 *   inside what        the Platform Transaction Contract, which is a SAGA
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 *  - It does not touch the family opportunity. The target vocabulary a participant decision may
 *    carry excludes `update_family_case_status`, so "the family stays open in Decision" is a
 *    property of the type, not a promise in a comment.
 *  - It does not enumerate siblings. Every write is scope-targeted at one `subject_id`, and the
 *    write-count contract refuses the result if that scope matched anything other than one row.
 *  - It does not close the family work item. Work completion is the family outcome's job, gated
 *    separately on every participant being resolved.
 *  - It does not know what "Waitlist" means. `waitlisted`, `enrolling`, `closed_withdrawn` appear
 *    nowhere below; they arrive from configuration or they do not arrive at all.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyStageOutcomeRuleTarget,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import type { ParticipantWriteCountFailure } from "@/lib/lifecycle/assertSingleParticipantWrite";
import {
    applyParticipantDecisionInputs,
    type ParticipantDecisionInputIssue,
} from "@/lib/lifecycle/applyParticipantDecisionInputs";
import { resolveChildTrackTransition } from "@/lib/lifecycle/resolveChildTrackTransition";
import {
    childParticipationIdentityFromWire,
    namesAChild,
    type ChildParticipationIdentity,
} from "@/lib/lifecycle/childParticipationIdentity";
import type {
    StageOperatingPlanV1,
    StageWorkParticipantDecisionV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    readEnrollmentInstanceStageKey,
    readEnrollmentInstanceState,
    resolveEnrollmentInstanceIdForScope,
} from "@/lib/process/processInstances";
import { assertSingleParticipantWrite } from "@/lib/lifecycle/assertSingleParticipantWrite";
import {
    runPlatformTransaction,
    type PlatformTransactionResult,
    type PlatformTransactionStep,
    type PlatformTransactionTrace,
} from "@/lib/platform/transaction/platformTransaction";

/** Capability identity the transaction trace records this under. */
export const PARTICIPANT_DECISION_CAPABILITY = "participant_decision" as const;

export type ParticipantDecisionRefusalCode =
    | "child_identity_required"
    | "child_identity_ambiguous"
    | "decision_not_configured"
    | "decision_unavailable"
    | "participant_not_found"
    | "inputs_invalid"
    | "transition_refused"
    | "write_count_violation"
    | "execution_failed";

/**
 * The refresh contract. Every result names the family AND the child it was about, so a surface
 * refreshes the two things that actually changed instead of relying on a whole-drawer reload
 * happening to cover it.
 */
export type ParticipantDecisionAffected = {
    opportunity_id: string;
    customer_member_id: string;
    /** Null only when the participant genuinely has no enrollment instance (a refusal case). */
    process_instance_id: string | null;
};

export type ExecuteParticipantDecisionResult =
    | {
          ok: true;
          /** False when the child was already exactly where this decision puts them. */
          changed: boolean;
          decision_key: string;
          affected: ParticipantDecisionAffected;
          /** Declared out-of-boundary effects that did not run. Surfaced, never swallowed. */
          degraded: string[];
          correlation_id: string;
          transaction?: PlatformTransactionResult<undefined>;
      }
    | {
          ok: false;
          code: ParticipantDecisionRefusalCode;
          message: string;
          decision_key: string;
          affected?: ParticipantDecisionAffected;
          input_issues?: ParticipantDecisionInputIssue[];
          write_error?: ParticipantWriteCountFailure;
          /** True only when durable state may have changed and rollback did not prove otherwise. */
          changed?: boolean;
          integrity_breach?: PlatformTransactionResult<undefined>["integrity_breach"];
          correlation_id?: string;
          transaction?: PlatformTransactionResult<undefined>;
      };

export type ExecuteParticipantDecisionInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    /** The stage whose work template carries the decision — used for work reconciliation context. */
    stageKey: string;
    plan: StageOperatingPlanV1;
    /** Work template that owns the participant decisions. */
    templateKey: string;
    decisionKey: string;
    opportunityId: string;
    /** The child, explicitly. At least one component must name a child. */
    childIdentity: {
        customer_member_id?: string | null;
        process_instance_id?: string | null;
        opportunity_customer_member_id?: string | null;
    };
    /** Operator-facing participant name for refusal copy. Presentation only. */
    participantLabel?: string | null;
    inputValues?: Record<string, unknown> | null;
    correlationId?: string | null;
    onTrace?: (trace: PlatformTransactionTrace) => void;
};

function findDecision(
    plan: StageOperatingPlanV1,
    templateKey: string,
    decisionKey: string,
): StageWorkParticipantDecisionV1 | null {
    const template = plan.work_templates.find((t) => t.template_key === templateKey.trim());
    if (!template) return null;
    return (
        template.participant_decisions?.find((d) => d.decision_key === decisionKey.trim()) ?? null
    );
}

/**
 * Resolve the ONE child this decision is about.
 *
 * "Exactly one" is enforced on the identity, not on a list: the wire carries a single participation
 * tuple, so there is no collection here that could be iterated. What must still be checked is that
 * the tuple actually names a child (a family id alone does not) and that the durable subject id is
 * recoverable — the executor needs `customer_members.id` to scope its writes, and a caller who sent
 * only a process-instance id has named a child this function cannot turn into a write scope.
 */
async function resolveSingleChild(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    identity: ChildParticipationIdentity,
): Promise<
    | { ok: true; customerMemberId: string }
    | { ok: false; code: "child_identity_required" | "child_identity_ambiguous"; message: string }
> {
    if (!namesAChild(identity)) {
        return {
            ok: false,
            code: "child_identity_required",
            message: "Choose which child this applies to.",
        };
    }
    if (identity.subjectId) return { ok: true, customerMemberId: identity.subjectId };

    // No subject id. The remaining components identify a participation but not a durable child, and
    // this module refuses to guess one — resolving a child from "whatever id was nearby" is exactly
    // the class of bug the identity tuple exists to prevent.
    void supabase;
    void orgId;
    void opportunityId;
    return {
        ok: false,
        code: "child_identity_ambiguous",
        message:
            "This child could not be identified precisely enough to record a decision. "
            + "Reopen the record and try again.",
    };
}

export async function executeParticipantDecisionForChild(
    input: ExecuteParticipantDecisionInput,
): Promise<ExecuteParticipantDecisionResult> {
    const decisionKey = input.decisionKey.trim();
    const opportunityId = input.opportunityId.trim();

    const decision = findDecision(input.plan, input.templateKey, decisionKey);
    if (!decision) {
        return {
            ok: false,
            code: "decision_not_configured",
            decision_key: decisionKey,
            message: "That option is no longer configured for this step.",
        };
    }
    if (decision.available === false) {
        return {
            ok: false,
            code: "decision_unavailable",
            decision_key: decisionKey,
            message: "That option is not currently available.",
        };
    }

    const identity = childParticipationIdentityFromWire({
        ...input.childIdentity,
        opportunity_id: opportunityId,
    });
    const child = await resolveSingleChild(input.supabase, input.orgId, opportunityId, identity);
    if (!child.ok) {
        return { ok: false, code: child.code, decision_key: decisionKey, message: child.message };
    }
    const customerMemberId = child.customerMemberId;

    // Inputs are validated and bound BEFORE the transaction opens. A missing close reason is a
    // configuration-and-operator matter, not a rollback.
    const bound = applyParticipantDecisionInputs({
        decision,
        values: input.inputValues,
    });
    if (!bound.ok) {
        return {
            ok: false,
            code: "inputs_invalid",
            decision_key: decisionKey,
            message: bound.issues[0]?.message ?? "Some required details are missing.",
            input_issues: bound.issues,
        };
    }

    /*
     * "No journey" and "more than one journey" are different refusals and must not collapse.
     *
     * The identification helper answers `null` for both, which would report a child with a
     * DUPLICATE enrollment track as having none — the operator would go looking for a missing track
     * while the real defect is two of them. The scope resolver distinguishes the two, so ambiguity
     * is reported as the integrity failure it is, before anything is written.
     */
    const journey = await resolveEnrollmentInstanceIdForScope(input.supabase, {
        orgId: input.orgId,
        customerMemberId,
        opportunityId,
    });
    const processInstanceId = journey.id;
    const affected: ParticipantDecisionAffected = {
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        process_instance_id: processInstanceId,
    };
    if (journey.ambiguous) {
        const ambiguity = assertSingleParticipantWrite({
            moved: 2,
            operation: "enrollment path",
            participantLabel: input.participantLabel,
        });
        return {
            ok: false,
            code: "write_count_violation",
            decision_key: decisionKey,
            affected,
            message: ambiguity.ok ? "More than one enrollment track matched." : ambiguity.failure.message,
            write_error: ambiguity.ok ? undefined : ambiguity.failure,
        };
    }
    if (!processInstanceId) {
        // Caught here rather than at the write so the operator gets the real reason instead of a
        // zero-row write failure, and so nothing is attempted at all.
        return {
            ok: false,
            code: "participant_not_found",
            decision_key: decisionKey,
            affected,
            message:
                `${input.participantLabel?.trim() || "This child"} does not have an enrollment `
                + `track on this lead, so a path cannot be recorded for them.`,
        };
    }

    // The decision's one state target defines where the track lands; the parser guarantees it exists.
    const stateTarget = bound.targets.find((t) => t.kind === "update_child_enrollment_status")!;
    const targetState = stateTarget.disposition_key?.trim() ?? "";

    const currentState = await readEnrollmentInstanceState(input.supabase, {
        orgId: input.orgId,
        opportunityId,
        customerMemberId,
    });
    const transition = resolveChildTrackTransition({
        currentState,
        targetState,
        participantLabel: input.participantLabel,
    });
    if (!transition.allowed) {
        return {
            ok: false,
            code: "transition_refused",
            decision_key: decisionKey,
            affected,
            message: transition.message,
        };
    }

    const currentStage = await readEnrollmentInstanceStageKey(input.supabase, {
        orgId: input.orgId,
        opportunityId,
        customerMemberId,
    });

    /**
     * IDEMPOTENCE, decided per target rather than for the decision as a whole.
     *
     * Re-running the decision that already placed this child must not write twice — a second write
     * produces a second audit record and a fresh `stage_entered_at` for a position the child never
     * left. But a track can also be HALF there (state recorded, stage move failed on a previous
     * attempt), and treating the whole decision as a no-op would leave it stranded. So each target
     * is skipped only when that specific fact already holds, which makes a repeat both a no-op when
     * nothing is missing and a repair when something is.
     */
    const executable = bound.targets.filter((target) => {
        if (target.kind === "update_child_enrollment_status") return !transition.noop;
        if (target.kind === "move_to_stage") {
            const wanted =
                target.stage_key?.trim()
                ?? (target.transition_ref?.startsWith("move_to_stage:")
                    ? target.transition_ref.slice("move_to_stage:".length).trim()
                    : null);
            return !wanted || wanted !== currentStage;
        }
        return true;
    });

    if (!executable.length) {
        return {
            ok: true,
            changed: false,
            decision_key: decisionKey,
            affected,
            degraded: [],
            correlation_id: input.correlationId?.trim() || "",
        };
    }

    const subject: StageOutcomeExecutionSubject = {
        journey_segment: "child",
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        process_instance_id: processInstanceId,
        ...(identity.legacyOcmId ? { opportunity_customer_member_id: identity.legacyOcmId } : {}),
        ...(input.participantLabel?.trim() ? { participant_label: input.participantLabel.trim() } : {}),
    };

    const degraded: string[] = [];
    let writeError: ParticipantWriteCountFailure | undefined;
    const applied: Array<{ run: () => Promise<void> }> = [];

    const transaction = await runPlatformTransaction({
        capability: PARTICIPANT_DECISION_CAPABILITY,
        correlationId: input.correlationId ?? null,
        actorUserId: input.userId,
        subject: {
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
            process_instance_id: processInstanceId,
            decision_key: decisionKey,
            stage_key: input.stageKey,
        },
        // A double-submit of the same decision for the same child joins the running transaction
        // rather than executing a second time.
        idempotencyKey: `${input.orgId}:${processInstanceId}:${decisionKey}`,
        onTrace: input.onTrace,
        steps: (): PlatformTransactionStep[] => [
            {
                name: "apply_participant_targets",
                stage: "business_process",
                // The targets are several writes; if a later one throws, the earlier ones must
                // still be undone.
                compensateOnFailure: true,
                run: async () => {
                    for (const target of executable) {
                        const result = await applyStageOutcomeRuleTarget(input.supabase, {
                            orgId: input.orgId,
                            userId: input.userId,
                            departmentId: input.departmentId,
                            stageKey: input.stageKey,
                            plan: input.plan,
                            subject,
                            target,
                        });
                        // Record the inverse BEFORE inspecting the error: a write-count failure
                        // can arrive together with an undo for rows that were written.
                        if (result.undo) applied.push({ run: result.undo });
                        if (result.degraded) degraded.push(result.degraded);
                        if (result.error) {
                            if (result.participant_write_error) {
                                writeError = result.participant_write_error;
                            }
                            throw new Error(result.error);
                        }
                    }
                    return true;
                },
                compensate: async () => {
                    const failures: string[] = [];
                    for (let i = applied.length - 1; i >= 0; i -= 1) {
                        try {
                            await applied[i].run();
                        } catch (e) {
                            failures.push(e instanceof Error ? e.message : String(e));
                        }
                    }
                    if (failures.length) {
                        throw new Error(`participant decision not fully reverted — ${failures.join("; ")}`);
                    }
                },
            },
        ],
    });

    if (!transaction.ok) {
        return {
            ok: false,
            code: writeError ? "write_count_violation" : "execution_failed",
            decision_key: decisionKey,
            affected,
            message: transaction.message ?? "Could not record this decision.",
            write_error: writeError,
            changed: transaction.changed,
            integrity_breach: transaction.integrity_breach,
            correlation_id: transaction.correlation_id,
            transaction,
        };
    }

    return {
        ok: true,
        changed: true,
        decision_key: decisionKey,
        affected,
        degraded,
        correlation_id: transaction.correlation_id,
        transaction,
    };
}
