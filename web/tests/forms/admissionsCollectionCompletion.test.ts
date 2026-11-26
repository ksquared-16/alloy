/**
 * THE ADMISSIONS PACKET CAN BE FINISHED — against its real published schema.
 *
 * `__fixtures_admissions_v12_published.json` is byte-identical to the schema staging serves for
 * Admissions v12 (`ee75bbc6…`). Measured there, no family could submit it:
 *
 *   1. Every guardian and emergency contact a family typed was refused — "Custom or unmapped fields
 *      require an explicit binding before publish." Publish checked a collection member only when it
 *      claimed a destination; submit checked every non-empty member. Same form, two answers.
 *   2. "Do you have other children in your household?" is required, unbound and boolean, so the
 *      participant runtime filed it as an acknowledgment: never asked, shown only as a tick box at
 *      signing. Ticking it there activated the required Other children collection behind a review
 *      gate the family could no longer pass.
 *
 * These drive the canonical authorities directly — the submit validator, the publish validator, the
 * Processing adapter and the participant compiler — over that schema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormPayload, type FormPayload, type FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { normalizeSubmissionForSchema, fieldIdsControllingVisibility } from "@/lib/forms/submissionSemantics";
import { validateFormsDocumentsP2Bindings } from "@/lib/forms/binding/validateFormsDocumentsP2Bindings";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import {
    fieldIsAcknowledgement,
    participantCollectionMode,
} from "@/lib/enrollment/informationNeeds/participantCollectionMode";

const RAW = JSON.parse(readFileSync(resolve(__dirname, "__fixtures_admissions_v12_published.json"), "utf8"));
const SCHEMA: FormSchemaV1 = validateFormSchema(RAW);

const group = (id: string) => SCHEMA.fields.find((f) => f.id === id) as FormField & { type: "group" };
const GUARDIANS = "emergency_contacts";
const OTHER_CHILDREN = "emergency_contacts_2";
const EMERGENCY = "emergency_contacts_3";
const OTHER_CHILDREN_Q = "untitled_yes_no_13";

let n = 0;
/** A respondent-added member, shaped exactly as the shared form engine writes one. */
const member = (groupId: string, values: Record<string, unknown>): FormPayloadGroupRow => {
    const binding = group(groupId).collection_binding!;
    n += 1;
    return {
        instance_key: `row-${groupId}-${n}`,
        values,
        groups: {},
        signatures: {},
        collection: { provider_ref: binding.collection_provider_ref, origin: "respondent_added", iteration_entity_type: binding.iteration_entity_type },
    };
};
const guardian = (name = "Pat Parent", phone = "5550100111") =>
    member(GUARDIANS, { emergency_contacts_full_name: name, emergency_contacts_phone: phone, emergency_contacts_relationship_to_the_child: "Mother" });
const contact = (name: string, phone: string, rel = "Aunt") =>
    member(EMERGENCY, { emergency_contacts_3_full_name: name, emergency_contacts_3_phone: phone, emergency_contacts_3_relationship_to_the_child: rel });
const otherChild = (name = "Sam Sibling") => member(OTHER_CHILDREN, { emergency_contacts_2_full_name: name, emergency_contacts_2_date_of_birth: "2021-05-01" });

/** The answers a family must give, plus whatever the case under test changes. */
function payload(over: { values?: Record<string, unknown>; groups?: Record<string, FormPayloadGroupRow[]> } = {}): FormPayload {
    return {
        values: {
            untitled_short_text: "Ava",
            untitled_short_text_2: "Example",
            untitled_date: "2023-03-01",
            untitled_date_2: "2026-09-24",
            [OTHER_CHILDREN_Q]: false,
            untitled_yes_no_2: false,
            untitled_yes_no_3: false,
            ...over.values,
        },
        groups: {
            [GUARDIANS]: [guardian()],
            [EMERGENCY]: [contact("Ec One", "5550100222"), contact("Ec Two", "5550100333", "Uncle")],
            ...over.groups,
        },
        signatures: { untitled_signature: { kind: "typed", typed_full_name: "Pat Parent", acknowledged_at: "2026-10-17T00:00:00Z" } },
    };
}

/** The submit route's own order: normalize against the schema, then validate in submit mode. */
const submit = (p: FormPayload, schemaJson: unknown = RAW) =>
    validateFormPayload({ schemaJson, payload: normalizeSubmissionForSchema(SCHEMA, p), mode: "submit" });
const errorsOf = (r: ReturnType<typeof submit>) => (r.ok ? [] : r.errors.map((e) => `${e.path.join(".")}: ${e.message}`));

