/**
 * Complete lifecycle stage work with a configured outcome.
 *
 * Runs on the Platform Transaction Contract. Recording an outcome used to CLOSE the work
 * item first and apply the configured rule targets afterwards, collecting errors and
 * continuing: a target failure returned an error to the operator while the work was already
 * closed and the stage had already moved. The operator was told the action failed and the
 * platform disagreed with them.
 *
 * Now the work-state write, the Business Process targets and the activity record are steps in
 * one transaction. Any in-boundary failure compensates back to the pre-click state, and a
 * compensation that cannot be applied is reported as an integrity breach rather than dressed
 * up as a clean abort.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { completeWorkInstance } from "@/lib/admin/operationalWork/operationalWorkService";
import {
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    executeStageOperatingOutcome,
    rollbackStageOperatingOutcome,
    type StageOutcomeExecutionResult,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/executeStageOperatingOutcome";
import {
    runPlatformTransaction,
    type PlatformTransactionResult,
    type PlatformTransactionStep,
    type PlatformTransactionTrace,
} from "@/lib/platform/transaction/platformTransaction";
import { patchLifecycleWorkIntentAttemptMetadata } from "@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata";
import { outcomeRulesForKey, resolveStageOperatingPlanForStage } from "@/lib/lifecycle/stageOperatingPlanV1";
import { planStageOutcomeExecution } from "@/lib/lifecycle/planStageOutcomeExecution";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";
import { shouldRepeatWorkAfterRetryOutcome } from "@/lib/lifecycle/stageWorkCompletionPolicy";
import { reopenStageWorkWithDueDate } from "@/lib/lifecycle/reopenStageWorkWithDueDate";
import { recordStageWorkContactOutcomeTrace } from "@/lib/lifecycle/recordStageWorkContactOutcomeTrace";
import { preflightStageChangingOutcomeReadiness } from "@/lib/lifecycle/preflightStageChangingOutcomeReadiness";
import {
    childParticipationIdentityFromWire,
    namesAChild,
} from "@/lib/lifecycle/childParticipationIdentity";
import { resolveJourneySegment } from "@/lib/lifecycle/grainVocabulary";
import { deriveParticipantDecisionProgress } from "@/lib/lifecycle/projectParticipantDecisionRows";
import { readEnrollmentInstancesForLead } from "@/lib/process/processInstances";

/**
 * Execution provenance for a discharged Current Work requirement. Distinguishes an
 * objective platform result (integrated) from an operator-reported external contact
 * (external_manual). Provenance is an attribute of the fact — never a new fact kind.
 */
export type StageWorkOutcomeDeclarationV1 = {
    provenance: "integrated" | "external_manual";
    /** Channel the contact used — e.g. "sms", "email", "phone", "in_person", "external_email". */
    channel?: string | null;
    /** Optional human-only context; never overwrites objective delivery state. */
    note?: string | null;
};

export type CompleteStageWorkWithOutcomeInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    departmentId: string;
    stageKey: string;
    workId: string;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
    /** Execution provenance + optional human context. Distinguishes integrated vs external. */
    declaration?: StageWorkOutcomeDeclarationV1;
    /** Propagated end-to-end so the click, the writes and the trace share one id. */
    correlationId?: string | null;
    /** Suppresses duplicate execution from a double-submit of the same outcome. */
    idempotencyKey?: string | null;
    onTrace?: (trace: PlatformTransactionTrace) => void;
};

export type CompleteStageWorkWithOutcomeResult = {
    ok: boolean;
    error?: string;
    work_closed?: boolean;
    attempt_count?: number;
    outcome_execution?: StageOutcomeExecutionResult;
    /** Full transaction result — outcome, per-step trace, timing, correlation id. */
    transaction?: PlatformTransactionResult<undefined>;
    /**
     * `false` only when rollback is proven complete. When a compensation fails this stays
     * true and `integrity_breach` explains what may still be committed.
     */
    changed?: boolean;
    integrity_breach?: PlatformTransactionResult<undefined>["integrity_breach"];
    correlation_id?: string;
};

