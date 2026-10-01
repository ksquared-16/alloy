/**
 * A COMBINED PLACEMENT + SCHEDULE CHANGE, AS ONE TRANSACTION AND TWO EVENTS.
 *
 * A single operator edit can change where a child is placed AND the schedule they are on. Doing that
 * as two service calls means two transactions: the placement can supersede and the assignment can
 * then fail, leaving the child in the new room on the old schedule with a placement event already
 * emitted for a change that only half happened. Partners see the half.
 *
 * So the persistence is one call to `apply_participation_operational_change`, which owns the
 * transaction. This module owns only the orchestration:
 *
 *   1. reuse each canonical service's own validation - `resolvePlacementSupersession` and
 *      `resolveAssignmentSupersession`, not copies of them, so the rules cannot drift apart;
 *   2. one transactional call carrying both payloads;
 *   3. after the commit, emit BOTH canonical domain events.
 *
 * Step 3 is after step 2 on purpose. The primitive emits nothing by design, and a rolled-back
 * transaction must produce no event: the doctrine is explicit that a silent divergence is worse than a
 * visible failure, because a partner that already synchronised the row learns of the change through
 * the event and nothing else.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChildPlacementRow, ScheduleAssignmentRow } from "./enrollmentOperationalTypes";
import { OperationalEnrollmentServiceError, trimOrNull } from "./operationalEnrollmentErrors";
import {
    applyParticipationOperationalChange,
    deriveParticipationIdempotencyKey,
} from "./participationOperationalChange";
import {
    emitPlacementSupersededEvent,
    placementChangePayload,
    readPlacementById,
    resolvePlacementSupersession,
    type SupersedeChildPlacementInput,
} from "./childPlacementService";
import {
    assignmentChangePayload,
    convergeAssignmentConflict,
    emitAssignmentSupersededEvent,
    readAssignmentById,
    resolveAssignmentSupersession,
    type SupersedeScheduleAssignmentInput,
} from "./scheduleAssignmentService";

export type CombinedParticipationChangeInput = {
    orgId: string;
    enrollmentAgreementId: string;
    todayYmd: string;
    actorUserId?: string | null;
    sourceKey?: string | null;
    idempotencyKey?: string;
    /**
     * Optimistic preconditions. Supplying the rows the caller believes are current turns a concurrent
     * edit into a conflict instead of a branch, and is the only failure mode that reaches the database
     * with one half already written - which is what proves the rollback is real rather than a
     * consequence of validating early.
     */
    expectedPlacementId?: string | null;
    expectedAssignmentId?: string | null;
    /** Omit to leave placement truth alone. */
    placement?: {
        startDate: string;
        programCategoryId?: string | null;
        roomLocationId?: string | null;
        reasonKey?: string | null;
        metadata?: Record<string, unknown>;
    };
    /** Omit to leave schedule truth alone. */
    assignment?: {
        startDate: string;
        schedulePatternId: string;
        metadata?: Record<string, unknown>;
    };
};

export type CombinedParticipationChangeResult = {
    replayed: boolean;
    placement: ChildPlacementRow | null;
    assignment: ScheduleAssignmentRow | null;
};

