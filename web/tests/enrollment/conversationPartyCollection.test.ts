/**
 * THE CONVERSATION DID NOT KNOW WHAT A COLLECTION OF PEOPLE WAS.
 *
 * `walkScalarFormFields` descends into every group and visits each child alone, so a repeated
 * emergency-contact collection reached a parent as three unrelated questions — "Full name?",
 * "Phone?", "Relationship to the child?" — asked once each, with no repetition, no entry identity,
 * and nothing to say those three answers belong to one person.
 *
 * The `party_collection` declaration the Form already carried was simply never read on this path.
 * These tests are about reading it, and about the two things that must never follow from reading
 * it: a second repeater implementation, and a second participant draft to keep in step.
 */

import { describe, expect, it } from "vitest";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import {
    mergeKnownEntries,
    partyCollectionGroupRows,
    partyCollectionStateKey,
    readPartyEntries,
    type ParticipantPartyEntry,
} from "@/lib/enrollment/informationNeeds/participantPartyCollection";

const FD = "fd-1";
const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const SCHEMA = {
    schema_version: 1,
    title: "Enrolment",
    fields: [
        { id: "child_name", type: "text", label: "Child's full name", required: true },
        {
            id: "emergency_contacts",
            type: "group",
            label: "Emergency contacts",
            required: false,
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
                { id: "ec_name", type: "text", label: "Full name", required: true },
                { id: "ec_phone", type: "text", label: "Phone", required: true },
            ],
        },
        {
            id: "plain_rows",
            type: "group",
            label: "Other rows",
            required: false,
            repeat: { min: 0 },
            fields: [{ id: "plain_a", type: "text", label: "Anything", required: false }],
        },
    ],
    sections: [{ id: "s1", title: "About", field_ids: ["child_name", "emergency_contacts", "plain_rows"] }],
} as unknown as FormSchemaV1;

const FORM = {
    requirement_id: "r1",
    form_definition_id: FD,
    form_definition_version_id: "v1",
    session_item_id: "si1",
    schema: SCHEMA,
} as never;

const project = (sharedValues: Record<string, unknown> = {}, known?: Record<string, ParticipantPartyEntry[]>) =>
    projectEnrollmentInformationNeeds({
        forms: [FORM],
        subjectId: CHILD,
        sharedValues,
        confirmations: {} as never,
        ...(known ? { knownPartyEntries: known } : {}),
    });

const collectionNeed = (needs: ReturnType<typeof project>) =>
    needs.find((n) => n.party_collection?.group_field_id === "emergency_contacts");

const KEY = partyCollectionStateKey(FD, "emergency_contacts");

describe("a collection of people is one obligation, not its questions", () => {
    it("no longer asks the collection's child fields as loose questions", () => {
        /*
         * THE DEFECT, IN ONE ASSERTION. Before this, "Full name" and "Phone" were two independent
         * needs with no relationship to each other and no repetition at all.
         */
        const needs = project();
        expect(needs.some((n) => n.occurrences.some((o) => o.form_field_id === "ec_name"))).toBe(false);
        expect(needs.some((n) => n.occurrences.some((o) => o.form_field_id === "ec_phone"))).toBe(false);
    });

    it("projects one need carrying the Form's own declaration", () => {
        const need = collectionNeed(project())!;
        expect(need).toBeTruthy();
        expect(need.party_collection!.action_key).toBe("add_emergency_contact");
        expect(need.party_collection!.subject).toBe("person");
        expect(need.party_collection!.role).toBe("emergency_contact");
        expect(need.party_collection!.scope).toBe("this_child");
        expect(need.party_collection!.min).toBe(1);
        expect(need.party_collection!.entry_fields.map((f) => f.label)).toEqual(["Full name", "Phone"]);
    });

    it("leaves ordinary scalar questions exactly as they were", () => {
        expect(project().some((n) => n.occurrences.some((o) => o.form_field_id === "child_name"))).toBe(true);
    });

    it("leaves an ordinary repeating group flattened, because nothing declared what its rows mean", () => {
        expect(project().some((n) => n.occurrences.some((o) => o.form_field_id === "plain_a"))).toBe(true);
    });
});

