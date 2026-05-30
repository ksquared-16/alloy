import { describe, expect, it } from "vitest";
import { formatPhoneUS } from "@/lib/adminFormatters";

describe("formatPhoneUS", () => {
    it("returns em dash for null or empty", () => {
        expect(formatPhoneUS(null)).toBe("—");
        expect(formatPhoneUS(undefined)).toBe("—");
        expect(formatPhoneUS("")).toBe("—");
    });

    it("returns original string when fewer than 10 digits", () => {
        expect(formatPhoneUS("555-1234")).toBe("555-1234");
        expect(formatPhoneUS("12345")).toBe("12345");
    });

    it("formats 10 digits and E.164 +1 as (XXX) XXX-XXXX", () => {
        expect(formatPhoneUS("5551234567")).toBe("(555) 123-4567");
        expect(formatPhoneUS("+15551234567")).toBe("(555) 123-4567");
        expect(formatPhoneUS("1-555-123-4567")).toBe("(555) 123-4567");
        expect(formatPhoneUS("(555) 123-4567")).toBe("(555) 123-4567");
        expect(formatPhoneUS("4444444444")).toBe("(444) 444-4444");
    });
});
