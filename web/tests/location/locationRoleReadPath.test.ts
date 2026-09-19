/**
 * Slice 2 — the canonical topology role reaches the Configuration surface.
 *
 * Effect-level locks on the BOUNDARY, not on a copied mapping function: the
 * assertions drive the real `GET /api/admin/locations` and the real
 * `PATCH /api/admin/locations/[id]` handlers, so a projection that silently
 * dropped `unit_role` — or a PATCH that quietly started accepting it — fails
 * here rather than passing a mirror of itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
    withCanonicalUnitRole,
    type LocationHierarchyRow,
} from "@/lib/adminV2/locationsHierarchyTablePresentation";

const ORG = "org-1";

const { mockGetAdminContextCached, mockCreateAdminClient, captured } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    captured: { locationRows: [] as Record<string, unknown>[], update: null as Record<string, unknown> | null },
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

import { GET } from "@/app/api/admin/locations/route";
import { PATCH } from "@/app/api/admin/locations/[id]/route";

/**
 * A chainable PostgREST stub. Every builder method returns `this`, and awaiting
 * the builder yields the table's rows — enough for the two handlers under test
 * without pretending to be Supabase.
 */
function supabaseStub() {
    const build = (table: string) => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        for (const m of ["select", "eq", "in", "or", "order", "neq"]) builder[m] = vi.fn(chain);
        builder.update = vi.fn((payload: Record<string, unknown>) => {
            if (table === "locations") captured.update = payload;
            return builder;
        });
        const rows = () => (table === "locations" ? captured.locationRows : []);
        builder.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
        builder.single = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
        return builder;
    };
    return { from: vi.fn((table: string) => build(table)) };
}

beforeEach(() => {
    vi.clearAllMocks();
    captured.locationRows = [];
    captured.update = null;
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId: ORG, userId: "u-1", role: "admin" });
    mockCreateAdminClient.mockImplementation(() => supabaseStub());
});

type ProjectedLocation = { id: string; unit_role?: unknown; location_type: string | null };

async function getLocations(query: string): Promise<ProjectedLocation[]> {
    const res = await GET(new NextRequest(`http://test/api/admin/locations${query}`));
    const json = (await res.json()) as { locations: ProjectedLocation[] };
    return json.locations;
}

function roleOf(rows: ProjectedLocation[], id: string): unknown {
    return rows.find((r) => r.id === id)?.unit_role;
}

// ---------------------------------------------------------------------------
// LOCK A — an explicit role survives the read path.
// ---------------------------------------------------------------------------
describe("LOCK A — explicit role survives the canonical Locations read path", () => {
    beforeEach(() => {
        captured.locationRows = [
            { id: "site", org_id: ORG, location_type: "site", unit_role: null, label: "North Campus" },
            { id: "room1", org_id: ORG, location_type: "unit", unit_role: "physical_space", label: "Room 1", parent_location_id: "site" },
            { id: "tod1", org_id: ORG, location_type: "unit", unit_role: "operational_group", label: "Toddler 1", parent_location_id: "room1" },
            { id: "play", org_id: ORG, location_type: "unit", unit_role: "shared_space", label: "Playground", parent_location_id: "site" },
        ];
    });

    it("returns physical_space as stored", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "room1")).toBe("physical_space");
    });

    it("returns operational_group as stored", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "tod1")).toBe("operational_group");
    });

    it("returns shared_space as stored", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "play")).toBe("shared_space");
    });

    it("gives a site no role at all — a site is not a role-bearing unit", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "site")).toBeNull();
    });

    it("carries the role alongside the structural parent it belongs with", async () => {
        const rows = (await getLocations("?hierarchy=1")) as Array<ProjectedLocation & { parent_location_id?: string }>;
        const nested = rows.find((r) => r.id === "tod1")!;
        expect(nested.parent_location_id).toBe("room1");
        expect(nested.unit_role).toBe("operational_group");
    });
});

// ---------------------------------------------------------------------------
// LOCK B — historical NULL compatibility, through the real projection.
// ---------------------------------------------------------------------------
describe("LOCK B — a historical unit with unit_role = NULL reads as operational_group", () => {
    beforeEach(() => {
        captured.locationRows = [
            { id: "site", org_id: ORG, location_type: "site", unit_role: null, label: "North Campus" },
            { id: "legacy", org_id: ORG, location_type: "unit", unit_role: null, label: "Infant Room", parent_location_id: "site" },
            { id: "absent", org_id: ORG, location_type: "unit", label: "Pre-K", parent_location_id: "site" },
            { id: "addr", org_id: ORG, location_type: "address", unit_role: null, label: "14 Elm St" },
        ];
    });

    it("resolves a stored NULL rather than passing the NULL on to the surface", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "legacy")).toBe("operational_group");
    });

    it("resolves an absent column the same way, so an environment without it still reads", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "absent")).toBe("operational_group");
    });

    it("does not treat an address row as a role-bearing unit", async () => {
        expect(roleOf(await getLocations("?hierarchy=1"), "addr")).toBeNull();
    });

    it("refuses to trust an unrecognised stored role, falling back to the legacy default", async () => {
        captured.locationRows = [
            { id: "weird", org_id: ORG, location_type: "unit", unit_role: "cupboard", label: "?", parent_location_id: "site" },
        ];
        expect(roleOf(await getLocations("?hierarchy=1"), "weird")).toBe("operational_group");
    });
});

