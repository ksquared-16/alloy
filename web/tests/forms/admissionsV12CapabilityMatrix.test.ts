/**
 * CAN AN ADMINISTRATOR AUTHOR EVERY ADMISSIONS-V12 SEMANTIC, THROUGH THE PRODUCT, ALONE?
 *
 * A prose capability matrix is a claim. This is the same matrix, machine-checked: every semantic the
 * Admissions normalization proposal requires is authored HERE through the builder the Studio UI
 * calls, saved through the persist path, reloaded through the validator, and then read back through
 * the owners the runtime itself uses.
 *
 * Nothing here authors Admissions v12. These are capability fixtures — one representative of each
 * semantic, which is the only thing "can it be authored" needs.
 */

import { describe, expect, it } from "vitest";

import { addField, createBlankSchema, normalizeFormSchemaForPersist, updateField } from "@/lib/forms/formBuilderSchema";
import { validateFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import {
    absenceLabel,
    addressBindingOf,
    addressParts,
    isConfigurationSupplied,
    isFormOnlyEvidence,
} from "@/lib/forms/fieldSemantics";
import { partyCollectionOf } from "@/lib/forms/partyCollection";
import { formFieldAsksParticipant } from "@/lib/forms/formFieldCollectsValue";
import { formDerivedBindings } from "@/lib/forms/derived/resolveFormDerivedValues";
import { effectiveCollectionBinding } from "@/lib/forms/partyCollection";

/** Author through the builder, persist, reload — exactly what Studio's save does. */
function authored(spec: Parameters<typeof addField>[1], patch?: Parameters<typeof updateField>[2]) {
    const added = addField(createBlankSchema("Capability fixture"), spec);
    const edited = patch ? updateField(added.schema, added.fieldId, patch) : added.schema;
    const schema = validateFormSchema(JSON.parse(JSON.stringify(normalizeFormSchemaForPersist(edited))));
    const field = schema.fields.find((f) => f.id === added.fieldId)!;
    return { schema, field, id: added.fieldId };
}

const inSection = (schema: FormSchemaV1, id: string) => schema.sections.some((s) => s.field_ids.includes(id));

describe("1 · canonical scalar binding — Child and Parent/Guardian fields", () => {
    it("binds a Child canonical field", () => {
        const { field, schema, id } = authored({
            type: "short_text",
            label: "Child's preferred name",
            field_source: { entity_type: "customer_member", field_key: "preferred_name" },
        });
        expect(field.field_source).toEqual({ entity_type: "customer_member", field_key: "preferred_name" });
        expect(inSection(schema, id)).toBe(true);
        expect(formFieldAsksParticipant(field)).toBe(true);
    });

    it("binds a Parent/Guardian canonical field", () => {
        const { field } = authored({
            type: "short_text",
            label: "Guardian phone",
            field_source: { entity_type: "person", field_key: "phone" },
        });
        expect(field.field_source?.entity_type).toBe("person");
    });
});

describe("2 · vocabulary and 3 · multiselect", () => {
    it("authors an organization option set", () => {
        const { field } = authored({ type: "select", label: "Gender", option_set_key: "person_gender" });
        expect((field as FormField & { option_set_key?: string }).option_set_key).toBe("person_gender");
    });

    it("authors inline choices", () => {
        const { field } = authored({
            type: "select",
            label: "Program",
            options: [{ value: "toddler", label: "Toddler" }, { value: "infant", label: "Infant" }],
        });
        expect((field as FormField & { static_options?: unknown[] }).static_options).toHaveLength(2);
    });

    it("authors a multiselect", () => {
        const { field } = authored({
            type: "multiselect",
            label: "Days needed",
            options: [{ value: "mon", label: "Monday" }, { value: "tue", label: "Tuesday" }],
        });
        expect(field.type).toBe("multiselect");
    });
});

describe("4 · conditional visibility", () => {
    it("authors 'ask this only when'", () => {
        const base = addField(createBlankSchema("f"), { type: "boolean", label: "Does your child have an IEP?" });
        const withDetail = addField(base.schema, { type: "long_text", label: "Tell us about the IEP" });
        const conditioned = updateField(withDetail.schema, withDetail.fieldId, {
            visible_when: { field_id: base.fieldId, equals: true },
        });
        const schema = validateFormSchema(JSON.parse(JSON.stringify(normalizeFormSchemaForPersist(conditioned))));
        const field = schema.fields.find((f) => f.id === withDetail.fieldId)!;
        expect(field.visibility?.all?.[0]).toMatchObject({ field_id: base.fieldId, op: "eq", value: true });
    });
});

describe("5 · derived values", () => {
    it("authors a value Alloy calculates and never asks for", () => {
        const { field, schema } = authored({
            type: "number",
            label: "Age upon enrolling",
            derived: { kind: "age_from_date_of_birth", source_key: "dob" },
        });
        expect(field.derived?.kind).toBe("age_from_date_of_birth");
        expect(formFieldAsksParticipant(field), "a derived value is never a question").toBe(false);
        expect(Object.keys(formDerivedBindings(schema))).toContain(field.id);
    });
});

describe("6 · repeated people, and 7 · known-person reuse", () => {
    it("authors a collection of people in a role", () => {
        const { field } = authored({
            type: "party_collection",
            label: "Emergency contacts",
            party_collection: {
                action_key: "add_emergency_contact",
                subject: "person",
                role: "emergency_contact",
                scope: "this_child",
                min: 1,
                fields: [
                    { type: "short_text", label: "Full name", required: true },
                    { type: "short_text", label: "Phone", required: true },
                ],
            },
        });
        const party = partyCollectionOf(field)!;
        expect(party.action_key).toBe("add_emergency_contact");
        expect(party.role).toBe("emergency_contact");
        // Known-person reuse is ON unless the author turns it off.
        expect(party.show_known).toBe(true);
        // And it resolves to a canonical collection, which is what reaches Processing.
        expect(effectiveCollectionBinding(field)?.collection_provider_ref).toBe("person.contact_role.emergency_contacts");
    });

    it("authors a collection of children", () => {
        const { field } = authored({
            type: "party_collection",
            label: "Children in your household",
            party_collection: { action_key: "add_child", subject: "child", fields: [{ type: "short_text", label: "Full name" }] },
        });
        expect(effectiveCollectionBinding(field)?.collection_provider_ref).toBe("children");
    });
});

describe("8 · structured address", () => {
    it("authors one address over canonical Person fields", () => {
        const { field, schema, id } = authored({
            type: "structured_address",
            label: "Home address",
            address: { subject: "person", role: "guardian" },
        });
        expect(addressBindingOf(field)).toEqual({ subject: "person", role: "guardian" });
        expect(addressParts(field).map((p) => p.part)).toEqual(["address_line1", "city", "state", "postal_code"]);
        // ONE question in the section, not four.
        expect(schema.sections.find((s) => s.field_ids.includes(id))!.field_ids.filter((f) => f.startsWith(id))).toEqual([id]);
    });
});

describe("9 · pending canonical owner", () => {
    it("authors a question kept as Form-only evidence", () => {
        const { field } = authored(
            { type: "long_text", label: "Immunization notes" },
            { retention: { kind: "form_only_pending_canonical_owner", owner_hint: "Health" } },
        );
        expect(isFormOnlyEvidence(field)).toBe(true);
        expect(field.field_source, "it must claim no canonical writer").toBeUndefined();
        expect(formFieldAsksParticipant(field), "the family still answers it normally").toBe(true);
    });
});

describe("10 · explicit absence", () => {
    it("authors 'there are none' with the author's own words", () => {
        const { field } = authored(
            { type: "long_text", label: "Allergies" },
            { absence: { offered: true, label: "No known allergies" } },
        );
        expect(absenceLabel(field)).toBe("No known allergies");
    });
});

describe("11 · configuration-supplied value", () => {
    it("authors a reference to organization configuration, not an amount", () => {
        const { field, schema } = authored(
            { type: "short_text", label: "Registration fee" },
            { supplied_by: { source_kind: "charge_template", source_key: "registration_fee" } },
        );
        expect(isConfigurationSupplied(field)).toBe(true);
        expect(formFieldAsksParticipant(field), "the family is never asked").toBe(false);
        expect(JSON.stringify(schema)).not.toMatch(/amount_cents|"amount"/);
    });
});

describe("12 · signatures, 13 · acknowledgements, 14 · file upload", () => {
    it("authors a signature", () => {
        const { field } = authored({ type: "signature", label: "Parent signature" });
        expect(field.type).toBe("signature");
    });

    it("authors an acknowledgement clause and its accept", () => {
        const clause = authored({ type: "text_block", label: "Handbook", content: "The Family Handbook says…" });
        expect(clause.field.type).toBe("text_block");
        const accept = authored({ type: "boolean", label: "I have read and agree to the Family Handbook." });
        expect(accept.field.type).toBe("boolean");
    });

    it("authors a file upload with the document it satisfies", () => {
        // Authored the way Studio does it: add the answer type, then set its property in the
        // inspector. `document_type` is an inspector property, not an add-time argument.
        const { field } = authored({ type: "file_ref", label: "Immunization record" }, { document_type: "immunization_record" });
        expect(field.type).toBe("file_ref");
        expect((field as FormField & { document_type?: string }).document_type).toBe("immunization_record");
    });
});

describe("the matrix is closed — no semantic needs engineering to author", () => {
    it("every answer type the builder offers round-trips through persist and validate", () => {
        const types = [
            "short_text", "long_text", "text_block", "date", "number", "select",
            "multiselect", "boolean", "file_ref", "signature", "party_collection", "structured_address",
        ] as const;
        for (const type of types) {
            const spec: Record<string, unknown> = { type, label: `A ${type}` };
            if (type === "select" || type === "multiselect") spec.options = [{ value: "a", label: "A" }];
            if (type === "party_collection") {
                spec.party_collection = { action_key: "add_emergency_contact", subject: "person", role: "emergency_contact", fields: [{ type: "short_text", label: "Full name" }] };
            }
            if (type === "structured_address") spec.address = { subject: "person" };
            expect(() => authored(spec as never), `${type} cannot be authored`).not.toThrow();
        }
    });
});
