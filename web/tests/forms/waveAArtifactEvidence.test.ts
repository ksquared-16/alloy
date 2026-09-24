/**
 * What the four new semantics look like on the paperwork a family signs.
 *
 * The composer is read BACK from the bytes — a test asserting on its return value would have passed
 * throughout the repeated-people defect this document path already suffered once.
 */

import { describe, expect, it } from "vitest";

import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import { ABSENCE_VALUE } from "@/lib/forms/fieldSemantics";
import { resolveSuppliedValuesFromTemplates } from "@/lib/forms/supplied/resolveConfigurationSuppliedValues";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { composedDocumentLines, composedDocumentText } from "./pdf/composedDocumentText";

const provenance = {
    form_definition_id: "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94",
    form_definition_version_id: "b7be55c5-15fd-44bc-8b68-1938b4e1532d",
    source_document_id: null,
    source_sha256: null,
    source_title: null,
};

const SCHEMA = {
    schema_version: 1,
    title: "Enrollment Application",
    fields: [
        { id: "allergies", type: "text", label: "Allergies", absence: { offered: true, label: "No known allergies" } },
        { id: "diet", type: "text", label: "Dietary needs", absence: { offered: true, label: "No known allergies" } },
        { id: "meds", type: "text", label: "Medications" },
        {
            id: "notes",
            type: "text",
            label: "Immunization notes",
            retention: { kind: "form_only_pending_canonical_owner", owner_hint: "Health" },
        },
        {
            id: "fee",
            type: "text",
            label: "Registration fee",
            supplied_by: { source_kind: "charge_template", source_key: "registration_fee", resolve_at: "generation" },
        },
        {
            id: "home_address",
            type: "group",
            label: "Home address",
            address_binding: { subject: "person", role: "guardian" },
            fields: [
                { id: "a1", type: "text", label: "Street address", field_source: { entity_type: "person", field_key: "address_line1" } },
                { id: "a2", type: "text", label: "City", field_source: { entity_type: "person", field_key: "city" } },
                { id: "a3", type: "text", label: "State", field_source: { entity_type: "person", field_key: "state" } },
                { id: "a4", type: "text", label: "ZIP / postal code", field_source: { entity_type: "person", field_key: "postal_code" } },
            ],
        },
    ],
    sections: [{ id: "s1", title: "Your family", field_ids: ["allergies", "diet", "meds", "notes", "fee", "home_address"] }],
} as unknown as FormSchemaV1;

const TEMPLATES = [
    { template_key: "registration_fee", is_active: true, effective_start: "2026-01-01", amount_cents: 15000, currency_code: "USD", label: "Registration Fee" },
    { template_key: "registration_fee", is_active: true, effective_start: "2026-08-01", amount_cents: 17500, currency_code: "USD", label: "Registration Fee" },
    { template_key: "registration_fee", is_active: false, effective_start: "2026-09-01", amount_cents: 99900, currency_code: "USD", label: "Registration Fee" },
];

async function compose(values: Record<string, unknown>) {
    return composeGeneratedDocument({ schema: SCHEMA, values, provenance });
}

describe("absence on the completed record", () => {
    it("prints the authored words, not an em dash", async () => {
        const text = composedDocumentText((await compose({ allergies: ABSENCE_VALUE })).bytes);
        expect(text).toContain("No known allergies");
    });

    it("keeps 'the family said none' visibly different from 'nobody answered'", async () => {
        const lines = composedDocumentLines((await compose({ allergies: ABSENCE_VALUE })).bytes);
        const absent = lines[lines.indexOf("Allergies") + 1];
        const unanswered = lines[lines.indexOf("Medications") + 1];
        expect(absent).toBe("No known allergies");
        expect(unanswered).toBe("-");
        expect(absent).not.toBe(unanswered);
    });

    it("counts an explicit none as an answer given", async () => {
        const none = await compose({ allergies: ABSENCE_VALUE });
        const blank = await compose({});
        expect(none.answeredCount).toBeGreaterThan(blank.answeredCount);
    });

    it("prints the author's words for each question, not one guessed from its wording", async () => {
        // Both questions authored the same absence words; the old rule would have given "Dietary
        // needs" a different answer than "Allergies" purely because of the letters in the label.
        const text = composedDocumentText((await compose({ allergies: ABSENCE_VALUE, diet: ABSENCE_VALUE })).bytes);
        expect(text.match(/No known allergies/g) ?? []).toHaveLength(2);
        expect(text).not.toContain("Nothing to add");
    });
});

