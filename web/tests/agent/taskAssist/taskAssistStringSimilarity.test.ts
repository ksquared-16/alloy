import { describe, expect, it } from "vitest";

import { editDistanceOneTokens, similarityRatio } from "@/lib/agent/taskAssist/taskAssistStringSimilarity";

describe("taskAssistStringSimilarity", () => {
    it("suggests Mitchell is similar to Michell", () => {
        expect(similarityRatio("Michell", "Mitchell")).toBeGreaterThan(0.7);
    });

    it("generates edit-distance-1 variants", () => {
        const v = editDistanceOneTokens("michell");
        expect(v.length).toBeGreaterThan(0);
        expect(v.some((t) => similarityRatio("michell", t) > 0.75)).toBe(true);
    });
});
