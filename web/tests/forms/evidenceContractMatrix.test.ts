/**
 * THE COMBINED EVIDENCE CONTRACT — every normalized semantic on ONE document.
 *
 * Each of these was proven alone. The failure this guards against is the one that only appears
 * together: a renderer that reads the wrong payload branch and degrades a POPULATED semantic to an
 * em dash beside nine that render correctly. That is exactly how repeated people were lost — the
 * submission was right, and the paperwork named nobody.
 *
 * Read back from the PDF bytes, never from the composer's return value.
 */

import { describe, expect, it } from "vitest";

import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import { ABSENCE_VALUE } from "@/lib/forms/fieldSemantics";
import { resolveSuppliedValuesFromTemplates } from "@/lib/forms/supplied/resolveConfigurationSuppliedValues";
import { validateFormSchema } from "@/lib/forms/schema";
import { partyCollectionGroupRows } from "@/lib/enrollment/informationNeeds/participantPartyCollection";
import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import type { FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { composedDocumentLines, composedDocumentText } from "./pdf/composedDocumentText";

const FD = "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94";

/** The capability specimen. Not Admissions v12 — one representative of each semantic. */
const SPECIMEN = validateFormSchema({
    schema_version: 1,
    title: "Capability specimen",
    fields: [
        // 1 canonical scalar
        { id: "child_name", type: "text", label: "Child's full name", required: true, field_source: { entity_type: "customer_member", field_key: "display_name" } },
        // 2 canonical vocabulary
        { id: "gender", type: "select", label: "Gender", static_options: [{ value: "female", label: "Female" }, { value: "male", label: "Male" }] },
        // 3 conditional
        { id: "has_iep", type: "boolean", label: "Does your child have an IEP?" },
        { id: "iep_detail", type: "text", label: "Tell us about the IEP", visibility: { all: [{ field_id: "has_iep", op: "eq", value: true }] } },
        // 4 derived
        { id: "dob", type: "date", label: "Date of birth", field_source: { entity_type: "customer_member", field_key: "dob" } },
        { id: "age", type: "number", label: "Age upon enrolling", derived: { kind: "age_from_date_of_birth", source_key: "dob" } },
        // 8 explicit absence
        { id: "allergies", type: "text", label: "Allergies", absence: { offered: true, label: "No known allergies" } },
        { id: "medications", type: "text", label: "Medications", absence: { offered: true, label: "None" } },
        // 7 pending owner
        { id: "immunization_note", type: "text", multiline: true, label: "Immunization notes", retention: { kind: "form_only_pending_canonical_owner", owner_hint: "Health" } },
        // 9 configuration supplied
        { id: "fee", type: "text", label: "Registration fee", supplied_by: { source_kind: "charge_template", source_key: "registration_fee", resolve_at: "generation" } },
        // 6 structured address
        {
            id: "home_address",
            type: "group",
            label: "Home address",
            address_binding: { subject: "person", role: "guardian" },
            fields: [
                { id: "a_line1", type: "text", label: "Street address", field_source: { entity_type: "person", field_key: "address_line1" } },
                { id: "a_city", type: "text", label: "City", field_source: { entity_type: "person", field_key: "city" } },
                { id: "a_state", type: "text", label: "State", field_source: { entity_type: "person", field_key: "state" } },
                { id: "a_zip", type: "text", label: "ZIP / postal code", field_source: { entity_type: "person", field_key: "postal_code" } },
            ],
        },
        // 5 repeated people — known + respondent-added
        {
            id: "emergency_contacts",
            type: "group",
            label: "Emergency contacts",
            repeat: { min: 1 },
            party_collection: { action_key: "add_emergency_contact", subject: "person", role: "emergency_contact", scope: "this_child", show_known: true, allow_add: true },
            fields: [
                { id: "ec_name", type: "text", label: "Full name", required: true },
                { id: "ec_phone", type: "text", label: "Phone", required: true },
            ],
        },
        // 10 acknowledgement
        { id: "ack", type: "boolean", label: "I have read and agree to the Family Handbook." },
    ],
    sections: [
        {
            id: "s1",
            title: "Your family",
            field_ids: ["child_name", "gender", "has_iep", "iep_detail", "dob", "age", "allergies", "medications", "immunization_note", "fee", "home_address", "emergency_contacts", "ack"],
        },
    ],
});

const TEMPLATES = [
    { template_key: "registration_fee", is_active: true, effective_start: "2026-01-01", amount_cents: 15000, currency_code: "USD", label: "Registration Fee" },
    { template_key: "registration_fee", is_active: true, effective_start: "2026-08-01", amount_cents: 17500, currency_code: "USD", label: "Registration Fee" },
];

const KNOWN_CONTACT = "fa01011b-7ca0-4557-9015-4e809d64894f";
const HELD = {
    [`party:${FD}:emergency_contacts`]: [
        { instance_key: "e-new", origin: "respondent_added", values: { ec_name: "Farrah Nolan", ec_phone: "3213525132" } },
    ],
};
const KNOWN_ENTRIES = {
    emergency_contacts: [
        {
            instance_key: "known:corinne",
            origin: "existing" as const,
            item_id: KNOWN_CONTACT,
            values: { ec_name: "Corinne Vasquez", ec_phone: "+15415557788" },
        },
    ],
};

/** The participant's answers, as the session holds them. */
const ANSWERED = {
    child_name: "Touree Disposable0913",
    gender: "Female",
    has_iep: true,
    iep_detail: "Speech therapy twice weekly",
    dob: "2021-04-02",
    allergies: ABSENCE_VALUE,
    // `medications` deliberately left unanswered — the state that must stay distinct from absence.
    immunization_note: "Records are with the clinic",
    a_line1: "12 Alder Lane",
    a_city: "Bend",
    a_state: "OR",
    a_zip: "97701",
    ack: true,
};

/** Everything the document is composed from — the same assembly the renderer performs. */
function assemble() {
    const derived = resolveFormDerivedValues(SPECIMEN, ANSWERED as never, {
        executedAtIso: "2026-09-24T00:00:00.000Z",
        timeZone: "UTC",
        signatures: null,
    });
    const supplied = resolveSuppliedValuesFromTemplates(SPECIMEN, TEMPLATES).values;
    const groups = partyCollectionGroupRows(SPECIMEN, HELD, FD, KNOWN_ENTRIES) as Record<string, FormPayloadGroupRow[]>;
    return { values: { ...ANSWERED, ...derived, ...supplied }, groups, derived, supplied };
}

const composed = async () => {
    const { values, groups } = assemble();
    return composeGeneratedDocument({
        schema: SPECIMEN,
        values,
        groups,
        provenance: {
            form_definition_id: FD,
            form_definition_version_id: "b7be55c5-15fd-44bc-8b68-1938b4e1532d",
            source_document_id: null,
            source_sha256: null,
            source_title: null,
        },
    });
};

describe("submission evidence — every semantic reaches the payload", () => {
    const { values, groups, derived, supplied } = assemble();

    it("1 scalar · 2 vocabulary · 3 conditional", () => {
        expect(values.child_name).toBe("Touree Disposable0913");
        expect(values.gender).toBe("Female");
        expect(values.iep_detail).toBe("Speech therapy twice weekly");
    });

    it("4 derived is computed, never asked", () => {
        // The resolver stores a DISPLAY string at the destination, not a number — the authored
        // destination type decides the shape, and that is what the validator enforces.
        expect(typeof derived.age).toBe("string");
        expect(String(derived.age)).toMatch(/\d/);
        expect(values.age).toBe(derived.age);
        // Nothing asked the family for it.
        expect(ANSWERED).not.toHaveProperty("age");
    });

    it("5 repeated people — known kept as existing with identity, added kept as new", () => {
        const rows = groups.emergency_contacts!;
        expect(rows.map((r) => r.values.ec_name)).toEqual(["Corinne Vasquez", "Farrah Nolan"]);
        expect(rows[0]!.collection?.origin).toBe("existing");
        expect(rows[0]!.collection?.item_id).toBe(KNOWN_CONTACT);
        expect(rows[1]!.collection?.origin).toBe("respondent_added");
        expect(rows[1]!.collection?.item_id).toBeUndefined();
    });

    it("6 address parts are present as canonical values", () => {
        expect([values.a_line1, values.a_city, values.a_state, values.a_zip]).toEqual(["12 Alder Lane", "Bend", "OR", "97701"]);
    });

    it("7 pending-owner value is retained, with no canonical destination claimed", () => {
        expect(values.immunization_note).toBe("Records are with the clinic");
        const field = SPECIMEN.fields.find((f) => f.id === "immunization_note")!;
        expect(field.retention?.kind).toBe("form_only_pending_canonical_owner");
        expect(field.field_source, "a held question must claim no canonical writer").toBeUndefined();
    });

    it("8 explicit absence, unanswered and detail stay three different states", () => {
        expect(values.allergies).toBe(ABSENCE_VALUE);
        expect(values.medications).toBeUndefined();
        expect(values.iep_detail).toBe("Speech therapy twice weekly");
    });

    it("9 the supplied value is resolved, and the Form holds no copy of it", () => {
        expect(supplied.fee).toBe("$175.00");
        expect(JSON.stringify(SPECIMEN)).not.toContain("175");
    });

    it("10 acknowledgement is recorded", () => {
        expect(values.ack).toBe(true);
    });
});

describe("filed artifact — every populated semantic renders, none degrades to a dash", () => {
    it("renders all ten semantics", async () => {
        const text = composedDocumentText((await composed()).bytes);
        const expected: Record<string, string> = {
            scalar: "Touree Disposable0913",
            vocabulary: "Female",
            conditional: "Speech therapy twice weekly",
            "repeated known": "Corinne Vasquez",
            "repeated new": "Farrah Nolan",
            address: "12 Alder Lane, Bend, OR 97701",
            "pending owner": "Records are with the clinic",
            absence: "No known allergies",
            supplied: "$175.00",
            acknowledgement: "Acknowledged and accepted.",
        };
        for (const [semantic, value] of Object.entries(expected)) {
            expect(text, `${semantic} did not reach the filed artifact`).toContain(value);
        }
    });

    it("renders the derived value rather than leaving it blank", async () => {
        const { derived } = assemble();
        const text = composedDocumentText((await composed()).bytes);
        expect(text).toContain(String(derived.age));
    });

    it("keeps phone formatting consistent between a known and a typed contact", async () => {
        const text = composedDocumentText((await composed()).bytes);
        expect(text).toContain("(541) 555-7788");
        expect(text).toContain("(321) 352-5132");
        expect(text).not.toContain("+15415557788");
        expect(text).not.toContain("3213525132");
    });

    it("NO populated semantic degrades to a dash", async () => {
        const lines = composedDocumentLines((await composed()).bytes);
        for (const heading of ["Child's full name", "Gender", "Allergies", "Immunization notes", "Registration fee", "Home address"]) {
            const at = lines.indexOf(heading);
            expect(at, `${heading} is missing entirely`).toBeGreaterThan(-1);
            expect(lines[at + 1], `${heading} degraded to a dash`).not.toBe("-");
        }
    });

    it("still prints a dash for the question nobody answered", async () => {
        const lines = composedDocumentLines((await composed()).bytes);
        const at = lines.indexOf("Medications");
        expect(at).toBeGreaterThan(-1);
        expect(lines[at + 1], "unanswered must stay visibly different from 'there are none'").toBe("-");
    });

    it("shows the address as one line, never as four labelled parts", async () => {
        const text = composedDocumentText((await composed()).bytes);
        expect(text).toContain("12 Alder Lane, Bend, OR 97701");
        for (const partLabel of ["Street address", "ZIP / postal code"]) {
            expect(text).not.toContain(partLabel);
        }
    });
});

describe("artifact truth — no internal identity reaches the family", () => {
    it("leaks no identity VALUE — the instance keys and record ids themselves", async () => {
        /*
         * The first version of this test asserted only on key NAMES ("instance_key", "item_id"),
         * and stayed GREEN when a plant printed the instance key's VALUE beside a person's name.
         * A guard that survives the leak it names is not a guard. These are the actual strings a
         * family must never read on their own paperwork.
         */
        const text = composedDocumentText((await composed()).bytes);
        for (const value of ["e-new", "known:corinne", KNOWN_CONTACT]) {
            expect(text, `the identity "${value}" reached a participant-facing document`).not.toContain(value);
        }
    });

    it("still carries the document's OWN provenance stamp, which is not a leak", async () => {
        /*
         * The distinction §C5 is drawing is about the identity of PEOPLE and RECORDS — an instance
         * key, a person id, a provider ref. The footer's short form-version stamp is the completed
         * record naming where its own questions came from, which is the same job a form number does
         * on paper and is the thing that makes a signed document traceable. Asserting it away would
         * have removed real provenance in the name of hiding bookkeeping.
         */
        const text = composedDocumentText((await composed()).bytes);
        expect(text, "a completed record must say where its questions came from").toContain("Form b7be55c5");
        expect(text).toContain("generated_document_v1");
    });

    it("leaks no bookkeeping of any kind", async () => {
        const text = composedDocumentText((await composed()).bytes);
        for (const leak of [
            "instance_key",
            "item_id",
            "provider_ref",
            "respondent_added",
            "origin",
            KNOWN_CONTACT,
            "form_only_pending_canonical_owner",
            "charge_template",
            "registration_fee",
            "address_binding",
            "party_collection",
            "__absence__",
        ]) {
            expect(text, `${leak} reached a participant-facing document`).not.toContain(leak);
        }
    });

    it("prints no governance language for a pending-owner answer", async () => {
        const text = composedDocumentText((await composed()).bytes).toLowerCase();
        for (const word of ["pending", "canonical owner", "form-only", "evidence only"]) {
            expect(text).not.toContain(word);
        }
    });
});

describe("configuration source change, at the integrated level", () => {
    it("the same Form definition renders a new amount when configuration changes", async () => {
        const before = composedDocumentText((await composed()).bytes);
        expect(before).toContain("$175.00");

        const raised = [...TEMPLATES, { template_key: "registration_fee", is_active: true, effective_start: "2026-10-01", amount_cents: 22500, currency_code: "USD", label: "Registration Fee" }];
        const { values, groups } = assemble();
        const after = composedDocumentText(
            (
                await composeGeneratedDocument({
                    schema: SPECIMEN,
                    values: { ...values, ...resolveSuppliedValuesFromTemplates(SPECIMEN, raised).values },
                    groups,
                    provenance: {
                        form_definition_id: FD,
                        form_definition_version_id: "b7be55c5-15fd-44bc-8b68-1938b4e1532d",
                        source_document_id: null,
                        source_sha256: null,
                        source_title: null,
                    },
                })
            ).bytes,
        );
        expect(after).toContain("$225.00");
        expect(after).not.toContain("$175.00");
    });
});
