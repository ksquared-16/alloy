/**
 * Daily operating state — expected versus actual, for both populations.
 *
 * Reuses the child presence vocabulary verbatim
 * (`CurrentPresenceStateKind = present | checked_out | absent | no_record`)
 * rather than inventing a staff status language. One operator vocabulary, two
 * typed subjects.
 *
 * PLANNED and ACTUAL staffing are separate verdicts and must stay separate:
 *
 *   planned   required(expected children)  vs  scheduled staff
 *   actual    required(children PRESENT)    vs  staff PRESENT
 *
 * A room can be planned-sufficient and actually short — that is the entire
 * operational point of this phase, and collapsing them would hide it.
 */

import type { CurrentPresenceStateKind } from "@/lib/childcareOperational/attendance/childAttendanceReadModel";
import {
    resolveRequiredStaffDemand,
    resolveStaffingSufficiency,
    type StaffingSufficiency,
} from "@/lib/scheduling/supply/staffingSufficiency";
import type { StaffPresenceDayState } from "@/lib/staffPresence/staffPresenceFold";

export type SubjectActualState = {
    state: CurrentPresenceStateKind;
    arrivedAt: string | null;
    departedAt: string | null;
    /** Actual room, which may differ from the expected/scheduled room. */
    actualRoomLocationId: string | null;
    /**
     * The effective fact this state came from. A correction must reference the
     * fact it supersedes, so the surface cannot offer "Correct" without it.
     */
    latestFactId: string | null;
};

export const NO_RECORD: SubjectActualState = {
    state: "no_record",
    arrivedAt: null,
    departedAt: null,
    actualRoomLocationId: null,
    latestFactId: null,
};

/** Fold one staff day-state into the shared subject vocabulary. */
export function staffActualFromDayState(day: StaffPresenceDayState | null | undefined): SubjectActualState {
    if (!day) return NO_RECORD;
    if (day.absent) {
        return {
            state: "absent",
            arrivedAt: null,
            departedAt: null,
            actualRoomLocationId: null,
            latestFactId: day.latestFactId,
        };
    }
    if (!day.present) return NO_RECORD;
    return {
        state: day.onSite ? "present" : "checked_out",
        arrivedAt: day.firstCheckInAt,
        departedAt: day.lastCheckOutAt,
        actualRoomLocationId: day.currentRoomLocationId,
        latestFactId: day.latestFactId,
    };
}

/** Counts that actually contribute to the ACTUAL ratio comparison. */
export function countsPresent(states: readonly SubjectActualState[]): number {
    return states.filter((s) => s.state === "present").length;
}

export type ActualStaffingInput = {
    /** Children physically present right now (never the expected count). */
    actualChildrenPresent: number;
    /** Staff physically present right now (never the scheduled count). */
    actualStaffPresent: number;
    /**
     * Demand for the ACTUAL child count, resolved through the same ratio engine
     * that produced planned demand — never a roster-local calculation.
     */
    requiredStaffForActualChildren: number | null;
    exceedsDefinedTiers: boolean;
};

export type ActualStaffingVerdict = {
    actualRequiredStaff: number | null;
    actualStaffPresent: number;
    actualStaffingSufficiency: StaffingSufficiency;
};

export function resolveActualStaffing(input: ActualStaffingInput): ActualStaffingVerdict {
    const actualRequiredStaff = resolveRequiredStaffDemand({
        requiredStaff: input.requiredStaffForActualChildren,
        exceedsDefinedTiers: input.exceedsDefinedTiers,
        childCount: input.actualChildrenPresent,
    });
    return {
        actualRequiredStaff,
        actualStaffPresent: input.actualStaffPresent,
        actualStaffingSufficiency: resolveStaffingSufficiency({
            requiredStaff: actualRequiredStaff,
            scheduledStaffCount: input.actualStaffPresent,
        }),
    };
}
