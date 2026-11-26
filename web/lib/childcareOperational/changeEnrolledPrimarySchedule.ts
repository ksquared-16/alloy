/**
 * EDITING AN ENROLLED CHILD'S PRIMARY SCHEDULE.
 *
 * The Assignment Card's primary editor posts to `/api/admin/scheduling`, which used to run
 * `schedule.create` whenever the child had an agreement — and `commitCreateSchedule` refuses a second
 * operational primary, so an enrolled child's schedule could never be edited (V7 audit A5). The
 * refusal was right; the route was wrong. An edit is a CHANGE, and a change goes through the canonical
 * change path:
 *
 *   - nothing but days/hours changed, on the same start date → the current row's Assignment Time is
 *     corrected in place (`setAssignmentTime` — hours are the assignment's own, not effective-dated);
 *   - the pattern, room or program changed → ONE `apply_participation_operational_change` transaction
 *     supersedes the primary (and the placement, when the room or program moved) from the operator's
 *     start date, then the successor's Assignment Time is written;
 *   - the facts changed but the start date did not → refused: a supersession needs the date it takes
 *     effect, and rewriting the current row would erase the history the doctrine keeps.
 *
 * `expectedAssignmentId` is the primary the operator was looking at. If it is no longer current the
 * edit is refused as stale — never applied on top of someone else's change.
 *
 * Nothing here touches tuition or accepted terms; that remains the card's explicit, separate step.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { setAssignmentTime, type AssignmentTimeDayInput } from "@/lib/assignmentTime/setAssignmentTime";
import { applyCombinedParticipationChange } from "./applyCombinedParticipationChange";
import { getOperationalPlacementForAgreement } from "./childPlacementService";
import { OperationalEnrollmentServiceError } from "./operationalEnrollmentErrors";
import { getOperationalScheduleAssignmentForAgreement } from "./scheduleAssignmentService";

export type EnrolledPrimaryScheduleEdit = {
    orgId: string;
    enrollmentAgreementId: string;
    todayYmd: string;
    actorUserId?: string | null;
    /** The primary the operator opened. Required: an edit without it cannot be judged stale. */
    expectedAssignmentId: string | null;
    schedulePatternId: string;
    startDate: string;
    roomLocationId: string | null;
    programCategoryId: string | null;
    /** The whole week, as Assignment Time. Empty leaves the hours as they are. */
    days: readonly AssignmentTimeDayInput[];
};

export type EnrolledPrimaryScheduleEditResult = {
    /** The primary that now carries the schedule — the successor, or the corrected current row. */
    assignmentId: string;
    kind: "superseded" | "corrected";
    priorAssignmentId: string | null;
    placementSuperseded: boolean;
};

/** True when the child has a live operational primary — i.e. a save is an edit, not a first schedule. */
export async function hasOperationalPrimary(
    supabase: SupabaseClient,
    orgId: string,
    enrollmentAgreementId: string,
): Promise<boolean> {
    return (await getOperationalScheduleAssignmentForAgreement(supabase, orgId, enrollmentAgreementId)) != null;
}

export async function changeEnrolledPrimarySchedule(
    supabase: SupabaseClient,
    input: EnrolledPrimaryScheduleEdit,
): Promise<EnrolledPrimaryScheduleEditResult> {
    const current = await getOperationalScheduleAssignmentForAgreement(supabase, input.orgId, input.enrollmentAgreementId);
    if (!current) {
        throw new OperationalEnrollmentServiceError("invalid_state", "This child has no primary schedule to change.");
    }
    // A repeated submit of the edit that produced the current row converges on it instead of reading as stale.
    if (
        input.expectedAssignmentId
        && current.supersedes_assignment_id === input.expectedAssignmentId
        && current.schedule_pattern_id === input.schedulePatternId
        && current.start_date === input.startDate
    ) {
        if (input.days.length > 0) {
            await setAssignmentTime(supabase, { assignmentId: current.id, days: input.days, actorUserId: input.actorUserId ?? null });
        }
        return { assignmentId: current.id, kind: "superseded", priorAssignmentId: input.expectedAssignmentId, placementSuperseded: false };
    }
    if (!input.expectedAssignmentId || input.expectedAssignmentId !== current.id) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "This schedule changed since it was opened. Reopen it to see the current schedule before changing it.",
            { assignment_id: current.id },
        );
    }

    const placement = await getOperationalPlacementForAgreement(supabase, input.orgId, input.enrollmentAgreementId);
    const currentRoom = current.room_location_id ?? placement?.room_location_id ?? null;
    const currentProgram = placement?.program_category_id ?? current.program_category_id ?? null;
    const patternChanged = input.schedulePatternId !== current.schedule_pattern_id;
    const roomChanged = (input.roomLocationId ?? null) !== currentRoom && input.roomLocationId != null;
    const programChanged = (input.programCategoryId ?? null) !== currentProgram && input.programCategoryId != null;
    const factsChanged = patternChanged || roomChanged || programChanged;

    if (input.startDate === current.start_date) {
        if (factsChanged) {
            throw new OperationalEnrollmentServiceError(
                "validation_failed",
                `Choose the date this change takes effect — after ${current.start_date}. The current schedule stays on record until then.`,
                { field: "start_date" },
            );
        }
        if (input.days.length > 0) {
            await setAssignmentTime(supabase, { assignmentId: current.id, days: input.days, actorUserId: input.actorUserId ?? null });
        }
        return { assignmentId: current.id, kind: "corrected", priorAssignmentId: null, placementSuperseded: false };
    }

    const movePlacement = Boolean(placement) && (roomChanged || programChanged);
    const change = await applyCombinedParticipationChange(supabase, {
        orgId: input.orgId,
        enrollmentAgreementId: input.enrollmentAgreementId,
        todayYmd: input.todayYmd,
        actorUserId: input.actorUserId ?? null,
        sourceKey: "operator",
        expectedAssignmentId: current.id,
        ...(movePlacement ? { expectedPlacementId: placement!.id } : {}),
        placement: movePlacement
            ? {
                  startDate: input.startDate,
                  reasonKey: "operator_change",
                  ...(roomChanged ? { roomLocationId: input.roomLocationId } : {}),
                  ...(programChanged ? { programCategoryId: input.programCategoryId } : {}),
              }
            : undefined,
        assignment: {
            startDate: input.startDate,
            schedulePatternId: input.schedulePatternId,
            // The primary names the room the placement now names — they move together, in one transaction.
            ...(roomChanged ? { roomLocationId: input.roomLocationId } : {}),
            ...(programChanged ? { programCategoryId: input.programCategoryId } : {}),
        },
    });
    const successor = change.assignment;
    if (!successor) {
        throw new OperationalEnrollmentServiceError("db_error", "The schedule change did not produce a successor.");
    }
    if (input.days.length > 0) {
        await setAssignmentTime(supabase, { assignmentId: successor.id, days: input.days, actorUserId: input.actorUserId ?? null });
    }
    return {
        assignmentId: successor.id,
        kind: "superseded",
        priorAssignmentId: current.id,
        placementSuperseded: change.placement != null,
    };
}