describe("entries keep one identity across their own questions", () => {
    const two = [
        { instance_key: "e1", origin: "respondent_added", values: { ec_name: "Jane Smith", ec_phone: "555-1234" } },
        { instance_key: "e2", origin: "respondent_added", values: { ec_name: "Priya Raman", ec_phone: "555-9876" } },
    ];

    it("holds a list of entries, never numbered scalar keys", () => {
        const needs = project({ [KEY]: two });
        const c = collectionNeed(needs)!.party_collection!;
        expect(c.entries.map((e) => e.instance_key)).toEqual(["e1", "e2"]);
        expect(c.entries[0]!.values.ec_name).toBe("Jane Smith");
        expect(needs.some((n) => n.identity.key.includes("ec_name_1"))).toBe(false);
    });

    it("survives save and resume with order and identity intact", () => {
        // Resume is a fresh projection over the same stored shared value; nothing else is involved.
        const resumed = collectionNeed(project({ [KEY]: two }))!.party_collection!;
        expect(resumed.entries.map((e) => e.values.ec_name)).toEqual(["Jane Smith", "Priya Raman"]);
    });

    it("ignores a malformed stored entry instead of throwing inside the projection", () => {
        const entries = readPartyEntries({ [KEY]: [null, { values: {} }, two[0]] }, FD, "emergency_contacts");
        expect(entries.map((e) => e.instance_key)).toEqual(["e1"]);
    });
});

describe("the minimum is a completion requirement, never blank slots", () => {
    it("is unsatisfied while empty, and creates no rows to say so", () => {
        const need = collectionNeed(project())!;
        expect(need.party_collection!.entries).toHaveLength(0);
        expect(need.requires_participant_action).toBe(true);
        expect(need.state).toBe("missing");
    });

    it("becomes VALID once the family has added enough complete entries — and stays active", () => {
        /*
         * This asserted `requires_participant_action === false` until the mounted conversation
         * showed what that meant: a family added one emergency contact and the collection vanished
         * before they could add a second. Meeting the Form's minimum is validity; being finished is
         * the family's own decision, and they have not made it yet.
         */
        const need = collectionNeed(project({ [KEY]: [{ instance_key: "e1", origin: "respondent_added", values: { ec_name: "Jane", ec_phone: "555" } }] }))!;
        expect(need.party_collection!.valid).toBe(true);
        expect(need.party_collection!.settled).toBe(false);
        expect(need.requires_participant_action).toBe(true);
    });

    it("stays unsatisfied when a required answer on a family-added entry is blank", () => {
        const need = collectionNeed(project({ [KEY]: [{ instance_key: "e1", origin: "respondent_added", values: { ec_name: "Jane" } }] }))!;
        expect(need.requires_participant_action).toBe(true);
    });

    it("counts someone Alloy already knows toward the minimum without interrogating them", () => {
        // A known contact is evidence, not a questionnaire; it is not blocked on questions the
        // family was never asked. It makes the collection VALID — the family still says when the
        // list is finished.
        const known = { emergency_contacts: [{ instance_key: "k1", origin: "existing" as const, values: { ec_name: "Jane Smith" }, item_id: "person-1" }] };
        const need = collectionNeed(project({}, known))!;
        expect(need.party_collection!.valid).toBe(true);
        expect(need.requires_participant_action).toBe(true);
    });

    it("advances only once the family has confirmed the list is finished", () => {
        const entries = [{ instance_key: "e1", origin: "respondent_added", values: { ec_name: "Jane", ec_phone: "555" } }];
        const settledKey = `${KEY}:settled`;
        const need = collectionNeed(project({ [KEY]: entries, [settledKey]: true }))!;
        expect(need.requires_participant_action).toBe(false);
        expect(need.state).toBe("confirmed");
    });
});

describe("what Alloy already knows is shown, not asked again", () => {
    const known: ParticipantPartyEntry[] = [
        { instance_key: "k1", origin: "existing", values: { ec_name: "Jane Smith", ec_phone: "555-1234" }, item_id: "person-1" },
    ];

    it("surfaces a known person first, marked as already on file", () => {
        const c = collectionNeed(project({}, { emergency_contacts: known }))!.party_collection!;
        expect(c.entries[0]!.origin).toBe("existing");
        expect(c.entries[0]!.values.ec_name).toBe("Jane Smith");
    });

    it("never shows the same canonical person twice", () => {
        /*
         * The duplicate this path exists to avoid: the session also recorded the known person, and
         * a naive concatenation would list them once from canonical truth and once from the draft.
         */
        const held = [{ instance_key: "h1", origin: "existing" as const, values: { ec_name: "Jane S." }, item_id: "person-1" }];
        const merged = mergeKnownEntries(known, held, { showKnown: true });
        expect(merged).toHaveLength(1);
        // The participant's correction wins over the stored copy, but it is still the same person.
        expect(merged[0]!.item_id).toBe("person-1");
        expect(merged[0]!.values.ec_name).toBe("Jane S.");
    });

    it("never lists one canonical person twice even when the draft holds two rows for them", () => {
        /*
         * The case the instance_key check alone does NOT catch: two stored rows both claiming the
         * same canonical person. One becomes the correction; the other must not be appended as a
         * second Jane Smith. Found by planting — the first version of this test passed with the
         * guard removed, which meant it was proving nothing.
         */
        const held = [
            { instance_key: "h1", origin: "existing" as const, values: { ec_name: "Jane S." }, item_id: "person-1" },
            { instance_key: "h2", origin: "existing" as const, values: { ec_name: "Jane Smith" }, item_id: "person-1" },
        ];
        const merged = mergeKnownEntries(known, held, { showKnown: true });
        expect(merged).toHaveLength(1);
        expect(merged[0]!.item_id).toBe("person-1");
    });

    it("hides known entries when the collection says not to show them", () => {
        expect(mergeKnownEntries(known, [], { showKnown: false })).toHaveLength(0);
    });
});

