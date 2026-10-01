import { describe, expect, it } from "vitest";

import type { FormViewSection, MappingState } from "@/lib/pos/formDraft/buildOperatorFormView";
import {
    canvasFilterCounts,
    CANVAS_FILTERS,
    matchesCanvasFilter,
} from "@/lib/pos/formDraft/sourceCanvasFilters";

const q = (id: string, mapping: MappingState, over: Record<string, unknown> = {}) =>
    ({
        kind: "question",
        id,
        label: id,
        answerShape: "Text",
        control: "text",
        required: false,
        requirednessText: "Optional",
        absenceText: null,
        mapping,
        mappingText: "",
        decisionPrompt: null,
        options: [],
        source: { excerpt: null, page: null, sourceFieldName: null },
        dependents: [],
        conditionConfidence: null,
        conditionTriggerLabel: null,
        ...over,
    }) as never;

const section = (items: unknown[]): FormViewSection =>
    ({ id: "s", title: "Section", items, tableWarning: null }) as FormViewSection;

describe("the filter vocabulary", () => {
    it("is exactly the five the operator was promised, in order", () => {
        expect(CANVAS_FILTERS.map((f) => f.label)).toEqual([
            "All",
            "Mapped",
            "Needs mapping",
            "Suggested",
            "Form only",
        ]);
    });

    it("keeps every field in scope under All, so the form is never reduced", () => {
        const states: MappingState[] = ["known", "suggested", "needs_review", "form_only", "derived"];
        for (const state of states) expect(matchesCanvasFilter(state, "all")).toBe(true);
    });

    it("emphasises one state at a time and nothing else", () => {
        expect(matchesCanvasFilter("known", "mapped")).toBe(true);
        expect(matchesCanvasFilter("suggested", "mapped")).toBe(false);
        expect(matchesCanvasFilter("needs_review", "needs")).toBe(true);
        expect(matchesCanvasFilter("form_only", "needs")).toBe(false);
        expect(matchesCanvasFilter("suggested", "suggested")).toBe(true);
    });

    it("treats a derived answer as form-only, because it is not a destination decision either", () => {
        expect(matchesCanvasFilter("derived", "form_only")).toBe(true);
        expect(matchesCanvasFilter("derived", "mapped")).toBe(false);
    });
});

describe("the counts beside each filter", () => {
    it("counts questions, addresses, conditional follow-ups and repeated questions alike", () => {
        const counts = canvasFilterCounts([
            section([
                q("a", "known", { dependents: [q("a1", "needs_review")] }),
                { kind: "prose", id: "p", text: "Read this" },
                { kind: "address", id: "addr", label: "Home address", lines: [], required: true, mapping: "known", mappingText: "", decisionPrompt: null, source: { excerpt: null, page: null, sourceFieldName: null } },
                {
                    kind: "repeat_group",
                    id: "g",
                    label: "Parents",
                    addLabel: "Add parent",
                    reuseText: null,
                    observedInSource: 2,
                    questions: [q("g1", "suggested"), q("g2", "form_only")],
                },
            ]),
        ]);
        // Prose is read, not answered, so it is counted nowhere.
        expect(counts).toEqual({ all: 5, mapped: 2, needs: 1, suggested: 1, form_only: 1 });
    });
});
