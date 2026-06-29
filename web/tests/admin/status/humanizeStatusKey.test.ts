import { describe, expect, it } from "vitest";
import { humanizeStatusKey } from "@/lib/admin/status/humanizeStatusKey";

describe("humanizeStatusKey", () => {
    it("title-cases snake_case status keys", () => {
        expect(humanizeStatusKey("new_inquiry")).toBe("New Inquiry");
        expect(humanizeStatusKey("waitlisted")).toBe("Waitlisted");
        expect(humanizeStatusKey("not_enrolling")).toBe("Not Enrolling");
    });

    it("handles kebab-case and redundant separators/whitespace", () => {
        expect(humanizeStatusKey("new-inquiry")).toBe("New Inquiry");
        expect(humanizeStatusKey("  new__inquiry  ")).toBe("New Inquiry");
    });

    it("returns null for empty / nullish input", () => {
        expect(humanizeStatusKey("")).toBeNull();
        expect(humanizeStatusKey("   ")).toBeNull();
        expect(humanizeStatusKey(null)).toBeNull();
        expect(humanizeStatusKey(undefined)).toBeNull();
    });

    it("returns null for UUID-like ids so a raw id is never shown as operator copy", () => {
        expect(humanizeStatusKey("11111111-1111-4111-8111-111111111111")).toBeNull();
    });
});
