/**
 * Location Topology V1 — physical space vs operational group vs shared space.
 *
 * The regression these tests exist to prevent is SILENT, not loud: before this
 * change `toCanonicalRoom` read `parent_location_id` as the site, so a group
 * nested inside a physical space would have been attributed to that space. The
 * value returned is a real location id, so nothing throws and no consumer
 * notices — occupancy simply lands under the wrong scope. Every assertion about
 * `siteLocationId` below is guarding that specific failure.
 */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_UNIT_ROLE,
    effectiveUnitRole,
    isPlaceableUnitRole,
    type CanonicalLocation,
} from "@/lib/location/canonicalLocationModel";
import {
    normalizeLocationRow,
    resolveSiteIdsByLocation,
} from "@/lib/location/canonicalLocationProvider";
import {
    groupsInSpace,
    placeableRooms,
    toCanonicalRoom,
} from "@/lib/location/canonicalRoomProvider";

const ORG = "org-1";

function row(over: Record<string, unknown>): Record<string, unknown> {
    return { id: "x", org_id: ORG, label: "L", location_type: "unit", ...over };
}

const SITE = normalizeLocationRow(row({ id: "site", location_type: "site", parent_location_id: null }));
const ROOM1 = normalizeLocationRow(
    row({ id: "room1", label: "Room 1", parent_location_id: "site", unit_role: "physical_space" })
);
const TOD1 = normalizeLocationRow(
    row({ id: "tod1", label: "Toddler 1", parent_location_id: "room1", unit_role: "operational_group" })
);
const TOD2 = normalizeLocationRow(
    row({ id: "tod2", label: "Toddler 2", parent_location_id: "room1", unit_role: "operational_group" })
);
const PLAY = normalizeLocationRow(
    row({ id: "play", label: "Playground", parent_location_id: "site", unit_role: "shared_space" })
);
/** A room created before roles existed: no `unit_role`, parented straight to the site. */
const LEGACY = normalizeLocationRow(row({ id: "legacy", label: "Infant A", parent_location_id: "site" }));

const ALL: CanonicalLocation[] = [SITE, ROOM1, TOD1, TOD2, PLAY, LEGACY];

describe("unit roles", () => {
    it("reads a legacy unit with no stored role as an operational group", () => {
        expect(LEGACY.unitRole).toBe(DEFAULT_UNIT_ROLE);
        expect(effectiveUnitRole("unit", null)).toBe("operational_group");
    });

    it("carries an explicit role through normalization", () => {
        expect(ROOM1.unitRole).toBe("physical_space");
        expect(TOD1.unitRole).toBe("operational_group");
        expect(PLAY.unitRole).toBe("shared_space");
    });

    it("gives a site or address no unit role at all", () => {
        expect(SITE.unitRole).toBeNull();
        expect(effectiveUnitRole("site", null)).toBeNull();
        expect(effectiveUnitRole("address", null)).toBeNull();
    });

    it("treats an unrecognised stored role as the legacy default rather than trusting it", () => {
        const weird = normalizeLocationRow(row({ id: "w", parent_location_id: "site", unit_role: "nonsense" }));
        expect(weird.unitRole).toBe("operational_group");
    });

    it("permits placement only into an operational group", () => {
        expect(isPlaceableUnitRole("operational_group")).toBe(true);
        expect(isPlaceableUnitRole("physical_space")).toBe(false);
        expect(isPlaceableUnitRole("shared_space")).toBe(false);
        expect(isPlaceableUnitRole(null)).toBe(false);
    });
});

