/**
 * Slice 3 — the one canonical topology mutation safety contract.
 *
 * These drive the REAL `POST /api/admin/locations` and
 * `PATCH /api/admin/locations/[id]` handlers through the real validator, so a
 * route that grew its own topology opinion — or lost the gate entirely — fails
 * here. The pure structural core is exercised directly where the case is about
 * the rule rather than the transport.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
    validateTopologyShape,
    candidateFromPatch,
    isTopologyUnchanged,
    LIVE_PLACEMENT_STATUSES,
} from "@/lib/location/topologyMutationAuthority";

const ORG = "org-1";

const { mockGetAdminContextCached, mockCreateAdminClient, db, captured } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    db: { locations: [] as Record<string, unknown>[], child_placements: [] as Record<string, unknown>[] },
    captured: { update: null as Record<string, unknown> | null, insert: null as Record<string, unknown> | null },
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([]),
    displayLabelsFromDefinitions: vi.fn().mockReturnValue(new Map()),
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/adminAuth", () => ({ logAdminAudit: vi.fn() }));
vi.mock("@/lib/admin/fieldValues", () => ({ upsertFieldValuesFromBody: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({ emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/admin/locations/route";
import { PATCH } from "@/app/api/admin/locations/[id]/route";

/**
 * A chainable PostgREST stub that honours `eq` / `in` filters, because the
 * validator's correctness depends on the placement lookup actually filtering by
 * room and by live status. A stub that ignored filters would green a broken
 * dependent guard.
 */
function supabaseStub() {
    const build = (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const rows = () => (db[table as keyof typeof db] ?? []).filter((r) => filters.every((f) => f(r)));
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.or = vi.fn(() => builder);
        builder.is = vi.fn((col: string, val: unknown) => {
            filters.push((r) => (val === null ? r[col] == null : r[col] === val));
            return builder;
        });
        builder.neq = vi.fn((col: string, val: unknown) => {
            filters.push((r) => r[col] !== val);
            return builder;
        });
        builder.eq = vi.fn((col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return builder;
        });
        builder.in = vi.fn((col: string, vals: unknown[]) => {
            filters.push((r) => vals.includes(r[col] as never));
            return builder;
        });
        builder.update = vi.fn((payload: Record<string, unknown>) => {
            if (table === "locations") captured.update = payload;
            return builder;
        });
        builder.insert = vi.fn((payload: Record<string, unknown>) => {
            if (table === "locations") captured.insert = payload;
            return builder;
        });
        builder.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
        builder.single = vi.fn(async () => ({ data: rows()[0] ?? { id: "created" }, error: null }));
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
        return builder;
    };
    return { from: vi.fn((t: string) => build(t)) };
}

const SITE = { id: "site", org_id: ORG, location_type: "site", unit_role: null, label: "North Campus", parent_location_id: null, is_active: true };
const SITE_B = { id: "siteB", org_id: ORG, location_type: "site", unit_role: null, label: "South Campus", parent_location_id: null, is_active: true };
const ROOM1 = { id: "room1", org_id: ORG, location_type: "unit", unit_role: "physical_space", label: "Room 1", parent_location_id: "site", is_active: true };
const ROOM_B = { id: "roomB", org_id: ORG, location_type: "unit", unit_role: "physical_space", label: "Room B", parent_location_id: "siteB", is_active: true };
const TOD1 = { id: "tod1", org_id: ORG, location_type: "unit", unit_role: "operational_group", label: "Toddler 1", parent_location_id: "room1", is_active: true };
const PLAY = { id: "play", org_id: ORG, location_type: "unit", unit_role: "shared_space", label: "Playground", parent_location_id: "site", is_active: true };
const LEGACY = { id: "legacy", org_id: ORG, location_type: "unit", unit_role: null, label: "Infant Room", parent_location_id: "site", is_active: true };

beforeEach(() => {
    vi.clearAllMocks();
    db.locations = [SITE, SITE_B, ROOM1, ROOM_B, TOD1, PLAY, LEGACY].map((r) => ({ ...r }));
    db.child_placements = [];
    captured.update = null;
    captured.insert = null;
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId: ORG, userId: "u-1", role: "admin" });
    mockCreateAdminClient.mockImplementation(() => supabaseStub());
});

