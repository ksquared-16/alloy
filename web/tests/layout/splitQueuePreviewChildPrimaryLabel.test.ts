import { describe, expect, it } from "vitest";
import {
    splitQueuePreviewChildPrimaryLabel,
    stripParentheticalAgeFromChildDisplayName,
} from "@/lib/layout/runtime/splitQueuePreviewChildPrimaryLabel";

describe("splitQueuePreviewChildPrimaryLabel", () => {
    it("splits CRM preview primary lines with parenthetical age", () => {
        expect(splitQueuePreviewChildPrimaryLabel("Alex Kelly (6m)")).toEqual({
            name: "Alex Kelly",
            inlineAge: "6m",
        });
        expect(splitQueuePreviewChildPrimaryLabel("Liam Mitchell (2y)")).toEqual({
            name: "Liam Mitchell",
            inlineAge: "2y",
        });
    });

    it("leaves plain names unchanged", () => {
        expect(splitQueuePreviewChildPrimaryLabel("Alex Kelly")).toEqual({
            name: "Alex Kelly",
            inlineAge: null,
        });
    });

    it("strips parenthetical age for display-only cleanup", () => {
        expect(stripParentheticalAgeFromChildDisplayName("Alex Kelly (6m)")).toBe("Alex Kelly");
    });
});