describe("site resolution by ancestry", () => {
    it("resolves a nested group to the SITE, not to its containing space", () => {
        const sites = resolveSiteIdsByLocation(ALL);
        expect(sites.get("tod1")).toBe("site");
        expect(sites.get("tod2")).toBe("site");
        // The regression guard: the parent is room1, and room1 is NOT the site.
        expect(TOD1.parentLocationId).toBe("room1");
        expect(sites.get("tod1")).not.toBe(TOD1.parentLocationId);
    });

    it("resolves site-parented rooms exactly as before", () => {
        const sites = resolveSiteIdsByLocation(ALL);
        expect(sites.get("room1")).toBe("site");
        expect(sites.get("play")).toBe("site");
        expect(sites.get("legacy")).toBe("site");
    });

    it("resolves a site to itself", () => {
        expect(resolveSiteIdsByLocation(ALL).get("site")).toBe("site");
    });

    it("leaves an orphan unresolved rather than inventing a site", () => {
        const orphan = normalizeLocationRow(row({ id: "orphan", parent_location_id: null }));
        expect(resolveSiteIdsByLocation([orphan]).get("orphan")).toBeUndefined();
    });

    it("does not loop or resolve on a cycle", () => {
        const a = normalizeLocationRow(row({ id: "a", parent_location_id: "b" }));
        const b = normalizeLocationRow(row({ id: "b", parent_location_id: "a" }));
        const sites = resolveSiteIdsByLocation([a, b]);
        expect(sites.get("a")).toBeUndefined();
        expect(sites.get("b")).toBeUndefined();
    });

    it("leaves a chain that never reaches a site unresolved", () => {
        const dangling = normalizeLocationRow(row({ id: "d", parent_location_id: "missing" }));
        expect(resolveSiteIdsByLocation([dangling]).get("d")).toBeUndefined();
    });
});

describe("toCanonicalRoom", () => {
    it("uses the RESOLVED site for a nested group, never the parent space", () => {
        const room = toCanonicalRoom(TOD1, "site");
        expect(room?.siteLocationId).toBe("site");
        expect(room?.containingSpaceLocationId).toBe("room1");
        expect(room?.unitRole).toBe("operational_group");
    });

    it("reports no containing space for a room that hangs off the site", () => {
        expect(toCanonicalRoom(LEGACY, "site")?.containingSpaceLocationId).toBeNull();
        expect(toCanonicalRoom(PLAY, "site")?.containingSpaceLocationId).toBeNull();
    });

    it("keeps the legacy single-argument behaviour for site-parented rooms", () => {
        const room = toCanonicalRoom(LEGACY);
        expect(room?.siteLocationId).toBe("site");
        expect(room?.unitRole).toBe("operational_group");
    });

    it("still refuses non-units and orphans", () => {
        expect(toCanonicalRoom(SITE)).toBeNull();
        expect(toCanonicalRoom(normalizeLocationRow(row({ id: "o", parent_location_id: null })))).toBeNull();
    });
});

describe("the divided room, the playground, and combining", () => {
    const rooms = ALL.filter((l) => l.type === "unit").map((l) => toCanonicalRoom(l, "site")!);

    it("A — Room 1 contains Toddler 1 and Toddler 2", () => {
        const contained = groupsInSpace(rooms, "room1").map((r) => r.name);
        expect(contained.sort()).toEqual(["Toddler 1", "Toddler 2"]);
    });

    it("A — Room 1 keeps its identity as the licensed physical space", () => {
        const room1 = rooms.find((r) => r.id === "room1");
        expect(room1?.unitRole).toBe("physical_space");
        expect(room1?.containingSpaceLocationId).toBeNull();
    });

    it("C/D — a shared space is distinguishable from a classroom and is not placeable", () => {
        const play = rooms.find((r) => r.id === "play");
        expect(play?.unitRole).toBe("shared_space");
        expect(placeableRooms(rooms).map((r) => r.id)).not.toContain("play");
    });

    it("placement targets exclude the physical space and include both groups", () => {
        expect(placeableRooms(rooms).map((r) => r.id).sort()).toEqual(["legacy", "tod1", "tod2"]);
    });

    it("E — occupancy rolls up from groups to the containing physical space", () => {
        // Two groups inside Room 1 each holding children: the space's occupancy is
        // the sum, while each group keeps its own ratio grain.
        const occupancyByRoom = new Map([
            ["tod1", 6],
            ["tod2", 5],
            ["play", 11],
        ]);
        const inRoom1 = groupsInSpace(rooms, "room1").reduce(
            (total, r) => total + (occupancyByRoom.get(r.id) ?? 0),
            0
        );
        expect(inRoom1).toBe(11);
        // The playground count is the SAME children standing somewhere else — it is
        // never added to the room's physical occupancy.
        expect(groupsInSpace(rooms, "play")).toHaveLength(0);
    });
});