/** Capability key — the same string the configured action registry uses. */
export const RECORD_OUTCOME_CAPABILITY = "record_outcome" as const;

type WorkRowSnapshot = { status: unknown; due_at: unknown; metadata: unknown } | null;

type WorkStateResult = { work_closed: boolean; attempt_count?: number };

export async function completeStageWorkWithOutcome(
    input: CompleteStageWorkWithOutcomeInput,
): Promise<CompleteStageWorkWithOutcomeResult> {
    const stageKey = input.stageKey.trim();
    const outcomeKey = input.outcomeKey.trim();

    // Configuration resolution. These are reads: they decide whether the capability may run at
    // all, and produce the plan the steps below execute. Nothing here writes.
    const resolved = await resolveOutcomeExecutionPlan(input, stageKey, outcomeKey);

    // Values produced by earlier steps and needed by later ones / by the caller's result.
    let workSnapshot: WorkRowSnapshot = null;
    let workState: WorkStateResult = { work_closed: false };
    let outcome_execution: StageOutcomeExecutionResult | undefined;
    let provenanceSnapshot: Record<string, unknown> | null = null;

    const transaction = await runPlatformTransaction({
        capability: RECORD_OUTCOME_CAPABILITY,
        correlationId: input.correlationId ?? null,
        actorUserId: input.userId,
        subject: {
            opportunity_id: input.subject.opportunity_id,
            work_id: input.workId,
            stage_key: stageKey,
            outcome_key: outcomeKey,
        },
        idempotencyKey: input.idempotencyKey ?? null,
        onTrace: input.onTrace,
        validate: async () => {
            if (!resolved.ok) return { ok: false, message: resolved.message };
            const participantGate = await preflightParticipantResolutionGate(input, resolved);
            if (!participantGate.ok) return participantGate;
            const readiness = await preflightStageChangingOutcomeReadiness({
                supabase: input.supabase,
                orgId: input.orgId,
                plan: resolved.plan,
                outcomeKey,
                subject: input.subject,
                departmentMetadata: resolved.departmentMetadata,
            });
            if (readiness.blocked) {
                return {
                    ok: false,
                    message: readiness.message ?? "Cannot move stage — requirements are incomplete.",
                };
            }
            return { ok: true };
        },
        steps: () => {
            if (!resolved.ok) return [];
            const { plan, outcome, closeDecision, departmentMetadata } = resolved;
            const steps: PlatformTransactionStep[] = [];

            // ── persist ──────────────────────────────────────────────────────────────
            // One step owns the work row so one snapshot restores it: close, or record the
            // attempt and (per configured retry policy) reopen with a new due date.
            steps.push({
                name: "work_state",
                stage: "persist",
                // The attempt patch and the retry reopen are two writes on one row; if the
                // second throws, the first must still be undone.
                compensateOnFailure: true,
                run: async (): Promise<WorkStateResult> => {
                    workSnapshot = await readWorkRowSnapshot(input);

                    if (closeDecision.shouldClose) {
                        const completed = await completeWorkInstance({
                            supabase: input.supabase,
                            orgId: input.orgId,
                            workId: input.workId,
                        });
                        if (!completed.ok) throw new Error(completed.message ?? completed.error);
                        workState = { work_closed: true };
                        return workState;
                    }

                    const patched = await patchLifecycleWorkIntentAttemptMetadata({
                        supabase: input.supabase,
                        orgId: input.orgId,
                        workId: input.workId,
                        outcomeKey,
                        outcomeLabel: outcome.label,
                    });
                    if (!patched.ok) throw new Error(patched.error);

                    const attempt_count = patched.attempt_count;
                    if (attempt_count != null) {
                        const templateKey = outcome.work_template_key?.trim() ?? null;
                        const workTemplate =
                            templateKey ?
                                plan.work_templates.find((t) => t.template_key === templateKey) ?? null
                            :   plan.work_templates[0] ?? null;
                        const repeat = shouldRepeatWorkAfterRetryOutcome(workTemplate, attempt_count);
                        if (repeat.repeat && repeat.dueDays != null) {
                            const reopened = await reopenStageWorkWithDueDate({
                                supabase: input.supabase,
                                orgId: input.orgId,
                                workId: input.workId,
                                dueDays: repeat.dueDays,
                            });
                            if (!reopened.ok) throw new Error(reopened.error);
                        }
                    }
                    workState = { work_closed: false, attempt_count };
                    return workState;
                },
                compensate: async () => {
                    await restoreWorkRowSnapshot(input, workSnapshot);
                    workState = { work_closed: false };
                },
            });

            // ── business process ─────────────────────────────────────────────────────
            steps.push({
                name: "apply_outcome_rules",
                stage: "business_process",
                compensateOnFailure: true,
                run: async () => {
                    outcome_execution = await executeStageOperatingOutcome({
                        supabase: input.supabase,
                        orgId: input.orgId,
                        userId: input.userId,
                        departmentId: input.departmentId,
                        plan,
                        outcomeKey,
                        subject: { ...input.subject, work_id: input.workId },
                        attemptCount: workState.attempt_count ?? null,
                    });
                    if (outcome_execution.errors.length) {
                        throw new Error(outcome_execution.errors.join("; "));
                    }
                    return outcome_execution;
                },
                compensate: async () => {
                    // Undo the targets that DID apply — including the ones that applied before
                    // a later target in the same batch failed.
                    if (!outcome_execution) return;
                    const failures = await rollbackStageOperatingOutcome(outcome_execution);
                    if (failures.length) {
                        throw new Error(`rule targets not fully reverted — ${failures.join("; ")}`);
                    }
                },
            });

            // ── activity ─────────────────────────────────────────────────────────────
            // Execution provenance — stamped on the discharged work regardless of trace
            // gating, so integrated vs external results remain distinguishable on the fact.
            if (input.declaration) {
                steps.push({
                    name: "execution_provenance",
                    stage: "activity",
                    run: async () => {
                        const { data: task } = await input.supabase
                            .from("operational_tasks")
                            .select("metadata")
                            .eq("id", input.workId)
                            .eq("org_id", input.orgId)
                            .maybeSingle();
                        const existing =
                            task?.metadata != null
                            && typeof task.metadata === "object"
                            && !Array.isArray(task.metadata)
                                ? (task.metadata as Record<string, unknown>)
                                : {};
                        provenanceSnapshot = { ...existing };
                        const taskMd = { ...existing };
                        taskMd.last_contact_provenance = input.declaration!.provenance;
                        if (input.declaration!.channel) taskMd.last_contact_channel = input.declaration!.channel;
                        const { error } = await input.supabase
                            .from("operational_tasks")
                            .update({ metadata: taskMd })
                            .eq("id", input.workId)
                            .eq("org_id", input.orgId);
                        // Previously unchecked — a dropped provenance stamp made an external
                        // contact indistinguishable from an integrated one.
                        if (error) throw new Error(`execution provenance: ${error.message}`);
                        return true;
                    },
                    compensate: async () => {
                        if (!provenanceSnapshot) return;
                        const { error } = await input.supabase
                            .from("operational_tasks")
                            .update({ metadata: provenanceSnapshot })
                            .eq("id", input.workId)
                            .eq("org_id", input.orgId);
                        if (error) throw new Error(`restore execution provenance: ${error.message}`);
                    },
                });
            }

            const workTemplateKey =
                outcome.work_template_key?.trim() ?? plan.work_templates[0]?.template_key ?? "";
            if (workTemplateKey) {
                steps.push({
                    name: "contact_outcome_trace",
                    stage: "activity",
                    run: async (ctx) => {
                        const traced = await recordStageWorkContactOutcomeTrace({
                            supabase: input.supabase,
                            orgId: input.orgId,
                            userId: input.userId,
                            opportunityId: input.subject.opportunity_id,
                            stageKey,
                            workId: input.workId,
                            workTemplateKey,
                            outcomeKey,
                            outcomeLabel: outcome.label,
                            plan,
                            departmentMetadata,
                            declaration: input.declaration,
                            // One id across click → transaction → database → activity.
                            correlationId: ctx.correlationId,
                        });
                        // Previously the return was discarded, so an outcome could be recorded
                        // with no activity trace and the operator would never know.
                        if (traced.error) throw new Error(`contact outcome trace: ${traced.error}`);
                        return traced;
                    },
                });
            }

            return steps;
        },
    });

    if (!transaction.ok) {
        return {
            ok: false,
            error: transaction.message,
            // Reported from the post-rollback state, not from what was attempted.
            work_closed: transaction.changed ? workState.work_closed : false,
            attempt_count: transaction.changed ? workState.attempt_count : undefined,
            outcome_execution,
            transaction,
            changed: transaction.changed,
            integrity_breach: transaction.integrity_breach,
            correlation_id: transaction.correlation_id,
        };
    }

    return {
        ok: true,
        work_closed: workState.work_closed,
        attempt_count: workState.attempt_count,
        outcome_execution,
        transaction,
        changed: true,
        correlation_id: transaction.correlation_id,
    };
}

