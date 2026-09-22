/** @vitest-environment jsdom */

/**
 * Slice 4 — Add Room can author the canonical topology.
 *
 * These RENDER the real create panel and drive the real controls, then assert on
 * the payload that reaches `onCreate` and on the request the real hook builds.
 * A source-text assertion would pass on a control that never mounts, so the form
 * is exercised rather than read.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, afterEach } from "vitest";
import LocationRoomCreatePanel from "@/components/adminV2/settings/locations/LocationRoomCreatePanel";
import type { LocationRoomCreateInput } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import { eligibleInsideOptions, DEFAULT_ROOM_TYPE } from "@/lib/locations/roomTypeVocabulary";
import { topologyRefusalCopy } from "@/lib/locations/topologyRefusalCopy";
import { TopologyRefusalError } from "@/lib/locations/topologyRefusalError";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

const INSIDE = [{ id: "room1", label: "Room 1" }];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type PanelProps = Parameters<typeof LocationRoomCreatePanel>[0];
type CreateFn = (input: LocationRoomCreateInput) => Promise<void>;

/** Render the real panel and hand back the spy the form will call. */
async function renderPanel(overrides: Partial<PanelProps> = {}) {
    const onCreate = vi.fn<CreateFn>().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <LocationRoomCreatePanel
                siteLabel="North Campus"
                programOptions={[]}
                schedulePatterns={[]}
                insideOptions={INSIDE}

                onCancel={() => {}}
                onCreate={onCreate}
                {...overrides}
            />,
        );
    });
    return onCreate;
}

function at<T extends HTMLElement>(testId: string): T | null {
    return container!.querySelector<T>(`[data-testid="${testId}"]`);
}
function need<T extends HTMLElement>(testId: string): T {
    const el = at<T>(testId);
    if (!el) throw new Error(`missing control: ${testId}`);
    return el;
}

/** Set a controlled input/select the way React sees a real user change. */
async function setValue(testId: string, value: string) {
    const el = need<HTMLInputElement | HTMLSelectElement>(testId);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    await act(async () => {
        el.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

const typeName = (name: string) => setValue("locations-room-create-name", name);
const chooseType = (role: string) => setValue("locations-room-create-type", role);
const chooseInside = (id: string) => setValue("locations-room-create-inside", id);

async function save() {
    await act(async () => {
        need("locations-room-create-save").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
}

afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
});

// ---------------------------------------------------------------------------
// 1-4 — Type control and role mapping.
// ---------------------------------------------------------------------------
describe("1-4. Type maps operator words to canonical roles", () => {
    it("1. defaults to Classroom, preserving what creation has always meant", async () => {
        const onCreate = await renderPanel();
        expect(need<HTMLSelectElement>("locations-room-create-type").value).toBe("operational_group");
        expect(DEFAULT_ROOM_TYPE).toBe("operational_group");
        await typeName("Toddler 1");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].unit_role).toBe("operational_group");
    });

    it("2. explicit Classroom sends operational_group", async () => {
        const onCreate = await renderPanel();
        await chooseType("operational_group");
        await typeName("Toddler 2");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].unit_role).toBe("operational_group");
    });

    it("3. Physical room sends physical_space", async () => {
        const onCreate = await renderPanel();
        await chooseType("physical_space");
        await typeName("Room 1");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].unit_role).toBe("physical_space");
    });

    it("4. a playground is an ordinary Physical space — no third type to choose", async () => {
        // The decisive specimen. A director creating a playground should not have
        // to know the word "shared space", and nothing downstream reads the
        // difference: placement and scheduling exclude both roles, attendance
        // offers both.
        const onCreate = await renderPanel();
        await chooseType("physical_space");
        await typeName("Playground");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].unit_role).toBe("physical_space");
    });

    it("never shows database vocabulary to the operator", async () => {
        await renderPanel();
        const text = container!.textContent ?? "";
        expect(text).toContain("Classroom");
        expect(text).toContain("Physical space");
        expect(text).not.toContain("Shared space");
        expect(text).not.toContain("unit_role");
        expect(text).not.toContain("operational_group");
        expect(text).not.toContain("parent_location_id");
    });
});

