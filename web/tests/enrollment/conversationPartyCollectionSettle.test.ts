/**
 * SATISFYING THE MINIMUM IS NOT THE SAME AS BEING FINISHED.
 *
 * MEASURED, in the mounted conversation: a family added one emergency contact and the collection
 * vanished. The minimum was met, the need went `confirmed`, and the turn advanced before anyone
 * could add a second. A list of people is open-ended by nature and only the family knows when it
 * ends — so validity (the Form's requirement) and finality (their decision) are two states, and
 * the conversation advances only when both hold.
 */

import { describe, expect, it } from "vitest";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import {
    partyCollectionComplete,
    partyCollectionSettled,
    partyCollectionSettledKey,
    partyCollectionStateKey,
    partyCollectionValid,
    readPartySettled,
    type ParticipantPartyCollection,
    type ParticipantPartyEntry,
} from "@/lib/enrollment/informationNeeds/participantPartyCollection";
import { parsePartyCollectionResponse } from "@/lib/enrollment/participantRuntime/applyPartyCollectionResponse";

const FD = "fd-1";
const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KEY = partyCollectionStateKey(FD, "emergency_contacts");
const SETTLED = partyCollectionSettledKey(FD, "emergency_contacts");

const schemaWith = (repeat: { min: number; max?: number }, allowAdd = true) =>
    ({
        schema_version: 1,
        title: "Enrolment",
        fields: [
            {
                id: "emergency_contacts", type: "group", label: "Emergency contacts", required: false,
                repeat,
                party_collection: { action_key: "add_emergency_contact", subject: "person", role: "emergency_contact", scope: "this_child", show_known: true, allow_add: allowAdd },
                fields: [
                    { id: "ec_name", type: "text", label: "Full name", required: true },
                    { id: "ec_phone", type: "text", label: "Phone", required: true },
                ],
            },
        ],
        sections: [{ id: "s1", title: "Family", field_ids: ["emergency_contacts"] }],
    }) as unknown as FormSchemaV1;

const person = (k: string, name = "Someone", phone = "555"): ParticipantPartyEntry =>
    ({ instance_key: k, origin: "respondent_added", values: { ec_name: name, ec_phone: phone } });
const knownPerson = (k: string, id: string): ParticipantPartyEntry =>
    ({ instance_key: k, origin: "existing", item_id: id, values: { ec_name: "Jane Smith" } });

function project(opts: {
    repeat?: { min: number; max?: number };
    allowAdd?: boolean;
    entries?: ParticipantPartyEntry[];
    settled?: boolean;
    known?: ParticipantPartyEntry[];
}) {
    const shared: Record<string, unknown> = {};
    if (opts.entries) shared[KEY] = opts.entries;
    if (opts.settled !== undefined) shared[SETTLED] = opts.settled;
    const needs = projectEnrollmentInformationNeeds({
        forms: [{ requirement_id: "r1", form_definition_id: FD, form_definition_version_id: "v1", session_item_id: "si1", schema: schemaWith(opts.repeat ?? { min: 1 }, opts.allowAdd) } as never],
        subjectId: CHILD,
        sharedValues: shared,
        confirmations: {} as never,
        ...(opts.known ? { knownPartyEntries: { emergency_contacts: opts.known } } : {}),
    });
    return needs.find((n) => n.party_collection)!;
}

describe("the eight completion cases", () => {
    it("CASE 1 — below the minimum: not valid, still the participant's work", () => {
        const n = project({ entries: [] });
        expect(n.party_collection!.valid).toBe(false);
        expect(n.requires_participant_action).toBe(true);
    });

    it("CASE 2 — minimum met, unsettled: valid, and the collection STAYS ACTIVE", () => {
        /* THE DEFECT, IN ONE ASSERTION. This used to be `false` and the card disappeared. */
        const n = project({ entries: [person("e1")] });
        expect(n.party_collection!.valid).toBe(true);
        expect(n.party_collection!.settled).toBe(false);
        expect(n.requires_participant_action, "the collection auto-advanced at its minimum").toBe(true);
    });

    it("CASE 3 — above the minimum, unsettled: still active", () => {
        const n = project({ entries: [person("e1"), person("e2")] });
        expect(n.requires_participant_action).toBe(true);
    });

    it("CASE 4 — above the minimum and settled: the conversation may advance", () => {
        const n = project({ entries: [person("e1"), person("e2")], settled: true });
        expect(n.requires_participant_action).toBe(false);
        expect(n.state).toBe("confirmed");
    });

    it("CASE 5 — minimum 2 with only one person: not valid", () => {
        const n = project({ repeat: { min: 2 }, known: [knownPerson("k1", "person-1")] });
        expect(n.party_collection!.valid).toBe(false);
    });

    it("CASE 6 — minimum 2, one known plus one added, unsettled: valid but active", () => {
        const n = project({ repeat: { min: 2 }, known: [knownPerson("k1", "person-1")], entries: [person("e1")] });
        expect(n.party_collection!.valid).toBe(true);
        expect(n.requires_participant_action).toBe(true);
    });

    it("CASE 7 — minimum 2, one known plus one added, settled: may advance", () => {
        const n = project({ repeat: { min: 2 }, known: [knownPerson("k1", "person-1")], entries: [person("e1")], settled: true });
        expect(n.requires_participant_action).toBe(false);
    });

    it("CASE 8 — at the maximum: nothing left to add, so nothing left to decide", () => {
        /*
         * The one place finishing is inferred rather than asked. The Form says no more may be
         * added and the list is full, so the collection is finished by its own terms.
         */
        const n = project({ repeat: { min: 1, max: 2 }, entries: [person("e1"), person("e2")] });
        expect(n.requires_participant_action).toBe(false);
    });
});

