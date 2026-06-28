import { describe, expect, it } from "vitest";
import {
    aggregateActualOccupancyByRoomDate,
    computeActualCompliance,
    computeActualStaffingByRoomDate,
} from "@/lib/childcareOperational/attendance/actualCompliance";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";
import type { RatioTier } from "@/lib/childcareOperational/config/ratioRules";

const DATE = "2026-06-15";

function ev(p: Partial<ChildAttendanceEventRow> & Pick<ChildAttendanceEventRow, "id" | "event_kind" | "customer_member_id">): ChildAttendanceEventRow {
    return {
        org_id: "org-1",
        enrollment_agreement_id: "agr-1",
        site_location_id: "site-1",
        entry_type: "original",
        corrects_event_id: null,
        event_at: `${DATE}T08:00:00Z`,
        service_date: DATE,
        room_location_id: null,
        from_room_location_id: null,
        to_room_location_id: null,
        actor_type: "staff",
        actor_user_id: null,
        actor_person_id: null,
        actor_label: null,
        source_type: "operator_action",
        source_key: "operator_action",
        reason_key: null,
        note: null,
        metadata: {},
        created_by: null,
        created_at: `${DATE}T08:00:00Z`,
        ...p,
    };
}

const TIERS: RatioTier[] = [
    { max_children: 4, required_staff: 1 },
    { max_children: 8, required_staff: 2 },
];
const resolveTiers = () => TIERS;

describe("aggregateActualOccupancyByRoomDate", () => {
    it("counts distinct children observed per room/date", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", customer_member_id: "m1", room_location_id: "room-a" }),
            ev({ id: "e2", event_kind: "check_in", customer_member_id: "m2", room_location_id: "room-a" }),
            ev({ id: "e3", event_kind: "check_in", customer_member_id: "m3", room_location_id: "room-b" }),
        ];
        const occ = aggregateActualOccupancyByRoomDate(events);
        expect(occ).toEqual([
            { roomLocationId: "room-a", date: DATE, childCount: 2 },
            { roomLocationId: "room-b", date: DATE, childCount: 1 },
        ]);
    });

    it("a room transfer adds the child to the destination room occupancy", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", customer_member_id: "m1", room_location_id: "room-a" }),
            ev({
                id: "e2",
                event_kind: "room_transfer",
                customer_member_id: "m1",
                event_at: `${DATE}T10:00:00Z`,
                from_room_location_id: "room-a",
                to_room_location_id: "room-b",
            }),
        ];
        const occ = aggregateActualOccupancyByRoomDate(events);
        const byRoom = Object.fromEntries(occ.map((o) => [o.roomLocationId, o.childCount]));
        expect(byRoom["room-a"]).toBe(1);
        expect(byRoom["room-b"]).toBe(1);
    });

    it("excludes reversed presence", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", customer_member_id: "m1", room_location_id: "room-a" }),
            ev({ id: "e2", event_kind: "check_in", customer_member_id: "m1", entry_type: "reversal", corrects_event_id: "e1", room_location_id: "room-a" }),
        ];
        expect(aggregateActualOccupancyByRoomDate(events)).toHaveLength(0);
    });
});

describe("computeActualStaffingByRoomDate", () => {
    it("derives required staff from actual occupancy + ratio tiers", () => {
        const occ = [{ roomLocationId: "room-a", date: DATE, childCount: 6 }];
        const [s] = computeActualStaffingByRoomDate(occ, resolveTiers);
        expect(s.requiredStaff).toBe(2);
        expect(s.exceedsDefinedTiers).toBe(false);
    });
});

describe("computeActualCompliance", () => {
    const occupancy = [{ roomLocationId: "room-a", date: DATE, childCount: 6 }];

    it("returns a placeholder gap (not a failure) when staff data is unavailable", () => {
        const r = computeActualCompliance({
            occupancy,
            resolveTiers,
            resolveCapacityBinding: () => null,
        });
        expect(r.entries[0].requiredStaff).toBe(2);
        expect(r.entries[0].staffOnHand).toBeNull();
        expect(r.entries[0].staffingGap).toBeNull();
        expect(r.entries[0].staffDataAvailable).toBe(false);
        expect(r.warnings.map((w) => w.code)).toContain("staff_data_unavailable");
    });

    it("computes a staffing gap and understaffed warning when staff data exists", () => {
        const r = computeActualCompliance({
            occupancy,
            resolveTiers,
            resolveCapacityBinding: () => null,
            staffing: { staffOnHandByRoomDate: { [`room-a::${DATE}`]: 1 } },
        });
        expect(r.entries[0].staffingGap).toBe(1);
        expect(r.warnings.map((w) => w.code)).toContain("understaffed");
    });

    it("flags over_capacity when actual exceeds binding capacity", () => {
        const r = computeActualCompliance({
            occupancy,
            resolveTiers,
            resolveCapacityBinding: () => 4,
            staffing: { staffOnHandByRoomDate: { [`room-a::${DATE}`]: 2 } },
        });
        expect(r.entries[0].overCapacity).toBe(true);
        expect(r.warnings.map((w) => w.code)).toContain("over_capacity");
    });

    it("no understaffed warning when staff meets requirement", () => {
        const r = computeActualCompliance({
            occupancy,
            resolveTiers,
            resolveCapacityBinding: () => 20,
            staffing: { staffOnHandByRoomDate: { [`room-a::${DATE}`]: 2 } },
        });
        expect(r.entries[0].staffingGap).toBe(0);
        expect(r.warnings.map((w) => w.code)).not.toContain("understaffed");
        expect(r.warnings.map((w) => w.code)).not.toContain("over_capacity");
    });
});
