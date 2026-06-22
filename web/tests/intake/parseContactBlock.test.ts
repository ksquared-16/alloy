import { describe, expect, it } from "vitest";
import { looksLikeContactBlockLine, parseContactBlock } from "@/lib/intake/extract/parseContactBlock";

describe("parseContactBlock", () => {
    it.each([
        [
            "Sarah & Rudy Emerson 1222344321 sarah@emerson.net",
            ["Sarah Emerson", "Rudy Emerson"],
            "1222344321",
            "sarah@emerson.net",
        ],
        [
            "Sarah and Rudy Emerson, 1222344321, sarah@emerson.net",
            ["Sarah Emerson", "Rudy Emerson"],
            "1222344321",
            "sarah@emerson.net",
        ],
        [
            "Parents: Sarah & Rudy Emerson 1222344321 sarah@emerson.net",
            ["Sarah Emerson", "Rudy Emerson"],
            "1222344321",
            "sarah@emerson.net",
        ],
        [
            "Sarah Emerson / Rudy Emerson / 1222344321 / sarah@emerson.net",
            ["Sarah Emerson", "Rudy Emerson"],
            "1222344321",
            "sarah@emerson.net",
        ],
    ])("parses compact contact line: %s", (line, names, phone, email) => {
        expect(looksLikeContactBlockLine(line)).toBe(true);
        const parsed = parseContactBlock(line);
        expect(parsed?.adult_names).toEqual(names);
        expect(parsed?.phones[0]).toBe(phone);
        expect(parsed?.emails[0]).toBe(email);
    });

    it("returns null for contact-only lines without adult names", () => {
        expect(parseContactBlock("1222344321 sarah@emerson.net")).toBeNull();
    });

    it("returns null for single adult without contact tokens", () => {
        expect(parseContactBlock("Sarah Emerson")).toBeNull();
    });
});
