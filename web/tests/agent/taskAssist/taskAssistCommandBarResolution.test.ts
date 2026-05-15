import { describe, expect, it } from "vitest";

import { extractTaskAssistEntitySearchQuery, looksLikeAmbientOnlyCommand } from "@/lib/agent/taskAssist/taskAssistCommandBarResolution";

describe("taskAssistCommandBarResolution", () => {
    it("detects ambient pronoun commands after stripping verbs", () => {
        expect(looksLikeAmbientOnlyCommand("send them a reminder")).toBe(true);
        expect(looksLikeAmbientOnlyCommand("text them about tomorrow")).toBe(true);
        expect(looksLikeAmbientOnlyCommand("remind this family")).toBe(true);
    });

    it("does not treat named-family commands as ambient-only", () => {
        expect(looksLikeAmbientOnlyCommand("text the Smith family about forms")).toBe(false);
        expect(looksLikeAmbientOnlyCommand("message Johnson about tour")).toBe(false);
    });

    it("extractSearchQuery strips intent prefixes and leading articles", () => {
        expect(extractTaskAssistEntitySearchQuery("text the Smith family about missing forms")).toContain("Smith");
        expect(extractTaskAssistEntitySearchQuery("Text the Smith family about missing forms").toLowerCase()).toMatch(/smith/);
    });
});
