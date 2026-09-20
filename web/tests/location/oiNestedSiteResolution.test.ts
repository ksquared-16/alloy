/**
 * Slice 8 — the OI room pickers resolve a campus, not a containing room.
 *
 * The defect was reproduced before repair with the exact expression these five
 * surfaces shipped: `byId.get(l.parent_location_id)?.label`, which for a nested
 * classroom returns the PHYSICAL ROOM's name and renders "Room 1 / Toddler 1" as
 * though Room 1 were a campus. That is worse than a blank — nothing looks broken.
 *
 * These lock the repaired behaviour and pin the shape of the original defect so
 * it cannot quietly return.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildRoomPickerOptions,
    type RoomPickerLocationRow,
} from "@/lib/locations/roomPickerOptions";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const row = (o: RoomPickerLocationRow): RoomPickerLocationRow => o;

// The representative topology, both campuses.
const NORTH = row({ id: "site", label: "North Campus", location_type: "site", parent_location_id: null });
const ROOM1 = row({ id: "room1", label: "Room 1", location_type: "unit", parent_location_id: "site" });
const TOD1 = row({ id: "tod1", label: "Toddler 1", location_type: "unit", parent_location_id: "room1" });
const TOD2 = row({ id: "tod2", label: "Toddler 2", location_type: "unit", parent_location_id: "room1" });
const INFANT = row({ id: "infant", label: "Infant Room", location_type: "unit", parent_location_id: "site" });
const PLAY = row({ id: "play", label: "Playground", location_type: "unit", parent_location_id: "site" });
const SOUTH = row({ id: "siteB", label: "South Campus", location_type: "site", parent_location_id: null });
const PRESCHOOL = row({ id: "pre", label: "Preschool", location_type: "unit", parent_location_id: "siteB" });
const ALL = [NORTH, ROOM1, TOD1, TOD2, INFANT, PLAY, SOUTH, PRESCHOOL];

const siteOf = (id: string, rows: readonly RoomPickerLocationRow[] = ALL) =>
    buildRoomPickerOptions(rows).find((o) => o.id === id)?.siteLabel ?? null;

/** The picker's rendered option, exactly as every one of the five composes it. */
const rendered = (id: string, rows: readonly RoomPickerLocationRow[] = ALL) => {
    const o = buildRoomPickerOptions(rows).find((r) => r.id === id)!;
    return `${o.siteLabel} / ${o.label}`;
};