describe("conversation state converges into the Form payload once, at submit", () => {
    const entries = [
        { instance_key: "e1", origin: "existing", values: { ec_name: "Jane Smith" }, item_id: "person-1" },
        { instance_key: "e2", origin: "respondent_added", values: { ec_name: "Priya Raman", ec_phone: "555-9876" } },
    ];

    it("produces the Form's own group-row shape", () => {
        const rows = partyCollectionGroupRows(SCHEMA, { [KEY]: entries }, FD);
        expect(rows.emergency_contacts).toHaveLength(2);
        expect(rows.emergency_contacts![0]!.instance_key).toBe("e1");
        expect(rows.emergency_contacts![1]!.values.ec_name).toBe("Priya Raman");
    });

    it("carries origin forward, so a person Alloy knows is never proposed as a new one", () => {
        const rows = partyCollectionGroupRows(SCHEMA, { [KEY]: entries }, FD);
        expect(rows.emergency_contacts![0]!.collection?.origin).toBe("existing");
        expect(rows.emergency_contacts![0]!.collection?.item_id).toBe("person-1");
        expect(rows.emergency_contacts![1]!.collection?.origin).toBe("respondent_added");
    });

    it("names the entity the entries are, from the declaration", () => {
        const rows = partyCollectionGroupRows(SCHEMA, { [KEY]: entries }, FD);
        expect(rows.emergency_contacts![0]!.collection?.iteration_entity_type).toBe("person");
    });

    it("emits nothing for a collection the family never touched", () => {
        expect(partyCollectionGroupRows(SCHEMA, {}, FD)).toEqual({});
    });
});

describe("a declared collection drives the conversation's existing party offer", () => {
    /*
     * The conversation already knew how to offer a role, show who holds it, accept another person
     * and record a decline — `partyOfferPlan` and the `collect_party` turn. What it had to INFER
     * was which roles and how many, by counting the boxes an imported PDF printed.
     *
     * A normalized Form says it outright, so the declaration becomes the offer's source. This is
     * deliberately not a second repeater: it is the same PartyOffer, reaching the same apply,
     * decline and presentation code.
     */
    const parties = [
        { id: "p1", display_name: "Jane Smith", roles: ["emergency_contact"] },
        { id: "p2", display_name: "Sam Okafor", roles: ["guardian"] },
    ] as never[];

    const declared = (over: Partial<import("@/lib/enrollment/participantRuntime/partyOfferPlan").DeclaredPartyCollection> = {}) => ({
        role: "emergency_contact",
        role_label: "Emergency contact",
        max: null,
        min: 1,
        allow_add: true,
        show_known: true,
        ...over,
    });

    it("does NOT also offer a declared role — the collection card owns it", async () => {
        /*
         * MEASURED in the mounted conversation: a family finished the emergency-contact collection
         * and was then asked "Would you like to add an emergency contact?" — the same obligation
         * twice, in two different interactions. A declared collection has a card; this path is for
         * paperwork that declared nothing.
         */
        const { nextPartyOffer } = await import("@/lib/enrollment/participantRuntime/partyOfferPlan");
        const slots = [
            { slot_id: "s1", role: "emergency_contact", ordinal: 1, field_ids: ["e1"] },
            { slot_id: "s2", role: "emergency_contact", ordinal: 2, field_ids: ["e2"] },
        ] as never[];
        expect(nextPartyOffer({ parties, slots, declines: {}, declaredCollections: [declared()] })).toBeNull();
    });

    it("still offers a role the declaration does not cover", async () => {
        const { nextPartyOffer } = await import("@/lib/enrollment/participantRuntime/partyOfferPlan");
        const slots = [
            { slot_id: "s1", role: "guardian", ordinal: 1, field_ids: ["g1"] },
            { slot_id: "s2", role: "guardian", ordinal: 2, field_ids: ["g2"] },
        ] as never[];
        expect(nextPartyOffer({ parties, slots, declines: {}, declaredCollections: [declared()] })?.role).toBe("guardian");
    });

    it("leaves slot-inferred offers working for paperwork that declared nothing", async () => {
        const { nextPartyOffer } = await import("@/lib/enrollment/participantRuntime/partyOfferPlan");
        // Two printed slots, one guardian on file — capacity remains for another.
        const slots = [
            { slot_id: "s1", role: "guardian", ordinal: 1, field_ids: ["g1"] },
            { slot_id: "s2", role: "guardian", ordinal: 2, field_ids: ["g2"] },
        ] as never[];
        const offer = nextPartyOffer({ parties, slots, declines: {} })!;
        expect(offer.role).toBe("guardian");
    });

    it("reads the declaration from the schema without counting boxes or reading labels", async () => {
        const { declaredPartyCollectionsForForms } = await import("@/lib/enrollment/participantRuntime/declaredPartyCollections");
        const declaredList = declaredPartyCollectionsForForms([{ schema: SCHEMA }]);
        expect(declaredList).toHaveLength(1);
        expect(declaredList[0]!.role).toBe("emergency_contact");
        expect(declaredList[0]!.min).toBe(1);
        expect(declaredList[0]!.max).toBeNull();
    });
});