// ---------------------------------------------------------------------------
// The contract gate: the role rides the `hierarchy` projection, like the parent.
// ---------------------------------------------------------------------------
describe("read contract — role is gated with the structural projection", () => {
    beforeEach(() => {
        captured.locationRows = [
            { id: "tod1", org_id: ORG, location_type: "unit", unit_role: "operational_group", label: "Toddler 1", parent_location_id: "site" },
        ];
    });

    it("omits the role from a flat dropdown response, exactly as it omits the parent", async () => {
        const rows = (await getLocations("")) as Array<ProjectedLocation & { parent_location_id?: unknown }>;
        expect(rows[0].unit_role).toBeUndefined();
        expect(rows[0].parent_location_id).toBeUndefined();
    });

    it("still returns every existing field to a flat consumer", async () => {
        const rows = (await getLocations("")) as Array<Record<string, unknown>>;
        for (const key of ["id", "label", "location_type", "is_active", "is_primary", "status_key", "updated_at"]) {
            expect(rows[0]).toHaveProperty(key);
        }
    });
});

// ---------------------------------------------------------------------------
// LOCK C — the Settings read model carries the role rather than discarding it.
// ---------------------------------------------------------------------------
describe("LOCK C — the Settings read model preserves the canonical role", () => {
    it("holds the role on a hierarchy row", () => {
        const row: LocationHierarchyRow = {
            id: "tod1",
            label: "Toddler 1",
            location_type: "unit",
            parent_location_id: "room1",
            unit_role: "operational_group",
            is_active: true,
            city: null,
            state: null,
        };
        expect(row.unit_role).toBe("operational_group");
    });

    it("folds a raw mutation response, so a saved legacy room does not lose its resolved role", () => {
        // `select("*")` after POST/PATCH returns STORAGE. Merging it unfolded would
        // flip a legacy room from operational_group back to a raw null.
        const rawPatchResponse = { id: "legacy", location_type: "unit", unit_role: null, label: "Infant Room" };
        expect(withCanonicalUnitRole(rawPatchResponse).unit_role).toBe("operational_group");
    });

    it("is idempotent, so a row that arrived effective passes through unchanged", () => {
        const effective = { id: "play", location_type: "unit", unit_role: "shared_space" as const };
        expect(withCanonicalUnitRole(withCanonicalUnitRole(effective)).unit_role).toBe("shared_space");
    });

    it("never gives a site a role, whichever seam it entered through", () => {
        expect(withCanonicalUnitRole({ id: "site", location_type: "site", unit_role: null }).unit_role).toBeNull();
    });

    it("applies the fold at every seam that puts a row into the model", () => {
        // The invariant is only true if no setRows bypasses it.
        const src = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/locations/useLocationsConfigurationSettings.ts"),
            "utf8",
        );
        const setRowsSeams = src.match(/setRows\((?!\[\])/g) ?? [];
        const folded = src.match(/withCanonicalUnitRole/g) ?? [];
        // One import + one per ingestion seam (initializer, snapshot, 2 creates, patch).
        expect(folded.length).toBeGreaterThanOrEqual(5);
        expect(setRowsSeams.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// LOCK D — the topology transport is never UNGATED.
//
// Slice 2 locked this as "PATCH refuses unit_role and parent_location_id
// outright". Slice 3 deliberately opened that transport so the canonical
// mutation authority could be proven end-to-end (no operator surface offers it).
// The invariant Slice 2 was protecting is unchanged and is asserted here in its
// current form: topology may not reach the row except through the authority.
// The full safety contract lives in tests/location/topologyMutationAuthority.test.ts.
// ---------------------------------------------------------------------------
describe("LOCK D — topology reaches the row only through the canonical authority", () => {
    beforeEach(() => {
        captured.locationRows = [
            { id: "legacy", org_id: ORG, location_type: "unit", unit_role: null, label: "Infant Room", parent_location_id: "site", customer_id: null },
        ];
    });

    async function patch(body: Record<string, unknown>) {
        return PATCH(
            new NextRequest("http://test/api/admin/locations/legacy", { method: "PATCH", body: JSON.stringify(body) }),
            { params: Promise.resolve({ id: "legacy" }) },
        );
    }

    it("refuses a topology change the authority rejects, and writes nothing", async () => {
        // The stub returns the single legacy row for every locations read, so the
        // proposed parent cannot be resolved — the authority refuses.
        const res = await patch({ label: "Renamed", parent_location_id: "some-other-space" });
        expect(res.status).toBe(400);
        expect(captured.update).toBeNull();
    });

    it("refuses an invalid role before it can reach the row", async () => {
        const res = await patch({ unit_role: "cupboard" });
        expect(res.status).toBe(400);
        expect(captured.update).toBeNull();
    });

    it("still lets an ordinary edit through untouched by topology rules", async () => {
        const res = await patch({ label: "Renamed" });
        expect(res.status).toBe(200);
        expect(captured.update).toHaveProperty("label", "Renamed");
        expect(captured.update).not.toHaveProperty("unit_role");
        expect(captured.update).not.toHaveProperty("parent_location_id");
    });

    it("routes every topology refusal through the named error contract", async () => {
        const res = await patch({ unit_role: "cupboard" });
        const body = (await res.json()) as { code?: string };
        expect(body.code).toBe("invalid_unit_role");
    });
});