async function post(body: Record<string, unknown>) {
    const res = await POST(new NextRequest("http://test/api/admin/locations", { method: "POST", body: JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as { error?: string; code?: string } };
}

async function patch(id: string, body: Record<string, unknown>) {
    const res = await PATCH(
        new NextRequest(`http://test/api/admin/locations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
        { params: Promise.resolve({ id }) },
    );
    return { status: res.status, body: (await res.json()) as { error?: string; code?: string } };
}

const view = () =>
    db.locations.map((r) => ({
        id: String(r.id),
        type: r.location_type as "site" | "unit" | "address",
        unitRole: (r.unit_role ?? null) as never,
        parentLocationId: (r.parent_location_id ?? null) as string | null,
        name: (r.label ?? null) as string | null,
    }));

// ---------------------------------------------------------------------------
// 1-3, 5, 6 — structural legality.
// ---------------------------------------------------------------------------
describe("structural legality — accepted shapes", () => {
    it("1. accepts a physical room directly under a site", async () => {
        const r = await post({ location_type: "unit", unit_role: "physical_space", parent_location_id: "site", label: "Room 2" });
        expect(r.status).toBe(200);
    });

    it("2. accepts a classroom inside a physical room", async () => {
        const r = await post({ location_type: "unit", unit_role: "operational_group", parent_location_id: "room1", label: "Toddler 2" });
        expect(r.status).toBe(200);
    });

    it("3. accepts a shared space under a site", async () => {
        const r = await post({ location_type: "unit", unit_role: "shared_space", parent_location_id: "site", label: "Gym" });
        expect(r.status).toBe(200);
    });

    it("accepts a legacy-shaped room with no role at all", async () => {
        const r = await post({ location_type: "unit", parent_location_id: "site", label: "Infant 2" });
        expect(r.status).toBe(200);
    });
});

describe("structural legality — refusals", () => {
    it("4. refuses a classroom nested inside another classroom", async () => {
        const r = await post({ location_type: "unit", unit_role: "operational_group", parent_location_id: "tod1", label: "X" });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe("invalid_parent_role");
    });

    it("4. refuses a physical room nested inside a physical room", async () => {
        const r = await post({ location_type: "unit", unit_role: "physical_space", parent_location_id: "room1", label: "X" });
        expect(r.body.code).toBe("nested_physical_space");
    });

    it("4. refuses a room nested inside a shared space", async () => {
        const r = await post({ location_type: "unit", unit_role: "operational_group", parent_location_id: "play", label: "X" });
        expect(r.body.code).toBe("invalid_parent_role");
    });

    it("refuses a room with no parent at all", async () => {
        const r = await post({ location_type: "unit", unit_role: "operational_group", label: "Orphan" });
        expect(r.body.code).toBe("parent_required");
    });

    it("refuses an unknown role rather than storing it", async () => {
        const r = await post({ location_type: "unit", unit_role: "cupboard", parent_location_id: "site", label: "X" });
        expect(r.body.code).toBe("invalid_unit_role");
    });

    it("refuses a role on a site", async () => {
        const r = await post({ location_type: "site", unit_role: "physical_space", label: "X" });
        expect(r.body.code).toBe("role_only_on_unit");
    });

    it("refuses a parent that is not in this organization", async () => {
        const r = await post({ location_type: "unit", unit_role: "operational_group", parent_location_id: "nope", label: "X" });
        expect(r.body.code).toBe("parent_not_found");
    });

    it("6. refuses a cycle — a room may not be moved inside its own descendant", () => {
        const verdict = validateTopologyShape(
            { id: "room1", locationType: "unit", unitRole: "physical_space", parentLocationId: "tod1" },
            view(),
        );
        expect(verdict).toMatchObject({ ok: false, code: "topology_cycle" });
    });

    it("6. refuses a location parented to itself", () => {
        const verdict = validateTopologyShape(
            { id: "room1", locationType: "unit", unitRole: "physical_space", parentLocationId: "room1" },
            view(),
        );
        expect(verdict).toMatchObject({ ok: false, code: "topology_cycle" });
    });

    it("refuses a chain that never reaches a site", () => {
        db.locations.push({ id: "floating", org_id: ORG, location_type: "unit", unit_role: "physical_space", label: "F", parent_location_id: null, is_active: true });
        const verdict = validateTopologyShape(
            { id: null, locationType: "unit", unitRole: "operational_group", parentLocationId: "floating" },
            view(),
        );
        expect(verdict.ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 7 — child legality (Defect A).
// ---------------------------------------------------------------------------
describe("7. child legality — a parent may not abandon its children", () => {
    it("refuses turning an occupied physical room into a shared space", async () => {
        const r = await patch("room1", { unit_role: "shared_space" });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe("existing_children_incompatible");
        expect(r.body.error).toContain("Toddler 1");
    });

    it("refuses turning an occupied physical room into a classroom", async () => {
        const r = await patch("room1", { unit_role: "operational_group" });
        expect(r.body.code).toBe("existing_children_incompatible");
    });

    it("writes nothing when the child guard refuses", async () => {
        await patch("room1", { unit_role: "shared_space" });
        expect(captured.update).toBeNull();
    });

    it("does not orphan, re-parent or reclassify the child", async () => {
        await patch("room1", { unit_role: "shared_space" });
        const child = db.locations.find((l) => l.id === "tod1")!;
        expect(child.parent_location_id).toBe("room1");
        expect(child.unit_role).toBe("operational_group");
    });

    it("allows the same change once the physical room is empty", async () => {
        db.locations = db.locations.filter((l) => l.id !== "tod1");
        const r = await patch("room1", { unit_role: "shared_space" });
        expect(r.status).toBe(200);
    });
});

// ---------------------------------------------------------------------------
// 8 — dependent legality (Defect B).
// ---------------------------------------------------------------------------
describe("8. dependent legality — a live placement pins the classroom role", () => {
    beforeEach(() => {
        db.child_placements = [
            { id: "p1", org_id: ORG, room_location_id: "tod1", status: "active" },
        ];
    });

    it("refuses turning a site-parented classroom with a live placement into a physical room", async () => {
        // `tod1` sits inside a physical room, so becoming one is refused
        // STRUCTURALLY before the dependent guard is even reached — structure is
        // judged before dependents, deliberately. `legacy` hangs off the site, so
        // the shape is legal and the placement is the only thing standing in the way.
        db.child_placements = [{ id: "p0", org_id: ORG, room_location_id: "legacy", status: "active" }];
        const r = await patch("legacy", { unit_role: "physical_space" });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe("active_placement_incompatible");
    });

    it("judges structure before dependents — a nested classroom cannot become a physical room at all", async () => {
        const r = await patch("tod1", { unit_role: "physical_space" });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe("nested_physical_space");
    });

    it("refuses turning it into a shared space too", async () => {
        const r = await patch("tod1", { unit_role: "shared_space" });
        expect(r.body.code).toBe("active_placement_incompatible");
    });

    it("12. leaves the dependent row completely untouched", async () => {
        const before = JSON.stringify(db.child_placements);
        await patch("tod1", { unit_role: "physical_space" });
        expect(JSON.stringify(db.child_placements)).toBe(before);
        expect(captured.update).toBeNull();
    });

    it("blocks on a planned placement, not only an active one", async () => {
        db.child_placements = [{ id: "p2", org_id: ORG, room_location_id: "tod1", status: "planned" }];
        expect((await patch("tod1", { unit_role: "shared_space" })).body.code).toBe("active_placement_incompatible");
    });

    it("blocks on an ending placement", async () => {
        db.child_placements = [{ id: "p3", org_id: ORG, room_location_id: "tod1", status: "ending" }];
        expect((await patch("tod1", { unit_role: "shared_space" })).body.code).toBe("active_placement_incompatible");
    });

    for (const status of ["ended", "superseded", "canceled"]) {
        it(`does NOT freeze the location on closed history (${status})`, async () => {
            db.child_placements = [{ id: "p4", org_id: ORG, room_location_id: "tod1", status }];
            const r = await patch("tod1", { unit_role: "shared_space" });
            expect(r.status).toBe(200);
        });
    }

    it("ignores a live placement that names a DIFFERENT room", async () => {
        db.child_placements = [{ id: "p5", org_id: ORG, room_location_id: "legacy", status: "active" }];
        expect((await patch("tod1", { unit_role: "shared_space" })).status).toBe(200);
    });

    it("the live-status set matches the placement lifecycle vocabulary", () => {
        expect([...LIVE_PLACEMENT_STATUSES].sort()).toEqual(["active", "ending", "planned"]);
    });
});

// ---------------------------------------------------------------------------
// 9, 10, 11 — safe transitions, identity preservation.
// ---------------------------------------------------------------------------
describe("9-11. safe transitions are accepted and preserve identity", () => {
    it("9. accepts a role change on a room with no children and no live placement", async () => {
        const r = await patch("play", { unit_role: "operational_group" });
        expect(r.status).toBe(200);
    });

    it("9. accepts adopting a legacy flat classroom into a physical room, same site", async () => {
        const r = await patch("legacy", { parent_location_id: "room1" });
        expect(r.status).toBe(200);
        expect(captured.update).toMatchObject({ parent_location_id: "room1" });
    });

    it("10. accepts a same-site re-parent of a classroom", async () => {
        const r = await patch("tod1", { parent_location_id: "site" });
        expect(r.status).toBe(200);
    });

    it("5. refuses a cross-site re-parent", async () => {
        const r = await patch("legacy", { parent_location_id: "roomB" });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe("cross_site_parent");
    });

    it("11. never writes the id — a safe change keeps the same location", async () => {
        await patch("legacy", { parent_location_id: "room1" });
        expect(captured.update).not.toHaveProperty("id");
        expect(Object.keys(captured.update ?? {})).toEqual(["parent_location_id"]);
    });
});

// ---------------------------------------------------------------------------
// Ordinary edits must not be caught by topology rules they never engaged.
// ---------------------------------------------------------------------------
describe("ordinary edits are unaffected", () => {
    it("renames an occupied physical room without engaging the child guard", async () => {
        const r = await patch("room1", { label: "Room One" });
        expect(r.status).toBe(200);
        expect(captured.update).toMatchObject({ label: "Room One" });
    });

    it("deactivates a classroom that has a live placement", async () => {
        db.child_placements = [{ id: "p1", org_id: ORG, room_location_id: "tod1", status: "active" }];
        expect((await patch("tod1", { is_active: false })).status).toBe(200);
    });

    it("edits metadata on a room without a topology verdict", async () => {
        const r = await patch("tod1", { metadata: { capacity: "12" } });
        expect(r.status).toBe(200);
    });

    it("treats an omitted topology key as unchanged, never as a change to null", () => {
        const current = { id: "tod1", locationType: "unit", unitRole: "operational_group", parentLocationId: "room1" };
        const candidate = candidateFromPatch(current, {});
        expect(candidate.unitRole).toBe("operational_group");
        expect(candidate.parentLocationId).toBe("room1");
        expect(isTopologyUnchanged(current, candidate)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 13 — POST/PATCH parity on the SAME authority.
// ---------------------------------------------------------------------------
describe("13. POST and PATCH reach the same verdict on the same resulting topology", () => {
    const ILLEGAL = [
        { name: "physical room inside a physical room", role: "physical_space", parent: "room1", code: "nested_physical_space" },
        { name: "room inside a classroom", role: "operational_group", parent: "tod1", code: "invalid_parent_role" },
        { name: "room inside a shared space", role: "operational_group", parent: "play", code: "invalid_parent_role" },
        { name: "unknown parent", role: "operational_group", parent: "nope", code: "parent_not_found" },
    ] as const;

    for (const c of ILLEGAL) {
        it(`both refuse: ${c.name}`, async () => {
            const created = await post({ location_type: "unit", unit_role: c.role, parent_location_id: c.parent, label: "X" });
            const patched = await patch("legacy", { unit_role: c.role, parent_location_id: c.parent });
            expect(created.status).toBe(400);
            expect(patched.status).toBe(400);
            expect(created.body.code).toBe(c.code);
            expect(patched.body.code).toBe(c.code);
        });
    }

    it("both accept the same legal topology", async () => {
        const created = await post({ location_type: "unit", unit_role: "operational_group", parent_location_id: "room1", label: "Toddler 3" });
        const patched = await patch("legacy", { unit_role: "operational_group", parent_location_id: "room1" });
        expect(created.status).toBe(200);
        expect(patched.status).toBe(200);
    });

    it("every refusal carries a named code, never a bare database string", async () => {
        const r = await post({ location_type: "unit", unit_role: "operational_group", parent_location_id: "tod1", label: "X" });
        expect(typeof r.body.code).toBe("string");
        expect(r.body.error).not.toMatch(/ERRCODE|pg_|23514/);
    });
});

// ---------------------------------------------------------------------------
// 14 — historical NULL compatibility survives the stronger contract.
// ---------------------------------------------------------------------------
describe("14. historical NULL-role compatibility survives", () => {
    it("treats a legacy room as a classroom for the dependent guard", async () => {
        db.child_placements = [{ id: "p1", org_id: ORG, room_location_id: "legacy", status: "active" }];
        const r = await patch("legacy", { unit_role: "physical_space" });
        expect(r.body.code).toBe("active_placement_incompatible");
    });

    it("still accepts a legacy room keeping its implicit role", async () => {
        expect((await patch("legacy", { label: "Infants" })).status).toBe(200);
    });

    it("lets a legacy room become a physical room when nothing depends on it", async () => {
        expect((await patch("legacy", { unit_role: "physical_space" })).status).toBe(200);
    });
});
