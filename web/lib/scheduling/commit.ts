/**
 * Scheduling commit adapter — maps a chosen Create-schedule decision to the
 * effective-dated writes, per `engineering-handoff.md` §2.4.
 *
 * It delegates to the invariant-owning services (`childPlacementService` /
 * `scheduleAssignmentService`) — the *same* services `applyChildEnrollmentMaterialization`
 * uses — so no business logic is forked: effective-dating, supersede rules,
 * location/pattern validation, and change events are all owned by those services.
 *
 * Create-only: this is the Place-a-Child path for a needs-placement child. A
 * child that already has an operational schedule assignment must use a change
 * command (supersede), not create.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    getOperationalPlacementForAgreement,
    createInitialChildPlacement,
} from "@/lib/childcareOperational/childPlacementService";
import {
    getOperationalScheduleAssignmentForAgreement,
    createInitialScheduleAssignment,
} from "@/lib/childcareOperational/scheduleAssignmentService";
import type {
    ChildPlacementRow,
    ScheduleAssignmentRow,
} from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type CommitCreateScheduleInput = {
    orgId: string;
    enrollmentAgreementId: string;
    schedulePatternId: string;
    startDate: string; // YYYY-MM-DD (effective start)
    roomLocationId?: string | null;
    programCategoryId?: string | null;
    sourceKey?: string;
    actorUserId?: string | null;
    todayYmd: string; // org-local today
};

export type CommitCreateScheduleResult = {
    placement: ChildPlacementRow;
    scheduleAssignment: ScheduleAssignmentRow;
    createdPlacement: boolean;
};

/**
 * Commit a new schedule for a needs-placement child: create the placement (room)
 * if none exists, then create the schedule assignment (pattern). Both are
 * effective-dated; neither overwrites. Throws if the child already has an
 * operational schedule assignment (that is a change, not a create).
 */
export async function commitCreateSchedule(
    supabase: SupabaseClient,
    input: CommitCreateScheduleInput
): Promise<CommitCreateScheduleResult> {
    const existingAssignment = await getOperationalScheduleAssignmentForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    if (existingAssignment) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "Child already has an operational schedule; use a change command to supersede",
            { assignment_id: existingAssignment.id }
        );
    }

    // Reuse an existing operational placement (child may have a room but no
    // schedule); otherwise create it.
    let placement = await getOperationalPlacementForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    let createdPlacement = false;
    if (!placement) {
        placement = await createInitialChildPlacement(supabase, {
            orgId: input.orgId,
            enrollmentAgreementId: input.enrollmentAgreementId,
            startDate: input.startDate,
            programCategoryId: input.programCategoryId ?? null,
            roomLocationId: input.roomLocationId ?? null,
            sourceKey: input.sourceKey,
            actorUserId: input.actorUserId,
            todayYmd: input.todayYmd,
        });
        createdPlacement = true;
    }

    const scheduleAssignment = await createInitialScheduleAssignment(supabase, {
        orgId: input.orgId,
        enrollmentAgreementId: input.enrollmentAgreementId,
        schedulePatternId: input.schedulePatternId,
        startDate: input.startDate,
        sourceKey: input.sourceKey,
        actorUserId: input.actorUserId,
        todayYmd: input.todayYmd,
    });

    return { placement, scheduleAssignment, createdPlacement };
}
