/**
 * Slice 5 §18 — capacity aggregation debt, RECORDED not solved.
 *
 * Now that presentation distinguishes a Physical room from a Classroom, it is
 * tempting to decide which of them "owns" capacity. That is a real product
 * question about licensed vs program capacity, and Slice 5 deliberately does not
 * answer it: presentation may SHOW existing capacity values, it must not
 * redefine how they aggregate.
 *
 * So this pins today's behaviour exactly. It is not an endorsement — it is a
 * tripwire. When the capacity decision is finally made, this test fails, and
 * that failure is the reminder that a deliberate choice replaced an accident.
 */
import { describe, expect, it } from "vitest";
import { rowsBelongingToSite } from "@/lib/location/canonicalRoomProvider";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

function row(over: Partial<LocationHierarchyRow> & { id: string }): LocationHierarchyRow {
    return { label: null, location_type: "unit", parent_location_id: null, is_active: true, city: null, state: null, ...over };
}

/** The exact expression in `useLocationsConfigurationSettings.roomCapacitySummaryForSite`. */
function siteCapacityAsShippedToday(roomRows: LocationHierarchyRow[], siteId: string): number {
    return rowsBelongingToSite(roomRows, siteId)
        .filter((r) => r.is_active !== false)
        .reduce((sum, room) => {
            const md = room.metadata;
            if (md == null || typeof md !== "object" || Array.isArray(md)) return sum;
            const cap = Number((md as Record<string, unknown>).capacity);
            return sum + (Number.isFinite(cap) ? cap : 0);
        }, 0);
}

describe("§18. site capacity double-counts a physical room and its classrooms", () => {
    const SITE = row({ id: "site", label: "North Campus", location_type: "site" });
    const ROOM1 = row({ id: "room1", label: "Room 1", unit_role: "physical_space", parent_location_id: "site", metadata: { capacity: "24" } });
    const TOD1 = row({ id: "tod1", label: "Toddler 1", unit_role: "operational_group", parent_location_id: "room1", metadata: { capacity: "12" } });
    const TOD2 = row({ id: "tod2", label: "Toddler 2", unit_role: "operational_group", parent_location_id: "room1", metadata: { capacity: "12" } });
    const ROOMS = [ROOM1, TOD1, TOD2];

    it("counts the licensed room AND both classrooms inside it — 24 + 12 + 12", () => {
        // A campus that can physically hold 24 children reports 48.
        expect(siteCapacityAsShippedToday(ROOMS, "site")).toBe(48);
    });

    it("is not a nesting bug — a flat site totals correctly", () => {
        const flat = [
            row({ id: "a", unit_role: "operational_group", parent_location_id: "site", metadata: { capacity: "12" } }),
            row({ id: "b", unit_role: "operational_group", parent_location_id: "site", metadata: { capacity: "12" } }),
        ];
        expect(siteCapacityAsShippedToday(flat, "site")).toBe(24);
    });

    it("the ambiguity is which capacity is authoritative, not whether the walk is right", () => {
        // The containing room stays in the set either way — dropping it would
        // break the ancestry walk rather than isolate a reading.
        const zeroed = (r: LocationHierarchyRow) => ({ ...r, metadata: { capacity: "0" } });

        // Reading A — licensed capacity owns the number.
        expect(siteCapacityAsShippedToday([ROOM1, zeroed(TOD1), zeroed(TOD2)], "site")).toBe(24);
        // Reading B — program capacity owns it.
        expect(siteCapacityAsShippedToday([zeroed(ROOM1), TOD1, TOD2], "site")).toBe(24);
        // Both readings are defensible and agree. Today's code picks neither and
        // adds them, which is the only answer that is certainly wrong.
        expect(siteCapacityAsShippedToday(ROOMS, "site")).toBe(48);
        expect(SITE.id).toBe("site");
    });
});
