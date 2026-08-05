/**
 * Generic executor for stage_operating_plan_v1 outcome rule targets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import {
    mergeEnrollmentOperationalIntoMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import type { StageOperatingPlanV1, StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { reopenStageWorkWithDueDate } from "@/lib/lifecycle/reopenStageWorkWithDueDate";
import { isConfiguredClosedStatus } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { readEnrollmentInstancesForLead } from "@/lib/process/processInstances";
import {
    describeFamilyCloseBlock,
    evaluateFamilyCloseGuard,
    type FamilyCloseBlockedReason,
} from "@/lib/lifecycle/familyCloseGuard";
import { reconcileBusinessProcessWorkAcrossStageMove } from "@/lib/lifecycle/reconcileBusinessProcessWorkAcrossStageMove";
import {
    moveEnrollmentInstanceStageByScope,
    setEnrollmentInstanceStateByScope,
    readEnrollmentInstanceState,
    readEnrollmentInstanceStageKey,
    PROCESS_INSTANCES_TABLE,
    type EnrollmentProcessState,
} from "@/lib/process/processInstances";
import { assertStageConfigured, loadConfiguredStageInventory } from "@/lib/lifecycle/configuredStageInventory";
import {
    assertStageMoveGrainCompatible,
    resolveStageGrain,
    type StageMoveGrainError,
} from "@/lib/lifecycle/stageGrainResolution";
import { ensurePlacementCandidateForWaitlistedChildBySubject } from "@/lib/orchestration/placement/placementCandidateLifecycleHook";
import { emitChildLifecycleStatusChangedEvent } from "@/lib/opportunities/emitChildLifecycleStatusChangedEvent";
// BOUNDARY (platform↔childcare): the generic outcome runtime touches the childcare domain only here,
// inside the enrolled disposition, gated by the childcare feature flag. Target decoupling is a childcare
// event subscriber on child_lifecycle_status_changed (deferred — see docs/sprints/archive/07_2026/
// process_instance_enrollment_materialization.md "Boundary: the one platform↔childcare seam").
import { materializeEnrollmentForChildScope } from "@/lib/childcareOperational/materializeEnrollmentFromProcessInstance";
import { isChildcareOperationalEnrollmentV1EnabledForOrg } from "@/lib/childcareOperational/featureFlag";
import { stampEnrollmentDateOnProcessInstances } from "@/lib/enrollment/stampEnrollmentDateOnProcessInstances";

export type StageOutcomeExecutionSubject = {
    journey_segment: "family" | "child";
    opportunity_id: string;
    /** Child subject = customer_members.id. Threaded so movement targets the process instance directly. */
    customer_member_id?: string | null;
    /** Optional direct process-instance id (most specific child identity). */
    process_instance_id?: string | null;
    /** Legacy OCM id (temporary bridge; only used to resolve the child when customer_member_id is absent). */
    opportunity_customer_member_id?: string | null;
    placement_candidate_id?: string | null;
    /** Open lifecycle work task for repeat/reopen automations. */
    work_id?: string | null;
};

/**
 * Resolve the child subject (customer_members.id) that a child movement targets. Prefers the
 * identity threaded on the subject (customer_member_id) — NO OCM read. Falls back to an OCM lookup
 * ONLY for legacy callers that still carry just the OCM id; that fallback is removed with OCM.
 */