describe("known people come from the canonical relationship graph, not a Forms matcher", () => {
    /*
     * Identity is `resolveChildParties`' answer — read straight from `person_child_relationships`.
     * Nothing here decides WHO someone is; it decides only which box a known person's name and
     * phone appear in, from the entry field's own binding where the Form declared one.
     */
    const parties = [
        { person_id: "person-1", full_name: "Jane Smith", phone: "(541) 555-1234", roles: ["emergency_contact"] },
        { person_id: "person-2", full_name: "Sam Okafor", phone: null, roles: ["guardian"] },
    ];

    it("maps a known holder of the role into the collection's own questions", async () => {
        const { knownPartyEntriesFromParties } = await import("@/lib/enrollment/informationNeeds/participantPartyCollection");
        const known = knownPartyEntriesFromParties(SCHEMA, parties);
        expect(known.emergency_contacts).toHaveLength(1);
        expect(known.emergency_contacts![0]!.values.ec_name).toBe("Jane Smith");
        expect(known.emergency_contacts![0]!.values.ec_phone).toBe("(541) 555-1234");
    });

    it("carries the canonical person id, which is what stops a duplicate", async () => {
        const { knownPartyEntriesFromParties } = await import("@/lib/enrollment/informationNeeds/participantPartyCollection");
        const known = knownPartyEntriesFromParties(SCHEMA, parties);
        expect(known.emergency_contacts![0]!.item_id).toBe("person-1");
        expect(known.emergency_contacts![0]!.origin).toBe("existing");
    });

    it("does not put a guardian into the emergency-contact collection", async () => {
        const { knownPartyEntriesFromParties } = await import("@/lib/enrollment/informationNeeds/participantPartyCollection");
        const names = knownPartyEntriesFromParties(SCHEMA, parties).emergency_contacts!.map((e) => e.values.ec_name);
        expect(names).not.toContain("Sam Okafor");
    });

    it("offers nothing when nobody holds the role — the family is asked, not shown a guess", async () => {
        const { knownPartyEntriesFromParties } = await import("@/lib/enrollment/informationNeeds/participantPartyCollection");
        expect(knownPartyEntriesFromParties(SCHEMA, [])).toEqual({});
    });
});

