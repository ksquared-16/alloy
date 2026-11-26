/**
 * R4 — a projection row's room comes from the placement covering the row's start, or from nothing.
 * The removed fallback (`placements[0]`) labelled a row no placement covered with whichever placement
 * the read returned first — another date's room.
 */
import { describe, expect, it } from "vitest";

import type { ChildPlacementRow, ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { placementForAssignment } from "@/lib/scheduling/projection/buildSchedulingProjection";

const plc = (over: Partial<ChildPlacementRow>): ChildPlacementRow => ({
    id: "p", org_id: "o", enrollment_agreement_id: "ag", customer_member_id: "m", site_location_id: "site",
    program_category_id: null, room_location_id: "ROOM_A", start_date: "2026-09-01", end_date: null, status: "active",
    reason_key: null, source_key: "test", supersedes_placement_id: null, metadata: {}, created_by: null, updated_by: null,
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...over,
});
const asg = (start_date: string) => ({ id: "a", start_date } as unknown as ScheduleAssignmentRow);

describe("R4: a row's placement room is date-true", () => {
    const earlier = plc({ id: "p1", room_location_id: "ROOM_A", start_date: "2026-09-01", end_date: "2026-10-31", status: "superseded" });
    const later = plc({ id: "p2", room_location_id: "ROOM_B", start_date: "2026-11-01" });

    it("each row resolves to the placement covering its start, in any read order", () => {
        expect(placementForAssignment([later, earlier], asg("2026-09-15"))?.room_location_id).toBe("ROOM_A");
        expect(placementForAssignment([earlier, later], asg("2026-11-20"))?.room_location_id).toBe("ROOM_B");
    });

    it("a row no placement covers names no room — never the first placement read", () => {
        expect(placementForAssignment([later, earlier], asg("2026-08-01"))).toBeNull();
        expect(placementForAssignment([earlier], asg("2026-12-01"))).toBeNull();
    });

    it("no placements → none", () => {
        expect(placementForAssignment([], asg("2026-11-20"))).toBeNull();
    });
});