describe("evidence with no canonical owner still reaches the paperwork", () => {
    it("prints the answer exactly like any other", async () => {
        const text = composedDocumentText((await compose({ notes: "Up to date, records with the clinic" })).bytes);
        expect(text).toContain("Immunization notes");
        expect(text).toContain("Up to date, records with the clinic");
    });

    it("never prints the governance language at the family", async () => {
        const text = composedDocumentText((await compose({ notes: "Up to date" })).bytes);
        for (const leak of ["pending", "canonical", "owner", "form_only", "Health"]) {
            expect(text.toLowerCase(), `${leak} reached a participant-facing document`).not.toContain(leak.toLowerCase());
        }
    });
});

describe("one address, on one line", () => {
    const filled = { a1: "12 Alder Lane", a2: "Bend", a3: "OR", a4: "97701" };

    it("prints the address as a person writes it", async () => {
        const text = composedDocumentText((await compose(filled)).bytes);
        expect(text).toContain("12 Alder Lane, Bend, OR 97701");
    });

    it("does not print four labelled parts", async () => {
        const text = composedDocumentText((await compose(filled)).bytes);
        for (const partLabel of ["Street address", "City", "State", "ZIP / postal code"]) {
            expect(text, `${partLabel} printed as its own question`).not.toContain(partLabel);
        }
    });

    it("closes up around a missing part rather than printing a gap", async () => {
        const text = composedDocumentText((await compose({ a1: "12 Alder Lane", a3: "OR" })).bytes);
        expect(text).toContain("12 Alder Lane, OR");
        expect(text).not.toContain(", ,");
    });
});

describe("the configured value is resolved, never stored", () => {
    it("resolves the version in effect, not the first or the retired one", () => {
        const { values } = resolveSuppliedValuesFromTemplates(SCHEMA, TEMPLATES);
        expect(values.fee).toBe("$175.00");
    });

    it("a changed fee changes the next document, with no Form edit", async () => {
        const before = resolveSuppliedValuesFromTemplates(SCHEMA, TEMPLATES).values;
        const raised = [...TEMPLATES, { template_key: "registration_fee", is_active: true, effective_start: "2026-10-01", amount_cents: 20000, currency_code: "USD", label: "Registration Fee" }];
        const after = resolveSuppliedValuesFromTemplates(SCHEMA, raised).values;
        expect(before.fee).toBe("$175.00");
        expect(after.fee).toBe("$200.00");
        // The Form definition is byte-identical across both renders.
        expect(JSON.stringify(SCHEMA)).not.toContain("175");
        expect(JSON.stringify(SCHEMA)).not.toContain("200");

        const text = composedDocumentText((await compose(after)).bytes);
        expect(text).toContain("$200.00");
    });

    it("fails truthfully when the source names nothing", () => {
        const { values, resolutions } = resolveSuppliedValuesFromTemplates(SCHEMA, []);
        expect(values.fee).toBeUndefined();
        expect(resolutions[0].resolved).toBe(false);
        expect(resolutions[0].reason).toContain("registration_fee");
    });

    it("leaves the destination blank rather than printing a remembered number", async () => {
        const lines = composedDocumentLines((await compose({})).bytes);
        expect(lines[lines.indexOf("Registration fee") + 1]).toBe("-");
    });
});
