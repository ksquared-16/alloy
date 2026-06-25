import { describe, it, expect } from "vitest";
import { buildCanonicalPrefillFieldMap, canonicalPrefillPathForField } from "@/lib/forms/prefill/canonicalPrefillMap";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

function f(id: string, type: FormField["type"], src?: { entity_type: string; field_key: string; crm_mapping_key?: string }): FormField {
    return { id, label: id, required: false, type, ...(src ? { field_source: src } : {}) } as FormField;
}
function schemaOf(fields: FormField[]): FormSchemaV1 {
    return { schema_version: 1, title: "T", sections: [{ id: "s", field_ids: fields.map((x) => x.id) }], fields };
}

describe("canonicalPrefillPathForField", () => {
    it("maps a child name field (any id) to customer_member.display_name", () => {
        expect(canonicalPrefillPathForField(f("q_42", "text", { entity_type: "customer_member", field_key: "child_name" }))).toBe("customer_member.display_name");
        expect(canonicalPrefillPathForField(f("nm", "text", { entity_type: "child", field_key: "name" }))).toBe("customer_member.display_name");
    });

    it("maps DOB aliases to customer_member.dob", () => {
        expect(canonicalPrefillPathForField(f("d", "date", { entity_type: "customer_member", field_key: "date_of_birth" }))).toBe("customer_member.dob");
        expect(canonicalPrefillPathForField(f("d", "date", { entity_type: "inquiry_child", field_key: "dob" }))).toBe("customer_member.dob");
    });

    it("maps parent email/phone to person columns", () => {
        expect(canonicalPrefillPathForField(f("e", "text", { entity_type: "person", field_key: "parent_email" }))).toBe("person.email");
        expect(canonicalPrefillPathForField(f("p", "text", { entity_type: "guardian", field_key: "phone" }))).toBe("person.phone");
    });

    it("honors an explicit crm_mapping_key override", () => {
        expect(canonicalPrefillPathForField(f("x", "text", { entity_type: "customer_member", field_key: "whatever", crm_mapping_key: "customer_member.first_name" }))).toBe("customer_member.first_name");
    });

    it("returns null for unbound fields", () => {
        expect(canonicalPrefillPathForField(f("x", "text"))).toBeNull();
    });
});

describe("buildCanonicalPrefillFieldMap", () => {
    it("builds a prefill map keyed by field id from field_source (the P0 fix)", () => {
        const schema = schemaOf([
            f("child_display", "text", { entity_type: "customer_member", field_key: "child_name" }),
            f("birth", "date", { entity_type: "customer_member", field_key: "dob" }),
            f("parent_e", "text", { entity_type: "person", field_key: "email" }),
            f("notes", "text"), // unbound — not mapped
            f("sig", "signature", { entity_type: "person", field_key: "signature" }), // not value-prefilled
            f("doc", "file_ref", { entity_type: "customer_member", field_key: "immunization" }),
        ]);
        const map = buildCanonicalPrefillFieldMap(schema);
        expect(map).toEqual({
            child_display: "customer_member.display_name",
            birth: "customer_member.dob",
            parent_e: "person.email",
        });
    });

    it("regression: a selected child's Name + DOB prefill regardless of field id", () => {
        const schema = schemaOf([
            f("anything_123", "text", { entity_type: "customer_member", field_key: "first_name" }),
            f("zzz", "date", { entity_type: "child", field_key: "birthdate" }),
        ]);
        const map = buildCanonicalPrefillFieldMap(schema);
        expect(map.anything_123).toBe("customer_member.first_name");
        expect(map.zzz).toBe("customer_member.dob");
    });
});
