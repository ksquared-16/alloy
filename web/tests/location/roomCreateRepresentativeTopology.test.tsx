/** @vitest-environment jsdom */

/**
 * Slice 4 — the representative topology, built through the product path.
 *
 * The operator's clicks go into the REAL Add Room panel; the panel's payload
 * goes through the REAL create contract; the payload is posted to the REAL
 * `POST /api/admin/locations` handler and judged by the REAL topology authority.
 * Nothing is direct-inserted, and no step is simulated by restating what the
 * previous step was supposed to produce.
 *
 * A browser mount was not available on this lane (unslotted: no port, no dev
 * server), so this is the deepest boundary reachable here. It exercises every
 * layer except the HTTP hop and the rendered Settings page refresh.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import LocationRoomCreatePanel from "@/components/adminV2/settings/locations/LocationRoomCreatePanel";
import {
    buildRoomCreatePayload,
    type LocationRoomCreateInput,
} from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import { eligibleInsideOptions } from "@/lib/locations/roomTypeVocabulary";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { canonicalUnitRoleFromStorage } from "@/lib/location/canonicalLocationModel";
import { placeableRooms, toCanonicalRoom, rowsBelongingToSite } from "@/lib/location/canonicalRoomProvider";
import { isAttendanceLocatableRole } from "@/lib/location/canonicalLocationModel";

const ORG = "org-1";
const SITE = "site";

const { mockGetAdminContextCached, mockCreateAdminClient, db } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    db: { locations: [] as Record<string, unknown>[], child_placements: [] as Record<string, unknown>[] },
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

import { POST } from "@/app/api/admin/locations/route";

/** A stub that actually STORES inserts, so later creates see earlier ones. */
function supabaseStub() {
    const build = (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        let pending: Record<string, unknown> | null = null;
        const rows = () => (db[table as keyof typeof db] ?? []).filter((r) => filters.every((f) => f(r)));
        const b: Record<string, unknown> = {};
        b.select = vi.fn(() => b);
        b.order = vi.fn(() => b);
        b.or = vi.fn(() => b);
        b.eq = vi.fn((c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; });
        b.in = vi.fn((c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c] as never)); return b; });
        b.update = vi.fn(() => b);
        b.insert = vi.fn((payload: Record<string, unknown>) => {
            pending = { id: `loc-${db.locations.length + 1}`, ...payload };
            if (table === "locations") db.locations.push(pending);
            return b;
        });
        b.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
        b.single = vi.fn(async () => ({ data: pending ?? rows()[0] ?? null, error: null }));
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
        return b;
    };
    return { from: vi.fn((t: string) => build(t)) };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function asHierarchyRows(): LocationHierarchyRow[] {
    return db.locations.map((r) => ({
        id: String(r.id),
        label: (r.label ?? null) as string | null,
        location_type: (r.location_type ?? null) as string | null,
        parent_location_id: (r.parent_location_id ?? null) as string | null,
        unit_role: canonicalUnitRoleFromStorage(r.location_type, r.unit_role),
        is_active: r.is_active !== false,
        city: null,
        state: null,
    }));
}

/**
 * One operator pass through Add Room: render with the CURRENT eligible Inside
 * options, drive the controls, then post what the form produced.
 */
