/** @vitest-environment jsdom */

/**
 * Slice 13 — Operational Rules authors within the campus it is mounted inside.
 *
 * The panel was built for the section-first, org-wide surface. Restored into an
 * object-centric workspace it kept offering every campus's rooms and programs, so
 * an operator standing in North Campus was casually offered South Campus
 * resources. The narrowing is OPT-IN: Financials and the scope-badge resolver
 * still need the org-wide set, and breaking them to fix this would trade one
 * defect for two.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { useScopeOptions } from "@/components/adminV2/settings/configurationRuntime/useScopeOptions";
import { ORG_SCOPE_SELECTION, type ScopeOptions } from "@/components/adminV2/settings/configurationRuntime/ScopePicker";

const root_ = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root_, rel), "utf8");

const NORTH = "north";
const SOUTH = "south";

const loc = (o: Record<string, unknown>) => ({ is_active: true, metadata: {}, ...o });

// North: a physical room containing a classroom, a flat classroom, a playground.
// South: its own physical room and classroom. Nested membership is the case that
// a direct-parent filter would silently drop.
const LOCATIONS = [
    loc({ id: NORTH, label: "North Campus", location_type: "site", parent_location_id: null }),
    loc({ id: SOUTH, label: "South Campus", location_type: "site", parent_location_id: null }),
    loc({ id: "n-room1", label: "Room 1", location_type: "unit", unit_role: "physical_space", parent_location_id: NORTH }),
    loc({ id: "n-tod1", label: "Toddler 1", location_type: "unit", unit_role: "operational_group", parent_location_id: "n-room1" }),
    loc({ id: "n-infant", label: "Infant Room", location_type: "unit", unit_role: "operational_group", parent_location_id: NORTH }),
    loc({ id: "n-play", label: "Playground", location_type: "unit", unit_role: "shared_space", parent_location_id: NORTH }),
    loc({ id: "s-room1", label: "Room S", location_type: "unit", unit_role: "physical_space", parent_location_id: SOUTH }),
    loc({ id: "s-pre", label: "Preschool", location_type: "unit", unit_role: "operational_group", parent_location_id: "s-room1" }),
];

const PROGRAMS = [
    { id: "p-north", key: "toddler", label: "Toddler", location_id: NORTH, is_active: true, sort_order: 1 },
    { id: "p-south", key: "preschool", label: "Preschool", location_id: SOUTH, is_active: true, sort_order: 1 },
];

vi.mock("@/lib/admin/location/fetchLocationProgramCategories", () => ({
    fetchLocationProgramCategories: vi.fn(async () => PROGRAMS),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ locations: LOCATIONS }) }) as Response));
});
afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
});

/** Render the real hook and hand back what it produced. */
async function loadScope(input?: { siteId?: string | null }) {
    let captured: { options: ScopeOptions; labelFor: (id: string) => string | undefined; ageGroupOptions: { value: string }[] } | null = null;
    function Probe() {
        const state = useScopeOptions(input);
        captured = { options: state.options, labelFor: state.labelFor, ageGroupOptions: state.ageGroupOptions };
        return null;
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(<Probe />); });
    await act(async () => {});
    return captured!;
}

const ids = (opts: { id: string }[]) => opts.map((o) => o.id).sort();

// ---------------------------------------------------------------------------
// 1-5, 11-13 — rooms.
// ---------------------------------------------------------------------------
describe("1-5, 11-13. room options follow canonical ancestry, scoped to the campus", () => {
    it("1. North Campus excludes every South Campus room", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(ids(options.rooms)).not.toContain("s-room1");
        expect(ids(options.rooms)).not.toContain("s-pre");
    });

    it("2. a NESTED North classroom survives — the case a direct-parent filter drops", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(ids(options.rooms)).toContain("n-tod1");
    });

    it("3-5. direct classroom, physical room and shared space all remain available", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        // Role filtering is NOT this slice's business — capacity and ratio rules may
        // legitimately target roles beyond classrooms.
        expect(ids(options.rooms)).toEqual(["n-infant", "n-play", "n-room1", "n-tod1"]);
    });

    it("12. the narrowing is ancestry, not a parent comparison", async () => {
        const src = read("components/adminV2/settings/configurationRuntime/useScopeOptions.ts");
        expect(src).toContain("rowsBelongingToSite(rooms, siteId)");
        expect(src).not.toMatch(/parent_location_id\s*===\s*siteId/);
    });

    it("13. nothing infers a site from a name", async () => {
        const src = read("components/adminV2/settings/configurationRuntime/useScopeOptions.ts");
        expect(src).not.toMatch(/label.*\.(includes|startsWith|match)\(/);
    });

    it("room labels still name the campus, resolved against the full tree", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(options.rooms.find((r) => r.id === "n-tod1")?.label).toBe("Toddler 1 · North Campus");
    });
});

// ---------------------------------------------------------------------------
// 6-7 — programs.
// ---------------------------------------------------------------------------
describe("6-7. programs follow their site relation", () => {
    it("7. the campus's own program is offered", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(ids(options.programs)).toEqual(["p-north"]);
    });

    it("6. another campus's program is absent", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(ids(options.programs)).not.toContain("p-south");
    });

    it("site ownership is read from the relation, never inferred from rooms", () => {
        const src = read("components/adminV2/settings/configurationRuntime/useScopeOptions.ts");
        expect(src).toContain("programs.filter((p) => p.location_id === siteId)");
    });
});

