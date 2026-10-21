/**
 * A GROUP HAS NO VALUE OF ITS OWN — its lines do.
 *
 * Deployed (Lil' Sunshine application): the composer printed `values[group.id]`, which never exists,
 * so the home address printed "-" while its street, city, state and ZIP sat in the record, and no
 * collection row (emergency contacts, physician) reached the completed document at all.
 */
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";

import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema = {
    title: "Lil' Sunshine Childcare — Enrollment Application",
    fields: [
        { id: "guardian_first", type: "text", label: "Parent or guardian first name" },
        {
            id: "home",
            type: "group",
            label: "Home address",
            address_binding: { subject: "person", role: "guardian" },
            fields: [
                { id: "home_line1", type: "text", label: "Street address", field_source: { entity_type: "person", field_key: "address_line1" } },
                { id: "home_city", type: "text", label: "City", field_source: { entity_type: "person", field_key: "city" } },
                { id: "home_state", type: "text", label: "State", field_source: { entity_type: "person", field_key: "state" } },
                { id: "home_zip", type: "text", label: "ZIP", field_source: { entity_type: "person", field_key: "postal_code" } },
            ],
        },
        {
            id: "contacts",
            type: "group",
            label: "Emergency contacts",
            repeat: { min: 1, max: 4 },
            collection_binding: { collection_provider_ref: "person.contact_role.emergency_contacts", iteration_entity_type: "person" },
            fields: [
                { id: "contacts__full_name", type: "text", label: "Name" },
                { id: "contacts__phone", type: "text", label: "Phone" },
                { id: "contacts__relationship_type", type: "text", label: "Relationship" },
            ],
        },
        {
            id: "dentists",
            type: "group",
            label: "Dental provider",
            repeat: { min: 0, max: 2 },
            collection_binding: { collection_provider_ref: "person.contact_role.dentists", iteration_entity_type: "person" },
            fields: [{ id: "dentists__full_name", type: "text", label: "Dental provider" }],
        },
    ],
    sections: [{ id: "s1", title: "Family", field_ids: ["guardian_first", "home", "contacts", "dentists"] }],
} as unknown as FormSchemaV1;

const provenance = {
    form_definition_id: "0a84c578-0000-4000-8000-000000000001",
    form_definition_version_id: "f1cb727c-0000-4000-8000-000000000001",
    source_document_id: null,
    source_sha256: null,
    source_title: null,
};

async function text(bytes: Uint8Array): Promise<string> {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text: pages } = await extractText(pdf, { mergePages: true });
    return String(pages).replace(/\s+/g, " ");
}

describe("composed document groups", () => {
    it("prints a structured address as an address, and each collection row as its people", async () => {
        const composed = await composeGeneratedDocument({
            schema,
            values: { guardian_first: "Avery", home_line1: "1200 SE Sunshine Ln", home_city: "Hillsboro", home_state: "OR", home_zip: "97123" },
            groups: {
                contacts: [
                    { values: { contacts__full_name: "Mary Rivers", contacts__phone: "5035550111", contacts__relationship_type: "Grandparent" } },
                    { values: { contacts__full_name: "Sam Ng", contacts__phone: "5035550123", contacts__relationship_type: "Family Friend" } },
                    { values: {} },
                ],
            },
            provenance,
        });
        const t = await text(composed.bytes);
        expect(t).toContain("1200 SE Sunshine Ln");
        expect(t).toContain("Hillsboro, OR 97123");
        expect(t).toContain("1. Mary Rivers");
        expect(t).toContain("Grandparent");
        expect(t).toContain("2. Sam Ng");
        // An empty collection says so; it does not print a dash that reads like a lost answer.
        expect(t).toContain("None listed");
    });

    it("an address nobody gave is a single honest blank", async () => {
        const composed = await composeGeneratedDocument({ schema, values: {}, provenance });
        const t = await text(composed.bytes);
        expect(t).toMatch(/Home address -/);
    });
});