async function addRoomThroughTheProduct(steps: {
    name: string;
    type?: string;
    inside?: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
    let captured: LocationRoomCreateInput | null = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <LocationRoomCreatePanel
                siteLabel="North Campus"
                programOptions={[]}
                schedulePatterns={[]}
                insideOptions={eligibleInsideOptions(asHierarchyRows(), SITE)}
                onCancel={() => {}}
                onCreate={async (input) => { captured = input; }}
            />,
        );
    });

    const set = async (testId: string, value: string) => {
        const el = container!.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-testid="${testId}"]`);
        if (!el) throw new Error(`missing control: ${testId}`);
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
        await act(async () => { el.dispatchEvent(new Event("change", { bubbles: true })); });
    };

    if (steps.type) await set("locations-room-create-type", steps.type);
    await set("locations-room-create-name", steps.name);
    if (steps.inside) await set("locations-room-create-inside", steps.inside);

    await act(async () => {
        container!
            .querySelector('[data-testid="locations-room-create-save"]')!
            .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});

    if (!captured) throw new Error("the form produced no create input");
    const payload = buildRoomCreatePayload(SITE, captured);
    const res = await POST(
        new NextRequest("http://test/api/admin/locations", { method: "POST", body: JSON.stringify(payload) }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
    vi.clearAllMocks();
    db.locations = [
        { id: SITE, org_id: ORG, location_type: "site", unit_role: null, label: "North Campus", parent_location_id: null, is_active: true },
    ];
    db.child_placements = [];
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId: ORG, userId: "u-1", role: "admin" });
    mockCreateAdminClient.mockImplementation(() => supabaseStub());
});

afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
});

const byLabel = (label: string) => db.locations.find((l) => l.label === label)!;

describe("16. the representative topology, built through Add Room", () => {
    it("A-E. builds North Campus → Room 1 → (Toddler 1, Toddler 2), plus Playground", async () => {
        // A — Physical room.
        const a = await addRoomThroughTheProduct({ name: "Room 1", type: "physical_space" });
        expect(a.status).toBe(200);
        const room1 = byLabel("Room 1");
        expect(room1.unit_role).toBe("physical_space");
        expect(room1.parent_location_id).toBe(SITE);

        // B — Classroom directly under the Site: flat creation still works.
        const b = await addRoomThroughTheProduct({ name: "Infant Room" });
        expect(b.status).toBe(200);
        const infant = byLabel("Infant Room");
        expect(infant.unit_role).toBe("operational_group");
        expect(infant.parent_location_id).toBe(SITE);

        // C — Classroom INSIDE the physical room.
        const c = await addRoomThroughTheProduct({ name: "Toddler 1", inside: String(room1.id) });
        expect(c.status).toBe(200);
        const tod1 = byLabel("Toddler 1");
        expect(tod1.unit_role).toBe("operational_group");
        expect(tod1.parent_location_id).toBe(room1.id);

        // D — a second Classroom in the SAME physical room.
        const d = await addRoomThroughTheProduct({ name: "Toddler 2", inside: String(room1.id) });
        expect(d.status).toBe(200);
        expect(byLabel("Toddler 2").parent_location_id).toBe(room1.id);

        // E — Shared space.
        const e = await addRoomThroughTheProduct({ name: "Playground", type: "shared_space" });
        expect(e.status).toBe(200);
        const play = byLabel("Playground");
        expect(play.unit_role).toBe("shared_space");
        expect(play.parent_location_id).toBe(SITE);

        expect(db.locations).toHaveLength(6);
    });

    it("F. refuses an obviously invalid combination at the real boundary", async () => {
        await addRoomThroughTheProduct({ name: "Room 1", type: "physical_space" });
        const room1 = byLabel("Room 1");
        await addRoomThroughTheProduct({ name: "Toddler 1", inside: String(room1.id) });
        const tod1 = byLabel("Toddler 1");

        // A classroom inside a classroom, posted exactly as the contract builds it.
        const payload = buildRoomCreatePayload(SITE, {
            label: "Illegal",
            is_active: true,
            metadata: {},
            unit_role: "operational_group",
            inside_location_id: String(tod1.id),
        });
        const res = await POST(
            new NextRequest("http://test/api/admin/locations", { method: "POST", body: JSON.stringify(payload) }),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("invalid_parent_role");
        expect(db.locations.find((l) => l.label === "Illegal")).toBeUndefined();
    });

    it("13. the nested Classroom keeps its physical-room parent when re-read", async () => {
        await addRoomThroughTheProduct({ name: "Room 1", type: "physical_space" });
        const room1 = byLabel("Room 1");
        await addRoomThroughTheProduct({ name: "Toddler 1", inside: String(room1.id) });

        const rows = asHierarchyRows();
        const tod1 = rows.find((r) => r.label === "Toddler 1")!;
        expect(tod1.parent_location_id).toBe(room1.id);
        expect(tod1.unit_role).toBe("operational_group");
        // Canonical ancestry still resolves it to the Site.
        expect(rowsBelongingToSite(rows, SITE).map((r) => r.label)).toContain("Toddler 1");
    });

    it("14. a historical NULL-role row is untouched by any of this", async () => {
        db.locations.push({ id: "legacy", org_id: ORG, location_type: "unit", unit_role: null, label: "Legacy", parent_location_id: SITE, is_active: true });
        await addRoomThroughTheProduct({ name: "Room 1", type: "physical_space" });
        const legacy = db.locations.find((l) => l.id === "legacy")!;
        expect(legacy.unit_role).toBeNull();
        expect(canonicalUnitRoleFromStorage(legacy.location_type, legacy.unit_role)).toBe("operational_group");
    });
});

// ---------------------------------------------------------------------------
// 17 — downstream smoke over the topology the product just created.
// ---------------------------------------------------------------------------
describe("17. downstream consumers read the created topology correctly", () => {
    beforeEach(async () => {
        await addRoomThroughTheProduct({ name: "Room 1", type: "physical_space" });
        const room1 = byLabel("Room 1");
        await addRoomThroughTheProduct({ name: "Toddler 1", inside: String(room1.id) });
        await addRoomThroughTheProduct({ name: "Toddler 2", inside: String(room1.id) });
        await addRoomThroughTheProduct({ name: "Playground", type: "shared_space" });
    });

    const canonicalRooms = () => {
        const rows = asHierarchyRows();
        return rows
            .filter((r) => r.location_type === "unit")
            .map((r) =>
                toCanonicalRoom(
                    {
                        id: r.id, orgId: ORG, name: r.label, locationNumber: null,
                        type: "unit", parentLocationId: r.parent_location_id,
                        unitRole: r.unit_role ?? "operational_group", statusKey: null,
                        isActive: true, isPrimary: false, address: null, timezoneRef: null, metadata: {},
                    },
                    SITE,
                )!,
            );
    };

    it("16. Assignment offers both classrooms and excludes the physical room", () => {
        const placeable = placeableRooms(canonicalRooms()).map((r) => r.name);
        expect(placeable).toContain("Toddler 1");
        expect(placeable).toContain("Toddler 2");
        expect(placeable).not.toContain("Room 1");
    });

    it("16. Assignment excludes the shared space from classroom placement", () => {
        expect(placeableRooms(canonicalRooms()).map((r) => r.name)).not.toContain("Playground");
    });

    it("17. Attendance may name every unit, shared space included", () => {
        for (const room of canonicalRooms()) {
            expect(isAttendanceLocatableRole(room.unitRole)).toBe(true);
        }
    });

    it("17. the nested classroom resolves to the Site and reports its containing space", () => {
        const tod1 = canonicalRooms().find((r) => r.name === "Toddler 1")!;
        expect(tod1.siteLocationId).toBe(SITE);
        expect(tod1.containingSpaceLocationId).toBe(byLabel("Room 1").id);
    });

    it("17. the shared space hangs off the Site with no containing space", () => {
        const play = canonicalRooms().find((r) => r.name === "Playground")!;
        expect(play.siteLocationId).toBe(SITE);
        expect(play.containingSpaceLocationId).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 14 — the presentation gap, RECORDED not repaired.
//
// Slice 1 measured a sites-only label map in the Settings rooms list. Now that
// the product can actually create a nested classroom, that gap is reachable, so
// the exact effect is pinned here as evidence for the presentation slice. This
// test asserts the CURRENT (wrong) behaviour on purpose: when the subtitle is
// repaired it will fail, which is the signal that the repair landed.
// ---------------------------------------------------------------------------
describe("14. list subtitle for a newly created nested Classroom (recorded gap)", () => {
    it("renders no containing-space or site context — the known presentation defect", async () => {
        await addRoomThroughTheProduct({ name: "Room 1", type: "physical_space" });
        const room1 = byLabel("Room 1");
        await addRoomThroughTheProduct({ name: "Toddler 1", inside: String(room1.id) });

        const rows = asHierarchyRows();
        const siteLabelById = new Map(
            rows.filter((r) => r.location_type === "site").map((r) => [r.id, (r.label ?? "").trim()]),
        );
        // This is the exact expression in useLocationsConfigurationSettings listItems.
        const nested = rows.find((r) => r.label === "Toddler 1")!;
        const subtitle = nested.parent_location_id
            ? siteLabelById.get(nested.parent_location_id)
            : undefined;

        // The parent is a physical room, which is absent from a sites-only map.
        expect(subtitle).toBeUndefined();

        // A site-parented room is unaffected, which is why the gap stayed hidden.
        const flat = rows.find((r) => r.label === "Room 1")!;
        expect(siteLabelById.get(flat.parent_location_id!)).toBe("North Campus");
    });
});