// ---------------------------------------------------------------------------
// 8-10 — sites and Organization scope.
// ---------------------------------------------------------------------------
describe("8-10. site-level and organization-level authoring survive", () => {
    it("8. the ACTIVE site stays selectable, so site-level rules remain authorable", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(ids(options.sites)).toEqual([NORTH]);
    });

    it("9. another campus is not offered from this workspace", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(ids(options.sites)).not.toContain(SOUTH);
    });

    it("10. Organization scope is untouched — it never lived in these options", async () => {
        const { options } = await loadScope({ siteId: NORTH });
        expect(options).not.toHaveProperty("org");
        expect(ORG_SCOPE_SELECTION).toEqual({
            scopeType: "org", siteLocationId: null, programCategoryId: null, roomLocationId: null,
        });
        // The picker offers Organization independently of the option lists.
        const picker = read("components/adminV2/settings/configurationRuntime/ScopePicker.tsx");
        expect(picker).toContain("ORG_SCOPE_SELECTION");
    });
});

// ---------------------------------------------------------------------------
// 14-15 — the opt-in contract, and the consumers that need it wide.
// ---------------------------------------------------------------------------
describe("14-15. unscoped behaviour is unchanged for every other consumer", () => {
    it("14. omitting the constraint returns the whole organization", async () => {
        const { options } = await loadScope();
        expect(ids(options.sites)).toEqual([NORTH, SOUTH]);
        expect(ids(options.programs)).toEqual(["p-north", "p-south"]);
        expect(ids(options.rooms)).toEqual(["n-infant", "n-play", "n-room1", "n-tod1", "s-pre", "s-room1"]);
    });

    it("14. an explicitly empty constraint is also org-wide, not an empty list", async () => {
        expect(ids((await loadScope({ siteId: null })).options.rooms)).toHaveLength(6);
        expect(ids((await loadScope({ siteId: "" })).options.rooms)).toHaveLength(6);
    });

    it("15. Financials asks for no constraint and therefore keeps org-wide options", () => {
        for (const rel of [
            "components/adminV2/settings/financials/FinancialsConfigurationPage.tsx",
            "components/adminV2/settings/financials/FinancialChargePreviewInspector.tsx",
        ]) {
            expect(read(rel)).toMatch(/useScopeOptions\(\)/);
        }
    });

    it("15. labelFor stays org-wide even when scoped, so existing badges still read", async () => {
        const { labelFor } = await loadScope({ siteId: NORTH });
        // A rule already scoped to the other campus must not render as a bare id.
        expect(labelFor("s-room1")).toBe("Room S");
        expect(labelFor(SOUTH)).toBe("South Campus");
        expect(labelFor("p-south")).toBe("Preschool");
    });

    it("15. age groups stay org-wide — a program KEY is a vocabulary, not a scope", async () => {
        const { ageGroupOptions } = await loadScope({ siteId: NORTH });
        expect(ageGroupOptions.map((o) => o.value)).toEqual(["", "preschool", "toddler"]);
    });

    it("the caller declares scope; the hook never reads route state", () => {
        const src = read("components/adminV2/settings/configurationRuntime/useScopeOptions.ts");
        expect(src).not.toMatch(/useSearchParams|useRouter|usePathname/);
    });
});

// ---------------------------------------------------------------------------
// 16-20 — the product path, and what must not have moved.
// ---------------------------------------------------------------------------
describe("16-20. deep link and boundaries", () => {
    it("16. the panel is mounted with the active site, so the deep link lands scoped", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const mount = page.slice(page.indexOf('activeTab === "operational-rules"'), page.indexOf('activeTab === "tours"'));
        expect(mount).toContain("siteId={selectedSite.id}");
        const panel = read("components/adminV2/settings/locations/LocationOperationalRulesPanel.tsx");
        expect(panel).toContain("useScopeOptions({ siteId })");
    });

    it("16. Manage capacity rules still carries the site into that concern", () => {
        const section = read("components/adminV2/settings/locations/RoomCapacitySection.tsx");
        expect(section).toContain('locationWorkspaceHref(siteId, "operational-rules")');
    });

    it("17. topology behaviour is unchanged", () => {
        expect(read("lib/locations/topologyPresentation.ts")).toContain("presentRoomTopology");
        expect(read("lib/location/topologyMutationAuthority.ts")).toContain("assertTopologyMutationSafe");
    });

    it("18-19. capacity and adoption semantics are unchanged", () => {
        const state = read("lib/locations/capacityAdoptionState.ts");
        expect(state).toContain("resolveRoomCapacityStanding");
        expect(state).toContain("summarizeSiteCapacityCoverage");
        expect(read("components/adminV2/settings/configurationRuntime/useScopeOptions.ts")).not.toContain("capacityAdoption");
    });

    it("20. Program child-count was not touched", () => {
        expect(read("components/adminV2/settings/locations/LocationProgramDetailPanel.tsx")).toContain("configuredCapacity");
    });
});
