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
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

export type ExecuteEnrollmentStatusTransitionInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    request: EnrollmentStatusTransitionExecutionRequest;
    departmentId?: string | null;
    workUnitId?: string | null;
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
    | { ok: false; error: string; validation?: RequirementValidationResult };

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
