/**
 * Slice 7 — Staff/Scheduling asks for a CLASSROOM, so it may only be offered one.
 *
 * Each materially distinct path is proven independently. One shared adapter does
 * not mean every mounted consumer reached it, and the whole defect this slice
 * repairs was four call sites that each had the provider and read none of it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    assignableClassrooms,
    type SiteOperationalRoom,
} from "@/lib/operationalAssignments/loadSiteOperationalRooms";
import {
    isOperationalGroupRole,
    isPlaceableUnitRole,
    isAttendanceLocatableRole,
} from "@/lib/location/canonicalLocationModel";
import { operationalGroupRooms, placeableRooms } from "@/lib/location/canonicalRoomProvider";
import type { CanonicalRoom } from "@/lib/location/canonicalLocationModel";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

// The canonical representative topology, as SiteOperationalRoom rows.
function siteRoom(over: Partial<SiteOperationalRoom> & { roomId: string }): SiteOperationalRoom {
    return {
        roomName: over.roomId,
        programCategoryId: null,
        active: true,
        unitRole: "operational_group",
        containingSpaceLocationId: null,
        ...over,
    };
}

const ROOM1 = siteRoom({ roomId: "room1", roomName: "Room 1", unitRole: "physical_space" });
const TOD1 = siteRoom({ roomId: "tod1", roomName: "Toddler 1", containingSpaceLocationId: "room1" });
const TOD2 = siteRoom({ roomId: "tod2", roomName: "Toddler 2", containingSpaceLocationId: "room1" });
const INFANT = siteRoom({ roomId: "infant", roomName: "Infant Room" });
const PLAY = siteRoom({ roomId: "play", roomName: "Playground", unitRole: "shared_space" });
const ALL = [ROOM1, TOD1, TOD2, INFANT, PLAY];

const names = (rooms: readonly SiteOperationalRoom[]) => rooms.map((r) => r.roomName);

// ---------------------------------------------------------------------------
// 18 — the representative option set.
// ---------------------------------------------------------------------------
describe("18. the classroom option set for the representative topology", () => {
    it("offers exactly the three classrooms", () => {
        expect(names(assignableClassrooms(ALL))).toEqual(["Toddler 1", "Toddler 2", "Infant Room"]);
    });

    it("5,16. excludes the physical room", () => {
        expect(names(assignableClassrooms(ALL))).not.toContain("Room 1");
    });

    it("6,17. excludes the shared space", () => {
        expect(names(assignableClassrooms(ALL))).not.toContain("Playground");
    });

    it("3. keeps a NESTED classroom — nesting must not hide it", () => {
        const offered = assignableClassrooms(ALL);
        expect(names(offered)).toContain("Toddler 1");
        expect(offered.find((r) => r.roomId === "tod1")!.containingSpaceLocationId).toBe("room1");
    });

    it("4. keeps a direct-site classroom, so no tenant must adopt physical rooms first", () => {
        expect(names(assignableClassrooms(ALL))).toContain("Infant Room");
        expect(assignableClassrooms([INFANT]).map((r) => r.roomId)).toEqual(["infant"]);
    });
});

// ---------------------------------------------------------------------------
// 1-2 — historical compatibility. The failure that would hurt most.
// ---------------------------------------------------------------------------
describe("1-2. a tenant whose rooms all predate Topology V1 loses nothing", () => {
    it("1. a historical room arrives reading as operational_group and stays offered", () => {
        // `loadSiteOperationalRooms` resolves the effective role before this point,
        // so a stored NULL is already `operational_group` here.
        const historical = siteRoom({ roomId: "old", roomName: "Old Room" });
        expect(historical.unitRole).toBe("operational_group");
        expect(names(assignableClassrooms([historical]))).toEqual(["Old Room"]);
    });

    it("1. an all-historical site keeps every classroom option it had", () => {
        const legacy = ["A", "B", "C"].map((n) => siteRoom({ roomId: n, roomName: n }));
        expect(assignableClassrooms(legacy)).toHaveLength(3);
    });

    it("2. an explicit operational_group is offered", () => {
        expect(names(assignableClassrooms([TOD1]))).toEqual(["Toddler 1"]);
    });

    it("never empties a site that has any classroom at all", () => {
        expect(assignableClassrooms([ROOM1, PLAY, INFANT])).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 5-10 — each consumer path independently reaches the filter.
// ---------------------------------------------------------------------------
describe("5-10. every classroom-question path is converged", () => {
    const PICKER_PATHS = [
        ["scheduling route (config view)", "app/api/admin/scheduling/route.ts"],
        ["opportunity first paint", "lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint.ts"],
        ["child scheduling card", "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildScheduling.ts"],
        ["staff scheduling card", "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling.ts"],
    ] as const;

    for (const [name, rel] of PICKER_PATHS) {
        it(`${name} narrows through the shared adapter`, () => {
            const src = read(rel);
            // The symbol must be CALLED, not merely imported. Asserting the bare
            // name passes on a file that still imports the adapter and no longer
            // uses it — which is precisely how a converged call site quietly
            // un-converges.
            const importLine = /import\s*\{[^}]*\}\s*from\s*["'][^"']*loadSiteOperationalRooms["'];?/g;
            const body = src.replace(importLine, "").replace(
                /const\s*\{[^}]*\}\s*=\s*await import\([^)]*\);/g,
                "",
            );
            expect(body).toMatch(/assignableClassrooms\s*[(),]/);
            // 18 — and does not spell the role comparison itself.
            expect(src).not.toMatch(/unitRole\s*===/);
        });
    }

    it("9,10. the ratio roster builds rows for operational groups only", () => {
        const src = read("lib/scheduling/roster/buildRosterReadModel.ts");
        expect(src).toContain("operationalGroupRooms(");
        expect(src).not.toMatch(/unitRole\s*===/);
    });

    it("the ratio roster's filter is the shared one, proven on rooms", () => {
        const rooms = [
            { id: "room1", unitRole: "physical_space" },
            { id: "tod1", unitRole: "operational_group" },
            { id: "play", unitRole: "shared_space" },
        ] as unknown as CanonicalRoom[];
        expect(operationalGroupRooms(rooms).map((r) => r.id)).toEqual(["tod1"]);
    });
});

// ---------------------------------------------------------------------------
// The path that must NOT be filtered.
// ---------------------------------------------------------------------------
describe("the combined roster stays an ALL-LOCATIONS name lookup", () => {
    it("still resolves every unit, because attendance may name a shared space", () => {
        // This originally also asserted the file never mentions operationalGroupRooms,
        // which read the doctrine one level too broadly. The FETCH and the NAME LOOKUP
        // stay wide — that is what lets a roster name a child on the playground. The
        // staffing-cell SEED must narrow, or creating a playground invents a staffing
        // row for it. Mounted QA found exactly that: nine cells for seven classrooms.
        const src = read("lib/roster/buildCombinedRoster.ts");
        expect(src).toContain("resolveRoomsForLocation(supabase, orgId, siteLocationId)");
        expect(src).toContain("const roomNameById = new Map(rooms.map(");
        // The picker adapters remain out of this file; it is not an option set.
        expect(src).not.toContain("assignableClassrooms");
        expect(src).not.toContain("placeableRooms");
    });
});

// ---------------------------------------------------------------------------
// 13-14 — existing assignments.
// ---------------------------------------------------------------------------
describe("13-14. an existing assignment stays readable and is never rewritten", () => {
    it("13. the selected room name renders from the assignment, not from the option list", () => {
        const src = read("components/admin/focusPanel/cards/SchedulingCard.tsx");
        // roomName is seeded from the EXISTING assignment...
        expect(src).toContain("useState<string | null>(ex?.room.name ?? null)");
        // ...and rendered on its own, so narrowing the options cannot blank it.
        expect(src).toContain('data-room-value="true"');
    });

    it("14. nothing in the converged paths writes a room reference", () => {
        for (const rel of [
            "lib/operationalAssignments/loadSiteOperationalRooms.ts",
            "lib/scheduling/roster/buildRosterReadModel.ts",
            "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildScheduling.ts",
            "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling.ts",
        ]) {
            const src = read(rel);
            expect(src).not.toMatch(/\.update\(/);
            expect(src).not.toMatch(/\.upsert\(/);
            expect(src).not.toMatch(/room_location_id:\s/);
        }
    });

    it("the adapter is pure — it returns a new list and mutates nothing", () => {
        const input = [...ALL];
        const before = JSON.stringify(input);
        assignableClassrooms(input);
        expect(JSON.stringify(input)).toBe(before);
        expect(assignableClassrooms(input)).not.toBe(input);
    });
});

// ---------------------------------------------------------------------------
// 15-16 — the boundaries this slice must not cross.
// ---------------------------------------------------------------------------
describe("15-16. Attendance and Assignment are untouched", () => {
    it("15. attendance still locates a child in ANY unit role, shared space included", () => {
        expect(isAttendanceLocatableRole("shared_space")).toBe(true);
        expect(isAttendanceLocatableRole("physical_space")).toBe(true);
        expect(isAttendanceLocatableRole("operational_group")).toBe(true);
        expect(isAttendanceLocatableRole(null)).toBe(false);
    });

    it("15. the attendance room list is not narrowed by the classroom predicate", () => {
        const src = read("lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM.ts");
        expect(src).not.toContain("assignableClassrooms");
        expect(src).not.toContain("operationalGroupRooms");
        expect(src).not.toContain("placeableRooms");
    });

    it("15. whereabouts roll-up is untouched", () => {
        const src = read("lib/childcareOperational/attendance/attendanceWhereabouts.ts");
        expect(src).not.toContain("assignableClassrooms");
        expect(src).not.toContain("operationalGroupRooms");
    });

    it("16. placement still means the same thing after the predicate was factored", () => {
        expect(isPlaceableUnitRole("operational_group")).toBe(true);
        expect(isPlaceableUnitRole("physical_space")).toBe(false);
        expect(isPlaceableUnitRole("shared_space")).toBe(false);
        expect(isPlaceableUnitRole(null)).toBe(false);
    });

    it("16. placement options still use the placement-named helper", () => {
        const src = read("lib/scheduling/options/generatePlacementOptions.ts");
        expect(src).toContain("placeableRooms(");
        expect(src).not.toContain("assignableClassrooms");
    });

    it("placeable and operational-group agree, which is why one delegates to the other", () => {
        for (const role of ["operational_group", "physical_space", "shared_space", null] as const) {
            expect(isPlaceableUnitRole(role)).toBe(isOperationalGroupRole(role));
        }
    });
});

// ---------------------------------------------------------------------------
// 17-21 — no second authority, no heuristics, and the untouched debt.
// ---------------------------------------------------------------------------
describe("17-21. one authority, no heuristics, debt preserved", () => {
    const CONVERGED = [
        "lib/operationalAssignments/loadSiteOperationalRooms.ts",
        "lib/scheduling/roster/buildRosterReadModel.ts",
        "app/api/admin/scheduling/route.ts",
        "lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint.ts",
        "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildScheduling.ts",
        "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableStaffScheduling.ts",
    ];

    it("17. no converged path defines its own role vocabulary", () => {
        for (const rel of CONVERGED) {
            const src = read(rel);
            expect(src).not.toMatch(/=\s*\[\s*["']physical_space["']/);
            expect(src).not.toMatch(/type\s+\w*Role\w*\s*=\s*["']/);
        }
    });

    it("18. no converged path guesses a classroom from its NAME", () => {
        for (const rel of CONVERGED) {
            const src = read(rel);
            expect(src).not.toMatch(/roomName.*\.(includes|startsWith|match)\(/);
            expect(src).not.toMatch(/\/classroom\/i/);
        }
    });

    it("19. no converged path assumes the direct parent is the Site", () => {
        for (const rel of CONVERGED) {
            const src = read(rel);
            expect(src).not.toMatch(/parent_location_id\s*===\s*site/i);
            expect(src).not.toMatch(/parentLocationId\s*===\s*site/i);
        }
    });

    it("20. capacity aggregation is untouched and its tripwire intact", () => {
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        expect(hook).toContain("roomCapacitySummaryForSite");
        expect(hook).toContain("rowsBelongingToSite(roomRows, siteId)");
        expect(hook).not.toContain("operationalGroupRooms");
        expect(hook).not.toContain("assignableClassrooms");
    });

    it("21. OI is untouched BY THIS SLICE", () => {
        // Slice 7 pinned the OI nested-Site defect as still present, to prove it
        // had not been swept in. Slice 8 repaired it deliberately, so pinning the
        // defect is no longer the right assertion — what Slice 7 must still own is
        // that the CLASSROOM narrowing never leaked into OI, which is a different
        // question and is asserted directly.
        const src = read("components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace.tsx");
        expect(src).not.toContain("assignableClassrooms");
        expect(src).not.toContain("operationalGroupRooms");
        expect(src).not.toContain("placeableRooms");
    });
});

// ---------------------------------------------------------------------------
// The picker's own filter still applies on top.
// ---------------------------------------------------------------------------
describe("the picker's existing active filter is preserved", () => {
    it("an inactive classroom is still a classroom to this adapter", () => {
        const inactive = siteRoom({ roomId: "x", roomName: "X", active: false });
        expect(assignableClassrooms([inactive])).toHaveLength(1);
        // The card narrows by `active` itself; this adapter answers only the role.
        expect(read("components/admin/focusPanel/cards/SchedulingCard.tsx")).toContain(
            "seedRooms.filter((r) => r.active !== false)",
        );
    });
});

// ---------------------------------------------------------------------------
// The daily roster seeds staffing rows from groups only.
// ---------------------------------------------------------------------------
describe("a roster cell is a staffing row, so only an operational group seeds one", () => {
    /**
     * Mounted QA found this. Creating "Room 1" (physical space) and "Playground"
     * (shared space) at North Campus produced NINE roster cells for seven
     * classrooms: the playground and the physical shell each got a staffing row
     * reporting `no_ratio_configuration`, and totals.roomsUnknown read 9.
     *
     * Slice 7 looked at this file and deliberately left `rooms` unnarrowed,
     * because it is the NAME lookup and a child on the playground must still be
     * nameable. That reasoning was right about line 233 and wrong about the same
     * variable seeding roomIds further down.
     *
     * So the seed narrows and the name lookup does not. The union that builds
     * roomIds still admits any location with a real child or a scheduled staff
     * member, which is what keeps a genuinely occupied shared space on the board.
     */
    const roster = () => read("lib/roster/buildCombinedRoster.ts");

    it("seeds the cell list from operational groups, not from every unit", () => {
        const src = roster().replace(/^import[\s\S]*?;$/gm, "");
        expect(src).toMatch(/\.\.\.operationalGroupRooms\(rooms\)\.map\(\(r\) => r\.id\)/);
        expect(src).not.toMatch(/const roomIds = \[\s*\.\.\.new Set\(\[\s*\.\.\.rooms\.map\(\(r\) => r\.id\)/);
    });

    it("keeps the name lookup wide, so a shared space can still be named", () => {
        const src = roster().replace(/^import[\s\S]*?;$/gm, "");
        expect(src).toMatch(/const roomNameById = new Map\(rooms\.map\(/);
    });

    it("still admits a location that genuinely has a child or scheduled staff", () => {
        const src = roster().replace(/^import[\s\S]*?;$/gm, "");
        expect(src).toMatch(/\.\.\.childrenByRoom\.keys\(\)/);
        expect(src).toMatch(/staffSupply\.cells[\s\S]{0,120}roomLocationId/);
    });
});