/**
 * THE FAMILY WORK DOES NOT CLOSE ON THE FIRST CHILD.
 *
 * A work template that carries per-participant decisions is one operational task shared by several
 * children. Recording the family's completing outcome closes that task — and with it the only
 * surface the remaining children's decisions are rendered on. So when configuration declares
 * `requires_all_participants_resolved`, the completing outcome is refused until every participant
 * has a path.
 *
 * Runs in `validate`, so a refusal happens before the work row is touched: the operator is told
 * why, and nothing was written and rolled back to tell them.
 *
 * Reads through `readEnrollmentInstancesForLead`, the FAIL-CLOSED reader. Its lenient sibling
 * answers a failed query with `[]`, which this gate would read as "no participants" — and
 * `all_resolved` is false for zero participants, so the gate would block rather than let a close
 * through. That is the safe direction, but "the database is unreachable" and "this family has no
 * children" deserve different messages, and only the strict reader can tell them apart.
 */
async function preflightParticipantResolutionGate(
    input: CompleteStageWorkWithOutcomeInput,
    resolved: Extract<ResolvedOutcomePlan, { ok: true }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
    const { plan, outcome, closeDecision } = resolved;
    if (!closeDecision.shouldClose) return { ok: true };

    const templateKey = outcome.work_template_key?.trim() ?? null;
    const template =
        templateKey ?
            plan.work_templates.find((t) => t.template_key === templateKey) ?? null
        :   plan.work_templates[0] ?? null;
    if (!template?.completion_policy?.requires_all_participants_resolved) return { ok: true };

    const decisions = template.participant_decisions ?? [];
    if (!decisions.length) return { ok: true };

    const read = await readEnrollmentInstancesForLead(input.supabase, {
        orgId: input.orgId,
        opportunityId: input.subject.opportunity_id,
    });
    if (!read.ok) {
        return {
            ok: false,
            message:
                "Could not confirm every child's path before completing this step. "
                + "Try again in a moment.",
        };
    }

    const progress = deriveParticipantDecisionProgress({
        participants: read.rows.map((row) => ({ state: row.state?.trim() ?? null })),
        decisions,
    });
    if (progress.all_resolved) return { ok: true };

    return {
        ok: false,
        message:
            progress.total === 0 ?
                `"${template.label}" cannot be completed until each child has a path, and this lead `
                + `has no children on it yet.`
            :   `"${template.label}" cannot be completed yet — ${progress.summary.toLowerCase()}. `
                + `Choose a path for each child first.`,
    };
}