export async function applyCombinedParticipationChange(
    supabase: SupabaseClient,
    input: CombinedParticipationChangeInput
): Promise<CombinedParticipationChangeResult> {
    if (!input.placement && !input.assignment) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "nothing_to_change: supply placement, assignment, or both"
        );
    }

    const placementInput: SupersedeChildPlacementInput | null = input.placement
        ? {
              orgId: input.orgId,
              enrollmentAgreementId: input.enrollmentAgreementId,
              startDate: input.placement.startDate,
              programCategoryId: input.placement.programCategoryId ?? null,
              roomLocationId: input.placement.roomLocationId ?? null,
              reasonKey: input.placement.reasonKey ?? null,
              sourceKey: input.sourceKey ?? undefined,
              metadata: input.placement.metadata ?? {},
              actorUserId: input.actorUserId ?? null,
              todayYmd: input.todayYmd,
          }
        : null;

    const assignmentInput: SupersedeScheduleAssignmentInput | null = input.assignment
        ? {
              orgId: input.orgId,
              enrollmentAgreementId: input.enrollmentAgreementId,
              startDate: input.assignment.startDate,
              schedulePatternId: input.assignment.schedulePatternId,
              sourceKey: input.sourceKey ?? undefined,
              metadata: input.assignment.metadata ?? {},
              actorUserId: input.actorUserId ?? null,
              todayYmd: input.todayYmd,
          }
        : null;

    // Both halves are validated BEFORE anything is written, so an invalid schedule change cannot first
    // cause a placement supersession that then has to be undone.
    const resolvedPlacement = placementInput
        ? await resolvePlacementSupersession(supabase, placementInput)
        : null;
    const resolvedAssignment = assignmentInput
        ? await resolveAssignmentSupersession(supabase, assignmentInput)
        : null;

    const idempotencyKey =
        input.idempotencyKey
        ?? deriveParticipationIdempotencyKey({
            scope: "participation",
            enrollmentAgreementId: input.enrollmentAgreementId,
            values: [
                resolvedPlacement?.newStartDate,
                resolvedPlacement?.programCategoryId,
                resolvedPlacement?.roomLocationId,
                resolvedAssignment?.newStartDate,
                resolvedAssignment?.schedulePatternId,
            ],
        });

    let change: Awaited<ReturnType<typeof applyParticipationOperationalChange>>;
    try {
        change = await applyParticipationOperationalChange(supabase, {
            orgId: input.orgId,
            enrollmentAgreementId: input.enrollmentAgreementId,
            idempotencyKey,
            todayYmd: input.todayYmd,
            actorUserId: trimOrNull(input.actorUserId),
            expectedPlacementId:
                input.expectedPlacementId !== undefined
                    ? input.expectedPlacementId
                    : (resolvedPlacement?.prior.id ?? null),
            expectedAssignmentId:
                input.expectedAssignmentId !== undefined
                    ? input.expectedAssignmentId
                    : (resolvedAssignment?.prior.id ?? null),
            placement:
                placementInput && resolvedPlacement
                    ? placementChangePayload(placementInput, resolvedPlacement)
                    : undefined,
            assignment:
                assignmentInput && resolvedAssignment
                    ? assignmentChangePayload(assignmentInput, resolvedAssignment)
                    : undefined,
        });
    } catch (e) {
        /*
         * An assignment-only conflict keeps the Scheduling service's convergence behaviour, so an
         * operator who loses a race sees the same outcome through either entry point. A conflict on a
         * COMBINED change is reported as a conflict rather than converged: half of it may already be
         * someone else's decision, and guessing which half is not something this module may do.
         */
        const conflict = e instanceof OperationalEnrollmentServiceError && e.code === "conflict";
        if (conflict && assignmentInput && resolvedAssignment && !placementInput) {
            const assignment = await convergeAssignmentConflict(
                supabase,
                assignmentInput,
                resolvedAssignment,
                e
            );
            return { replayed: false, placement: null, assignment };
        }
        throw e;
    }

    const placement = change.placement
        ? await readPlacementById(supabase, input.orgId, change.placement.successorId)
        : null;
    const assignment = change.assignment
        ? await readAssignmentById(supabase, input.orgId, change.assignment.successorId)
        : null;

    // EVENTS AFTER THE COMMIT, never before, and one per domain that actually changed.
    if (placement && change.placement && placementInput) {
        await emitPlacementSupersededEvent(placementInput, placement, {
            id: change.placement.priorId,
            closeDate: change.placement.priorEndDate,
        });
    }
    if (assignment && change.assignment && assignmentInput) {
        await emitAssignmentSupersededEvent(assignmentInput, assignment, {
            id: change.assignment.priorId,
            closeDate: change.assignment.priorEndDate,
        });
    }

    return { replayed: change.replayed, placement, assignment };
}
