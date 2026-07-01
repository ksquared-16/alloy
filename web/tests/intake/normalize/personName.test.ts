import { describe, expect, it } from "vitest";
import {
    extractNameFromContactBlobLine,
    isChildContextLine,
    looksLikeNameLine,
    splitPersonName,
} from "@/lib/intake/normalize/personName";

describe("intake normalize personName", () => {
    it("splits full names", () => {
        expect(splitPersonName("Jordan Lee")).toEqual({ first: "Jordan", last: "Lee" });
        expect(splitPersonName("Ravi Almead")).toEqual({ first: "Ravi", last: "Almead" });
    });

    it("extracts name from contact blob line", () => {
        expect(extractNameFromContactBlobLine("Kelly Kurzman kelly.k@gmail.com 6022904816")).toEqual({
            first: "Kelly",
            last: "Kurzman",
        });
    });

    it("detects child context lines", () => {
        expect(isChildContextLine("child is Kai Almead, he's 2 years old")).toBe(true);
        expect(isChildContextLine("Child: Kai Almead")).toBe(true);
        expect(isChildContextLine("Daughter is Kai Almead")).toBe(true);
    });

    it("does not treat call-note phrasing as a name line", () => {
        expect(looksLikeNameLine("Johnson called today about toddler care")).toBe(false);
    });
});