describe("relationship members are accepted at their canonical authority", () => {
    it("complete guardians and emergency contacts submit — the measured refusal is gone", () => {
        const r = submit(payload());
        expect(errorsOf(r)).toEqual([]);
        expect(r.ok).toBe(true);
    });

    it("publish and submit ask the same question: a member that claims a destination is checked by both", () => {
        // Give an emergency contact's line a CHILD-only destination — a fact that cannot belong to a
        // person in the emergency-contacts collection.
        const tampered = structuredClone(RAW);
        const ec = tampered.fields.find((f: { id: string }) => f.id === EMERGENCY);
        ec.fields[0].field_source = { entity_type: "customer_member", field_key: "date_of_birth" };
        const publishViolations = validateFormsDocumentsP2Bindings(validateFormSchema(tampered)).filter((v) => v.field_id === "emergency_contacts_3_full_name");
        expect(publishViolations.length).toBeGreaterThan(0);

        const r = validateFormPayload({ schemaJson: tampered, payload: normalizeSubmissionForSchema(validateFormSchema(tampered), payload()), mode: "submit" });
        expect(errorsOf(r).some((e) => e.startsWith(`groups.${EMERGENCY}.0.values.emergency_contacts_3_full_name`))).toBe(true);
    });

    it("an undeclared member value is still refused — strictness is unchanged", () => {
        const p = payload();
        p.groups![EMERGENCY]![0]!.values.invented_line = "x";
        expect(submit(p).ok).toBe(false);
    });
});

describe("minimums count complete members only (#1463 preserved)", () => {
    it("no guardian → refused", () => {
        const r = submit(payload({ groups: { [GUARDIANS]: [] } }));
        expect(errorsOf(r).some((e) => e.startsWith(GUARDIANS))).toBe(true);
    });

    it("one complete emergency contact and one missing a phone → refused, with the missing line named", () => {
        const r = submit(payload({ groups: { [EMERGENCY]: [contact("Ec One", "5550100222"), member(EMERGENCY, { emergency_contacts_3_full_name: "Ec Two" })] } }));
        const errs = errorsOf(r);
        expect(r.ok).toBe(false);
        expect(errs.some((e) => e.includes("emergency_contacts_3_phone") || e.startsWith(EMERGENCY))).toBe(true);
    });

    it("a blank seeded row does not count toward the minimum", () => {
        const r = submit(payload({ groups: { [EMERGENCY]: [contact("Ec One", "5550100222"), member(EMERGENCY, {})] } }));
        expect(r.ok).toBe(false);
    });

    it("extra valid members are allowed", () => {
        const r = submit(payload({ groups: { [EMERGENCY]: [contact("A", "1"), contact("B", "2"), contact("C", "3")] } }));
        expect(errorsOf(r)).toEqual([]);
    });
});

describe("the Other children collection follows its controlling answer", () => {
    it("Yes with no member → refused for the collection", () => {
        const r = submit(payload({ values: { [OTHER_CHILDREN_Q]: true } }));
        expect(errorsOf(r).some((e) => e.startsWith(OTHER_CHILDREN))).toBe(true);
    });

    it("Yes with a complete member → submits", () => {
        const r = submit(payload({ values: { [OTHER_CHILDREN_Q]: true }, groups: { [OTHER_CHILDREN]: [otherChild()] } }));
        expect(errorsOf(r)).toEqual([]);
    });

    it("No → not required, and a stale hidden member does not block", () => {
        const r = submit(payload({ values: { [OTHER_CHILDREN_Q]: false }, groups: { [OTHER_CHILDREN]: [otherChild()] } }));
        expect(errorsOf(r)).toEqual([]);
    });
});

