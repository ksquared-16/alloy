/** @vitest-environment jsdom */

/**
 * Slice 5 — the Room detail surface explains topology, and only explains it.
 *
 * Rendered, not read: a source assertion would pass on a field that never mounts,
 * and — more importantly for §12 — would not prove that no EDIT affordance came
 * with it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import LocationRoomDetailPanel from "@/components/adminV2/settings/locations/LocationRoomDetailPanel";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { eligibleInsideOptions } from "@/lib/locations/roomTypeVocabulary";

beforeAll(() => {
    // React 18 wants this flag before it will treat act() as an act scope.
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

function row(over: Partial<LocationHierarchyRow> & { id: string }): LocationHierarchyRow {
    return { label: null, location_type: "unit", parent_location_id: null, is_active: true, city: null, state: null, ...over };
}

const SITE = row({ id: "site", label: "North Campus", location_type: "site" });
const ROOM1 = row({ id: "room1", label: "Room 1", unit_role: "physical_space", parent_location_id: "site" });
const TOD1 = row({ id: "tod1", label: "Toddler 1", unit_role: "operational_group", parent_location_id: "room1" });
const INFANT = row({ id: "infant", label: "Infant Room", unit_role: "operational_group", parent_location_id: "site" });
const PLAY = row({ id: "play", label: "Playground", unit_role: "shared_space", parent_location_id: "site" });
const ROWS = [SITE, ROOM1, TOD1, INFANT, PLAY];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderDetail(room: LocationHierarchyRow, canMutate = true) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <LocationRoomDetailPanel
                room={room}
                siteLabel="North Campus"
                topologyRows={ROWS}
                siteId="site"
                insideOptions={eligibleInsideOptions(ROWS, "site", { excludeLocationId: room.id })}
                capacityRules={[]}
                todayYmd="2026-09-19"
                onCapacityChanged={() => {}}
                programOptions={[]}
                schedulePatterns={[]}
                canMutate={canMutate}
                onSave={async () => {}}
                rooms={[ROOM1, TOD1, INFANT, PLAY]}
                selectedRoomId={room.id}
                onSelectRoom={() => {}}
            />,
        );
    });
    return container;
}

const metric = (key: string) => container!.querySelector(`[data-testid="locations-room-metric-${key}"]`);
const metricValue = (key: string) => metric(key)?.querySelectorAll("p")[1]?.textContent ?? null;

afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
});

// ---------------------------------------------------------------------------
// 9-11 — Type, Site, Inside.
// ---------------------------------------------------------------------------
describe("9-11. detail shows Type, Site and — when it applies — Inside", () => {
    it("a nested Classroom shows all three", async () => {
        await renderDetail(TOD1);
        expect(metricValue("type")).toBe("Classroom");
        expect(metricValue("site")).toBe("North Campus");
        expect(metricValue("inside")).toBe("Room 1");
    });

    it("a direct-site Classroom omits Inside rather than showing an em dash", async () => {
        await renderDetail(INFANT);
        expect(metricValue("type")).toBe("Classroom");
        expect(metricValue("site")).toBe("North Campus");
        expect(metric("inside")).toBeNull();
    });

    it("a Physical room shows Physical room and no Inside", async () => {
        await renderDetail(ROOM1);
        expect(metricValue("type")).toBe("Physical space");
        expect(metricValue("site")).toBe("North Campus");
        expect(metric("inside")).toBeNull();
    });

    it("a stored Shared space now shows Physical space and no Inside", async () => {
        // The compatibility fold: the row keeps its stored role, and the operator
        // is shown the word the product still uses.
        await renderDetail(PLAY);
        expect(metricValue("type")).toBe("Physical space");
        expect(metricValue("site")).toBe("North Campus");
        expect(metric("inside")).toBeNull();
    });

    it("keeps the existing operational cards alongside the topology ones", async () => {
        await renderDetail(TOD1);
        // Capacity IS a metric card again, but it now shows the canonical
        // authored value rather than the untyped legacy number that once read as
        // a fourth, competing capacity.
        for (const key of ["programs", "schedule", "status"]) {
            expect(metric(key)).not.toBeNull();
        }
    });

    it("resolves the Site by ancestry, not from the parent label", async () => {
        await renderDetail(TOD1);
        // The parent is Room 1; the Site must still be the campus.
        expect(metricValue("site")).not.toBe("Room 1");
    });
});

// ---------------------------------------------------------------------------
// 12, 16 — display only. No topology editing came with it.
// ---------------------------------------------------------------------------
describe("12, 16. topology is read-only here", () => {
    it("renders no Type or Inside control in the read view", async () => {
        await renderDetail(TOD1);
        expect(container!.querySelector('[data-testid="locations-room-create-type"]')).toBeNull();
        expect(container!.querySelector('[data-testid="locations-room-create-inside"]')).toBeNull();
        expect(container!.querySelectorAll("select")).toHaveLength(0);
    });

    it("exposes topology ONLY after the operator deliberately enters edit mode", async () => {
        // Slice 5 asserted that edit mode had no topology control at all. Slice 6
        // deliberately moved that boundary: adoption is the whole point of the
        // edit surface now. What survives unchanged is the rule the original
        // assertion was really protecting — understanding is ambient, editing is
        // intentional — so topology becomes editable on the explicit Edit action
        // and never before it.
        await renderDetail(TOD1);
        expect(container!.querySelectorAll("select")).toHaveLength(0);

        const edit = container!.querySelector('[data-testid="locations-room-toggle-edit"]')!;
        await act(async () => { edit.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

        const selects = [...container!.querySelectorAll("select")].map((s) => s.getAttribute("data-testid"));
        expect(selects).toContain("locations-room-type");
        expect(selects).toContain("locations-room-inside");
        expect(selects).toContain("locations-room-schedule-pattern");
    });

    it("never exposes a Site as topology-editable", async () => {
        await renderDetail(ROOM1);
        const edit = container!.querySelector('[data-testid="locations-room-toggle-edit"]')!;
        await act(async () => { edit.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        // A physical room has no container to choose.
        expect(container!.querySelector('[data-testid="locations-room-inside"]')).toBeNull();
    });

    it("the topology cards are text, not form fields", async () => {
        await renderDetail(TOD1);
        for (const key of ["type", "site", "inside"]) {
            const cell = metric(key)!;
            expect(cell.querySelector("input")).toBeNull();
            expect(cell.querySelector("select")).toBeNull();
            expect(cell.querySelector("button")).toBeNull();
        }
    });

    it("the save path never carries a topology key", async () => {
        const saved: Record<string, unknown>[] = [];
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(
                <LocationRoomDetailPanel
                    room={TOD1}
                    siteLabel="North Campus"
                    topologyRows={ROWS}
                    siteId="site"
                    insideOptions={eligibleInsideOptions(ROWS, "site", { excludeLocationId: TOD1.id })}
                    capacityRules={[]}
                    todayYmd="2026-09-19"
                    onCapacityChanged={() => {}}
                    programOptions={[]}
                    schedulePatterns={[]}
                    canMutate
                    onSave={async (_id, body) => { saved.push(body); }}
                    rooms={[TOD1]}
                    selectedRoomId={TOD1.id}
                    onSelectRoom={() => {}}
                />,
            );
        });
        const edit = container!.querySelector('[data-testid="locations-room-toggle-edit"]')!;
        await act(async () => { edit.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        const save = container!.querySelector('[data-testid="locations-room-save"]')!;
        await act(async () => { save.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        await act(async () => {});

        // Topology untouched in this edit, so the body is exactly what it was
        // before Slice 6 existed. Adoption only adds keys when the operator
        // actually moved something — proven in roomTopologyAdoption.test.tsx.
        expect(saved).toHaveLength(1);
        expect(Object.keys(saved[0]).sort()).toEqual(["is_active", "label", "metadata"]);
        expect(saved[0]).not.toHaveProperty("unit_role");
        expect(saved[0]).not.toHaveProperty("parent_location_id");
    });
});

// ---------------------------------------------------------------------------
// 10 — the rail inside a site.
// ---------------------------------------------------------------------------
describe("10. the room rail leads with Type and containment", () => {
    it("shows Classroom · Room 1 for a nested room, without repeating the campus", async () => {
        await renderDetail(TOD1);
        const text = container!.textContent ?? "";
        expect(text).toContain("Classroom · Room 1");
        // The campus is the page header, not every row.
        expect(text.match(/North Campus/g)!.length).toBeLessThanOrEqual(2);
    });

    it("gives every room in the rail its own Type", async () => {
        await renderDetail(INFANT);
        const text = container!.textContent ?? "";
        // One rail row per room, each labelled by what it actually is.
        expect(text).toContain("Physical space");
        expect(text).toContain("Classroom");
        // Two types in the rail, not three — the playground reads as what it is.
        expect(text).not.toContain("Shared space");
    });
});