describe("a known person is never removed from Alloy through the conversation", () => {
    it("keeps a known entry out of the removable set", async () => {
        /*
         * The Form renderer already refuses this; the conversation must refuse it for the same
         * reason. Saying someone does not belong on THIS paperwork is not an instruction to delete
         * them from the record.
         */
        const { rowIsRemovable } = await import("@/lib/forms/partyCollection");
        const group = SCHEMA.fields.find((f) => f.id === "emergency_contacts")!;
        const known = { instance_key: "known:person-1", values: {}, collection: { provider_ref: "x", origin: "existing" as const, iteration_entity_type: "person" } };
        const added = { instance_key: "e2", values: {}, collection: { provider_ref: "x", origin: "respondent_added" as const, iteration_entity_type: "person" } };
        expect(rowIsRemovable(group, known, 5)).toBe(false);
        expect(rowIsRemovable(group, added, 5)).toBe(true);
    });

    it("creates no canonical entity while the participant is still answering", async () => {
        // The whole conversation collection path is pure; the only writer is the reviewed commit.
        const { readFileSync } = await import("node:fs");
        const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");
        const WRITERS = /createAdminClient|executeRelationshipAction|\.insert\(/;
        for (const f of [
            "lib/enrollment/informationNeeds/participantPartyCollection.ts",
            "lib/enrollment/participantRuntime/declaredPartyCollections.ts",
        ]) {
            expect(read(f), `${f} can write canonical data from the participant path`).not.toMatch(WRITERS);
        }
    });
});


describe("a sibling collection has no relationship role, and still renders", () => {
    /*
     * Children in a household are collected as `add_child` with subject `child` and NO role — the
     * relationship is household membership, not a role on this child. The declaration itself is
     * sufficient authority to render the collection; routing it through the role-only party-offer
     * path would make siblings disappear from the conversation entirely.
     *
     * Found by planting: gating the projection on `party.role` left every existing test green,
     * because they all describe emergency contacts.
     */
    const SIBLINGS = {
        schema_version: 1,
        title: "Enrolment",
        fields: [
            {
                id: "household_children",
                type: "group",
                label: "Children in your household",
                required: false,
                repeat: { min: 0 },
                party_collection: { action_key: "add_child", subject: "child", show_known: true, allow_add: true },
                fields: [
                    { id: "sib_name", type: "text", label: "Full name", required: true },
                    { id: "sib_dob", type: "date", label: "Date of birth", required: false },
                ],
            },
        ],
        sections: [{ id: "s1", title: "Household", field_ids: ["household_children"] }],
    } as unknown as FormSchemaV1;

    const SIB_FORM = { requirement_id: "r1", form_definition_id: FD, form_definition_version_id: "v1", session_item_id: "si1", schema: SIBLINGS } as never;

    const projectSiblings = (sharedValues: Record<string, unknown> = {}, known?: Record<string, ParticipantPartyEntry[]>) =>
        projectEnrollmentInformationNeeds({
            forms: [SIB_FORM], subjectId: CHILD, sharedValues, confirmations: {} as never,
            ...(known ? { knownPartyEntries: known } : {}),
        });

    it("projects the collection even though no role is declared", () => {
        const need = projectSiblings().find((n) => n.party_collection?.group_field_id === "household_children");
        expect(need, "a roleless sibling collection did not reach the conversation").toBeTruthy();
        expect(need!.party_collection!.subject).toBe("child");
        expect(need!.party_collection!.role).toBeNull();
    });

    it("still does not ask its child fields as loose questions", () => {
        expect(projectSiblings().some((n) => n.occurrences.some((o) => o.form_field_id === "sib_name"))).toBe(false);
    });

    it("shows a known sibling without asking the family to retype them", () => {
        const known = { household_children: [{ instance_key: "known:cm-2", origin: "existing" as const, values: { sib_name: "Emma Smith" }, item_id: "cm-2" }] };
        const c = projectSiblings({}, known).find((n) => n.party_collection)!.party_collection!;
        expect(c.entries).toHaveLength(1);
        expect(c.entries[0]!.origin).toBe("existing");
        expect(c.entries[0]!.item_id).toBe("cm-2");
    });

    it("keeps a known sibling and a newly added child as two distinct entries", () => {
        const known = { household_children: [{ instance_key: "known:cm-2", origin: "existing" as const, values: { sib_name: "Emma Smith" }, item_id: "cm-2" }] };
        const held = { [partyCollectionStateKey(FD, "household_children")]: [{ instance_key: "n1", origin: "respondent_added", values: { sib_name: "Noah Smith" } }] };
        const c = projectSiblings(held, known).find((n) => n.party_collection)!.party_collection!;
        expect(c.entries.map((e) => e.values.sib_name)).toEqual(["Emma Smith", "Noah Smith"]);
        expect(c.entries.map((e) => e.origin)).toEqual(["existing", "respondent_added"]);
    });

    it("converges to group rows with the child entity, not a person", () => {
        const held = { [partyCollectionStateKey(FD, "household_children")]: [{ instance_key: "n1", origin: "respondent_added", values: { sib_name: "Noah Smith" } }] };
        const rows = partyCollectionGroupRows(SIBLINGS, held, FD);
        expect(rows.household_children![0]!.collection?.iteration_entity_type).toBe("customer_member");
    });

    it("is not offered through the role-based party path, because it names no role", async () => {
        const { declaredPartyCollectionsForForms } = await import("@/lib/enrollment/participantRuntime/declaredPartyCollections");
        expect(declaredPartyCollectionsForForms([{ schema: SIBLINGS }])).toHaveLength(0);
    });
});
