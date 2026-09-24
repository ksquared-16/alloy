/**
 * A COLLECTION OF PEOPLE HAS TO REACH PROCESSING.
 *
 * The participant half of repeated people was accepted in human QA: the family adds, reuses,
 * removes, resumes, settles, submits, and the completed artifact names everyone. Then it stopped.
 *
 * `party_collection` states what an entry MEANS — the action, the subject, the role, the scope.
 * `collection_binding` states which canonical collection the group iterates, and that is the only
 * thing the Processing pipeline reads: it gates the proposal adapter, it resolves the provider, and
 * the relationship definition behind that provider supplies the role, the apply command and the
 * scope a reviewed commit executes through.
 *
 * Forms Studio authors the first and never wrote the second, so every Studio-authored collection of
 * people submitted rows tagged `party:add_emergency_contact` — a provider no registry has ever
 * heard of — into a group the adapter skipped as unbound. The evidence was perfect and nothing
 * downstream could act on it.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { effectiveCollectionBinding } from "@/lib/forms/partyCollection";
import { partyCollectionGroupRows } from "@/lib/enrollment/informationNeeds/participantPartyCollection";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import {
    classifyCollectionProvider,
    findCanonicalCollectionProvider,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";
import type { FormSchemaV1, FormField } from "@/lib/forms/schema";

const FD = "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94";

const siblings = {
    id: "household_children",
    type: "group",
    label: "Children in your household",
    repeat: { min: 0 },
    party_collection: { action_key: "add_child", subject: "child", show_known: true, allow_add: true },
    fields: [{ id: "sib_name", type: "text", label: "Full name" }],
} as unknown as FormField;

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
    fields: [
        { id: "ec_name", type: "text", label: "Full name", required: true, field_source: { entity_type: "person", field_key: "full_name" } },
        { id: "ec_phone", type: "text", label: "Phone", required: true, field_source: { entity_type: "person", field_key: "phone" } },
    ],
} as unknown as FormField;

const SCHEMA = {
    title: "Enrollment Application",
    fields: [siblings, contacts],
    sections: [{ id: "s1", title: "Your family", field_ids: ["household_children", "emergency_contacts"] }],
} as unknown as FormSchemaV1;

describe("a party collection names a canonical collection", () => {
    it("binds a collection of people in a role to that role's own provider", () => {
        const binding = effectiveCollectionBinding(contacts)!;
        expect(binding.collection_provider_ref).toBe("person.contact_role.emergency_contacts");
        expect(binding.iteration_entity_type).toBe("person");
        // Registered, therefore resolvable downstream — the point of the whole derivation.
        expect(findCanonicalCollectionProvider(binding.collection_provider_ref)).toBeTruthy();
        expect(classifyCollectionProvider(binding.collection_provider_ref)).toBe("configured_relationship");
        expect(relationshipDefinitionForRef(binding.collection_provider_ref)?.apply_command_key).toBe(
            "add_emergency_contact",
        );
    });

    it("binds a collection of children to household membership, which carries no role", () => {
        const binding = effectiveCollectionBinding(siblings)!;
        expect(binding.collection_provider_ref).toBe("children");
        expect(binding.iteration_entity_type).toBe("customer_member");
        expect(classifyCollectionProvider("children")).toBe("native_structural");
    });

    it("lets an authored binding outrank the inference", () => {
        const authored = {
            ...(contacts as unknown as Record<string, unknown>),
            collection_binding: { collection_provider_ref: "household.members", iteration_entity_type: "customer_member" },
        } as unknown as FormField;
        expect(effectiveCollectionBinding(authored)!.collection_provider_ref).toBe("household.members");
    });

    it("fails closed on a role no relationship definition claims", () => {
        const invented = {
            ...(contacts as unknown as Record<string, unknown>),
            party_collection: { action_key: "add_emergency_contact", subject: "person", role: "dog_walker" },
        } as unknown as FormField;
        expect(effectiveCollectionBinding(invented)).toBeNull();
    });

    it("never invents a provider ref for the payload", () => {
        const held = {
            [`party:${FD}:emergency_contacts`]: [
                { instance_key: "e-9", origin: "respondent_added", values: { ec_name: "Farrah Nolan", ec_phone: "3213525132" } },
            ],
        };
        const rows = partyCollectionGroupRows(SCHEMA, held, FD);
        const ref = rows.emergency_contacts![0].collection!.provider_ref;
        expect(ref).toBe("person.contact_role.emergency_contacts");
        expect(ref.startsWith("party:"), "a made-up provider reaches Processing as unknown_provider").toBe(false);
    });
});

describe("the proposal adapter can now see the collection", () => {
    const payload = {
        values: {},
        groups: {
            emergency_contacts: [
                {
                    instance_key: "known:c0r",
                    values: { ec_name: "Corinne Vasquez", ec_phone: "5415557788" },
                    groups: {},
                    signatures: {},
                    collection: {
                        provider_ref: "person.contact_role.emergency_contacts",
                        origin: "existing",
                        iteration_entity_type: "person",
                        item_id: "c0r1nne0-0000-4000-8000-000000000002",
                    },
                },
                {
                    instance_key: "e-9",
                    values: { ec_name: "Farrah Nolan", ec_phone: "3213525132" },
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

    const bundle = adaptFormSubmissionToRelatedRecordProposals(SCHEMA, payload, {
        formSubmissionId: "11111111-1111-4111-8111-111111111111",
        formDefinitionVersionId: "22222222-2222-4222-8222-222222222222",
    });
    const collection = bundle.collections.find((c) => c.collection_key === "emergency_contacts");

    it("produces one proposal per person, and no collection_mismatch", () => {
        expect(collection, "the adapter skipped the group as unbound").toBeTruthy();
        expect(collection!.instances).toHaveLength(2);
        expect(bundle.diagnostics.map((d) => d.code)).not.toContain("collection_mismatch");
    });

    it("every proposal is valid — no unknown_provider", () => {
        for (const inst of collection!.instances) {
            expect(inst.diagnostics.map((d) => d.code), inst.instance_key).not.toContain("unknown_provider");
            expect(inst.status, inst.instance_key).toBe("valid");
        }
    });

    it("reuses the known person rather than proposing a new one", () => {
        const known = collection!.instances.find((i) => i.instance_key === "known:c0r")!;
        expect(known.origin).toBe("existing_record");
        expect(known.existing_record_id).toBe("c0r1nne0-0000-4000-8000-000000000002");
        expect(known.relationship_intent?.identity_action).toBe("link_existing_person");
        expect(known.relationship_intent?.existing_person_id).toBe("c0r1nne0-0000-4000-8000-000000000002");
    });

    it("proposes the family's new contact as a person to create, once", () => {
        const added = collection!.instances.find((i) => i.instance_key === "e-9")!;
        expect(added.origin).toBe("proposed_new_record");
        expect(added.existing_record_id).toBeUndefined();
        expect(added.relationship_intent?.identity_action).toBe("create_proposed_person");
        expect(added.relationship_intent?.proposed_person_facts?.map((f) => f.field_key)).toEqual(["full_name", "phone"]);
    });

    it("carries the role, the command and the scope the commit executes through", () => {
        const added = collection!.instances.find((i) => i.instance_key === "e-9")!;
        expect(added.execution_kind).toBe("configured_relationship");
        expect(added.relationship_intent?.operational_role_key).toBe("emergency_contact");
        expect(added.relationship_intent?.apply_command_key).toBe("add_emergency_contact");
        expect(added.relationship_intent?.supported_scopes?.length).toBeGreaterThan(0);
    });

    it("proposes nothing for a person the family removed", () => {
        // A removed respondent-added entry is simply not in the payload; nothing represents it.
        const keys = collection!.instances.map((i) => i.instance_key);
        expect(keys).not.toContain("removed-one");
        expect(keys).toEqual(["known:c0r", "e-9"]);
    });
});

describe("an unbindable collection must not break the family's submission", () => {
    /*
     * `provider_ref` is `min(1)` in the payload contract, so an empty one is not a harmless
     * placeholder — it fails validation and refuses the submission. A downstream gap must never
     * become a participant-facing outage: the row keeps its values, so the person still reaches the
     * completed artifact, and simply makes no canonical claim.
     */
    const unbindable = {
        ...(contacts as unknown as Record<string, unknown>),
        id: "mystery_people",
        // A valid ACTION with a role no relationship definition claims — the unbindable case.
        party_collection: { action_key: "add_emergency_contact", subject: "person", role: "dog_walker" },
    } as unknown as FormField;
    const schema = {
        schema_version: 1,
        title: "T",
        fields: [unbindable],
        sections: [{ id: "s", title: "S", field_ids: ["mystery_people"] }],
    } as unknown as FormSchemaV1;

    const rows = partyCollectionGroupRows(
        schema,
        {
            [`party:${FD}:mystery_people`]: [
                { instance_key: "x1", origin: "respondent_added", values: { ec_name: "Someone", ec_phone: "5415557788" } },
            ],
        },
        FD,
    );

    it("still carries the person's answers", () => {
        expect(rows.mystery_people).toHaveLength(1);
        expect(rows.mystery_people![0].values.ec_name).toBe("Someone");
    });

    it("omits the collection envelope rather than asserting an empty provider", () => {
        expect(rows.mystery_people![0].collection).toBeUndefined();
    });

    it("passes the payload contract, which would reject an empty provider_ref", async () => {
        const { validateFormPayload } = await import("@/lib/forms/validateSubmission");
        const result = validateFormPayload({
            schemaJson: schema,
            payload: { values: {}, groups: rows } as never,
            mode: "submit",
        });
        expect(result.ok, JSON.stringify("errors" in result ? result.errors : [])).toBe(true);
    });
});

describe("the operator reads the same number the family typed", () => {
    /*
     * MEASURED in a real case's evidence: a known contact read `(541) 555-7788` and the contact the
     * family had just typed read `3213525132`, one line apart — the first only because it happened
     * to be STORED punctuated. The same drift human QA reported on the participant card, surfacing
     * in front of the operator deciding whether these are the same kind of record.
     */
    const src = readFileSync(
        new URL("../../lib/pos/processingCase/collection/projectRelatedRecordProposalsToEvidence.ts", import.meta.url)
            .pathname,
        "utf8",
    );

    it("formats the display half through the platform primitive", () => {
        expect(src).toContain("formatPhoneNumber");
        expect(src).toContain("display_value: display === null ? null : formatPhoneNumber(display)");
    });

    it("leaves the submitted evidence itself untouched", () => {
        // `submitted_value` is what the family sent. Evidence is never reformatted.
        expect(src).toContain("submitted_value: fp.submitted_value,");
        expect(src).not.toContain("submitted_value: formatPhoneNumber");
    });
});
