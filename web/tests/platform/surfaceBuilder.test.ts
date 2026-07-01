import { describe, expect, it } from "vitest";

import type { SurfaceCardInstance } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import {
    emptyDoc,
    IMPLICIT_SECTION_ID,
    insertCard,
    removeCard,
    moveCard,
    updateCard,
    addSection,
    removeSection,
    renameSection,
    moveSection,
    getCard,
    countCards,
    surfaceBuilderReducer,
    type BuilderState,
} from "@/lib/platform/surfaceBuilder/surfaceBuilderModel";

const card = (id: string, cardTypeKey = "kpi"): SurfaceCardInstance => ({ instanceId: id, cardTypeKey, contentId: null, config: {} });

describe("SurfaceBuilder engine — generic, no business logic", () => {
    it("emptyDoc: implicit single section for 'none', no sections for 'authorable'", () => {
        expect(emptyDoc("none").sections).toEqual([{ sectionId: IMPLICIT_SECTION_ID, title: "", cards: [] }]);
        expect(emptyDoc("authorable").sections).toEqual([]);
    });

    it("inserts cards at a clamped index and moves across sections", () => {
        let doc = emptyDoc("authorable");
        doc = addSection(doc, { sectionId: "s1", title: "One", cards: [] });
        doc = addSection(doc, { sectionId: "s2", title: "Two", cards: [] });
        doc = insertCard(doc, "s1", 0, card("a"));
        doc = insertCard(doc, "s1", 99, card("b")); // clamps to end
        expect(doc.sections[0].cards.map((c) => c.instanceId)).toEqual(["a", "b"]);
        doc = moveCard(doc, "a", "s2", 0);
        expect(doc.sections[0].cards.map((c) => c.instanceId)).toEqual(["b"]);
        expect(doc.sections[1].cards.map((c) => c.instanceId)).toEqual(["a"]);
        expect(countCards(doc)).toBe(2);
    });

    it("removes cards and patches content/span/promotion/config (config merges)", () => {
        let doc = insertCard(emptyDoc("none"), IMPLICIT_SECTION_ID, 0, card("a"));
        doc = updateCard(doc, "a", { contentId: "enrollment.lead_count", span: 3, promotedTo: ["workspace_header"], config: { rendererKey: "trend_card" } });
        doc = updateCard(doc, "a", { config: { title: "Leads" } }); // merge, not replace
        const c = getCard(doc, "a")!;
        expect(c.contentId).toBe("enrollment.lead_count");
        expect(c.span).toBe(3);
        expect(c.promotedTo).toEqual(["workspace_header"]);
        expect(c.config).toEqual({ rendererKey: "trend_card", title: "Leads" });
        doc = removeCard(doc, "a");
        expect(countCards(doc)).toBe(0);
    });

    it("authors sections: add / rename / move / remove", () => {
        let doc = emptyDoc("authorable");
        doc = addSection(doc, { sectionId: "a", title: "A", cards: [] });
        doc = addSection(doc, { sectionId: "b", title: "B", cards: [] });
        doc = addSection(doc, { sectionId: "c", title: "C", cards: [] });
        doc = renameSection(doc, "b", "Beta");
        doc = moveSection(doc, "c", 0);
        expect(doc.sections.map((s) => `${s.sectionId}:${s.title}`)).toEqual(["c:C", "a:A", "b:Beta"]);
        doc = removeSection(doc, "a");
        expect(doc.sections.map((s) => s.sectionId)).toEqual(["c", "b"]);
    });
});

describe("SurfaceBuilder reducer — dirty + selection", () => {
    const initial: BuilderState = { doc: emptyDoc("none"), selectedInstanceId: null, dirty: false };

    it("load resets dirty + selection", () => {
        const dirty: BuilderState = { ...initial, dirty: true, selectedInstanceId: "x" };
        const next = surfaceBuilderReducer(dirty, { type: "load", doc: emptyDoc("none") });
        expect(next.dirty).toBe(false);
        expect(next.selectedInstanceId).toBeNull();
    });

    it("insert marks dirty and selects the new card; markSaved clears dirty", () => {
        let s = surfaceBuilderReducer(initial, { type: "insertCard", sectionId: IMPLICIT_SECTION_ID, index: 0, instance: card("a") });
        expect(s.dirty).toBe(true);
        expect(s.selectedInstanceId).toBe("a");
        s = surfaceBuilderReducer(s, { type: "markSaved" });
        expect(s.dirty).toBe(false);
    });

    it("removing the selected card clears the selection", () => {
        let s = surfaceBuilderReducer(initial, { type: "insertCard", sectionId: IMPLICIT_SECTION_ID, index: 0, instance: card("a") });
        s = surfaceBuilderReducer(s, { type: "removeCard", instanceId: "a" });
        expect(s.selectedInstanceId).toBeNull();
        expect(countCards(s.doc)).toBe(0);
    });
});