type ResolvedOutcomePlan =
    | {
          ok: true;
          plan: NonNullable<ReturnType<typeof resolveStageOperatingPlanForStage>>;
          outcome: NonNullable<
              NonNullable<ReturnType<typeof resolveStageOperatingPlanForStage>>["outcomes"][number]
          >;
          closeDecision: ReturnType<typeof shouldCloseWorkAfterStageOutcome>;
          departmentMetadata: Record<string, unknown>;
      }
    | { ok: false; message: string };

async function resolveOutcomeExecutionPlan(
    input: CompleteStageWorkWithOutcomeInput,
    stageKey: string,
    outcomeKey: string,
): Promise<ResolvedOutcomePlan> {
    if (!stageKey || !outcomeKey) {
        return { ok: false, message: "stageKey and outcomeKey are required" };
    }

    const { data: dept, error: deptErr } = await input.supabase
        .from("departments")
        .select("metadata")
        .eq("id", input.departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, message: deptErr.message };
    if (!dept) return { ok: false, message: "Department not found" };

    const departmentMetadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageRecord = process?.stages.find((s) => s.key === stageKey && s.is_active) ?? null;
    const plan = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
    if (!plan) return { ok: false, message: "No operating plan for stage" };

    const outcome = plan.outcomes.find((o) => o.outcome_key === outcomeKey);
    if (!outcome) return { ok: false, message: "Unknown outcome for stage" };

    // WHICH GRAIN THIS OUTCOME RUNS AT — reconciled across the two places it is declared, not read
    // from the plan alone. The guard below reads the segment, so a stage configured `grain: "child"`
    // whose plan still said `family` never reached it: no child subject was demanded and the outcome
    // executed against the family case. The guard existed and was correct; it simply never fired.
    const segment = resolveJourneySegment({
        planSegment: plan.journey_segment,
        stageGrain: stageRecord?.grain,
    });
    if (!segment.ok) return { ok: false, message: segment.reason };

    // Child-grain plans must carry a child subject — never silently execute as family/case.
    if (segment.segment === "child") {
        const hasChild = namesAChild(childParticipationIdentityFromWire(input.subject));
        if (!hasChild) {
            return {
                ok: false,
                message: "Child enrollment subject required for this stage outcome",
            };
        }
        if (input.subject.journey_segment !== "child") {
            return {
                ok: false,
                message: "Child-grain outcome cannot run with family/case subject grain",
            };
        }
    }

    /**
     * PREFLIGHT THE WHOLE EFFECT SEQUENCE (Law 6).
     *
     * Transition references used to be resolved inside `executeStageOperatingOutcome`, which runs
     * in the `business_process` step — AFTER the `work_state` step has already closed the work
     * item. So a pure configuration error (an outcome naming a transition the stage does not
     * declare) closed and then compensated a work row for no reason, and the operator saw a
     * transaction that touched durable state before discovering it could not proceed.
     *
     * Resolving here means an unresolvable graph never reaches `validate`, so nothing is written
     * at all. This is the same plan phase the automation path uses.
     *
     * ORDERING (promotion resolution): the grain reconciliation above is staging's and runs FIRST.
     * Both guards return before any write, so neither can corrupt state, but failing on subject
     * identity before configuration shape gives the operator the more fundamental reason. The two
     * checks are independent — grain decides WHAT the outcome acts on, this decides whether the
     * transition graph resolves at all — so both are kept.
     */
    const executionPlan = planStageOutcomeExecution(
        outcomeRulesForKey(plan, outcomeKey).map((rule) => ({ stageKey, plan, rule })),
    );
    if (executionPlan.errors.length) {
        return {
            ok: false,
            message: `This outcome cannot run: ${executionPlan.errors.join("; ")}`,
        };
    }

    return {
        ok: true,
        plan,
        outcome,
        closeDecision: shouldCloseWorkAfterStageOutcome(plan, outcomeKey),
        departmentMetadata,
    };
}

/** Mutable work-row fields captured before the persist step, so it has an exact inverse. */
async function readWorkRowSnapshot(input: CompleteStageWorkWithOutcomeInput): Promise<WorkRowSnapshot> {
    const { data } = await input.supabase
        .from("operational_tasks")
        .select("status, due_at, metadata")
        .eq("id", input.workId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    return (data as WorkRowSnapshot) ?? null;
}

async function restoreWorkRowSnapshot(
    input: CompleteStageWorkWithOutcomeInput,
    snapshot: WorkRowSnapshot,
): Promise<void> {
    if (!snapshot) return;
    const { error } = await input.supabase
        .from("operational_tasks")
        .update({
            status: snapshot.status,
            due_at: snapshot.due_at,
            metadata: snapshot.metadata,
            updated_at: new Date().toISOString(),
        })
        .eq("id", input.workId)
        .eq("org_id", input.orgId);
    if (error) throw new Error(`restore work item: ${error.message}`);
}
