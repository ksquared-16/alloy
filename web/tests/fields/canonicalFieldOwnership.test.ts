import { describe, expect, it } from "vitest";
import {
    CANONICAL_FIELD_OWNER_ENTITIES,
    findCustomerMemberProfileKeysInPatch,
    validateFieldDefinitionOwnership,
} from "@/lib/fields/canonicalFieldOwnership";
import { rejectLegacyTextStatusPatch } from "@/lib/fields/canonicalLegacyStatusWrite";
import {
    findUnsupportedCustomerMemberPatchKeys,
    partitionCustomerMemberPatchBody,
} from "@/lib/fields/partitionCustomerMemberPatchBody";

describe("canonicalFieldOwnership", () => {
    it("documents minimum required entity owners", () => {
        expect(CANONICAL_FIELD_OWNER_ENTITIES.person).toContain("identity");
        expect(CANONICAL_FIELD_OWNER_ENTITIES.customer_member).toContain("child profile");
        expect(CANONICAL_FIELD_OWNER_ENTITIES.inquiry_child).toContain("enrollment");
        expect(CANONICAL_FIELD_OWNER_ENTITIES.field_definitions).toContain("metadata");
        expect(CANONICAL_FIELD_OWNER_ENTITIES.status_definitions).toContain("Status vocabulary");
    });

    it("rejects profile fields registered on inquiry_child", () => {
        expect(validateFieldDefinitionOwnership("inquiry_child", "allergies")).toMatch(/customer_member/);
        expect(validateFieldDefinitionOwnership("inquiry_child", "gender")).toMatch(/customer_member/);
    });

    it("rejects enrollment fields registered on customer_member", () => {
        expect(validateFieldDefinitionOwnership("customer_member", "start_date")).toMatch(/inquiry_child/);
        expect(validateFieldDefinitionOwnership("customer_member", "outcome_status_key")).toMatch(/inquiry_child/);
    });

    it("finds profile keys that must not PATCH OCM rows", () => {
        expect(findCustomerMemberProfileKeysInPatch({ allergies: "peanut", notes: "ok" })).toEqual(["allergies"]);
        expect(findCustomerMemberProfileKeysInPatch({ start_date: "2026-09-01" })).toEqual([]);
    });
});

describe("partitionCustomerMemberPatchBody", () => {
    it("splits native columns from config field_values keys", () => {
        const { native, config } = partitionCustomerMemberPatchBody({
            first_name: "Ava",
            gender: "female",
            allergies: "none",
        });
        expect(native).toEqual({ first_name: "Ava" });
        expect(config).toEqual({ gender: "female", allergies: "none" });
    });

    it("flags unsupported patch keys", () => {
        expect(findUnsupportedCustomerMemberPatchKeys({ start_date: "2026-01-01" })).toEqual([
            "start_date",
        ]);
        expect(findUnsupportedCustomerMemberPatchKeys({ first_name: "Ava" })).toEqual([]);
    });
});

describe("canonicalLegacyStatusWrite", () => {
    it("rejects legacy text status PATCH bodies", () => {
        expect(rejectLegacyTextStatusPatch({ status: "open" })).toMatch(/status_key/);
        expect(rejectLegacyTextStatusPatch({ status_key: "new_inquiry" })).toBeNull();
    });
});
