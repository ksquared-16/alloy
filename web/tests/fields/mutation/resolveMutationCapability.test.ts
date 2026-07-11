import { describe, expect, it } from "vitest";
import {
    resolveMutationCapability,
    validateMutationValue,
} from "@/lib/fields/mutation/resolveMutationCapability";

describe("resolveMutationCapability", () => {
    it("resolves Forms child provider refs to customer_member native patch keys", () => {
        const first = resolveMutationCapability("child.child_first_name");
        expect(first).toMatchObject({
            entity_type: "customer_member",
            field_key: "first_name",
            patch_key: "first_name",
            storage_class: "native",
            writable: true,
        });
        expect(first?.canonical_ref).toEqual({ entity_type: "customer_member", field_key: "first_name" });

        expect(resolveMutationCapability("child.child_last_name")?.field_key).toBe("last_name");
        expect(resolveMutationCapability("child.date_of_birth")?.field_key).toBe("dob");
    });

    it("accepts layout and customer_member namespace refs", () => {
        expect(resolveMutationCapability("child.first_name")?.field_key).toBe("first_name");
        expect(resolveMutationCapability("customer_member.first_name")?.field_key).toBe("first_name");
    });

    it("resolves configured customer_member profile fields to config storage class", () => {
        const cap = resolveMutationCapability("child.gender");
        expect(cap).toMatchObject({
            entity_type: "customer_member",
            field_key: "gender",
            storage_class: "config",
            patch_key: "gender",
        });
    });

    it("returns null for unsupported, read-only, runtime, relationship, and collection providers", () => {
        expect(resolveMutationCapability("child.preferred_language")).toBeNull();
        expect(resolveMutationCapability("person.first_name")).toBeNull();
        expect(resolveMutationCapability("children")).toBeNull();
        expect(resolveMutationCapability("child.age")).toBeNull();
        expect(resolveMutationCapability("person.contact_role.parents")).toBeNull();
    });

    it("validates values through customerMemberPatch", () => {
        const cap = resolveMutationCapability("child.child_first_name");
        expect(cap).not.toBeNull();
        const ok = validateMutationValue(cap!, "Sam");
        expect(ok.ok).toBe(true);
        if (ok.ok) expect(ok.value).toBe("Sam");
    });
});
