/**
 * Identity inheritance down the canonical hierarchy: organization → school → room.
 *
 * Two product rules are pinned here.
 *
 * ONE — a room follows its SCHOOL when the school sends as itself, and the
 * organization otherwise. This is the fallback the sender resolver performs. The
 * UI must state it rather than keep a second, drifting copy of it.
 *
 * TWO — a room is never configurable. `RoomIdentityRow` carries no binding id and
 * no action, because the runtime cannot select one room truthfully for an outbound
 * message (see `ROOM_IDENTITY_FUTURE_GATE`). A control the runtime would ignore is
 * worse than no control, so the absence is asserted, not assumed.
 */

import { describe, expect, it } from "vitest";

import { buildChannelCards, type BindingView } from "@/lib/communications/organizationCommunicationsModel";
import { buildLocationHierarchy } from "@/lib/communications/locationHierarchy";

const NORTH = "11111111-1111-4111-8111-111111111111";
const SOUTH = "22222222-2222-4222-8222-222222222222";
const BEARS = "33333333-3333-4333-8333-333333333333";
const GIRAFFE = "44444444-4444-4444-8444-444444444444";

const HIERARCHY = buildLocationHierarchy([
    { id: NORTH, label: "North Campus", location_type: "site", parent_location_id: null },
    { id: SOUTH, label: "South Campus", location_type: "site", parent_location_id: null },
    { id: BEARS, label: "Bears", location_type: "unit", parent_location_id: SOUTH },
    { id: GIRAFFE, label: "Giraffe", location_type: "unit", parent_location_id: SOUTH },
]);

const LOCATIONS = [
    { id: NORTH, label: "North Campus" },
    { id: SOUTH, label: "South Campus" },
    { id: BEARS, label: "Bears" },
    { id: GIRAFFE, label: "Giraffe" },
];

const READY = {
    send: { state: "ready" as const, detail: "Sending." },
    receive: { state: "ready" as const, detail: "Receiving." },
    providerConnection: "configured" as const,
};

function orgEmail(): BindingView {
    return {
        id: "org-email",
        channel: "email",
        provider: "resend",
        status: "active",
        is_primary: true,
        from_email: "hello@firefly.test",
        readiness: READY,
    };
}

function schoolEmail(locationId: string, from: string): BindingView {
    return {
        id: `school-${locationId}`,
        channel: "email",
        provider: "resend",
        status: "active",
        location_id: locationId,
        from_email: from,
        readiness: READY,
    };
}

function emailCard(bindings: BindingView[]) {
    return buildChannelCards(bindings, LOCATIONS, HIERARCHY).find((c) => c.channel === "email")!;
}

describe("schools and rooms are no longer peers", () => {
    it("only schools appear at the top level", () => {
        const card = emailCard([orgEmail()]);
        expect(card.schools.map((s) => s.label)).toEqual(["North Campus", "South Campus"]);
    });

    it("rooms are nested under their own school", () => {
        const card = emailCard([orgEmail()]);
        const south = card.schools.find((s) => s.locationId === SOUTH)!;
        expect(south.rooms.map((r) => r.label)).toEqual(["Bears", "Giraffe"]);
        expect(card.schools.find((s) => s.locationId === NORTH)!.rooms).toEqual([]);
    });
});

describe("inheritance follows the resolver's ladder", () => {
    it("with no school override, a room uses the ORGANIZATION identity", () => {
        const card = emailCard([orgEmail()]);
        const bears = card.schools.find((s) => s.locationId === SOUTH)!.rooms[0]!;
        expect(bears.source).toBe("organization");
        expect(bears.identity).toBe("hello@firefly.test");
        expect(bears.inheritedFrom).toBeNull();
    });

    it("when the school sends as itself, its rooms follow the SCHOOL", () => {
        const card = emailCard([orgEmail(), schoolEmail(SOUTH, "south@firefly.test")]);
        const south = card.schools.find((s) => s.locationId === SOUTH)!;
        expect(south.inherits).toBe(false);
        for (const room of south.rooms) {
            expect(room.source).toBe("school");
            expect(room.identity).toBe("south@firefly.test");
            expect(room.inheritedFrom).toBe("South Campus");
        }
    });

    it("a sibling school's override does not leak into another school's rooms", () => {
        const card = emailCard([orgEmail(), schoolEmail(NORTH, "north@firefly.test")]);
        for (const room of card.schools.find((s) => s.locationId === SOUTH)!.rooms) {
            expect(room.identity).toBe("hello@firefly.test");
            expect(room.source).toBe("organization");
        }
    });

    it("removing the school override returns its rooms to the organization identity", () => {
        const withOverride = emailCard([orgEmail(), schoolEmail(SOUTH, "south@firefly.test")]);
        expect(withOverride.schools.find((s) => s.locationId === SOUTH)!.rooms[0]!.source).toBe("school");

        // Removal keeps the row but retires it — the identity must not broaden.
        const retired = { ...schoolEmail(SOUTH, "south@firefly.test"), status: "disabled" };
        const after = emailCard([orgEmail(), retired]);
        const south = after.schools.find((s) => s.locationId === SOUTH)!;
        expect(south.inherits).toBe(true);
        expect(south.rooms[0]!.source).toBe("organization");
        expect(south.rooms[0]!.identity).toBe("hello@firefly.test");
    });

    it("with nothing to inherit, rooms say so rather than showing a blank", () => {
        const card = emailCard([]);
        const bears = card.schools.find((s) => s.locationId === SOUTH)!.rooms[0]!;
        expect(bears.source).toBe("none");
        expect(bears.identity).toBe("");
    });
});

describe("rooms are not configurable, and that is enforced by shape", () => {
    it("a room row carries no binding handle and no override flag", () => {
        const card = emailCard([orgEmail(), schoolEmail(SOUTH, "south@firefly.test")]);
        for (const room of card.schools.flatMap((s) => s.rooms)) {
            expect(room).not.toHaveProperty("bindingId");
            expect(room).not.toHaveProperty("inherits");
            expect(Object.keys(room).sort()).toEqual(["identity", "inheritedFrom", "label", "roomId", "source"]);
        }
    });

    it("a room never reports its own identity as its source", () => {
        const card = emailCard([orgEmail(), schoolEmail(SOUTH, "south@firefly.test")]);
        for (const room of card.schools.flatMap((s) => s.rooms)) {
            expect(["school", "organization", "none"]).toContain(room.source);
        }
    });

    it("schools DO stay configurable — the deepest level that is", () => {
        const card = emailCard([orgEmail(), schoolEmail(SOUTH, "south@firefly.test")]);
        expect(card.schools.find((s) => s.locationId === SOUTH)!.bindingId).toBe(`school-${SOUTH}`);
    });
});

describe("the flat list and the hierarchy cannot disagree", () => {
    it("a school reads the same way in both", () => {
        const card = emailCard([orgEmail(), schoolEmail(SOUTH, "south@firefly.test")]);
        for (const school of card.schools) {
            const flat = card.locations.find((l) => l.locationId === school.locationId)!;
            expect(school.inherits).toBe(flat.inherits);
            expect(school.identity).toBe(flat.identity);
        }
    });
});

describe("without hierarchy data the card degrades safely", () => {
    it("omitting the hierarchy yields no schools rather than throwing", () => {
        const card = buildChannelCards([orgEmail()], LOCATIONS).find((c) => c.channel === "email")!;
        expect(card.schools).toEqual([]);
        expect(card.unparentedRooms).toEqual([]);
        // The flat roster still works, so nothing regresses for older payloads.
        expect(card.locations).toHaveLength(4);
    });
});