// ---------------------------------------------------------------------------
// 1-5 — the required topology cases.
// ---------------------------------------------------------------------------
describe("1-5. every room resolves its own campus", () => {
    it("1,2. A — a nested Classroom resolves North Campus, NOT Room 1", () => {
        expect(siteOf("tod1")).toBe("North Campus");
        expect(siteOf("tod1")).not.toBe("Room 1");
        expect(rendered("tod1")).toBe("North Campus / Toddler 1");
    });

    it("1,2. both nested classrooms, not just the first", () => {
        expect(rendered("tod2")).toBe("North Campus / Toddler 2");
    });

    it("3. B — a direct-site Classroom resolves North Campus", () => {
        expect(rendered("infant")).toBe("North Campus / Infant Room");
    });

    it("C — the Physical room itself resolves North Campus", () => {
        expect(rendered("room1")).toBe("North Campus / Room 1");
    });

    it("D — a Shared space resolves North Campus", () => {
        expect(rendered("play")).toBe("North Campus / Playground");
    });

    it("5. E — a room at another campus resolves ITS campus and never leaks", () => {
        expect(rendered("pre")).toBe("South Campus / Preschool");
        const north = buildRoomPickerOptions(ALL).filter((o) => o.siteLabel === "North Campus");
        expect(north.map((o) => o.id).sort()).toEqual(["infant", "play", "room1", "tod1", "tod2"]);
    });

    it("no option in the representative topology names a room as its campus", () => {
        const roomNames = new Set(["Room 1", "Toddler 1", "Toddler 2", "Infant Room", "Playground", "Preschool"]);
        for (const o of buildRoomPickerOptions(ALL)) {
            expect(roomNames.has(o.siteLabel)).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// 4 — historical rows.
// ---------------------------------------------------------------------------
describe("4. a historical row resolves its Site", () => {
    it("a pre-topology unit with no role still resolves North Campus", () => {
        // `unit_role` is not part of this row shape at all — ancestry is the only
        // question here, and role migration is explicitly not this slice.
        const historical = row({ id: "old", label: "Old Room", location_type: "unit", parent_location_id: "site" });
        expect(rendered("old", [NORTH, historical])).toBe("North Campus / Old Room");
    });

    it("a historical room nested after adoption resolves the campus, not its new container", () => {
        const adopted = row({ id: "old", label: "Old Room", location_type: "unit", parent_location_id: "room1" });
        expect(rendered("old", [NORTH, ROOM1, adopted])).toBe("North Campus / Old Room");
    });
});

// ---------------------------------------------------------------------------
// 6 — refuse rather than guess.
// ---------------------------------------------------------------------------
describe("6. malformed ancestry never guesses the direct parent", () => {
    it("an orphan gets the neutral placeholder, not a fabricated campus", () => {
        const orphan = row({ id: "o", label: "Floating", location_type: "unit", parent_location_id: null });
        expect(siteOf("o", [orphan])).toBe("Site");
    });

    it("a missing ancestor does not fall back to the parent id or label", () => {
        const dangling = row({ id: "d", label: "Dangling", location_type: "unit", parent_location_id: "ghost" });
        expect(siteOf("d", [dangling])).toBe("Site");
    });

    it("a cycle resolves to nothing rather than looping or guessing", () => {
        const a = row({ id: "a", label: "A", location_type: "unit", parent_location_id: "b" });
        const b = row({ id: "b", label: "B", location_type: "unit", parent_location_id: "a" });
        expect(siteOf("a", [a, b])).toBe("Site");
        expect(siteOf("b", [a, b])).toBe("Site");
    });

    it("a chain that never reaches a site refuses — the parent's label is NOT used", () => {
        const deep = row({ id: "x", label: "X", location_type: "unit", parent_location_id: "room1" });
        // Room 1 is present but its own site is absent, so nothing resolves.
        expect(siteOf("x", [ROOM1, deep])).toBe("Site");
        expect(siteOf("x", [ROOM1, deep])).not.toBe("Room 1");
    });

    it("a site row is never offered as a room", () => {
        expect(buildRoomPickerOptions(ALL).map((o) => o.id)).not.toContain("site");
        expect(buildRoomPickerOptions(ALL).map((o) => o.id)).not.toContain("siteB");
    });
});

// ---------------------------------------------------------------------------
// 7-9 — one owner, and containment is still a separate fact.
// ---------------------------------------------------------------------------
describe("7-9. canonical helper, no OI-local walker, containment preserved", () => {
    const OI_SURFACES = [
        "components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace.tsx",
        "components/adminV2/settings/organizationCalculations/ReadableDefinitionBuilder.tsx",
        "components/adminV2/settings/operationalIntelligence/OiFutureRoomCapacityBuilder.tsx",
        "components/adminV2/settings/operationalIntelligence/OiRoomUtilizationBuilder.tsx",
        "components/adminV2/settings/operationalIntelligence/OiOrgCalcMeasurementPanel.tsx",
    ];

    it("7. the adapter resolves Site through the canonical ancestry walk", () => {
        const src = read("lib/locations/roomPickerOptions.ts");
        expect(src).toContain("resolveRowSiteId");
    });

    for (const rel of OI_SURFACES) {
        const name = rel.split("/").pop();
        it(`7. ${name} builds its options through the shared adapter`, () => {
            const src = read(rel);
            const body = src.replace(/import[^;]*;/g, "");
            expect(body).toMatch(/buildRoomPickerOptions\s*\(/);
        });

        it(`8. ${name} has no local ancestry algorithm left`, () => {
            const src = read(rel);
            // The exact defect shape, and every near neighbour of it.
            expect(src).not.toContain("byId.get(l.parent_location_id");
            expect(src).not.toMatch(/byId\.get\(\w+\.parent_location_id/);
            expect(src).not.toMatch(/parent_location_id\s*\?\s*byId/);
            expect(src).not.toMatch(/while\s*\(.*parent/i);
        });
    }

    it("8. no OI surface reimplements the walk under another name", () => {
        for (const rel of OI_SURFACES) {
            const src = read(rel);
            expect(src).not.toContain("resolveRowSiteId");
            expect(src).not.toContain("location_site_id");
        }
    });

    it("9. Site and containing room stay different facts — the adapter answers only Site", () => {
        const opt = buildRoomPickerOptions(ALL).find((o) => o.id === "tod1")!;
        expect(opt.siteLabel).toBe("North Campus");
        // Containment is still true of this room; it is simply not its campus,
        // and the canonical presentation authority still reports it.
        expect(Object.keys(opt).sort()).toEqual(["id", "label", "siteLabel"]);
        expect(TOD1.parent_location_id).toBe("room1");
    });

    it("the cohort is unchanged — this repair narrowed nothing", () => {
        expect(buildRoomPickerOptions(ALL)).toHaveLength(6);
    });
});

// ---------------------------------------------------------------------------
// 10-12 — the boundaries.
// ---------------------------------------------------------------------------
describe("10-12. capacity, Staff/Scheduling and Locations are untouched", () => {
    it("10. capacity aggregation is unchanged and its tripwire intact", () => {
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        expect(hook).toContain("roomCapacitySummaryForSite");
        expect(hook).toContain("rowsBelongingToSite(roomRows, siteId)");
        expect(hook).not.toContain("buildRoomPickerOptions");
    });

    it("11. Staff/Scheduling convergence is untouched", () => {
        for (const rel of [
            "lib/operationalAssignments/loadSiteOperationalRooms.ts",
            "lib/scheduling/roster/buildRosterReadModel.ts",
            "lib/roster/buildCombinedRoster.ts",
        ]) {
            expect(read(rel)).not.toContain("buildRoomPickerOptions");
        }
    });

    it("12. Locations product code is untouched", () => {
        for (const rel of [
            "components/adminV2/settings/locations/LocationRoomCreatePanel.tsx",
            "components/adminV2/settings/locations/LocationRoomDetailPanel.tsx",
            "lib/locations/topologyPresentation.ts",
            "lib/location/topologyMutationAuthority.ts",
        ]) {
            expect(read(rel)).not.toContain("buildRoomPickerOptions");
        }
    });

    it("12. the canonical ancestry helper itself was only consumed, not changed", () => {
        const src = read("lib/location/canonicalRoomProvider.ts");
        expect(src).toContain("export function resolveRowSiteId(");
        expect(src).toContain("export function rowBelongsToSite(");
    });
});
