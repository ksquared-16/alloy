/**
 * Compliance-over-actuals (P2.1) — pure read model over L4 attendance facts.
 *
 * Mirrors the L3 expected occupancy/staffing computation but keys off ACTUAL
 * presence folded from immutable attendance events. Observational only; authors
 * nothing and stores nothing.
 *
 * Grain note: this is DAY-LEVEL. "Actual occupancy" for a room/date is the count
 * of distinct children OBSERVED in that room that day (a check-in/present room or
 * a transfer's destination room). Point-in-time (time-block) occupancy is
 * deferred — see attendance-system.md. A transfer therefore adds the child to the
 * destination room's occupancy; placements are never consulted here.
 *
 * Staff scheduling is not yet modeled. `staffOnHandByRoomDate` is an optional
 * placeholder input; when a room/date has no staff datum, staffingGap is null
 * (a placeholder, not a failure) and a staff_data_unavailable warning is emitted.
 */

import { requiredStaffForChildren, type RatioTier } from "@/lib/childcareOperational/config/ratioRules";
import { effectiveAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceFold";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

export type ActualOccupancyEntry = {
    roomLocationId: string;
    date: string;
    childCount: number;
};

export type ActualStaffingEntry = {
    roomLocationId: string;
    date: string;
    childCount: number;
    requiredStaff: number;
    exceedsDefinedTiers: boolean;
};

export type ActualComplianceEntry = {
    roomLocationId: string;
    date: string;
    actualChildCount: number;
    requiredStaff: number;
    exceedsDefinedTiers: boolean;
    /** From the optional staff placeholder input; null when unknown. */
    staffOnHand: number | null;
    /** requiredStaff - staffOnHand; null (placeholder) when staff data is unavailable. */
    staffingGap: number | null;
    staffDataAvailable: boolean;
    capacityBinding: number | null;
    overCapacity: boolean;
};

export type ActualComplianceWarningCode =
    | "over_capacity"
    | "understaffed"
    | "staff_data_unavailable";

export type ActualComplianceWarning = {
    code: ActualComplianceWarningCode;
    roomLocationId: string;
    date: string;
    detail: string;
};

/** Optional staff-on-hand placeholder keyed `${roomLocationId}::${date}`. */
export type ActualStaffingInput = {
    staffOnHandByRoomDate?: Readonly<Record<string, number>>;
};

function roomDateKey(roomLocationId: string, date: string): string {
    return `${roomLocationId}::${date}`;
}

/**
 * Distinct children observed per room/date from effective events. A child is
 * counted in a room if a presence/check-in event names that room, or a transfer
 * moves them into it.
 */
export function aggregateActualOccupancyByRoomDate(
    events: readonly ChildAttendanceEventRow[]
): ActualOccupancyEntry[] {
    const effective = effectiveAttendanceEvents(events);
    const membersByRoomDate = new Map<string, Set<string>>();

    const observe = (room: string | null, date: string, member: string) => {
        if (!room) return;
        const key = roomDateKey(room, date);
        const set = membersByRoomDate.get(key) ?? new Set<string>();
        set.add(member);
        membersByRoomDate.set(key, set);
    };

    for (const e of effective) {
        if (e.event_kind === "check_in" || e.event_kind === "present") {
            observe(e.room_location_id, e.service_date, e.customer_member_id);
        } else if (e.event_kind === "room_transfer") {
            observe(e.to_room_location_id, e.service_date, e.customer_member_id);
        }
    }

    const entries: ActualOccupancyEntry[] = [];
    for (const [key, members] of membersByRoomDate) {
        const [roomLocationId, date] = key.split("::");
        entries.push({ roomLocationId, date, childCount: members.size });
    }
    return entries.sort(
        (a, b) => a.roomLocationId.localeCompare(b.roomLocationId) || a.date.localeCompare(b.date)
    );
}

/** Required staff per room/date from actual occupancy + ratio tiers (same resolver as L3). */
export function computeActualStaffingByRoomDate(
    occupancy: readonly ActualOccupancyEntry[],
    resolveTiers: (roomLocationId: string, date: string) => readonly RatioTier[]
): ActualStaffingEntry[] {
    return occupancy.map((o) => {
        const { requiredStaff, exceedsDefinedTiers } = requiredStaffForChildren(
            resolveTiers(o.roomLocationId, o.date),
            o.childCount
        );
        return {
            roomLocationId: o.roomLocationId,
            date: o.date,
            childCount: o.childCount,
            requiredStaff,
            exceedsDefinedTiers,
        };
    });
}

export type ComputeActualComplianceInput = {
    occupancy: readonly ActualOccupancyEntry[];
    resolveTiers: (roomLocationId: string, date: string) => readonly RatioTier[];
    resolveCapacityBinding: (roomLocationId: string, date: string) => number | null;
    staffing?: ActualStaffingInput;
};

export type ActualComplianceResult = {
    entries: ActualComplianceEntry[];
    warnings: ActualComplianceWarning[];
};

export function computeActualCompliance(input: ComputeActualComplianceInput): ActualComplianceResult {
    const staffMap = input.staffing?.staffOnHandByRoomDate ?? {};
    const staffing = computeActualStaffingByRoomDate(input.occupancy, input.resolveTiers);

    const entries: ActualComplianceEntry[] = [];
    const warnings: ActualComplianceWarning[] = [];

    for (const s of staffing) {
        const key = roomDateKey(s.roomLocationId, s.date);
        const staffDataAvailable = Object.prototype.hasOwnProperty.call(staffMap, key);
        const staffOnHand = staffDataAvailable ? staffMap[key] : null;
        const staffingGap = staffOnHand == null ? null : s.requiredStaff - staffOnHand;
        const capacityBinding = input.resolveCapacityBinding(s.roomLocationId, s.date);
        const overCapacity = capacityBinding != null && s.childCount > capacityBinding;

        entries.push({
            roomLocationId: s.roomLocationId,
            date: s.date,
            actualChildCount: s.childCount,
            requiredStaff: s.requiredStaff,
            exceedsDefinedTiers: s.exceedsDefinedTiers,
            staffOnHand,
            staffingGap,
            staffDataAvailable,
            capacityBinding,
            overCapacity,
        });

        if (overCapacity) {
            warnings.push({
                code: "over_capacity",
                roomLocationId: s.roomLocationId,
                date: s.date,
                detail: `actual ${s.childCount} exceeds capacity ${capacityBinding}`,
            });
        }
        if (!staffDataAvailable) {
            warnings.push({
                code: "staff_data_unavailable",
                roomLocationId: s.roomLocationId,
                date: s.date,
                detail: "no staff-on-hand data; staffing gap is a placeholder pending staff scheduling",
            });
        } else if (staffingGap != null && staffingGap > 0) {
            warnings.push({
                code: "understaffed",
                roomLocationId: s.roomLocationId,
                date: s.date,
                detail: `actual ${staffOnHand} staff below required ${s.requiredStaff}`,
            });
        }
    }

    return { entries, warnings };
}
