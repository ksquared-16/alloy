/**
 * Operator account identity — a name is a name, and an unknown one stays unknown.
 *
 * The defect these hold against is small and very visible: the Users rail rendered
 * `display_name || email`, so an account with no name showed its address as the heading and again
 * underneath. Two lines, one string, and a person's login presented as their name.
 */
import { describe, it, expect } from "vitest";
import {
    fullNameFromParts,
    identityHeadline,
    identitySubtitle,
    nameIsUnknown,
    operatorIdentity,
} from "@/lib/access/operatorAccountName";

describe("full_name is derived, never stored twice", () => {
    it("joins the parts an operator typed", () => {
        expect(fullNameFromParts("Kelly", "Kurzman")).toBe("Kelly Kurzman");
    });

    it("is deterministic and whitespace-stable", () => {
        expect(fullNameFromParts("  Kelly ", " Kurzman  ")).toBe("Kelly Kurzman");
        expect(fullNameFromParts("Mary  Jane", "Watson")).toBe("Mary Jane Watson");
        expect(fullNameFromParts("Kelly", "Kurzman")).toBe(fullNameFromParts("Kelly", "Kurzman"));
    });

    it("tolerates one half", () => {
        expect(fullNameFromParts("Kelly", "")).toBe("Kelly");
        expect(fullNameFromParts("", "Kurzman")).toBe("Kurzman");
    });

    it("returns null rather than an empty name", () => {
        for (const [a, b] of [["", ""], ["  ", " "], [null, undefined]] as const) {
            expect(fullNameFromParts(a, b)).toBeNull();
        }
    });
});

describe("the email never becomes the name", () => {
    const withName = operatorIdentity({ display_name: "Kelly Kurzman", email: "kelly@example.org" });
    const noName = operatorIdentity({ display_name: null, email: "kelly@example.org" });

    it("a named account shows name then email", () => {
        expect(identityHeadline(withName)).toBe("Kelly Kurzman");
        expect(identitySubtitle(withName)).toBe("kelly@example.org");
        expect(nameIsUnknown(withName)).toBe(false);
    });

    it("an unnamed account shows the address ONCE", () => {
        // The whole point. Headline falls back to the address, so the subtitle must withhold it.
        expect(identityHeadline(noName)).toBe("kelly@example.org");
        expect(identitySubtitle(noName)).toBeNull();
        expect(nameIsUnknown(noName)).toBe(true);
    });

    it("`name` is never the address, even when that is all there is", () => {
        expect(noName.name).toBeNull();
        expect(operatorIdentity({ display_name: "   ", email: "x@y.z" }).name).toBeNull();
    });

    it("a named account with no address says so instead of leaving a gap", () => {
        const noEmail = operatorIdentity({ display_name: "Kelly Kurzman", email: null });
        expect(identityHeadline(noEmail)).toBe("Kelly Kurzman");
        expect(identitySubtitle(noEmail)).toBe("No email on file");
    });

    it("an account with neither is named as such, once", () => {
        const nothing = operatorIdentity({ display_name: null, email: null });
        expect(identityHeadline(nothing)).toBe("Unnamed account");
        expect(identitySubtitle(nothing)).toBeNull();
    });

    it("headline and subtitle are never the same string", () => {
        // The invariant, stated over every shape rather than the four cases above.
        for (const account of [
            { display_name: "Kelly Kurzman", email: "kelly@example.org" },
            { display_name: null, email: "kelly@example.org" },
            { display_name: "Kelly Kurzman", email: null },
            { display_name: null, email: null },
        ]) {
            const id = operatorIdentity(account);
            const sub = identitySubtitle(id);
            if (sub !== null) expect(sub).not.toBe(identityHeadline(id));
        }
    });
});
