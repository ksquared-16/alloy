import { describe, expect, it } from "vitest";

import {
    operationalIntelligenceContentSource,
    operationalIntelligenceSurfaceDefinition,
    OPERATIONAL_INTELLIGENCE_CARD_TYPES,
    OPERATIONAL_INTELLIGENCE_INSPECTOR,
} from "@/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition";
import { workspaceHeaderSurfaceDefinition } from "@/lib/platform/surfaceBuilder/definitions/headerSurfaceDefinitions";
import { createMemoryPersistence } from "@/lib/platform/surfaceBuilder/memoryPersistence";
import { emptyDoc } from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";
import { listOperationalCalculations } from "@/lib/analytics/calculations/registry";

describe("Surface controls own display + header proportions", () => {
    it("the OI inspector exposes an accent color control (Surfaces owns color)", () => {
        const renderer = OPERATIONAL_INTELLIGENCE_INSPECTOR.tabs.find((t) => t.key === "renderer")!;
        const accent = renderer.fields.find((f) => f.key === "accent");
        expect(accent?.kind).toBe("select");
        expect(accent?.options?.map((o) => o.value)).toEqual(
            expect.arrayContaining(["auto", "juniper", "amber", "ember", "blue", "neutral"]),
        );
    });

    it("header surfaces are compact, single-canvas, with no Placement tab and no Tall size", () => {
        const def = workspaceHeaderSurfaceDefinition(createMemoryPersistence(emptyDoc("none")));
        expect(def.sections).toBe("none");
        expect(def.density).toBe("compact");
        const tabKeys = def.inspectorSchema.tabs.map((t) => t.key);
        expect(tabKeys).not.toContain("placement");
        const sizeField = def.inspectorSchema.tabs.find((t) => t.key === "card")!.fields.find((f) => f.key === "size")!;
        expect(sizeField.options?.map((o) => o.value)).toEqual(["compact", "standard", "wide"]);
    });
});

describe("Operational Intelligence — a Surface Definition, not a builder", () => {
    it("content comes from the Operational Calculations registry (question-led, grouped, no impl terms)", () => {
        const source = operationalIntelligenceContentSource();
        const items = source.list();
        expect(items.length).toBe(listOperationalCalculations().length);
        const tour = items.find((i) => i.id === "enrollment.tour_conversion_rate");
        expect(tour).toBeDefined();
        expect(tour?.group).toBe("Enrollment");
        expect(tour?.question).toMatch(/tours/i);
        expect(tour?.availability).toBe("live");
        expect(source.resolveLabel("ops.needs_attention_count")).toBe("Needs attention");
        expect(source.resolveLabel("not.a.key")).toBe("not.a.key");
    });

    it("offers metric card types and a Card/Content/Renderer/Behavior/Placement inspector", () => {
        expect(OPERATIONAL_INTELLIGENCE_CARD_TYPES.map((c) => c.key)).toContain("kpi");
        expect(OPERATIONAL_INTELLIGENCE_CARD_TYPES.map((c) => c.key)).toContain("breakdown");
        expect(OPERATIONAL_INTELLIGENCE_INSPECTOR.tabs.map((t) => t.key)).toEqual([
            "card",
            "content",
            "renderer",
            "behavior",
            "placement",
        ]);
        const placement = OPERATIONAL_INTELLIGENCE_INSPECTOR.tabs.find((t) => t.key === "placement")!.fields[0];
        expect(placement.kind).toBe("promote");
        expect(placement.options?.map((o) => o.value)).toContain("workspace_header");
    });

    it("builds a valid SurfaceDefinition with an injected persistence adapter", () => {
        const def = operationalIntelligenceSurfaceDefinition(createMemoryPersistence(emptyDoc("authorable")));
        expect(def.surfaceType).toBe("operational_intelligence");
        expect(def.sections).toBe("authorable");
        expect(def.immediatePersist).toBe(true);
        expect(typeof def.persistence.load).toBe("function");
        expect(typeof def.persistence.persist).toBe("function");
        expect(def.contentSource.list().length).toBeGreaterThan(0);
    });

    it("the memory persistence round-trips the doc (preview only — not a real store)", async () => {
        const mem = createMemoryPersistence(emptyDoc("authorable"));
        const next = { sections: [{ sectionId: "s1", title: "Pulse", cards: [] }] };
        await mem.persist(next);
        expect(await mem.load()).toEqual(next);
        expect(mem.snapshot()).toEqual(next);
    });
});
