import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    resolveRoomById,
    resolveRoomsForLocation,
    resolveRoomsForProgram,
    toCanonicalRoom,
} from "@/lib/location/canonicalRoomProvider";
import { normalizeLocationRow } from "@/lib/location/canonicalLocationProvider";
import {
    CANONICAL_ROOM_PROVIDER_ENTRYPOINTS,
    KNOWN_ROOM_DIRECT_QUERY_OFFENDERS,
} from "@/lib/location/roomConsumerConvergence";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

function loc(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        org_id: ORG_ID,
        label: null,
        location_type: "unit",
        parent_location_id: null,
        status_key: null,
        is_active: true,
        is_primary: false,
        metadata: {},
        ...overrides,
    };
}

function setup() {
    const store = createOperationalEnrollmentMockStore({
        locations: [
            loc({ id: "site-a", label: "Alpha", location_type: "site", parent_location_id: null }),
            loc({ id: "site-b", label: "Bravo", location_type: "site", parent_location_id: null }),
            loc({ id: "room-a1", label: "Infant Room", parent_location_id: "site-a", metadata: { classroom_age_group: "infant" } }),
            loc({ id: "room-a2", label: "Toddler Room", parent_location_id: "site-a", metadata: { childcare_program_type: "toddler" } }),
            loc({ id: "room-a3", label: "Flex Room", parent_location_id: "site-a", metadata: {} }),
            loc({ id: "room-a-inactive", label: "Closed Room", parent_location_id: "site-a", is_active: false }),
            loc({ id: "room-b1", label: "Bravo Room", parent_location_id: "site-b" }),
            loc({ id: "addr-1", label: "Home", location_type: "address" }),
        ],
    });
    return createOperationalEnrollmentMockSupabase(store);
}

describe("toCanonicalRoom", () => {
    it("projects a unit with parent into a room and reads age-band hint", () => {
        const room = toCanonicalRoom(normalizeLocationRow(loc({ id: "r", parent_location_id: "s", metadata: { classroom_age_group: "infant" } })));
        expect(room?.siteLocationId).toBe("s");
        expect(room?.ageGroupCompat).toBe("infant");
    });
    it("returns null for a site, an address, or an orphan unit", () => {
        expect(toCanonicalRoom(normalizeLocationRow(loc({ id: "s", location_type: "site" })))).toBeNull();
        expect(toCanonicalRoom(normalizeLocationRow(loc({ id: "a", location_type: "address" })))).toBeNull();
        expect(toCanonicalRoom(normalizeLocationRow(loc({ id: "o", location_type: "unit", parent_location_id: null })))).toBeNull();
    });
});

describe("resolveRoomsForLocation", () => {
    it("returns active rooms of the site only (no cross-location, no site/address)", async () => {
        const supabase = setup();
        const rooms = await resolveRoomsForLocation(supabase, ORG_ID, "site-a");
        expect(rooms.map((r) => r.id).sort()).toEqual(["room-a1", "room-a2", "room-a3"]);
        expect(rooms.every((r) => r.siteLocationId === "site-a")).toBe(true);
    });
    it("returns empty for a non-site id", async () => {
        const supabase = setup();
        expect(await resolveRoomsForLocation(supabase, ORG_ID, "room-a1")).toEqual([]);
    });
    it("includeInactive surfaces closed rooms", async () => {
        const supabase = setup();
        const rooms = await resolveRoomsForLocation(supabase, ORG_ID, "site-a", { includeInactive: true });
        expect(rooms.some((r) => r.id === "room-a-inactive")).toBe(true);
    });
});

describe("resolveRoomById", () => {
    it("resolves a unit and rejects a site/address/unknown", async () => {
        const supabase = setup();
        expect((await resolveRoomById(supabase, ORG_ID, "room-a1"))?.name).toBe("Infant Room");
        expect(await resolveRoomById(supabase, ORG_ID, "site-a")).toBeNull();
        expect(await resolveRoomById(supabase, ORG_ID, "addr-1")).toBeNull();
        expect(await resolveRoomById(supabase, ORG_ID, "nope")).toBeNull();
    });
});

describe("resolveRoomsForProgram — eligibility (no invented certainty)", () => {
    it("tags eligible / not_eligible / unknown and never drops unknown rooms", async () => {
        const supabase = setup();
        const matches = await resolveRoomsForProgram(supabase, ORG_ID, "site-a", "infant");
        const byId = Object.fromEntries(matches.map((m) => [m.room.id, m.eligibility]));
        expect(byId["room-a1"]).toBe("eligible"); // classroom_age_group === infant
        expect(byId["room-a2"]).toBe("not_eligible"); // childcare_program_type === toddler
        expect(byId["room-a3"]).toBe("unknown"); // no age-band data
        expect(Object.keys(byId).sort()).toEqual(["room-a1", "room-a2", "room-a3"]);
    });
});

describe("room consumer-convergence ledger", () => {
    it("enumerates the frozen offender surface and the provider entrypoints", () => {
        expect(KNOWN_ROOM_DIRECT_QUERY_OFFENDERS.length).toBeGreaterThan(0);
        expect(new Set(KNOWN_ROOM_DIRECT_QUERY_OFFENDERS).size).toBe(KNOWN_ROOM_DIRECT_QUERY_OFFENDERS.length);
        expect(CANONICAL_ROOM_PROVIDER_ENTRYPOINTS).toContain("resolveRoomsForLocation");
    });
    it("the canonical Room provider projects via the Location provider, not a raw locations query", () => {
        const src = readFileSync(resolve(__dirname, "../../lib/location/canonicalRoomProvider.ts"), "utf8");
        // It must delegate to the Location provider hierarchy...
        expect(src).toMatch(/resolveLocationHierarchy/);
        // ...and never touch the raw `locations` table itself.
        expect(src).not.toMatch(/\.from\(\s*["']locations["']\s*\)/);
    });
});
