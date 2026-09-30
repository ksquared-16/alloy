/**
 * Execute enrollment status transition — OCM-first; case fallback when no child scope.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import type {
    EnrollmentStatusDestinationKey,
    EnrollmentStatusTransitionExecutionRequest,
    EnrollmentStatusTransitionScope,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { evaluateEnrollmentStatusTransitionPreflight } from "@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight";
import { applyEnrollmentStatusTransitionOutcomeEffects } from "@/lib/admin/enrollmentStatus/applyEnrollmentStatusTransitionOutcomeEffects";
import { resolveEnrollmentStatusTargetKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionDestinations";
import { preflightStageTransitionReconciliation } from "@/lib/lifecycle/preflightStageTransitionReconciliation";
import { applyStageTransitionReconciliation } from "@/lib/lifecycle/applyStageTransitionReconciliation";
import { validateStageTransitionReconciliationPayload } from "@/lib/lifecycle/validateStageTransitionReconciliationPayload";
import type { StageTransitionReconciliationPreflight } from "@/lib/lifecycle/stageTransitionReconciliationTypes";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

export type ExecuteEnrollmentStatusTransitionInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    request: EnrollmentStatusTransitionExecutionRequest;
    departmentId?: string | null;
    workUnitId?: string | null;
    /*
     * The operator's answers to the reconciliation preflight, unvalidated as received.
     * Revalidated here against a preflight this function computes itself — never trusted because the
     * client echoed one back.
     */
    reconciliation?: unknown;
};

export type ExecuteEnrollmentStatusTransitionResult =
    | {
          ok: true;
          targetStatusKey: string;
          grain: EnrollmentStatusTransitionScope["grain"];
          opportunityCustomerMemberId?: string | null;
          placementHook?: { attempted: boolean; created: boolean; skipped_reason?: string } | null;
          outcomeEffects?: Awaited<ReturnType<typeof applyEnrollmentStatusTransitionOutcomeEffects>>;
      }
    | { ok: false; error: string; validation?: RequirementValidationResult }
    /*
     * The operator has to answer for the work being left behind before the transition may proceed.
     * Distinct from a requirement failure: nothing is wrong, the caller simply has not yet supplied
     * the dispositions. The caller re-submits the same request carrying `reconciliation`.
     */
    | {
          ok: false;
          reconciliationRequired: true;
          reconciliationPreflight: StageTransitionReconciliationPreflight;
          error: string;
      };

