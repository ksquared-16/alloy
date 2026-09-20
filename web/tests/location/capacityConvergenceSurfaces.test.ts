/**
 * Slice 11 (resumed) — the Locations surfaces stop summing legacy capacity.
 *
 * The Slice 9 census found 17 of 17 units carrying an untyped legacy number and
 * zero canonical rules. Four surfaces summed those numbers, and with topology in
 * place the sum added a physical room's seats to the seats of the classrooms
 * inside it. There is no canonical site seat total to replace it with — capacity
 * is room-scoped, kind-specific, effective-dated and binding per context — so
 * these lock coverage in its place, and lock that no seat total comes back.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildLocationWorkspaceModel,
    buildLocationsCollectionModel,
} from "@/lib/locations/locationWorkspaceModel";
import {
    capacityCoverageCohort,
    formatCapacityCoverage,
    siteAcceptsLegacyCapacityCapture,
    summarizeSiteCapacityCoverage,
} from "@/lib/locations/capacityAdoptionState";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const site = (id = "site"): LocationHierarchyRow => ({
    id, label: "North Campus", location_type: "site", parent_location_id: null,
    is_active: true, city: null, state: null, metadata: {},
});
const room = (id: string, over: Partial<LocationHierarchyRow> = {}): LocationHierarchyRow => ({
    id, label: id, location_type: "unit", parent_location_id: "site", is_active: true,
    city: null, state: null, unit_role: "operational_group", metadata: {}, ...over,
});
const rule = (roomId: string, over: Partial<ChildcareCapacityRuleRow> = {}) =>
    ({
        id: `r-${roomId}`, org_id: "org-1", scope_type: "room", site_location_id: null,
        program_category_id: null, room_location_id: roomId, age_group_key: null,
        capacity_kind: "operational", capacity: 12, effective_start: "2026-01-01",
        effective_end: null, source_key: "config", metadata: {}, created_by: null,
        updated_by: null, created_at: "", updated_at: "", ...over,
    }) as ChildcareCapacityRuleRow;

// The topology that produced the 48. Room 1 holds 24; its two classrooms hold 12 each.
const ROOM1 = room("room1", { unit_role: "physical_space", metadata: { capacity: "24" } });
const TOD1 = room("tod1", { parent_location_id: "room1", metadata: { capacity: "12" } });
const TOD2 = room("tod2", { parent_location_id: "room1", metadata: { capacity: "12" } });
const PLAY = room("play", { unit_role: "shared_space", metadata: { capacity: "30" } });
const ROOMS = [ROOM1, TOD1, TOD2, PLAY];

// ---------------------------------------------------------------------------
// 21, 24, 28 — the cohort, and the retirement of the 48.
// ---------------------------------------------------------------------------
describe("21, 24, 28. the old seat sum is gone and does not come back", () => {
    it("21. the cohort is active physical rooms and classrooms — a shared space is not capacity-bearing", () => {
        expect(capacityCoverageCohort(ROOMS).map((r) => r.id)).toEqual(["room1", "tod1", "tod2"]);
    });

    it("21. an inactive room is not outstanding configuration", () => {
        const retired = room("old", { is_active: false, metadata: { capacity: "9" } });
        expect(capacityCoverageCohort([...ROOMS, retired]).map((r) => r.id)).not.toContain("old");
    });

    it("28. RETIRES THE 48. The model reports coverage, and no seat total exists", () => {
        const model = buildLocationWorkspaceModel({
            site: site(), rooms: ROOMS, programs: [], schedules: [], capacityRules: [],
        });
        expect(model.capacityCoverage).toEqual({ total: 3, confirmed: 0, needsReview: 3, unset: 0 });
        // 48 was physical 24 + classrooms 12 + 12. 24 is not a canonical site total
        // either. Neither may appear anywhere in the model's capacity answer.
        const serialized = JSON.stringify(model.capacityCoverage);
        expect(serialized).not.toContain("48");
        expect(serialized).not.toContain("24");
        expect(model).not.toHaveProperty("configuredCapacity");
    });

    it("24. no active Locations surface sums metadata capacity into a site figure", () => {
        for (const rel of [
            "components/adminV2/settings/locations/LocationSiteDetailPanel.tsx",
            "components/adminV2/settings/locations/LocationOverviewSurface.tsx",
            "components/adminV2/settings/locations/LocationsLanding.tsx",
        ]) {
            const src = read(rel);
            expect(src).not.toContain("configuredCapacity");
            expect(src).not.toContain("capacitySummary");
            expect(src).not.toMatch(/seats across active rooms/);
        }
    });

    it("31. coverage adds ROOM COUNTS across locations, never capacities", () => {
        const collection = buildLocationsCollectionModel({
            sites: [site("a"), site("b")],
            rooms: [room("r1", { parent_location_id: "a", metadata: { capacity: "12" } }),
                    room("r2", { parent_location_id: "b", metadata: { capacity: "30" } })],
            programs: [], schedules: [], capacityRules: [],
        });
        expect(collection.totalCapacityCoverage.total).toBe(2);
        expect(JSON.stringify(collection.totalCapacityCoverage)).not.toContain("42");
        expect(collection).not.toHaveProperty("totalConfiguredCapacity");
    });
});

// ---------------------------------------------------------------------------
// 22-23, 25 — coverage presentation.
// ---------------------------------------------------------------------------
describe("22-23, 25. coverage presentation", () => {
    it("22. reads as counts of rooms, never seats", () => {
        expect(formatCapacityCoverage({ total: 17, confirmed: 12, needsReview: 5, unset: 0 }))
            .toBe("12 confirmed · 5 need review");
    });

    it("22. says so plainly when there is nothing yet", () => {
        expect(formatCapacityCoverage({ total: 0, confirmed: 0, needsReview: 0, unset: 0 })).toBe("No rooms yet");
    });

    it("23. an all-confirmed site reads as fully covered", () => {
        expect(formatCapacityCoverage({ total: 3, confirmed: 3, needsReview: 0, unset: 0 })).toBe("3 confirmed");
    });

    it("25. every converged surface renders coverage through the one helper", () => {
        for (const rel of [
            "components/adminV2/settings/locations/LocationSiteDetailPanel.tsx",
            "components/adminV2/settings/locations/LocationOverviewSurface.tsx",
            "components/adminV2/settings/locations/LocationsLanding.tsx",
        ]) {
            expect(read(rel)).toContain("formatCapacityCoverage");
        }
    });
});

// ---------------------------------------------------------------------------
// 26-29 — readiness.
// ---------------------------------------------------------------------------
describe("26-29. readiness distinguishes confirmed from merely present", () => {
    const build = (rooms: LocationHierarchyRow[], rules: ChildcareCapacityRuleRow[]) =>
        buildLocationWorkspaceModel({ site: site(), rooms, programs: [], schedules: [], capacityRules: rules });

    // Site-parented, so the ancestry walk can reach the site from the room list
    // alone. A nested room needs its container present to resolve.
    const FLAT = room("flat", { metadata: { capacity: "12" } });

    it("26. an unconfirmed legacy room is outstanding, not complete", () => {
        const m = build([FLAT], []);
        expect(m.capacityCoverage).toMatchObject({ confirmed: 0, needsReview: 1 });
        expect(m.roomsNeedingCapacity).toBe(1);
    });

    it("27. a canonically covered room counts as configured", () => {
        const m = build([FLAT], [rule("flat")]);
        expect(m.capacityCoverage).toMatchObject({ confirmed: 1, needsReview: 0, unset: 0 });
        expect(m.roomsNeedingCapacity).toBe(0);
    });

    it("28. a canonical rule beside an unreviewed legacy value still counts as covered here", () => {
        // Coverage asks whether canonical capacity exists. Whether the legacy value
        // was ever reviewed is the room's own mixed state, surfaced on the room.
        const m = build([FLAT], [rule("flat")]);
        expect(m.capacityCoverage.confirmed).toBe(1);
        expect(summarizeSiteCapacityCoverage([FLAT], [rule("flat")]).confirmed).toBe(1);
    });

    it("29. a room with nothing at all is unset, not needing review", () => {
        const m = build([room("bare")], []);
        expect(m.capacityCoverage).toMatchObject({ needsReview: 0, unset: 1 });
    });

    it("ambiguous legacy capacity can no longer satisfy completion", () => {
        expect(build([FLAT], []).setupComplete).toBe(false);
    });

    it("25. rail actions key on readiness, not on a legacy number being present", () => {
        const src = read("lib/locations/buildLocationsRailActions.ts");
        expect(src).not.toContain("configuredCapacity");
        expect(src).toContain("roomsNeedingCapacity");
    });
});

// ---------------------------------------------------------------------------
// 17-19, 21-22 — the Add Room debt stop.
// ---------------------------------------------------------------------------
describe("17-19. Add Room stops growing ambiguous debt, by site readiness", () => {
    it("21. a site with NO canonical rules keeps its only capture path", () => {
        expect(siteAcceptsLegacyCapacityCapture([TOD1, TOD2], [])).toBe(true);
    });

    it("22. a site with even one canonical rule stops creating new legacy values", () => {
        expect(siteAcceptsLegacyCapacityCapture([TOD1, TOD2], [rule("tod1")])).toBe(false);
    });

    it("readiness is judged per SITE — another campus adopting does not stop this one", () => {
        expect(siteAcceptsLegacyCapacityCapture([TOD1], [rule("someone-elses-room")])).toBe(true);
    });

    it("19. the create panel omits the input rather than showing one that is ignored", () => {
        const src = read("components/adminV2/settings/locations/LocationRoomCreatePanel.tsx");
        expect(src).toContain("acceptsLegacyCapacity ?");
        expect(src).toContain("locations-room-create-capacity-canonical");
        // And the payload can never carry a legacy capacity once the site moved on.
        expect(src).toContain("acceptsLegacyCapacity ? capacity.trim() || null : null");
    });

    it("19. Add Room grew no typed rule authoring of its own", () => {
        const src = read("components/adminV2/settings/locations/LocationRoomCreatePanel.tsx");
        expect(src).not.toContain("capacity_kind");
        expect(src).not.toContain("operational-config/capacity-rules");
    });
});

// ---------------------------------------------------------------------------
// 26, 30-34 — what must not have moved.
// ---------------------------------------------------------------------------
describe("26, 30-34. boundaries", () => {
    it("30. Program detail is untouched and still uses its own summary field", () => {
        const model = read("lib/locations/locationWorkspaceModel.ts");
        // The program summary keeps its own configuredCapacity; only the site and
        // collection ones converged. Two different fields, deliberately isolated.
        expect(model).toContain("buildLocationProgramOperationalSummaries");
        const panel = read("components/adminV2/settings/locations/LocationProgramDetailPanel.tsx");
        expect(panel).toContain("configuredCapacity");
        expect(panel).not.toContain("capacityCoverage");
    });

    it("32. no capacity kind is inferred anywhere in the convergence", () => {
        const src = read("lib/locations/capacityAdoptionState.ts");
        expect(src).not.toMatch(/unit_role[\s\S]{0,80}capacity_kind/);
        expect(src).not.toMatch(/=\s*["']operational["']\s*;/);
    });

    it("33. no bulk migration path exists", () => {
        const src = read("lib/locations/capacityAdoptionState.ts");
        expect(src).not.toMatch(/adoptAll|bulkAdopt|migrateAll/);
    });

    it("34. topology is untouched", () => {
        expect(read("lib/locations/topologyPresentation.ts")).toContain("presentRoomTopology");
        expect(read("lib/location/topologyMutationAuthority.ts")).toContain("assertTopologyMutationSafe");
    });

    it("31. canonical and legacy are never summed by any converged surface", () => {
        const state = read("lib/locations/capacityAdoptionState.ts");
        expect(state).not.toMatch(/canonical[\s\S]{0,40}\+[\s\S]{0,40}legacy/i);
        expect(state).not.toMatch(/legacyValue[\s\S]{0,30}\+/);
    });
});
