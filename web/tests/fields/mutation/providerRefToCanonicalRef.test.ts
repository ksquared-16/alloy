import { describe, expect, it } from "vitest";
import { providerRefToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";

describe("providerRefToCanonicalRef", () => {
    it("bridges Forms child aliases to customer_member canonical refs", () => {
        expect(providerRefToCanonicalRef("child.child_first_name")).toEqual({ entity_type: "customer_member", field_key: "first_name" });
        expect(providerRefToCanonicalRef("child.child_last_name")).toEqual({ entity_type: "customer_member", field_key: "last_name" });
        expect(providerRefToCanonicalRef("child.child_date_of_birth")).toEqual({ entity_type: "customer_member", field_key: "dob" });
        expect(providerRefToCanonicalRef("child.date_of_birth")).toEqual({ entity_type: "customer_member", field_key: "dob" });
    });

    it("accepts layout and explicit customer_member refs", () => {
        expect(providerRefToCanonicalRef("child.first_name")).toEqual({ entity_type: "customer_member", field_key: "first_name" });
        expect(providerRefToCanonicalRef("child.last_name")).toEqual({ entity_type: "customer_member", field_key: "last_name" });
        expect(providerRefToCanonicalRef("customer_member.first_name")).toEqual({ entity_type: "customer_member", field_key: "first_name" });
        expect(providerRefToCanonicalRef("customer_member.dob")).toEqual({ entity_type: "customer_member", field_key: "dob" });
    });

    it("returns null for unsupported or ambiguous consumer refs", () => {
        expect(providerRefToCanonicalRef("child.preferred_language")).toEqual({ entity_type: "inquiry_child", field_key: "preferred_language" });
        expect(providerRefToCanonicalRef("person.first_name")).toEqual({ entity_type: "person", field_key: "first_name" });
        expect(providerRefToCanonicalRef("bogus.ref.key")).toBeNull();
        expect(providerRefToCanonicalRef("")).toBeNull();
        expect(providerRefToCanonicalRef("child.age")).toBeNull();
    });
});
