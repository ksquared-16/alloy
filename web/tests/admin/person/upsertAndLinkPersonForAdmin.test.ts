import { describe, expect, it } from "vitest";
import {
    resolvePersonRoleType,
    validatePersonIdentityFields,
} from "@/lib/admin/person/upsertAndLinkPersonForAdmin";

describe("validatePersonIdentityFields", () => {
    it("requires first and last name", () => {
        expect(validatePersonIdentityFields({ first_name: "", last_name: "Lo", email: "a@b.com" })).toMatch(
            /first name/i
        );
        expect(validatePersonIdentityFields({ first_name: "Ada", last_name: "", phone: "555" })).toMatch(
            /last name/i
        );
    });

    it("requires phone or email", () => {
        expect(validatePersonIdentityFields({ first_name: "Ada", last_name: "Lo" })).toMatch(/phone or email/i);
    });

    it("accepts email only", () => {
        expect(
            validatePersonIdentityFields({ first_name: "Ada", last_name: "Lo", email: "ada@example.com" })
        ).toBeNull();
    });

    it("accepts phone only", () => {
        expect(validatePersonIdentityFields({ first_name: "Ada", last_name: "Lo", phone: "5551234567" })).toBeNull();
    });
});

describe("resolvePersonRoleType", () => {
    it("defaults by action key when role omitted", () => {
        expect(resolvePersonRoleType(undefined, "add_related_person")).toBe("primary_contact");
        expect(resolvePersonRoleType("", "add_family_member")).toBe("parent");
    });

    it("honors explicit role", () => {
        expect(resolvePersonRoleType("guardian", "add_family_member")).toBe("guardian");
    });
});
