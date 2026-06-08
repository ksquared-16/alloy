import { describe, expect, it } from "vitest";

import {
    extractExplainEntitySearchQuery,
    pickExplainEntityCandidate,
} from "@/lib/agent/workflowAssist/workflowAssistExplainEntityLookup";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

describe("extractExplainEntitySearchQuery", () => {
    it("extracts Mitchell from family phrasing", () => {
        expect(extractExplainEntitySearchQuery("Why didn't the Mitchell family get moved?")).toBe("Mitchell");
    });

    it("returns null without why-blocked phrasing", () => {
        expect(extractExplainEntitySearchQuery("Show workflow summary")).toBeNull();
    });
});

describe("pickExplainEntityCandidate", () => {
    const base = (id: string, confidence: TaskAssistEntitySearchCandidate["confidence"]): TaskAssistEntitySearchCandidate => ({
        entity_type: "opportunities",
        entity_id: id,
        label: `Opp ${id}`,
        subtitle: null,
        confidence,
        source: "opportunity_name",
        matched_fields: ["name"],
    });

    it("picks single high-confidence match", () => {
        const r = pickExplainEntityCandidate([base("a", "high")]);
        expect(r.kind).toBe("single");
    });

    it("returns multiple when ambiguous", () => {
        const r = pickExplainEntityCandidate([base("a", "medium"), base("b", "medium")]);
        expect(r.kind).toBe("multiple");
    });
});