// ---------------------------------------------------------------------------
// 5-8, 11 — Inside behaviour.
// ---------------------------------------------------------------------------
describe("5-8, 11. Inside is role-adaptive", () => {
    it("5. a Classroom with no Inside parents to the Site", async () => {
        const onCreate = await renderPanel();
        await typeName("Infant Room");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].inside_location_id).toBeNull();
    });

    it("6. a Classroom with Inside parents to the chosen physical room", async () => {
        const onCreate = await renderPanel();
        await typeName("Toddler 1");
        await chooseInside("room1");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].inside_location_id).toBe("room1");
    });

    it("7. a Physical room offers no Inside and carries none", async () => {
        const onCreate = await renderPanel();
        await chooseType("physical_space");
        expect(at("locations-room-create-inside")).toBeNull();
        await typeName("Room 2");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].inside_location_id).toBeNull();
    });

    it("8. a Shared space offers no Inside and carries none", async () => {
        const onCreate = await renderPanel();
        await chooseType("shared_space");
        expect(at("locations-room-create-inside")).toBeNull();
        await typeName("Playground");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].inside_location_id).toBeNull();
    });

    it("11. changing Type away from Classroom drops an incompatible Inside", async () => {
        const onCreate = await renderPanel();
        await typeName("Room 3");
        await chooseInside("room1");
        await chooseType("physical_space");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].inside_location_id).toBeNull();
        expect(onCreate.mock.calls[0][0].unit_role).toBe("physical_space");
    });

    it("11. returning to Classroom does not silently restore the dropped Inside", async () => {
        const onCreate = await renderPanel();
        await chooseInside("room1");
        await chooseType("shared_space");
        await chooseType("operational_group");
        await typeName("Toddler 9");
        await save();
        expect(onCreate).toHaveBeenCalled();
        expect(onCreate.mock.calls[0][0].inside_location_id).toBeNull();
    });

    it("offers the site itself as the default Inside choice, in operator words", async () => {
        await renderPanel();
        const select = need<HTMLSelectElement>("locations-room-create-inside");
        expect(select.options[0].textContent).toContain("North Campus");
        expect(select.options[0].value).toBe("");
    });

    it("hides Inside entirely when the site has no physical rooms yet", async () => {
        await renderPanel({ insideOptions: [] });
        expect(at("locations-room-create-inside")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 9-10 — eligible Inside comes from canonical truth.
// ---------------------------------------------------------------------------
describe("9-10. eligible Inside options", () => {
    const rows: LocationHierarchyRow[] = [
        { id: "site", label: "North", location_type: "site", parent_location_id: null, is_active: true, city: null, state: null },
        { id: "siteB", label: "South", location_type: "site", parent_location_id: null, is_active: true, city: null, state: null },
        { id: "room1", label: "Room 1", location_type: "unit", unit_role: "physical_space", parent_location_id: "site", is_active: true, city: null, state: null },
        { id: "tod1", label: "Toddler 1", location_type: "unit", unit_role: "operational_group", parent_location_id: "room1", is_active: true, city: null, state: null },
        { id: "play", label: "Playground", location_type: "unit", unit_role: "shared_space", parent_location_id: "site", is_active: true, city: null, state: null },
        { id: "legacy", label: "Infant", location_type: "unit", unit_role: "operational_group", parent_location_id: "site", is_active: true, city: null, state: null },
        { id: "roomB", label: "Room B", location_type: "unit", unit_role: "physical_space", parent_location_id: "siteB", is_active: true, city: null, state: null },
        { id: "roomOff", label: "Room Off", location_type: "unit", unit_role: "physical_space", parent_location_id: "site", is_active: false, city: null, state: null },
    ];

    it("9. offers physical rooms only — never a classroom or a shared space", () => {
        expect(eligibleInsideOptions(rows, "site").map((o) => o.id)).toEqual(["room1"]);
    });

    it("10. is scoped to the selected site", () => {
        expect(eligibleInsideOptions(rows, "siteB").map((o) => o.id)).toEqual(["roomB"]);
        expect(eligibleInsideOptions(rows, "site").map((o) => o.id)).not.toContain("roomB");
    });

    it("does not offer an inactive physical room as a new container", () => {
        expect(eligibleInsideOptions(rows, "site").map((o) => o.id)).not.toContain("roomOff");
    });

    it("answers empty for a site that has none, rather than guessing", () => {
        expect(eligibleInsideOptions(rows, "unknown-site")).toEqual([]);
        expect(eligibleInsideOptions(rows, "")).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 12 — refusal is explained from the NAMED code.
// ---------------------------------------------------------------------------
describe("12. server refusal reaches the operator through the named code", () => {
    it("shows copy chosen by code, not by the server sentence", async () => {
        const onCreate = vi
            .fn<CreateFn>()
            .mockRejectedValue(new TopologyRefusalError("A room may only sit inside a physical room.", "invalid_parent_role"));
        await renderPanel({ onCreate });
        await typeName("Toddler 1");
        await save();
        const expected = topologyRefusalCopy("invalid_parent_role", "unused fallback");
        expect(container!.querySelector('[role="alert"]')!.textContent).toBe(expected);
    });

    it("explains a cross-site refusal in terms of Inside and the site", () => {
        expect(topologyRefusalCopy("cross_site_parent", "x")).toContain("same site");
    });

    it("never surfaces SQL, trigger names, enums or stack traces", () => {
        const codes = [
            "invalid_parent_role", "invalid_parent_type", "nested_physical_space",
            "parent_not_direct_child_of_site", "parent_not_found", "parent_required",
            "cross_site_parent", "topology_cycle", "unresolved_site", "invalid_unit_role",
            "role_only_on_unit", "existing_children_incompatible", "active_placement_incompatible",
        ];
        for (const code of codes) {
            const copy = topologyRefusalCopy(code, "fallback");
            expect(copy).not.toBe("fallback");
            expect(copy).not.toMatch(/unit_role|operational_group|physical_space|shared_space|trg_|ERRCODE|23514|locations\./);
        }
    });

    it("falls back to the server sentence for an unmapped code rather than going silent", () => {
        expect(topologyRefusalCopy("some_future_code", "Server said no.")).toBe("Server said no.");
        expect(topologyRefusalCopy(null, "Server said no.")).toBe("Server said no.");
    });
});

// ---------------------------------------------------------------------------
// Program/capacity/active field semantics by role.
// ---------------------------------------------------------------------------
describe("classroom-only fields are offered only for a Classroom", () => {
    it("offers programs and schedule for a Classroom", async () => {
        await renderPanel();
        expect(at("locations-room-create-programs")).not.toBeNull();
        expect(at("locations-room-create-schedule")).not.toBeNull();
    });

    for (const role of ["physical_space", "shared_space"]) {
        it(`hides programs and schedule for ${role}`, async () => {
            await renderPanel();
            await chooseType(role);
            expect(at("locations-room-create-programs")).toBeNull();
            expect(at("locations-room-create-schedule")).toBeNull();
        });

        it(`keeps capacity and active for ${role} — both are real for every type`, async () => {
            await renderPanel();
            await chooseType(role);
            expect(at("locations-room-create-capacity")).not.toBeNull();
            expect(at("locations-room-create-active")).not.toBeNull();
        });
    }

    it("does not smuggle program metadata onto a non-classroom", async () => {
        const onCreate = await renderPanel();
        await chooseType("physical_space");
        await typeName("Room 4");
        await setValue("locations-room-create-capacity", "20");
        await save();
        expect(onCreate).toHaveBeenCalled();
        const md = onCreate.mock.calls[0][0].metadata as Record<string, unknown>;
        // Capacity rides beside the metadata, not inside it: a new space records
        // a typed canonical rule rather than minting untyped legacy debt.
        expect(md.capacity).toBeUndefined();
        expect(onCreate.mock.calls[0][0].capacity).toBe(20);
        expect(md.supported_program_keys).toEqual([]);
        expect(md.schedule_pattern_id).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// 15 — no existing-location topology control was introduced.
// ---------------------------------------------------------------------------
describe("15. editing an existing location gained no topology control", () => {
    it("the room detail/edit panel offers no Type or Inside CONTROL", async () => {
        // Slice 5 added read-only Type / Site / Inside to this panel, so the
        // original proxy — "the file never mentions a topology field name" — no
        // longer distinguishes displaying topology from editing it. The real
        // invariant is the absence of a control and of a topology write, and that
        // is proven by rendering in
        // tests/location/roomDetailTopologyPresentation.test.tsx. What stays here
        // is the narrow structural fact: no edit-mode topology control exists.
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/locations/LocationRoomDetailPanel.tsx"),
            "utf8",
        );
        expect(src).not.toContain("locations-room-edit-type");
        expect(src).not.toContain("locations-room-edit-inside");
        // The save body shape itself is asserted by rendering, in the detail
        // presentation suite — a source scan cannot tell a display value from a
        // written one, which is exactly how the original version of this
        // assertion went stale.
    });
});
