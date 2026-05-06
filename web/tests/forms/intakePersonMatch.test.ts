import { describe, expect, it } from "vitest";
import {
    decidePersonMatchFromIdLists,
    normalizeIntakeEmail,
    normalizeIntakePhone,
} from "@/lib/forms/intake/intakePersonMatch";

describe("intakePersonMatch", () => {
    it("normalizeIntakeEmail trims and lowercases", () => {
        expect(normalizeIntakeEmail("  User@EXAMPLE.COM ")).toBe("user@example.com");
        expect(normalizeIntakeEmail("   ")).toBeNull();
        expect(normalizeIntakeEmail(null)).toBeNull();
    });

    it("normalizeIntakePhone strips separators", () => {
        expect(normalizeIntakePhone("(555) 123-4567")).toBe("5551234567");
        expect(normalizeIntakePhone("  ")).toBeNull();
    });

    it("single email match wins before phone", () => {
        const d = decidePersonMatchFromIdLists({
            emailNorm: "a@b.com",
            phoneNorm: "5551112222",
            emailMatchIds: ["p-email"],
            phoneMatchIds: ["p-phone"],
        });
        expect(d).toEqual({ kind: "matched_email", personId: "p-email" });
    });

    it("ambiguous email does not fall through to phone", () => {
        const d = decidePersonMatchFromIdLists({
            emailNorm: "a@b.com",
            phoneNorm: "5551112222",
            emailMatchIds: ["p1", "p2"],
            phoneMatchIds: ["p-phone"],
        });
        expect(d).toEqual({ kind: "ambiguous_email" });
    });

    it("no email norm uses phone single match", () => {
        const d = decidePersonMatchFromIdLists({
            emailNorm: null,
            phoneNorm: "5551112222",
            emailMatchIds: [],
            phoneMatchIds: ["p-phone"],
        });
        expect(d).toEqual({ kind: "matched_phone", personId: "p-phone" });
    });

    it("ambiguous phone", () => {
        const d = decidePersonMatchFromIdLists({
            emailNorm: null,
            phoneNorm: "5551112222",
            emailMatchIds: [],
            phoneMatchIds: ["a", "b"],
        });
        expect(d).toEqual({ kind: "ambiguous_phone" });
    });

    it("no_match when nothing lines up", () => {
        expect(
            decidePersonMatchFromIdLists({
                emailNorm: "a@b.com",
                phoneNorm: null,
                emailMatchIds: [],
                phoneMatchIds: [],
            }).kind
        ).toBe("no_match");
    });
});