describe("the participant runtime asks the controlling question and shows the collection it opens", () => {
    const compiled = (values: Record<string, unknown>, groups?: Record<string, { values: Record<string, unknown> }[]>) => {
        const a = compileParticipantArtifact(SCHEMA, values, undefined, groups);
        return { ...a, controls: a.sections.flatMap((s) => s.controls) };
    };

    it("the three visibility-controlling yes/no questions are questions, not acknowledgments", () => {
        const controllers = fieldIdsControllingVisibility(SCHEMA);
        for (const id of [OTHER_CHILDREN_Q, "untitled_yes_no_2", "untitled_yes_no_3"]) {
            expect(controllers.has(id)).toBe(true);
            const field = SCHEMA.fields.find((f) => f.id === id)!;
            expect(fieldIsAcknowledgement(field, { bound: false, controlsVisibility: true })).toBe(false);
            expect(participantCollectionMode(field, { bound: false, controlsVisibility: true })).toBe("conversational");
            const artifact = compiled({});
            expect(artifact.controls.find((c) => c.field_id === id)?.kind).not.toBe("acknowledgment");
            // Not gathered at signing, and still the participant's outstanding work until answered.
            expect(artifact.acknowledgments.some((c) => c.field_id === id)).toBe(false);
            expect(artifact.outstanding.some((c) => c.field_id === id)).toBe(true);
        }
    });

    it("a genuine acknowledgment — required, unbound, boolean, controlling nothing — stays one", () => {
        const ack = { id: "f_ack", type: "boolean", label: "I acknowledge the information above is accurate.", required: true } as FormField;
        expect(fieldIsAcknowledgement(ack, { bound: false, controlsVisibility: false })).toBe(true);
        expect(participantCollectionMode(ack, { bound: false })).toBe("acknowledgement");
    });

    it("Yes shows the Other children collection as required work; No hides it", () => {
        const yes = compiled({ [OTHER_CHILDREN_Q]: true }, {}).controls.find((c) => c.field_id === OTHER_CHILDREN);
        expect(yes?.input_type).toBe("group");
        expect(yes?.required).toBe(true);
        expect(yes?.value).toEqual({ complete: 0, needed: 1 });

        const filled = compiled({ [OTHER_CHILDREN_Q]: true }, { [OTHER_CHILDREN]: [otherChild()] }).controls.find((c) => c.field_id === OTHER_CHILDREN);
        expect(filled?.value).toEqual({ complete: 1, needed: 1 });

        expect(compiled({ [OTHER_CHILDREN_Q]: false }, {}).controls.find((c) => c.field_id === OTHER_CHILDREN)).toBeUndefined();
    });
});

describe("Processing receives each member as itself", () => {
    it("guardians and emergency contacts become separate proposals with their own role and their own answers", () => {
        const p = payload();
        p.groups![EMERGENCY]!.push(member(EMERGENCY, {})); // a blank row must not become a proposal
        const r = submit(p);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const bundle = adaptFormSubmissionToRelatedRecordProposals(r.schema, r.payload, { formSubmissionId: "sub-1", formDefinitionVersionId: "ee75bbc6" });
        const byGroup = Object.fromEntries(
            bundle.collections.map((c) => [String(c.instances[0]?.source_lineage.source_metadata?.schema_group_id), c]),
        );
        const guardians = byGroup[GUARDIANS]!;
        const contacts = byGroup[EMERGENCY]!;
        expect(guardians.instances).toHaveLength(1);
        expect(contacts.instances).toHaveLength(2);

        expect(guardians.instances[0]!.relationship_intent?.operational_role_key).not.toBe(contacts.instances[0]!.relationship_intent?.operational_role_key);
        const facts = (i: (typeof contacts.instances)[number]) => Object.fromEntries(i.field_proposals.map((f) => [f.source_fact_ref, f.submitted_value]));
        expect(facts(guardians.instances[0]!)).toMatchObject({ emergency_contacts_full_name: "Pat Parent" });
        expect(contacts.instances.map((i) => facts(i).emergency_contacts_3_full_name)).toEqual(["Ec One", "Ec Two"]);
        // A guardian's answer never appears on an emergency contact, nor the reverse.
        expect(contacts.instances.some((i) => "emergency_contacts_full_name" in facts(i))).toBe(false);
        // The unbound member lines are read through each collection's OWN relationship definition
        // (Director decision, Enrollment V0.5 relationship commit repair): every fact is that member's
        // own answer, with its source field and basis — nothing invented, nothing crossing people.
        for (const i of [...guardians.instances, ...contacts.instances]) {
            const pf = i.relationship_intent?.proposed_person_facts ?? [];
            expect(pf.map((f) => f.field_key)).toEqual(["full_name", "phone", "relationship_type"]);
            expect(pf.every((f) => f.basis === "definition_member" && f.source_field_id && f.value === facts(i)[f.source_field_id])).toBe(true);
        }
    });
});

describe("imported and manually authored forms behave identically", () => {
    it("the legacy party_collection form and its canonical collection_binding twin give the same submit answer", () => {
        const canonical = structuredClone(RAW);
        for (const f of canonical.fields) {
            if (!f.party_collection) continue;
            f.collection_binding = group(f.id).collection_binding;
            delete f.party_collection;
        }
        for (const p of [payload(), payload({ groups: { [GUARDIANS]: [] } }), payload({ values: { [OTHER_CHILDREN_Q]: true } })]) {
            expect(errorsOf(submit(p, canonical))).toEqual(errorsOf(submit(p, RAW)));
        }
    });
});
