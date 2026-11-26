/**
 * Slice 7 — the whole chain, from stored rows to the offered option set.
 *
 * The sibling suite asserts that each call site reaches the adapter. This one
 * proves the adapter is worth reaching: real `loadSiteOperationalRooms`, real
 * canonical provider, real ancestry walk, real effective-role fold — so a stored
 * NULL and a nested group are exercised as storage, not as a hand-built fixture
 * that already assumed the answer.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    assignableClassrooms,
    loadSiteOperationalRooms,
} from "@/lib/operationalAssignments/loadSiteOperationalRooms";

const ORG = "org-1";
const SITE = "site";

const db = { locations: [] as Record<string, unknown>[] };

/** Minimal PostgREST stub honouring the provider's org + type filters. */
function supabaseStub() {
    const build = () => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const b: Record<string, unknown> = {};
        b.select = vi.fn(() => b);
        b.eq = vi.fn((c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; });
        b.in = vi.fn((c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c] as never)); return b; });
        // The provider excludes archived locations; a fixture without the column
        // is not archived, so `undefined` has to satisfy `is null` here too.
        b.is = vi.fn((c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; });
        b.then = (resolve: (v: unknown) => unknown) =>
            resolve({ data: db.locations.filter((r) => filters.every((f) => f(r))), error: null });
        return b;
    };
    return { from: vi.fn(() => build()) } as never;
}

const loc = (o: Record<string, unknown>) => ({ org_id: ORG, is_active: true, metadata: {}, ...o });

beforeEach(() => {
    db.locations = [
        loc({ id: SITE, location_type: "site", unit_role: null, label: "North Campus", parent_location_id: null }),
        loc({ id: "room1", location_type: "unit", unit_role: "physical_space", label: "Room 1", parent_location_id: SITE }),
        loc({ id: "tod1", location_type: "unit", unit_role: "operational_group", label: "Toddler 1", parent_location_id: "room1" }),
        loc({ id: "tod2", location_type: "unit", unit_role: "operational_group", label: "Toddler 2", parent_location_id: "room1" }),
        // Pre-topology row: stored NULL, parented straight to the site.
        loc({ id: "infant", location_type: "unit", unit_role: null, label: "Infant Room", parent_location_id: SITE }),
        loc({ id: "play", location_type: "unit", unit_role: "shared_space", label: "Playground", parent_location_id: SITE }),
    ];
});

const offered = async () =>
    assignableClassrooms(await loadSiteOperationalRooms(supabaseStub(), ORG, SITE)).map((r) => r.roomName);

describe("the full chain: stored rows → provider → classroom options", () => {
    it("the provider still returns every unit — narrowing is the adapter's job", async () => {
        const all = await loadSiteOperationalRooms(supabaseStub(), ORG, SITE);
        expect(all.map((r) => r.roomName).sort()).toEqual([
            "Infant Room", "Playground", "Room 1", "Toddler 1", "Toddler 2",
        ]);
    });

    it("offers exactly the classrooms, from real storage", async () => {
        expect((await offered()).sort()).toEqual(["Infant Room", "Toddler 1", "Toddler 2"]);
    });

    it("a room stored with unit_role = NULL survives as a classroom", async () => {
        // The row is genuinely NULL in the fixture; the provider folds it.
        expect(db.locations.find((l) => l.id === "infant")!.unit_role).toBeNull();
        expect(await offered()).toContain("Infant Room");
    });

    it("a site whose rooms ALL predate topology keeps every option", async () => {
        db.locations = db.locations.filter((l) => l.id === SITE).concat(
            ["A", "B"].map((n) => loc({ id: n, location_type: "unit", unit_role: null, label: n, parent_location_id: SITE })),
        );
        expect((await offered()).sort()).toEqual(["A", "B"]);
    });

    it("a nested classroom survives the ancestry walk and stays offered", async () => {
        const all = await loadSiteOperationalRooms(supabaseStub(), ORG, SITE);
        const tod1 = all.find((r) => r.roomId === "tod1")!;
        expect(tod1.containingSpaceLocationId).toBe("room1");
        expect(await offered()).toContain("Toddler 1");
    });

    it("the physical room and the shared space are dropped, from real storage", async () => {
        const list = await offered();
        expect(list).not.toContain("Room 1");
        expect(list).not.toContain("Playground");
    });

    it("a site with only a physical room and a playground offers nothing, rather than guessing", async () => {
        db.locations = db.locations.filter((l) => ["site", "room1", "play"].includes(String(l.id)));
        expect(await offered()).toEqual([]);
    });

    it("rooms at another site are never offered", async () => {
        db.locations.push(loc({ id: "siteB", location_type: "site", unit_role: null, label: "South", parent_location_id: null }));
        db.locations.push(loc({ id: "todB", location_type: "unit", unit_role: "operational_group", label: "Toddler B", parent_location_id: "siteB" }));
        expect(await offered()).not.toContain("Toddler B");
    });
});
