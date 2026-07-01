import { describe, expect, it } from "vitest";
import {
    classifyEmail,
    findEmailCandidate,
    isValidEmail,
    normalizeEmail,
} from "@/lib/intake/normalize/email";

describe("intake normalize email", () => {
    it("normalizes and validates jordan.lee@test.com", () => {
        expect(normalizeEmail("  Jordan.Lee@Test.COM ")).toBe("jordan.lee@test.com");
        expect(isValidEmail("jordan.lee@test.com")).toBe(true);
    });

    it("rejects invalid TLD segment", () => {
        expect(isValidEmail("jordan.lee@test")).toBe(false);
        const classified = classifyEmail("jordan.lee@test");
        expect(classified.validation_state).toBe("invalid");
    });

    it("finds loose email candidates", () => {
        expect(findEmailCandidate("Contact jordan.lee@test today")).toBe("jordan.lee@test");
    });
});
