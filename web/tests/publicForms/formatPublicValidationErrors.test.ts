import { describe, expect, it } from "vitest";
import { formatPublicValidationErrors } from "@/lib/public/forms/formatPublicValidationErrors";

describe("formatPublicValidationErrors", () => {
    it("joins path segments with message", () => {
        const lines = formatPublicValidationErrors([
            { path: ["groups", "medications", "0", "values", "schedule"], message: "Invalid option for select" },
        ]);
        expect(lines[0]).toContain("schedule");
        expect(lines[0]).toContain("Invalid option for select");
    });
});