async function resolveOcmIdFromCandidate(
    supabase: SupabaseClient,
    orgId: string,
    placementCandidateId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("placement_candidates")
        .select("opportunity_customer_member_id")
        .eq("id", placementCandidateId)
        .eq("org_id", orgId)
        .maybeSingle();
    const raw = (data as { opportunity_customer_member_id?: unknown } | null)?.opportunity_customer_member_id;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function executeEnrollmentStatusTransition(
    input: ExecuteEnrollmentStatusTransitionInput,
): Promise<ExecuteEnrollmentStatusTransitionResult> {
    const { request, supabase, orgId } = input;
    const scope = request.scope;
    const targetStatusKey =
        request.targetStatusKey.trim() ||
        resolveEnrollmentStatusTargetKey(request.destinationKey, scope.grain);

    const preflight = await evaluateEnrollmentStatusTransitionPreflight({
        supabase,
        orgId,
        scope,
        destinationKey: request.destinationKey,
        targetStatusKey,
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        bypassReason: request.bypassReason,
    });

    if (!preflight.ok) {
        return {
            ok: false,
            error: formatRequirementValidationSummary(preflight.validation) || "Requirements not met",
            validation: preflight.validation,
        };
    }

    let ocmId = scope.opportunityCustomerMemberId?.trim() ?? null;
    if (!ocmId && scope.placementCandidateId?.trim()) {
        ocmId = await resolveOcmIdFromCandidate(supabase, orgId, scope.placementCandidateId.trim());
    }

    const metadataBase: Record<string, unknown> = {
        destination_key: request.destinationKey,
        source_surface: request.sourceSurface ?? null,
        ...(request.bypassReason?.trim() ? { bypass_reason: request.bypassReason.trim() } : {}),
        ...(request.note?.trim() ? { note: request.note.trim() } : {}),
    };

    if (ocmId && scope.grain !== "case") {
        const result = await updateOpportunityCustomerMemberLifecycleStatus({
            supabase,
            orgId,
            opportunityId: scope.opportunityId,
            opportunityCustomerMemberId: ocmId,
            nextStatusKey: targetStatusKey,
            actorUserId: input.userId,
            source: "update_enrollment_status",
            reason: request.reason ?? request.bypassReason ?? null,
            rowGrain: scope.grain === "candidate" ? "candidate" : "child",
            placementCandidateId: scope.placementCandidateId ?? null,
            metadata: metadataBase,
        });
        if (result.error) {
            return { ok: false, error: result.error.message };
        }

        const outcomeEffects = await applyEnrollmentStatusTransitionOutcomeEffects({
            supabase,
            orgId,
            userId: input.userId,
            departmentId: input.departmentId,
            scope,
            destinationKey: request.destinationKey,
            targetStatusKey,
            previousStatusKey: result.before.outcome_status_key,
        });

        if (request.bypassReason?.trim()) {
            try {
                await emitEvent({
                    org_id: orgId,
                    event_type: "enrollment_status_tour_bypassed",
                    entity_type: "opportunity_customer_members",
                    entity_id: ocmId,
                    payload: {
                        opportunity_id: scope.opportunityId,
                        destination_key: request.destinationKey,
                        target_status_key: targetStatusKey,
                        bypass_reason: request.bypassReason.trim(),
                        actor_user_id: input.userId ?? null,
                    },
                });
            } catch {
                /* non-blocking */
            }
        }

        try {
            await emitEvent({
                org_id: orgId,
                event_type: "action_executed",
                entity_type: "opportunities",
                entity_id: scope.opportunityId,
                payload: {
                    action_key: request.actionKey,
                    actor_user_id: input.userId ?? null,
                    row_grain: scope.grain,
                    opportunity_customer_member_id: ocmId,
                    target_status_key: targetStatusKey,
                },
            });
        } catch {
            /* non-blocking */
        }

        return {
            ok: true,
            targetStatusKey,
            grain: scope.grain === "candidate" ? "candidate" : "child",
            opportunityCustomerMemberId: ocmId,
            placementHook: result.placementHook ?? null,
            outcomeEffects,
        };
    }

    /*
     * ── PRIOR-STAGE RECONCILIATION, CASE GRAIN, BEFORE THE STATUS MOVES ──
     *
     * This is the half the canonical path did not own. The generic Opportunity PATCH carried it, and
     * that is the only reason an operator surface still had to go through the PATCH to change a
     * lifecycle state: it is where the "what happens to the work you are leaving behind" question
     * lived. Moving it here — reusing the same three functions, not forking them — is what lets the
     * canonical path become a superset and the bypass be closed.
     *
     * GRAIN. This is deliberately on the CASE path only. `preflightStageTransitionReconciliation` is
     * keyed on `opportunities.status_key` and derives the stage being left from it, and the generic
     * PATCH it moved from could only ever write that column. A child-grain transition moves the OCM's
     * own `outcome_status_key` and leaves the case status alone, so keying a case preflight off it
     * would reconcile against a stage the child is not leaving.
     *
     * ORDER. This runs after requirements pass and BEFORE the status write, for two reasons that are
     * not interchangeable:
     *
     *   1. `preflightStageTransitionReconciliation` is keyed on the CURRENT status to derive the
     *      stage being left. Once the status is written the prior stage is no longer discoverable
     *      from the row, so a preflight after the write would reconcile against the wrong stage.
     *   2. Outcome execution may move the stage (`move_to_stage`). Work belonging to the stage being
     *      left has to be resolved while that stage is still the current one.
     *
     * ATOMICITY, stated honestly. Reconciliation and the status write are separate operations, so a
     * failure between them leaves work reconciled and the transition not made. That window is
     * PRE-EXISTING and unchanged — the PATCH path has exactly the same shape — and closing it means a
     * transactional RPC, which is a migration-bearing change beyond this convergence. What this move
     * must not do is make it worse, and it does not: the two operations stay adjacent and in the same
     * order they had. The ordering test pins that.
     */
    const { data: caseRow } = await supabase
        .from("opportunities")
        .select("status_key")
        .eq("id", scope.opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    const currentCaseStatusKey = (caseRow as { status_key?: string | null } | null)?.status_key ?? null;

    const reconciliationPreflight = await preflightStageTransitionReconciliation({
        supabase,
        orgId,
        opportunityId: scope.opportunityId,
        previousStatusKey: currentCaseStatusKey,
        nextStatusKey: targetStatusKey,
    });

    if (reconciliationPreflight.required) {
        if (input.reconciliation == null) {
            return {
                ok: false,
                reconciliationRequired: true,
                reconciliationPreflight,
                error: "Prior-stage work requires reconciliation before this transition can proceed.",
            };
        }
        // Revalidated against the preflight computed above, not the one the client was handed.
        const validated = validateStageTransitionReconciliationPayload(
            reconciliationPreflight,
            input.reconciliation,
        );
        if (!validated.ok) {
            return { ok: false, error: validated.message };
        }
        const applied = await applyStageTransitionReconciliation({
            supabase,
            orgId,
            opportunityId: scope.opportunityId,
            actorUserId: input.userId ?? "",
            preflight: reconciliationPreflight,
            reconciliation: validated.reconciliation,
        });
        if (applied.errors.length) {
            return { ok: false, error: applied.errors.join("; ") };
        }
    }

    const caseResult = await updateOpportunityStatusWithEvent({
        supabase,
        orgId,
        opportunityId: scope.opportunityId,
        newStatusKey: targetStatusKey,
        actorUserId: input.userId,
        normalizeContext: "update_enrollment_status:case_fallback",
        eventMetadata: metadataBase,
    });
    if (caseResult.error) {
        return { ok: false, error: caseResult.error.message };
    }

    return {
        ok: true,
        targetStatusKey,
        grain: "case",
        opportunityCustomerMemberId: null,
        placementHook: null,
    };
}

export function destinationKeyFromBosLabel(raw: string): EnrollmentStatusDestinationKey | null {
    const t = raw.trim().toLowerCase();
    if (t.includes("waitlist")) return "waitlist";
    if (t.includes("enrolled")) return "enrolled";
    if (t.includes("enrolling")) return "enrollment";
    if (t.includes("tour")) return "tour";
    if (t.includes("qualif")) return "qualification";
    if (t.includes("lead") || t.includes("new")) return "lead";
    if (t.includes("withdraw") || t.includes("lost")) return "closed_withdrawn";
    return null;
}
