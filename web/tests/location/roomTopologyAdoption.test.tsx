/** @vitest-environment jsdom */

/**
 * Slice 6 — adopting an EXISTING room into the canonical topology.
 *
 * The whole point is that the row survives: same `locations.id`, same dependent
 * references, no delete-and-recreate. So these drive the real detail panel, the
 * real save contract and the real PATCH handler, and check the id on both sides
 * of every accepted edit.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import LocationRoomDetailPanel from "@/components/adminV2/settings/locations/LocationRoomDetailPanel";
import {
    committedRoomTopology,
    roomTopologyChanged,
    roomTopologyPatch,
} from "@/lib/locations/roomTopologyEdit";
import { eligibleInsideOptions } from "@/lib/locations/roomTypeVocabulary";
import { presentRoomTopology } from "@/lib/locations/topologyPresentation";
import { TopologyRefusalError } from "@/lib/locations/topologyRefusalError";
import { topologyRefusalCopy } from "@/lib/locations/topologyRefusalCopy";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

const ORG = "org-1";
const SITE = "site";

const { mockGetAdminContextCached, mockCreateAdminClient, db, captured } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    db: { locations: [] as Record<string, unknown>[], child_placements: [] as Record<string, unknown>[] },
    captured: { update: null as Record<string, unknown> | null, updatedId: null as string | null },
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
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

import { PATCH } from "@/app/api/admin/locations/[id]/route";

/** Chainable stub that honours filters and APPLIES updates, so identity is observable. */
function supabaseStub() {
    const build = (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const rows = () => (db[table as keyof typeof db] ?? []).filter((r) => filters.every((f) => f(r)));
        const b: Record<string, unknown> = {};
        b.select = vi.fn(() => b);
        b.order = vi.fn(() => b);
        b.or = vi.fn(() => b);
        b.eq = vi.fn((c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; });
        b.neq = vi.fn((c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; });
        b.in = vi.fn((c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c] as never)); return b; });
        // PostgREST applies `.update()` to whatever the LATER `.eq()` calls select,
        // so the payload is held and applied at resolution — applying it eagerly
        // would write to the first row in the table and quietly hide an identity bug.
        let pendingUpdate: Record<string, unknown> | null = null;
        const applyPending = () => {
            const target = rows()[0];
            if (pendingUpdate && target) {
                captured.update = pendingUpdate;
                captured.updatedId = String(target.id);
                Object.assign(target, pendingUpdate); // same object: identity cannot change
                pendingUpdate = null;
            }
            return target ?? null;
        };
        b.update = vi.fn((payload: Record<string, unknown>) => {
            if (table === "locations") pendingUpdate = payload;
            return b;
        });
        b.maybeSingle = vi.fn(async () => ({ data: applyPending(), error: null }));
        b.single = vi.fn(async () => ({ data: applyPending(), error: null }));
        b.then = (resolve: (v: unknown) => unknown) => {
            applyPending();
            return resolve({ data: rows(), error: null });
        };
        return b;
    };
    return { from: vi.fn((t: string) => build(t)) };
}

const loc = (o: Record<string, unknown>) => ({ org_id: ORG, is_active: true, customer_id: null, ...o });

function resetDb() {
    db.locations = [
        loc({ id: SITE, location_type: "site", unit_role: null, label: "North Campus", parent_location_id: null }),
        loc({ id: "room1", location_type: "unit", unit_role: "physical_space", label: "Room 1", parent_location_id: SITE }),
        loc({ id: "room2", location_type: "unit", unit_role: "physical_space", label: "Room 2", parent_location_id: SITE }),
        // The historical row: pre-topology, stored NULL, parented to the site.
        loc({ id: "toddler", location_type: "unit", unit_role: null, label: "Toddler Room", parent_location_id: SITE }),
    ];
    db.child_placements = [];
    captured.update = null;
    captured.updatedId = null;
}

