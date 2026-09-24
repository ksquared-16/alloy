/**
 * A PERSON ALLOY COULD SHOW BUT NOT CREATE.
 *
 * `proposed_person_facts` — the identity a reviewed commit drafts a Person from — was built from
 * `field_source` alone, and a Studio-authored party collection carries none on its entry questions.
 *
 * MEASURED on the real enrollment form: every entry field arrived as
 * `provider_ref: "ec_name", entity_type: null, field_key: null`. So a family-added emergency
 * contact reached the commit carrying no identity at all and was refused
 * `insufficient_person_identity` — visible on the participant card, printed on the completed
 * paperwork, and impossible to turn into a canonical record.
 *
 * The platform already answered "which entry question is the name" — in the READ direction, for
 * putting a known person onto the card. These guard the same answer in the write direction, and
 * guard that it stays an answer to a DECLARED question rather than a free-for-all.
 */

import { describe, expect, it } from "vitest";

import { effectiveEntryFieldSource } from "@/lib/forms/partyCollection";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const contacts = {
    id: "emergency_contacts",
    type: "group",
    label: "Emergency contacts",
    repeat: { min: 1 },
    party_collection: {
        action_key: "add_emergency_contact",
        subject: "person",
        role: "emergency_contact",
        scope: "this_child",
        show_known: true,
        allow_add: true,
    },
    // Exactly as Studio authors them: no field_source anywhere.
    fields: [
        { id: "ec_name", type: "text", label: "Full name", required: true },
        { id: "ec_phone", type: "text", label: "Phone", required: true },
        { id: "ec_rel", type: "text", label: "Relationship to the child" },
    ],
} as unknown as FormField;

const ordinary = {
    id: "plain_rows",
    type: "group",
    label: "Other rows",
    repeat: { min: 0 },
    fields: [{ id: "plain_name", type: "text", label: "Full name" }],
} as unknown as FormField;

const SCHEMA = {
    schema_version: 1,
    title: "Enrollment Application",
    fields: [contacts],
    sections: [{ id: "s1", title: "Your family", field_ids: ["emergency_contacts"] }],
} as unknown as FormSchemaV1;

const nested = (id: string) => (contacts as unknown as { fields: FormField[] }).fields.find((f) => f.id === id)!;

describe("which canonical fact an entry question carries", () => {
    it("places the name, the phone and the email of a person entry", () => {
        expect(effectiveEntryFieldSource(contacts, nested("ec_name"))).toEqual({ entity_type: "person", field_key: "full_name" });
        expect(effectiveEntryFieldSource(contacts, nested("ec_phone"))).toEqual({ entity_type: "person", field_key: "phone" });
    });

    it("places nothing it cannot recognise, rather than guessing", () => {
        expect(effectiveEntryFieldSource(contacts, nested("ec_rel"))).toBeNull();
    });

    it("lets an authored binding outrank the inference", () => {
        const bound = { id: "ec_name", type: "text", label: "Full name", field_source: { entity_type: "person", field_key: "preferred_name" } } as unknown as FormField;
        expect(effectiveEntryFieldSource(contacts, bound)).toEqual({ entity_type: "person", field_key: "preferred_name" });
    });

    it("offers the reading only inside a party collection — never to an ordinary repeater", () => {
        const plain = (ordinary as unknown as { fields: FormField[] }).fields[0]!;
        expect(effectiveEntryFieldSource(ordinary, plain)).toBeNull();
    });

    it("reads a child entry as a child, not as a person", () => {
        const kids = {
            ...(contacts as unknown as Record<string, unknown>),
            party_collection: { action_key: "add_child", subject: "child" },
        } as unknown as FormField;
        expect(effectiveEntryFieldSource(kids, nested("ec_name"))?.entity_type).toBe("customer_member");
    });
});

describe("the proposal now carries enough identity to create the person", () => {
    const payload = {
        values: {},
        groups: {
            emergency_contacts: [
                {
                    instance_key: "e-9",
                    values: { ec_name: "Farrah Nolan", ec_phone: "3213525132", ec_rel: "Neighbour" },
                    groups: {},
                    signatures: {},
                    collection: {
                        provider_ref: "person.contact_role.emergency_contacts",
                        origin: "respondent_added",
                        iteration_entity_type: "person",
                    },
                },
            ],
        },
    } as never;

    const instance = adaptFormSubmissionToRelatedRecordProposals(SCHEMA, payload, {
        formSubmissionId: "11111111-1111-4111-8111-111111111111",
        formDefinitionVersionId: "22222222-2222-4222-8222-222222222222",
    }).collections.find((c) => c.collection_key === "emergency_contacts")!.instances[0]!;

    it("carries the family's typed name and phone as canonical facts", () => {
        const facts = instance.relationship_intent?.proposed_person_facts ?? [];
        expect(facts).toContainEqual({ entity_type: "person", field_key: "full_name", value: "Farrah Nolan" });
        expect(facts).toContainEqual({ entity_type: "person", field_key: "phone", value: "3213525132" });
    });

    it("carries a first and last name, which is what the draft requires", () => {
        const full = (instance.relationship_intent?.proposed_person_facts ?? []).find((f) => f.field_key === "full_name");
        expect(String(full?.value ?? "").trim().split(/\s+/).length).toBeGreaterThan(1);
    });

    it("does not smuggle the relationship description in as an identity fact", () => {
        const keys = (instance.relationship_intent?.proposed_person_facts ?? []).map((f) => f.field_key);
        expect(keys).not.toContain("ec_rel");
        expect(keys.sort()).toEqual(["full_name", "phone"]);
    });

    it("still asks to CREATE rather than link, because the family added them", () => {
        expect(instance.relationship_intent?.identity_action).toBe("create_proposed_person");
        expect(instance.existing_record_id).toBeUndefined();
    });
});
