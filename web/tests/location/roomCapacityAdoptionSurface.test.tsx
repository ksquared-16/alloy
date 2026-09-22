/** @vitest-environment jsdom */

/**
 * Slice 11 (resumed) — the Room capacity surface.
 *
 * Rendered, because the whole point is what an operator is shown and offered: an
 * untyped legacy number must read as NEEDS REVIEW rather than as capacity, no
 * kind may be preselected, and canonical figures must come from the server
 * resolver rather than a client minimum over the authored kinds.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import RoomCapacitySection from "@/components/adminV2/settings/locations/RoomCapacitySection";
import { ADOPTION_PROVENANCE_KEY, LEGACY_CAPACITY_REVIEW_KEY } from "@/lib/locations/capacityAdoptionState";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

const SITE = "site";

const room = (over: Partial<LocationHierarchyRow> = {}): LocationHierarchyRow => ({
    id: "tod1", label: "Toddler 1", location_type: "unit", parent_location_id: SITE,
    is_active: true, city: null, state: null, unit_role: "operational_group", metadata: {}, ...over,
});

const rule = (over: Partial<ChildcareCapacityRuleRow> = {}) =>
    ({
        id: "r1", org_id: "org-1", scope_type: "room", site_location_id: null, program_category_id: null,
        room_location_id: "tod1", age_group_key: null, capacity_kind: "operational", capacity: 12,
        effective_start: "2026-01-01", effective_end: null, source_key: "config", metadata: {},
        created_by: null, updated_by: null, created_at: "", updated_at: "", ...over,
    }) as ChildcareCapacityRuleRow;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const posted: { url: string; body: Record<string, unknown> }[] = [];
const saved: Record<string, unknown>[] = [];
let resolution: Record<string, unknown> | null = null;

beforeAll(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    posted.length = 0;
    saved.length = 0;
    resolution = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("resolved-capacity")) {
            return { ok: true, json: async () => ({ resolution }) } as Response;
        }
        posted.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return { ok: true, json: async () => ({ rule: {} }) } as Response;
    }));
});

afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
});

async function render(r: LocationHierarchyRow, rules: ChildcareCapacityRuleRow[] = []) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <RoomCapacitySection
                room={r}
                siteId={SITE}
                capacityRules={rules}
                todayYmd="2026-09-19"
                canMutate
                onAdopted={() => {}}
                onSaveRoom={async (_id, body) => { saved.push(body); }}
            />,
        );
    });
    await act(async () => {});
}

const at = (id: string) => container!.querySelector(`[data-testid="${id}"]`);
const need = (id: string) => {
    const el = at(id);
    if (!el) throw new Error(`missing: ${id}`);
    return el as HTMLElement;
};
async function click(id: string) {
    await act(async () => { need(id).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => {});
}
async function choose(value: string) {
    const el = need("locations-room-capacity-kind") as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    await act(async () => { el.dispatchEvent(new Event("change", { bubbles: true })); });
}

// ---------------------------------------------------------------------------
// 1-4 — the legacy state and the choice.
// ---------------------------------------------------------------------------
describe("1-4. an unconfirmed legacy value reads as Needs review", () => {
    beforeEach(async () => { await render(room({ metadata: { capacity: "12" } })); });

    it("1. shows the number and says its meaning is unknown", () => {
        expect(need("locations-room-capacity-review").textContent).toContain("12 seats");
        const note = need("locations-room-capacity-needs-review").textContent ?? "";
        expect(note).toContain("Needs review");
        expect(note).toMatch(/physical, licensed or operational/);
    });

    it("1. never labels it as a kind, invalid or missing", () => {
        const text = container!.textContent ?? "";
        expect(text).not.toMatch(/\bInvalid\b|\bMissing\b/);
        expect(text).not.toMatch(/^Operational capacity\b/m);
    });

    it("2. offers Confirm capacity", () => {
        expect(at("locations-room-capacity-confirm")).not.toBeNull();
    });

    it("3-4. offers all three kinds plus discard, with NOTHING preselected", async () => {
        await click("locations-room-capacity-confirm");
        const select = need("locations-room-capacity-kind") as HTMLSelectElement;
        expect(select.value).toBe("");
        expect([...select.options].map((o) => o.value)).toEqual([
            "", "physical", "licensed", "operational", "discard",
        ]);
    });
});

// ---------------------------------------------------------------------------
// 5-9 — preview, canonical write, provenance.
// ---------------------------------------------------------------------------
describe("5-9. preview then commit through the canonical authority", () => {
    beforeEach(async () => {
        await render(room({ metadata: { capacity: "12" } }));
        await click("locations-room-capacity-confirm");
    });

    it("5-6. the preview states the value, the result and the effective date", async () => {
        await choose("operational");
        const text = need("locations-room-capacity-preview").textContent ?? "";
        expect(text).toContain("12 seats");
        expect(text).toContain("unconfirmed");
        expect(text).toContain("Operational capacity rule: 12 seats");
        expect(text).toContain("Effective from 2026-09-19");
        expect(text).toContain("Kept for now");
    });

    it("7. commits to the canonical capacity-rules route", async () => {
        await choose("operational");
        await click("locations-room-capacity-commit");
        expect(posted).toHaveLength(1);
        expect(posted[0].url).toContain("/api/admin/operational-config/capacity-rules");
        expect(posted[0].body).toMatchObject({
            action: "create", scope_type: "room", room_location_id: "tod1",
            capacity_kind: "operational", capacity: 12, effective_start: "2026-09-19",
        });
    });

    it("8. carries provenance identifying the legacy source", async () => {
        await choose("licensed");
        await click("locations-room-capacity-commit");
        const meta = posted[0].body.metadata as Record<string, Record<string, unknown>>;
        expect(meta[ADOPTION_PROVENANCE_KEY]).toMatchObject({
            source: "locations.metadata.capacity", source_location_id: "tod1",
            legacy_value: "12", legacy_retained: true,
        });
    });

    it("9. uses the adoption date, never the room's creation date", async () => {
        await choose("physical");
        await click("locations-room-capacity-commit");
        expect(posted[0].body.effective_start).toBe("2026-09-19");
    });

    it("the operator's kind is what is written — all three round trip", async () => {
        for (const kind of ["physical", "licensed", "operational"]) {
            posted.length = 0;
            await choose(kind);
            await click("locations-room-capacity-commit");
            expect(posted[0].body.capacity_kind).toBe(kind);
            await click("locations-room-capacity-confirm");
        }
    });
});

// ---------------------------------------------------------------------------
// 10-12 — the canonical state comes from the server.
// ---------------------------------------------------------------------------
describe("10-12. canonical capacity is server-resolved", () => {
    it("10-11. explains binding IN WORDS when it disagrees with what was authored", async () => {
        // The section no longer repeats the authored number — that lives on the
        // object now. It speaks only when the room cannot actually operate at
        // the number someone typed, and then it says why.
        resolution = {
            status: "resolved", physicalCapacity: 24, licensedCapacity: 20,
            configuredCapacity: 18, ratioConstrainedCapacity: 8,
            bindingCapacity: 8, limitingFactor: "ratio",
        };
        await render(room(), [rule()]);
        const text = need("locations-room-capacity-binding").textContent ?? "";
        expect(text).toContain("8");
        expect(text.toLowerCase()).toContain("ratio");
        // A client minimum over the authored kinds would have said 18.
        expect(container!.textContent).not.toContain("18 seats");
    });

    it("stays silent when binding simply agrees with the authored number", async () => {
        resolution = {
            status: "resolved", physicalCapacity: null, licensedCapacity: null,
            configuredCapacity: 12, ratioConstrainedCapacity: null,
            bindingCapacity: 12, limitingFactor: "operational",
        };
        await render(room(), [rule()]);
        expect(at("locations-room-capacity-binding")).toBeNull();
    });

    it("12. a kind with no rule is absent, never rendered as zero", async () => {
        // Binding must DISAGREE with the authored number for the kind cells to
        // render at all — the section speaks only when there is a limit to explain.
        resolution = {
            status: "resolved", physicalCapacity: null, licensedCapacity: null,
            configuredCapacity: 12, ratioConstrainedCapacity: 8,
            bindingCapacity: 8, limitingFactor: "ratio",
        };
        await render(room(), [rule()]);
        expect(at("locations-room-capacity-operational")).not.toBeNull();
        expect(at("locations-room-capacity-physical")).toBeNull();
        expect(at("locations-room-capacity-licensed")).toBeNull();
        expect(container!.textContent).not.toMatch(/Physical\s*0|Licensed\s*0/);
    });

    it("the section never computes binding itself", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/locations/RoomCapacitySection.tsx"),
            "utf8",
        );
        expect(src).toContain("resolved-capacity");
        expect(src).not.toMatch(/Math\.min|Math\.max/);
    });
});

// ---------------------------------------------------------------------------
// 13 — mixed.
// ---------------------------------------------------------------------------
describe("13. a canonical rule beside an unreviewed legacy value still needs review", () => {
    beforeEach(async () => {
        resolution = { status: "resolved", physicalCapacity: null, licensedCapacity: null,
            configuredCapacity: 12, ratioConstrainedCapacity: 8, bindingCapacity: 8, limitingFactor: "ratio" };
        await render(room({ metadata: { capacity: "9" } }), [rule()]);
    });

    it("shows the canonical limit AND the outstanding legacy value", () => {
        expect(at("locations-room-capacity-canonical")).not.toBeNull();
        expect(need("locations-room-capacity-review").textContent).toContain("9 seats");
    });

    it("offers Review legacy value rather than pretending it is settled", () => {
        expect(need("locations-room-capacity-confirm").textContent).toContain("Review legacy value");
    });

    it("does not add the canonical and legacy numbers", () => {
        expect(container!.textContent).not.toContain("21");
    });
});

// ---------------------------------------------------------------------------
// 14-15 — discard.
// ---------------------------------------------------------------------------
describe("14-15. discard makes the value inactive without destroying it", () => {
    beforeEach(async () => {
        await render(room({ metadata: { capacity: "12", category: "toddler" } }));
        await click("locations-room-capacity-confirm");
        await choose("discard");
    });

    it("confirms the consequence before writing", () => {
        const text = need("locations-room-capacity-discard-preview").textContent ?? "";
        expect(text).toContain("stop counting");
        expect(text).toContain("kept as a record");
    });

    it("15. writes a review marker and preserves the number and its neighbours", async () => {
        await click("locations-room-capacity-commit");
        expect(saved).toHaveLength(1);
        const md = saved[0].metadata as Record<string, unknown>;
        expect(md[LEGACY_CAPACITY_REVIEW_KEY]).toBe("discarded");
        expect(md.capacity).toBe("12");
        expect(md.category).toBe("toddler");
    });

    it("14. never posts a canonical rule for a discard", async () => {
        await click("locations-room-capacity-commit");
        expect(posted).toHaveLength(0);
    });

    it("a discarded room stops asking for review and offers no limits to explain", async () => {
        await render(room({ metadata: { capacity: "12", [LEGACY_CAPACITY_REVIEW_KEY]: "discarded" } }));
        // There is no "no capacity configured" dead end any more: capacity is a
        // field on the object, so an unset one is simply an empty field there.
        expect(at("locations-room-capacity-review")).toBeNull();
        expect(at("locations-room-capacity-binding")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 16-18 — the edit boundary and the canonical destination.
// ---------------------------------------------------------------------------
describe("16-18. boundaries and navigation", () => {
    it("17-18. Manage capacity rules reaches the restored concern, carrying the site", async () => {
        await render(room({ metadata: { capacity: "12" } }));
        const link = need("locations-room-capacity-manage") as HTMLAnchorElement;
        expect(link.getAttribute("href")).toContain("tab=operational-rules");
        expect(link.getAttribute("href")).toContain("locationId=site");
    });

    it("16. the object's Capacity field is always editable, and always canonical", async () => {
        // INVERTED DELIBERATELY. The old gate withdrew the Capacity field the
        // moment canonical capacity existed, so an operator who did the right
        // thing lost the simple editor and was sent to the rule console. The
        // field now stays, and writes a typed canonical rule every time.
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/locations/LocationRoomDetailPanel.tsx"),
            "utf8",
        );
        expect(src).not.toContain("canEditLegacyCapacity");
        expect(src).not.toContain("locations-room-capacity-canonical-owned");
        expect(src).toContain('action: "set_object_capacity"');
        // The value shown is the canonical one, never locations.metadata.capacity.
        expect(src).toContain("readOrdinaryCapacity");
    });
});