async function resolveChildSubjectId(
    supabase: SupabaseClient,
    orgId: string,
    subject: StageOutcomeExecutionSubject,
): Promise<string | null> {
    const direct = subject.customer_member_id?.trim();
    if (direct) return direct;
    const ocmId = subject.opportunity_customer_member_id?.trim();
    if (!ocmId) return null;
    // Legacy bridge read: old task/queue payloads carried only the OCM id. Temporary — removed with OCM.
    const { data } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id")
        .eq("id", ocmId)
        .eq("org_id", orgId)
        .maybeSingle();
    const id = (data as { customer_member_id?: string } | null)?.customer_member_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Does this family case status close the case?
 *
 * Uses the SHARED closed-status predicate rather than a local `=== "closed"`, so the guard agrees
 * with Organization → Statuses and the Business Process editor by construction.
 *
 * Deliberately pure. An earlier version read the org's status catalog first, which was more
 * configurable in theory and wrong in practice: it pulled `createAdminClient` onto a code path
 * that outcome execution reaches with an injected client, and it charged every family status write
 * — including the `open` ones — an extra query to answer a question the canonical case domain
 * already settles. `opportunities.status_key` is `open | closed` by migration doctrine, which is
 * exactly the key-level resolution this predicate applies for the opportunity grain.
 */
function familyCaseStatusCloses(statusKey: string): boolean {
    return isConfiguredClosedStatus({
        status_key: statusKey,
        status_label: statusKey,
        entity_type: "opportunities",
        is_active: true,
        metadata: null,
    });
}

export type ApplyStageOutcomeRuleTargetResult = {
    error?: string;
    /** Why a guarded target refused, structured for a command preview to translate. */
    blocked_reasons?: FamilyCloseBlockedReason[];
    /** Why a stage move was refused on grain grounds — structured for the same reason. */
    stage_grain_error?: StageMoveGrainError;
    needs_attention?: boolean;
    status_updated?: boolean;
    /**
     * Inverse of this target's durable write, for the Platform Transaction Contract's
     * compensation pass. Present only when the write SUCCEEDED and can be undone; a target
     * that writes nothing durable returns none.
     */
    undo?: () => Promise<void>;
    /**
     * A declared out-of-boundary effect that did not run. Reported so the operator learns
     * about it — the alternative (an empty catch) is what made results untrustworthy.
     */
    degraded?: string;
};

export async function applyStageOutcomeRuleTarget(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        userId: string;
        departmentId: string;
        stageKey: string;
        plan: StageOperatingPlanV1;
        subject: StageOutcomeExecutionSubject;
        target: StageOutcomeRuleTargetV1;
    },
): Promise<ApplyStageOutcomeRuleTargetResult> {
    const { orgId, userId, subject, target, plan, stageKey, departmentId } = params;

    switch (target.kind) {
        case "no_movement":
        case "mark_stage_work_complete":
            return {};

        case "stamp_enrollment_date": {
            // Tenant-configured paperwork-completion outcome stamps Enrollment Date on
            // enrollment process_instance(s). Child subject → one instance; family subject → all
            // children on the lead. Refuses silent overwrite (mergeEnrollmentDateOntoProcessMetadata).
            const childId = await resolveChildSubjectId(supabase, orgId, subject);
            const stampResult = await stampEnrollmentDateOnProcessInstances(supabase, {
                orgId,
                opportunityId: subject.opportunity_id,
                customerMemberId: childId,
                processInstanceId: subject.process_instance_id ?? null,
                source: "paperwork_completion_outcome",
                actorUserId: userId,
            });
            if (stampResult.error) return { error: stampResult.error };
            const wroteRows = stampResult.stamped.filter((r) => r.wrote && r.priorMetadata);
            if (!wroteRows.length) return {};
            return {
                undo: async () => {
                    for (const row of wroteRows) {
                        const { error: undoErr } = await supabase
                            .from(PROCESS_INSTANCES_TABLE)
                            .update({
                                metadata: row.priorMetadata,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", row.processInstanceId)
                            .eq("org_id", orgId);
                        if (undoErr) {
                            throw new Error(
                                `restore enrollment date on ${row.processInstanceId}: ${undoErr.message}`,
                            );
                        }
                    }
                },
            };
        }

        case "update_family_case_status": {
            const statusKey = target.status_key?.trim();
            if (!statusKey) return { error: "Missing family case status key" };
            const closeReasonKey = target.close_reason_key?.trim();

            /**
             * A family case cannot close out from under its children.
             *
             * The guard lives HERE, on the target executor, rather than on the `close_lead`
             * command or its placement, because this is the invariant-owning path: outcome rules,
             * status-entry automation and domain-signal automation all resolve to this executor.
             * Guarding a command would leave every configured rule free to close a family with a
             * waitlisted or enrolled child still riding on it.
             *
             * Only closes are guarded. A write that leaves the case open is untouched, so
             * `reached_qualified` (status `open`) never pays for this.
             */
            if (familyCaseStatusCloses(statusKey)) {
                const read = await readEnrollmentInstancesForLead(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                });
                const decision = evaluateFamilyCloseGuard(read);
                if (!decision.allowed) {
                    // Nothing has been written, so there is nothing to compensate — the
                    // surrounding transaction aborts clean. The structured reasons travel out for
                    // the command layer to turn into operator language and a named preview.
                    return {
                        error:
                            "This lead cannot be closed while child enrollment tracks are still active ("
                            + describeFamilyCloseBlock(decision)
                            + ").",
                        blocked_reasons: decision.reasons,
                    };
                }
            }

            // Read the prior value BEFORE the write so the transaction has an inverse.
            const { data: priorStatus } = await supabase
                .from("opportunities")
                .select("status_key, close_reason_key")
                .eq("id", subject.opportunity_id)
                .eq("org_id", orgId)
                .maybeSingle();
            const res = await updateOpportunityStatusWithEvent({
                supabase,
                orgId,
                opportunityId: subject.opportunity_id,
                newStatusKey: statusKey,
                actorUserId: userId,
                normalizeContext: "stage_operating_plan_outcome",
                // Persist close reason alongside the durable status (S4 collapse).
                ...(closeReasonKey ? { additionalPatch: { close_reason_key: closeReasonKey } } : {}),
                eventMetadata: { source: "stage_operating_plan_v1", stage_key: stageKey },
            });
            if (res.error) return { error: res.error.message };
            return {
                status_updated: true,
                undo:
                    priorStatus ?
                        async () => {
                            // Direct restore, not a second status EVENT: the transaction is being
                            // unwound, so the forward transition never truthfully happened.
                            const { error } = await supabase
                                .from("opportunities")
                                .update({
                                    status_key: (priorStatus as { status_key?: string | null }).status_key ?? null,
                                    close_reason_key:
                                        (priorStatus as { close_reason_key?: string | null }).close_reason_key ?? null,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("id", subject.opportunity_id)
                                .eq("org_id", orgId);
                            if (error) throw new Error(`restore family case status: ${error.message}`);
                        }
                    :   undefined,
            };
        }

        case "update_child_enrollment_status": {
            const dispositionKey = target.disposition_key?.trim();
            if (!dispositionKey) return { error: "Child enrollment disposition required" };
            // Resolve the child from the threaded identity (no OCM read on the primary path).
            const childId = await resolveChildSubjectId(supabase, orgId, subject);
            if (!childId) return { error: "Could not resolve child for enrollment state update" };
            // Prior state (from process_instances, not OCM) for the transition event.
            const prevState = await readEnrollmentInstanceState(supabase, {
                orgId,
                opportunityId: subject.opportunity_id,
                customerMemberId: childId,
            });
            // Authoritative writer: the child's process instance owns durable state + close reason.
            // The OCM durable enrollment-status column is NOT written — process_instances is the
            // single source of truth for child participation state.
            const closeReasonKey = target.close_reason_key?.trim() || undefined;
            const pi = await setEnrollmentInstanceStateByScope(supabase, {
                orgId,
                opportunityId: subject.opportunity_id,
                customerMemberId: childId,
                state: dispositionKey as EnrollmentProcessState,
                closeReasonKey,
            });
            if (pi.error) return { error: pi.error };

            const degradedEffects: string[] = [];
            const undoChildState = async () => {
                const restored = await setEnrollmentInstanceStateByScope(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                    customerMemberId: childId,
                    state: (prevState ?? null) as EnrollmentProcessState,
                });
                if (restored.error) throw new Error(`restore child enrollment state: ${restored.error}`);
            };

            const ocmBridgeId = subject.opportunity_customer_member_id?.trim() ?? null;
            // Child lifecycle event emitted from the process-instance transition (restored). While the
            // OCM bridge exists the event stays keyed on the OCM id so existing workflow subscriptions
            // (entity_type=opportunity_customer_members) keep firing; it re-keys to process_instances
            // when OCM is dropped.
            if (ocmBridgeId && prevState !== dispositionKey) {
                try {
                    await emitChildLifecycleStatusChangedEvent({
                        supabase,
                        orgId,
                        opportunityId: subject.opportunity_id,
                        opportunityCustomerMemberId: ocmBridgeId,
                        previousStatusKey: prevState,
                        nextStatusKey: dispositionKey,
                        actorUserId: userId,
                        source: "stage_operating_plan_v1",
                        rowGrain: "child",
                    });
                } catch (e) {
                    // Declared downstream effect: the state transition stands, but the operator
                    // is told the event did not fire rather than it being logged and forgotten.
                    console.error("[stageOutcomeRuleTargetExecutor] child lifecycle event", e);
                    degradedEffects.push(
                        `child lifecycle event not emitted: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }
            // Waitlist placement candidate — sourced from the child's process instance (no OCM required).
            if (dispositionKey === "waitlisted") {
                await ensurePlacementCandidateForWaitlistedChildBySubject(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                    customerMemberId: childId,
                });
            }
            // Enrollment completion → materialize durable operational truth (agreement + placement +
            // schedule assignment). The process produces the facts; it does not own them. Non-blocking
            // and idempotent — a failure here must not roll back the state transition (retryable).
            if (dispositionKey === "enrolled" && (await isChildcareOperationalEnrollmentV1EnabledForOrg(supabase, orgId))) {
                try {
                    await materializeEnrollmentForChildScope(supabase, {
                        orgId,
                        opportunityId: subject.opportunity_id,
                        customerMemberId: childId,
                        userId,
                    });
                } catch (e) {
                    console.error("[stageOutcomeRuleTargetExecutor] enrollment materialization", e);
                    degradedEffects.push(
                        `enrollment materialization did not run: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }
            return {
                status_updated: true,
                undo: undoChildState,
                degraded: degradedEffects.length ? degradedEffects.join("; ") : undefined,
            };
        }

        case "update_candidate_status": {
            const candidateId = subject.placement_candidate_id?.trim();
            const candidateStatus = target.candidate_status;
            if (!candidateId || !candidateStatus) {
                return { error: "Waitlist candidate required for candidate status update" };
            }
            const { data: priorCandidate } = await supabase
                .from("placement_candidates")
                .select("status")
                .eq("id", candidateId)
                .eq("org_id", orgId)
                .maybeSingle();
            const { error } = await supabase
                .from("placement_candidates")
                .update({ status: candidateStatus, updated_at: new Date().toISOString() })
                .eq("id", candidateId)
                .eq("org_id", orgId);
            if (error) return { error: error.message };
            return {
                status_updated: true,
                undo:
                    priorCandidate ?
                        async () => {
                            const { error: undoErr } = await supabase
                                .from("placement_candidates")
                                .update({
                                    status: (priorCandidate as { status?: string | null }).status ?? null,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("id", candidateId)
                                .eq("org_id", orgId);
                            if (undoErr) throw new Error(`restore candidate status: ${undoErr.message}`);
                        }
                    :   undefined,
            };
        }

        case "create_needs_attention": {
            const { data: opp, error: loadErr } = await supabase
                .from("opportunities")
                .select("id, metadata")
                .eq("id", subject.opportunity_id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (loadErr || !opp) return { error: loadErr?.message ?? "Opportunity not found" };

            const patch = sanitizeEnrollmentOperationalPatch({
                wait_bucket: target.wait_bucket ?? "waiting_on_staff",
                wait_reason: target.attention_reason ?? "Lifecycle stage attention rule",
                wait_since: new Date().toISOString(),
            });
            const metadata =
                opp.metadata != null && typeof opp.metadata === "object" && !Array.isArray(opp.metadata)
                    ? (opp.metadata as Record<string, unknown>)
                    : {};
            const merged = mergeEnrollmentOperationalIntoMetadata(metadata, patch ?? {});

            const { error: upErr } = await supabase
                .from("opportunities")
                .update({ metadata: merged, updated_at: new Date().toISOString() })
                .eq("id", subject.opportunity_id)
                .eq("org_id", orgId);
            if (upErr) return { error: upErr.message };
            return {
                needs_attention: true,
                undo: async () => {
                    // Restore the metadata document captured before the merge.
                    const { error: undoErr } = await supabase
                        .from("opportunities")
                        .update({ metadata, updated_at: new Date().toISOString() })
                        .eq("id", subject.opportunity_id)
                        .eq("org_id", orgId);
                    if (undoErr) throw new Error(`restore needs-attention metadata: ${undoErr.message}`);
                },
            };
        }

        case "create_next_work": {
            const templateKey = target.template_key?.trim();
            if (!templateKey) return { error: "Missing work template key" };
            const workTpl = plan.work_templates.find((t) => t.template_key === templateKey);
            if (!workTpl) return { error: `Unknown work template: ${templateKey}` };
            const result = await instantiateStageWorkFromTemplate({
                supabase,
                orgId,
                userId,
                opportunityId: subject.opportunity_id,
                stageKey,
                departmentId,
                template: workTpl,
                dueDaysOverride: target.due_days,
                followUpDuePolicy: target.follow_up_due_policy ?? null,
            });
            if (result.status === "rejected") {
                return { error: result.error };
            }
            return {
                // Only a freshly CREATED work item is ours to remove; a deduped result matched
                // work that already existed and must survive the rollback.
                undo:
                    result.status === "created" ?
                        async () => {
                            const { error: undoErr } = await supabase
                                .from("operational_tasks")
                                .delete()
                                .eq("id", result.work_id)
                                .eq("org_id", orgId);
                            if (undoErr) throw new Error(`remove spawned work ${result.work_id}: ${undoErr.message}`);
                        }
                    :   undefined,
            };
        }

        case "reopen_work": {
            const workId = subject.work_id?.trim();
            if (!workId) return { error: "Open work required to repeat work item" };
            const { data: priorWork } = await supabase
                .from("operational_tasks")
                .select("status, due_at")
                .eq("id", workId)
                .eq("org_id", orgId)
                .maybeSingle();
            const dueDays =
                typeof target.due_days === "number" && Number.isFinite(target.due_days) ?
                    Math.max(0, Math.floor(target.due_days))
                :   1;
            const reopened = await reopenStageWorkWithDueDate({
                supabase,
                orgId,
                workId,
                dueDays,
            });
            if (!reopened.ok) return { error: reopened.error };
            return {
                undo:
                    priorWork ?
                        async () => {
                            const prior = priorWork as { status?: string | null; due_at?: string | null };
                            const { error: undoErr } = await supabase
                                .from("operational_tasks")
                                .update({
                                    status: prior.status ?? null,
                                    due_at: prior.due_at ?? null,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("id", workId)
                                .eq("org_id", orgId);
                            if (undoErr) throw new Error(`restore work ${workId}: ${undoErr.message}`);
                        }
                    :   undefined,
            };
        }

        case "move_to_stage": {
            const targetStageKey =
                target.stage_key?.trim()
                ?? (target.transition_ref?.startsWith("move_to_stage:")
                    ? target.transition_ref.slice("move_to_stage:".length).trim()
                    : null);
            if (!targetStageKey) return { error: "Missing target stage key" };

            // CANONICAL STAGE-MOVE GUARD (Configured Stage Referential Integrity).
            // The destination must exist in the subject's current configured Business Process.
            // This is the single chokepoint every stage-move caller inherits — outcome rules,
            // status-entry automation, domain-signal automation and transition execution all
            // resolve to this target executor. A non-configured target is a configuration error:
            // no write happens, so the surrounding transaction aborts with nothing to compensate.
            const inventory = await loadConfiguredStageInventory(supabase, orgId, departmentId);
            const membership = assertStageConfigured(inventory, targetStageKey);
            if (!membership.ok) {
                return { error: membership.error.message };
            }

            /**
             * GRAIN GUARD. Configured-and-existing is not the same as configured-and-compatible:
             * the family case and each child's enrollment move on their own tracks, and until now
             * nothing stopped a child outcome writing a family stage or the reverse.
             *
             * Placed here, above every branch below, so it covers both writers. The destination's
             * own operating plan is not loaded on this path — `plan` is the SOURCE stage's — so
             * the resolver weighs the canonical vocabulary against the configured metadata and
             * refuses when they disagree rather than picking one.
             */
            const destinationGrain = resolveStageGrain({
                stageKey: targetStageKey,
                configuredMetadataGrain: inventory.stageGrainsByKey[targetStageKey],
            });
            const grainCheck = assertStageMoveGrainCompatible({
                subjectGrain: subject.journey_segment,
                destination: destinationGrain,
            });
            if (!grainCheck.ok) {
                // No write has happened, so the transaction aborts with nothing to compensate.
                return { error: grainCheck.error.message, stage_grain_error: grainCheck.error };
            }

            const nowIso = new Date().toISOString();
            let undoStageMove: (() => Promise<void>) | undefined;
            if (subject.journey_segment === "child") {
                // Authoritative + only writer: the child's process instance owns stage_key.
                // (The OCM stage_key mirror write was removed — OCM is no longer a runtime dependency
                // for child movement.)
                const childId = await resolveChildSubjectId(supabase, orgId, subject);
                if (!childId) return { error: "Child enrollment track required for move_to_stage" };
                const priorStage = await readEnrollmentInstanceStageKey(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                    customerMemberId: childId,
                });
                const pi = await moveEnrollmentInstanceStageByScope(supabase, {
                    orgId,
                    opportunityId: subject.opportunity_id,
                    customerMemberId: childId,
                    stageKey: targetStageKey,
                });
                if (pi.error) return { error: pi.error };
                if (priorStage != null) {
                    undoStageMove = async () => {
                        const restored = await moveEnrollmentInstanceStageByScope(supabase, {
                            orgId,
                            opportunityId: subject.opportunity_id,
                            customerMemberId: childId,
                            stageKey: priorStage,
                        });
                        if (restored.error) throw new Error(`restore child stage: ${restored.error}`);
                    };
                }
            } else {
                const { data: priorOpp } = await supabase
                    .from("opportunities")
                    .select("stage_key, stage_entered_at")
                    .eq("id", subject.opportunity_id)
                    .eq("org_id", orgId)
                    .maybeSingle();
                const { error } = await supabase
                    .from("opportunities")
                    .update({ stage_key: targetStageKey, stage_entered_at: nowIso, updated_at: nowIso })
                    .eq("id", subject.opportunity_id)
                    .eq("org_id", orgId);
                if (error) return { error: error.message };
                if (priorOpp) {
                    const prior = priorOpp as {
                        stage_key?: string | null;
                        stage_entered_at?: string | null;
                    };
                    undoStageMove = async () => {
                        const { error: undoErr } = await supabase
                            .from("opportunities")
                            .update({
                                stage_key: prior.stage_key ?? null,
                                stage_entered_at: prior.stage_entered_at ?? null,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", subject.opportunity_id)
                            .eq("org_id", orgId);
                        if (undoErr) throw new Error(`restore family stage: ${undoErr.message}`);
                    };
                }
            }

            // Stage membership changes first; then reconcile work across the move.
            // Declared OUTSIDE the boundary: a failed reconciliation must not roll back a stage
            // move the operator completed — but it is REPORTED, never swallowed.
            let spawnDegraded: string | undefined;
            try {
                const { data: deptRow } = await supabase
                    .from("departments")
                    .select("metadata")
                    .eq("id", departmentId)
                    .eq("org_id", orgId)
                    .maybeSingle();
                const departmentMetadata =
                    deptRow?.metadata != null
                    && typeof deptRow.metadata === "object"
                    && !Array.isArray(deptRow.metadata)
                        ? (deptRow.metadata as Record<string, unknown>)
                        : {};
                const reconciled = await reconcileBusinessProcessWorkAcrossStageMove({
                    supabase,
                    orgId,
                    userId,
                    opportunityId: subject.opportunity_id,
                    departmentId,
                    sourceStageKey: stageKey,
                    destinationStageKey: targetStageKey,
                    departmentMetadata,
                    initiatingWorkId: subject.work_id ?? null,
                });
                if (reconciled.degraded) {
                    spawnDegraded = reconciled.degraded;
                }
            } catch (e) {
                // Test doubles or transient reads must not undo a successful stage move.
                spawnDegraded = `stage work reconciliation failed for "${targetStageKey}": ${
                    e instanceof Error ? e.message : String(e)
                }`;
            }
            return { undo: undoStageMove, degraded: spawnDegraded };
        }

        default:
            return { error: `Unsupported target kind` };
    }
}
