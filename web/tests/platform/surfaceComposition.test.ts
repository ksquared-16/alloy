/**
 * Experience Builder V3 — Universal Surface Composition tests.
 *
 * Proves the frozen model and the keystone primitive (Expanded = Open Surface):
 *   - the hierarchy types compose (Surface → Canvas → Component → Evidence Group → Item)
 *   - a Card is one component type among several
 *   - openSurfaceId resolves through the registry
 *   - recursion (Children → child → Children) terminates via cycle detection
 *   - two proofs on two axes: Children (record→record) + Financial Config (op→op)
 *   - no abstract group labels; no dangling openSurfaceId refs
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    componentOpenSurfaceIds,
    hasAbstractGroupLabel,
    surfaceComponents,
    type SurfaceComponentSpec,
} from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import {
    __resetSurfaceRegistry,
    danglingOpenSurfaceRefs,
    getSurface,
    reachableSurfaceIds,
    registerSurfaces,
    resolveOpenSurface,
    walkSurfaceGraph,
} from "@/lib/platform/surfaceComposition/surfaceRegistry";
import {
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    FOCUS_PANEL_SURFACE_ID,
    V3_PROOF_SURFACES,
    childrenSurface,
    financialConfigurationSurface,
    focusPanelSurface,
} from "@/lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs";

beforeEach(() => {
    __resetSurfaceRegistry();
    registerSurfaces(V3_PROOF_SURFACES);
});
afterEach(() => __resetSurfaceRegistry());

describe("the hierarchy composes: Surface → Canvas → Component → Evidence Group → Item", () => {
    it("focus panel surface has components with evidence groups of composition items", () => {
        const components = surfaceComponents(focusPanelSurface);
        expect(components.length).toBeGreaterThan(0);
        const withGroups = components.every((c) => c.evidenceGroups.length > 0);
        expect(withGroups).toBe(true);
        const withItems = components.every((c) => c.evidenceGroups.every((g) => g.items.length > 0));
        expect(withItems).toBe(true);
    });

    it("a Card is one component type among several (card + config_panel present)", () => {
        const types = new Set(surfaceComponents(focusPanelSurface).map((c) => c.componentType));
        expect(types.has("card")).toBe(true);
        expect(types.has("config_panel")).toBe(true);
    });

    it("composition items carry one of the six canonical kinds", () => {
        const kinds = new Set(
            V3_PROOF_SURFACES.flatMap((s) =>
                surfaceComponents(s).flatMap((c) => c.evidenceGroups.flatMap((g) => g.items.map((i) => i.kind))),
            ),
        );
        for (const k of kinds) {
            expect(["field", "widget", "related_list", "calculation", "ai_summary", "action"]).toContain(k);
        }
        // We exercise more than just "field": calculation, related_list, action appear.
        expect(kinds.has("calculation")).toBe(true);
        expect(kinds.has("related_list")).toBe(true);
        expect(kinds.has("action")).toBe(true);
    });
});

describe("keystone: Expanded = Open Surface", () => {
    it("children card's Expanded depth opens the Children Surface", () => {
        const childrenCard = surfaceComponents(focusPanelSurface).find((c) => c.id === "children_card")!;
        const opened = resolveOpenSurface(childrenCard, "expanded");
        expect(opened).not.toBeNull();
        expect(opened!.id).toBe(CHILDREN_SURFACE_ID);
        expect(opened!.label).toBe("Children");
    });

    it("financial configuration card's Workspace depth opens the Financial Config Surface", () => {
        const finCard = surfaceComponents(focusPanelSurface).find((c) => c.id === "financial_configuration_card")!;
        const opened = resolveOpenSurface(finCard, "workspace");
        expect(opened).not.toBeNull();
        expect(opened!.id).toBe(FINANCIAL_CONFIG_SURFACE_ID);
        expect(opened!.category).toBe("operational_config");
    });

    it("a component with no depth binding opens nothing", () => {
        const bare: SurfaceComponentSpec = {
            id: "x",
            label: "X",
            componentType: "card",
            evidenceGroups: [{ key: "g", label: "Group Name", items: [{ key: "a.b", label: "B", kind: "field" }] }],
        };
        expect(resolveOpenSurface(bare, "expanded")).toBeNull();
        expect(resolveOpenSurface(bare, "workspace")).toBeNull();
    });
});

describe("recursion terminates (Children → child → Children)", () => {
    it("the children component opens the Children Surface via a handoff action", () => {
        const childComponent = surfaceComponents(childrenSurface)[0]!;
        expect(componentOpenSurfaceIds(childComponent)).toContain(CHILDREN_SURFACE_ID);
    });

    it("walkSurfaceGraph visits a self-referential surface exactly once (no infinite loop)", () => {
        const nodes = walkSurfaceGraph(CHILDREN_SURFACE_ID);
        const ids = nodes.map((n) => n.surface.id);
        // Children opens itself — must appear once, not loop forever.
        expect(ids.filter((id) => id === CHILDREN_SURFACE_ID)).toHaveLength(1);
    });

    it("from the Focus Panel, both nested surfaces are reachable", () => {
        const reachable = reachableSurfaceIds(FOCUS_PANEL_SURFACE_ID);
        expect(reachable).toContain(FOCUS_PANEL_SURFACE_ID);
        expect(reachable).toContain(CHILDREN_SURFACE_ID);
        expect(reachable).toContain(FINANCIAL_CONFIG_SURFACE_ID);
    });
});

describe("two proofs on two different axes", () => {
    it("Children Surface proves Record → Record Surface (grain child)", () => {
        expect(childrenSurface.grain).toBe("child");
        expect(childrenSurface.category).toBe("focus_panel");
    });

    it("Financial Config Surface proves Operational → Operational (config panel, History + Actions)", () => {
        expect(financialConfigurationSurface.category).toBe("operational_config");
        const groups = surfaceComponents(financialConfigurationSurface)[0]!.evidenceGroups.map((g) => g.key);
        expect(groups).toContain("current_configuration");
        expect(groups).toContain("configuration_history");
        expect(groups).toContain("configuration_actions");
    });

    it("both surfaces are composed from the same model (identical shape)", () => {
        for (const s of [childrenSurface, financialConfigurationSurface]) {
            expect(Array.isArray(s.canvas.rows)).toBe(true);
            expect(surfaceComponents(s).length).toBeGreaterThan(0);
        }
    });
});

describe("invariants", () => {
    it("no proof surface uses an abstract group label", () => {
        for (const s of V3_PROOF_SURFACES) {
            expect(hasAbstractGroupLabel(s), `${s.id} has an abstract group label`).toBe(false);
        }
    });

    it("no dangling openSurfaceId references in the registry", () => {
        expect(danglingOpenSurfaceRefs()).toEqual([]);
    });

    it("a dangling reference is detected when a target is unregistered", () => {
        __resetSurfaceRegistry();
        registerSurfaces([focusPanelSurface]); // children + financial NOT registered
        const dangling = danglingOpenSurfaceRefs();
        expect(dangling.length).toBeGreaterThan(0);
        expect(dangling.map((d) => d.missing)).toContain(CHILDREN_SURFACE_ID);
    });

    it("getSurface returns null for an unknown id", () => {
        expect(getSurface("nope")).toBeNull();
    });
});
