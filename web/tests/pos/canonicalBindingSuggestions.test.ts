import { describe, it, expect } from "vitest";
import {
    suggestFieldBinding,
    buildBindingProposals,
    applyBindingSuggestions,
    type BindableFieldInput,
} from "@/lib/forms/canonicalBindingSuggestions";
import { buildCanonicalPrefillFieldMap } from "@/lib/forms/prefill/canonicalPrefillMap";
import type { FormSchemaV1 } from "@/lib/forms/schema";

describe("suggestFieldBinding (reusable, not MO500-specific)", () => {
    // Names bind to the REGISTERED split fields. There is no person-level display_name/full_name in
    // systemFieldRegistry, and form generation has always built first + last — so binding a name to a
    // single unregistered field was the divergence, not the split.
    it("maps child name variants to the registered child first-name field", () => {
        for (const label of ["Child's Name", "Child Name", "Student Name", "Name of Child"]) {
            expect(suggestFieldBinding(label, "text")?.field_source).toMatchObject({ entity_type: "child", field_key: "child_first_name" });
        }
    });
    it("maps explicit child first/last name to split fields", () => {
        expect(suggestFieldBinding("Child First Name", "text")?.field_source).toMatchObject({ entity_type: "child", field_key: "child_first_name" });
        expect(suggestFieldBinding("Student Last Name", "text")?.field_source).toMatchObject({ entity_type: "child", field_key: "child_last_name" });
    });
    it("maps DOB variants to customer_member.dob", () => {
        for (const label of ["Birthdate", "Date of Birth", "DOB", "D.O.B."]) {
            expect(suggestFieldBinding(label, "date")?.field_source).toEqual({ entity_type: "customer_member", field_key: "dob" });
        }
    });
    it("maps parent/guardian contact fields to person.*, and names to the registered guardian fields", () => {
        expect(suggestFieldBinding("Parent/Guardian Name", "text")?.field_source).toMatchObject({ entity_type: "guardian", field_key: "guardian_first_name" });
        expect(suggestFieldBinding("Parent Email", "text")?.field_source).toEqual({ entity_type: "person", field_key: "email" });
        expect(suggestFieldBinding("Guardian Phone", "text")?.field_source).toEqual({ entity_type: "person", field_key: "phone" });
    });
    it("signature type → recipient scope, no field_source", () => {
        const s = suggestFieldBinding("Parent/Guardian Signature", "signature");
        expect(s).toMatchObject({ scope: "recipient" });
        expect(s?.field_source).toBeUndefined();
    });
    it("date signed → signature_date special; generic date → submission_date", () => {
        expect(suggestFieldBinding("Date Signed", "date")).toMatchObject({ scope: "recipient", special: "signature_date" });
        expect(suggestFieldBinding("Date", "date")).toMatchObject({ special: "submission_date" });
    });
    it("returns null for unrecognized labels", () => {
        expect(suggestFieldBinding("Favorite color", "text")).toBeNull();
    });
});

describe("buildBindingProposals / applyBindingSuggestions", () => {
    const fields: BindableFieldInput[] = [
        { id: "f1", label: "Child's Name", type: "text" },
        { id: "f2", label: "Birthdate", type: "date" },
        { id: "f3", label: "Parent Email", type: "text" },
        { id: "f4", label: "Notes", type: "text" }, // no suggestion
        { id: "f5", label: "Custom", type: "text", field_source: { entity_type: "opportunity", field_key: "status_key" } }, // existing kept
    ];

    it("proposes bindings for unbound fields and keeps existing", () => {
        const props = buildBindingProposals(fields);
        const by = Object.fromEntries(props.map((p) => [p.id, p]));
        expect(by.f1.field_source).toMatchObject({ entity_type: "child", field_key: "child_first_name" });
        expect(by.f1.suggested).toBe(true);
        expect(by.f4.field_source).toBeNull();
        expect(by.f5.suggested).toBe(false); // existing binding preserved
        expect(by.f5.field_source).toEqual({ entity_type: "opportunity", field_key: "status_key" });
    });

    it("applyBindingSuggestions persists field_source on unbound fields only", () => {
        const out = applyBindingSuggestions(fields);
        expect(out[0].field_source).toMatchObject({ entity_type: "child", field_key: "child_first_name" });
        expect(out[3].field_source).toBeUndefined(); // Notes stays unbound
        expect(out[4].field_source).toEqual({ entity_type: "opportunity", field_key: "status_key" }); // unchanged
    });
});

describe("P1 → P2: suggested bindings drive prefill", () => {
    it("a generated form with auto-bindings prefills child Name + DOB", () => {
        const inputs: BindableFieldInput[] = [
            { id: "child_name_x", label: "Child's Name", type: "text" },
            { id: "bday", label: "Date of Birth", type: "date" },
        ];
        const bound = applyBindingSuggestions(inputs);
        const schema: FormSchemaV1 = {
            schema_version: 1,
            title: "MO500",
            sections: [{ id: "s", field_ids: bound.map((b) => b.id) }],
            fields: bound.map((b) => ({ id: b.id, label: b.label, required: false, type: b.type, ...(b.field_source ? { field_source: b.field_source } : {}) })) as FormSchemaV1["fields"],
        };
        const prefillMap = buildCanonicalPrefillFieldMap(schema);
        // The prefill layer deliberately bridges the domain entity ("child") to its storage root
        // ("customer_member") and aliases the registered key to the real column.
        expect(prefillMap.child_name_x).toBe("customer_member.first_name");
        expect(prefillMap.bday).toBe("customer_member.dob");
    });
});