describe("validity and finality are not the same question", () => {
    const collection = (over: Partial<ParticipantPartyCollection> = {}): ParticipantPartyCollection =>
        ({
            group_field_id: "g", label: "Emergency contacts", action_key: "add_emergency_contact",
            subject: "person", role: "emergency_contact", scope: "this_child",
            show_known: true, allow_add: true, add_another_label: "Add emergency contact",
            min: 1, max: null,
            entry_fields: [{ field_id: "ec_name", label: "Full name", type: "text", required: true }],
            entries: [{ instance_key: "e1", origin: "respondent_added", values: { ec_name: "Dana" } }],
            ...over,
        }) as ParticipantPartyCollection;

    it("never finishes an open-ended list on the family's behalf", () => {
        expect(partyCollectionValid(collection())).toBe(true);
        expect(partyCollectionSettled(collection(), false)).toBe(false);
        expect(partyCollectionComplete(collection(), false)).toBe(false);
    });

    it("refuses to be settled while the minimum is unmet, however the marker was written", () => {
        // A stale or forged marker cannot finish a collection the Form would reject.
        const short = collection({ min: 2 });
        expect(partyCollectionSettled(short, true)).toBe(false);
        expect(partyCollectionComplete(short, true)).toBe(false);
    });

    it("finishes a collection the Form closed to additions", () => {
        expect(partyCollectionSettled(collection({ allow_add: false }), false)).toBe(true);
    });
});

describe("the family's decision survives, and is reopened when they change it", () => {
    it("reads the marker back after a resume", () => {
        expect(readPartySettled({ [SETTLED]: true }, FD, "emergency_contacts")).toBe(true);
        expect(readPartySettled({}, FD, "emergency_contacts")).toBe(false);
    });

    it("does not silently turn valid-but-unsettled into finished on resume", () => {
        /*
         * The failure this guards is quiet: a resumed session that treats "enough people" as
         * "they said they were done" advances past a question nobody answered.
         */
        const n = project({ entries: [person("e1")], settled: undefined });
        expect(n.party_collection!.settled).toBe(false);
        expect(n.requires_participant_action).toBe(true);
    });

    it("clears the marker whenever the list itself changes", async () => {
        const apply = await import("node:fs").then((fs) =>
            fs.readFileSync(new URL("../../lib/enrollment/participantRuntime/applyPartyCollectionResponse.ts", import.meta.url).pathname, "utf8"),
        );
        // add / edit / remove all write through one place, and that place reopens the collection.
        expect(apply).toContain("[settledKey]: false");
    });

    it("accepts a settle action addressed to one collection", () => {
        expect(parsePartyCollectionResponse({ action: "settle", group_field_id: "emergency_contacts" }))
            .toEqual({ action: "settle", group_field_id: "emergency_contacts" });
        expect(parsePartyCollectionResponse({ action: "settle" })).toBeNull();
    });
});

describe("the card offers finishing only when there is something to finish", () => {
    const read = (rel: string) => require("node:fs").readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8") as string;

    it("gates the action on validity, not on the raw entry count", () => {
        const card = read("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        const at = card.indexOf("data-participant-collection-done");
        expect(at).toBeGreaterThan(0);
        expect(card.slice(Math.max(0, at - 400), at)).toContain("collection.valid");
    });

    it("sends the settle action rather than a bare yes", () => {
        const card = read("app/forms/embed/[token]/EnrollmentConversationCard.tsx");
        const at = card.indexOf("data-participant-collection-done");
        expect(card.slice(at, at + 400)).toContain('action: "settle"');
    });
});
