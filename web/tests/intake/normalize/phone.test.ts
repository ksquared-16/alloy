import { describe, expect, it } from "vitest";
import {
    classifyPhone,
    formatPhoneDisplay,
    isValidPhone,
    normalizePhoneDigits,
} from "@/lib/intake/normalize/phone";

describe("intake normalize phone", () => {
    it("normalizes 10-digit phone", () => {
        expect(normalizePhoneDigits("1231231234")).toBe("1231231234");
        expect(isValidPhone("1231231234")).toBe(true);
    });

    it("normalizes formatted phone", () => {
        expect(normalizePhoneDigits("(123) 123-1234")).toBe("1231231234");
        expect(isValidPhone("(123) 123-1234")).toBe(true);
    });

    it("strips leading 1 from 11-digit numbers", () => {
        expect(normalizePhoneDigits("11231231234")).toBe("1231231234");
    });

    it("marks invalid short numbers", () => {
        expect(isValidPhone("12312312")).toBe(false);
        expect(classifyPhone("12312312").validation_state).toBe("invalid");
    });

    it("formats display", () => {
        expect(formatPhoneDisplay("1231231234")).toBe("(123) 123-1234");
    });
});
