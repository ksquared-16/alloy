import { describe, expect, it } from "vitest";
import {
    prefixTextareaLines,
    wrapTextareaSelection,
} from "@/app/adminV2/communications/activityEmbedTextFormatting";

describe("activityEmbedTextFormatting", () => {
    it("wraps selection for bold markers", () => {
        const result = wrapTextareaSelection("hello world", 6, 11, "**", "**");
        expect(result.next).toBe("hello **world**");
    });

    it("prefixes selected lines for bullet list", () => {
        const result = prefixTextareaLines("one\ntwo", 0, 7, "- ");
        expect(result.next).toBe("- one\n- two");
    });
});