function rowsOf(): LocationHierarchyRow[] {
    return db.locations.map((r) => ({
        id: String(r.id),
        label: (r.label ?? null) as string | null,
        location_type: (r.location_type ?? null) as string | null,
        parent_location_id: (r.parent_location_id ?? null) as string | null,
        unit_role:
            String(r.location_type) === "unit"
                ? ((r.unit_role as "physical_space" | "operational_group" | "shared_space" | null) ?? "operational_group")
                : null,
        is_active: r.is_active !== false,
        city: null,
        state: null,
    }));
}
const rowOf = (id: string) => rowsOf().find((r) => r.id === id)!;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Render the real detail panel wired to the real PATCH handler. */
async function renderPanel(roomId: string, canMutate = true) {
    const rows = rowsOf();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <LocationRoomDetailPanel
                room={rowOf(roomId)}
                siteLabel="North Campus"
                topologyRows={rows}
                siteId={SITE}
                insideOptions={eligibleInsideOptions(rows, SITE, { excludeLocationId: roomId })}
                capacityRules={[]}
                todayYmd="2026-09-19"
                onCapacityChanged={() => {}}
                programOptions={[]}
                schedulePatterns={[]}
                canMutate={canMutate}
                onSave={async (id, body) => {
                    const res = await PATCH(
                        new NextRequest(`http://test/api/admin/locations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
                        { params: Promise.resolve({ id }) },
                    );
                    if (!res.ok) {
                        const j = (await res.json()) as { error?: string; code?: string };
                        throw new TopologyRefusalError(j.error ?? "failed", j.code ?? null);
                    }
                }}
                rooms={rows.filter((r) => r.location_type === "unit")}
                selectedRoomId={roomId}
                onSelectRoom={() => {}}
            />,
        );
    });
}

const at = <T extends HTMLElement>(id: string) => container!.querySelector<T>(`[data-testid="${id}"]`);
const need = <T extends HTMLElement>(id: string) => {
    const el = at<T>(id);
    if (!el) throw new Error(`missing control: ${id}`);
    return el;
};
async function setValue(id: string, value: string) {
    const el = need<HTMLInputElement | HTMLSelectElement>(id);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    await act(async () => { el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function click(id: string) {
    await act(async () => { need(id).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => {});
}
const enterEdit = () => click("locations-room-toggle-edit");
const save = () => click("locations-room-save");

beforeAll(() => { (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId: ORG, userId: "u-1", role: "admin" });
    mockCreateAdminClient.mockImplementation(() => supabaseStub());
});
afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
});

// ---------------------------------------------------------------------------
// 1-2 — the historical row, and not backfilling it by accident.
// ---------------------------------------------------------------------------
describe("1-2. a historical NULL-role room edits as a Classroom", () => {
    it("1. shows Classroom, never a blank or a raw stored value", async () => {
        await renderPanel("toddler");
        await enterEdit();
        expect(need<HTMLSelectElement>("locations-room-type").value).toBe("operational_group");
        const shown = [...need<HTMLSelectElement>("locations-room-type").options].map((o) => o.textContent);
        // Two types, not three. "Shared space" was withdrawn from the operator
        // vocabulary because no behavioral branch distinguished it from a
        // physical space, and "Physical room" became "Physical space" so the
        // word can honestly cover a playground.
        expect(shown).toEqual(["Classroom", "Physical space"]);
        expect(need("locations-room-type").textContent).not.toContain("operational_group");
    });

    it("2. saving without touching topology writes no topology key — no accidental backfill", async () => {
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-name", "Toddler Room A");
        await save();
        expect(captured.update).toMatchObject({ label: "Toddler Room A" });
        expect(captured.update).not.toHaveProperty("unit_role");
        expect(captured.update).not.toHaveProperty("parent_location_id");
        expect(db.locations.find((l) => l.id === "toddler")!.unit_role).toBeNull();
    });

    it("2. the contract itself refuses to emit keys for an unchanged topology", () => {
        const committed = committedRoomTopology(rowOf("toddler"), SITE);
        expect(committed).toEqual({ roomType: "operational_group", insideId: "" });
        expect(roomTopologyChanged(committed, { roomType: "operational_group", insideId: "" })).toBe(false);
        expect(roomTopologyPatch(committed, { roomType: "operational_group", insideId: "" }, SITE)).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// 3-8 — the adoption journey, and what survives it.
// ---------------------------------------------------------------------------
describe("3-8. adopting the historical room into a physical room", () => {
    it("3,4,7. moves Inside Room 1, materializes the role, and keeps the SAME id", async () => {
        const idBefore = String(db.locations.find((l) => l.label === "Toddler Room")!.id);

        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "room1");
        await save();

        // §16 decision: an explicit topology edit IS a classification, so the role
        // is materialized — and only now.
        expect(captured.update).toMatchObject({ unit_role: "operational_group", parent_location_id: "room1" });

        const after = db.locations.find((l) => l.label === "Toddler Room")!;
        expect(String(after.id)).toBe(idBefore);
        expect(captured.updatedId).toBe(idBefore);
        expect(after.parent_location_id).toBe("room1");
        expect(after.unit_role).toBe("operational_group");
        // 23 — exactly one row still carries this identity. Nothing was recreated.
        expect(db.locations.filter((l) => l.id === idBefore)).toHaveLength(1);
        expect(db.locations.filter((l) => l.label === "Toddler Room")).toHaveLength(1);
    });

    it("8. dependent references still point at the same location afterwards", async () => {
        db.child_placements = [
            { id: "p1", org_id: ORG, room_location_id: "toddler", status: "active" },
            { id: "p2", org_id: ORG, room_location_id: "toddler", status: "ended" },
        ];
        const before = JSON.stringify(db.child_placements);

        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "room1");
        await save();

        // Adoption, not migration: the placements were never touched and still name
        // the same room.
        expect(JSON.stringify(db.child_placements)).toBe(before);
        expect(db.child_placements.every((p) => p.room_location_id === "toddler")).toBe(true);
    });

    it("5. a Classroom may stay directly under its site", async () => {
        db.locations.find((l) => l.id === "toddler")!.parent_location_id = "room1";
        db.locations.find((l) => l.id === "toddler")!.unit_role = "operational_group";
        await renderPanel("toddler");
        await enterEdit();
        expect(need<HTMLSelectElement>("locations-room-inside").value).toBe("room1");
        await setValue("locations-room-inside", "");
        await save();
        expect(captured.update).toMatchObject({ parent_location_id: SITE });
        expect(db.locations.find((l) => l.id === "toddler")!.parent_location_id).toBe(SITE);
    });

    it("6. a same-site re-parent from Room 1 to Room 2 succeeds and keeps identity", async () => {
        const t = db.locations.find((l) => l.id === "toddler")!;
        t.parent_location_id = "room1";
        t.unit_role = "operational_group";
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "room2");
        await save();
        expect(db.locations.find((l) => l.id === "toddler")!.parent_location_id).toBe("room2");
        expect(db.locations.filter((l) => l.id === "toddler")).toHaveLength(1);
    });

    it("an empty direct Classroom may become a Physical room", async () => {
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-type", "physical_space");
        await save();
        expect(captured.update).toMatchObject({ unit_role: "physical_space", parent_location_id: SITE });
    });

    it("a Physical space can no longer be turned into a Shared space", async () => {
        // The editor cannot produce the role because the picker no longer offers
        // it. Stored shared spaces keep working; new ones are never authored.
        await renderPanel("room2");
        await enterEdit();
        const roles = [...need<HTMLSelectElement>("locations-room-type").options].map((o) => o.value);
        expect(roles).toEqual(["operational_group", "physical_space"]);
    });

    it("19-20. presentation explains the adopted room immediately afterwards", async () => {
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "room1");
        await save();
        const t = presentRoomTopology(rowOf("toddler"), rowsOf());
        expect(t.subtitle).toBe("Classroom · Room 1 · North Campus");
        expect(t.typeLabel).toBe("Classroom");
        expect(t.containingSpaceLabel).toBe("Room 1");
        expect(t.siteLabel).toBe("North Campus");
    });
});

// ---------------------------------------------------------------------------
// 9-14 — refusals.
// ---------------------------------------------------------------------------
describe("9-14. the safety contract refuses, and the operator is told why", () => {
    it("9,12. a physical room containing a classroom refuses the type change, and writes nothing", async () => {
        db.locations.find((l) => l.id === "toddler")!.parent_location_id = "room1";
        db.locations.find((l) => l.id === "toddler")!.unit_role = "operational_group";
        await renderPanel("room1");
        await enterEdit();
        await setValue("locations-room-type", "shared_space");
        await save();

        expect(captured.update).toBeNull();
        expect(db.locations.find((l) => l.id === "room1")!.unit_role).toBe("physical_space");
        expect(container!.querySelector('[role="alert"]')!.textContent).toBe(
            topologyRefusalCopy("existing_children_incompatible", "x"),
        );
    });

    it("9. the child is not moved, re-parented or reclassified by the refusal", async () => {
        db.locations.find((l) => l.id === "toddler")!.parent_location_id = "room1";
        db.locations.find((l) => l.id === "toddler")!.unit_role = "operational_group";
        await renderPanel("room1");
        await enterEdit();
        await setValue("locations-room-type", "shared_space");
        await save();
        const child = db.locations.find((l) => l.id === "toddler")!;
        expect(child.parent_location_id).toBe("room1");
        expect(child.unit_role).toBe("operational_group");
    });

    it("10,13. a classroom with a live placement refuses, and the placements are untouched", async () => {
        db.child_placements = [{ id: "p1", org_id: ORG, room_location_id: "toddler", status: "active" }];
        const before = JSON.stringify(db.child_placements);
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-type", "physical_space");
        await save();

        expect(captured.update).toBeNull();
        expect(JSON.stringify(db.child_placements)).toBe(before);
        expect(container!.querySelector('[role="alert"]')!.textContent).toBe(
            topologyRefusalCopy("active_placement_incompatible", "x"),
        );
    });

    it("11. a cross-site re-parent is refused", async () => {
        db.locations.push(loc({ id: "siteB", location_type: "site", unit_role: null, label: "South", parent_location_id: null }));
        db.locations.push(loc({ id: "roomB", location_type: "unit", unit_role: "physical_space", label: "Room B", parent_location_id: "siteB" }));
        // The picker will not offer it, so post the intent directly at the boundary.
        const res = await PATCH(
            new NextRequest("http://test/api/admin/locations/toddler", {
                method: "PATCH",
                body: JSON.stringify({ unit_role: "operational_group", parent_location_id: "roomB" }),
            }),
            { params: Promise.resolve({ id: "toddler" }) },
        );
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("cross_site_parent");
        expect(db.locations.find((l) => l.id === "toddler")!.parent_location_id).toBe(SITE);
    });

    it("14. every refusal renders operator copy, never a database sentence", async () => {
        db.child_placements = [{ id: "p1", org_id: ORG, room_location_id: "toddler", status: "active" }];
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-type", "physical_space");
        await save();
        const text = container!.querySelector('[role="alert"]')!.textContent!;
        expect(text).not.toMatch(/unit_role|operational_group|physical_space|ERRCODE|23514|locations\./);
    });

    it("18. a failed save stays in edit mode and never visually commits the rejected topology", async () => {
        db.child_placements = [{ id: "p1", org_id: ORG, room_location_id: "toddler", status: "active" }];
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-type", "physical_space");
        await save();
        // Still editing, so the read view has not adopted the rejected value...
        expect(at("locations-room-edit")).not.toBeNull();
        expect(at("locations-room-detail")).toBeNull();
        // ...and the stored row is untouched.
        expect(db.locations.find((l) => l.id === "toddler")!.unit_role).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 15-17 — edit lifecycle.
// ---------------------------------------------------------------------------
describe("15-17. dirty state and cancel", () => {
    it("15. changing Type away from Classroom clears a pending Inside", async () => {
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "room1");
        expect(need<HTMLSelectElement>("locations-room-inside").value).toBe("room1");
        await setValue("locations-room-type", "physical_space");
        expect(at("locations-room-inside")).toBeNull();
        await save();
        expect(captured.update).toMatchObject({ parent_location_id: SITE });
    });

    it("15. returning to Classroom does not silently restore the dropped Inside", async () => {
        // The payload builder independently refuses to attach an Inside to a type
        // that cannot have one, which masks a stale-state bug on the way OUT of
        // Classroom. Coming back is where the operator would actually see it.
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "room1");
        await setValue("locations-room-type", "shared_space");
        await setValue("locations-room-type", "operational_group");
        expect(need<HTMLSelectElement>("locations-room-inside").value).toBe("");
        await save();
        // The ordinary fields still save; topology moved nowhere, so no topology key.
        expect(captured.update).not.toHaveProperty("unit_role");
        expect(captured.update).not.toHaveProperty("parent_location_id");
    });

    it("16,17. Cancel restores the committed Type and Inside", async () => {
        const t = db.locations.find((l) => l.id === "toddler")!;
        t.parent_location_id = "room1";
        t.unit_role = "operational_group";
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-type", "shared_space");
        await click("locations-room-cancel-edit");
        await enterEdit();
        expect(need<HTMLSelectElement>("locations-room-type").value).toBe("operational_group");
        expect(need<HTMLSelectElement>("locations-room-inside").value).toBe("room1");
        expect(captured.update).toBeNull();
    });

    it("16. Cancel after clearing Inside restores the committed container", async () => {
        const t = db.locations.find((l) => l.id === "toddler")!;
        t.parent_location_id = "room1";
        t.unit_role = "operational_group";
        await renderPanel("toddler");
        await enterEdit();
        await setValue("locations-room-inside", "");
        await click("locations-room-cancel-edit");
        await enterEdit();
        expect(need<HTMLSelectElement>("locations-room-inside").value).toBe("room1");
    });
});

// ---------------------------------------------------------------------------
// 21-25 — parity, authority, and the boundaries this slice must not cross.
// ---------------------------------------------------------------------------
describe("21-25. parity and boundaries", () => {
    it("21. edit offers exactly the vocabulary create offers", async () => {
        await renderPanel("toddler");
        await enterEdit();
        const editOptions = [...need<HTMLSelectElement>("locations-room-type").options].map((o) => [o.value, o.textContent]);
        const { ROOM_TYPE_OPTIONS } = await import("@/lib/locations/roomTypeVocabulary");
        expect(editOptions).toEqual(ROOM_TYPE_OPTIONS.map((o) => [o.role, o.label]));
    });

    it("22. a room is never offered as its own container", () => {
        const rows = rowsOf();
        expect(eligibleInsideOptions(rows, SITE, { excludeLocationId: "room1" }).map((o) => o.id)).toEqual(["room2"]);
        expect(eligibleInsideOptions(rows, SITE).map((o) => o.id)).toEqual(["room1", "room2"]);
    });

    it("24. no topology editing is exposed for a Site", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/locations/LocationSiteDetailPanel.tsx"),
            "utf8",
        );
        expect(src).not.toContain("locations-site-type");
        expect(src).not.toContain("locations-site-inside");
        expect(src).not.toContain("unit_role");
        expect(src).not.toContain("parent_location_id");
    });

    it("25. no bulk adoption path exists", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const dir = resolve(__dirname, "../../components/adminV2/settings/locations");
        const { readdirSync } = await import("node:fs");
        for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx") || n.endsWith(".ts"))) {
            const src = readFileSync(resolve(dir, f), "utf8");
            expect(src).not.toMatch(/bulk.?classif|convert all|classifyAll|migrateRooms|normalizeRooms/i);
        }
    });

    it("23. no code path deletes a location", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const hook = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/locations/useLocationsConfigurationSettings.ts"),
            "utf8",
        );
        expect(hook).not.toMatch(/method:\s*"DELETE"/);
        expect(hook).not.toMatch(/\.delete\(/);
    });
});
