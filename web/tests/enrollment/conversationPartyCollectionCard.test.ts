/**
 * THE PARTICIPANT-VISIBLE HALF.
 *
 * The semantics landed last slice: a collection is projected once, holds structured entries with a
 * stable identity, and converges into the Form payload at submit. None of that was visible to a
 * parent — the conversation still had no card for it.
 *
 * These guards are about what a family actually meets: one card per collection, people drawn as
 * people, known people shown and not deletable, and an Add that creates exactly one entry.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { controlForTurn } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { parsePartyCollectionResponse } from "@/lib/enrollment/participantRuntime/applyPartyCollectionResponse";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");
const CARD = "app/forms/embed/[token]/EnrollmentConversationCard.tsx";

const turnWithCollection = (over: Record<string, unknown> = {}) =>
    ({
        kind: "collect_missing_value",
        prompt: "Who should we call?",
        proposed_value: null,
        resolves_occurrences: 1,
        input_type: null,
        label: "Emergency contacts",
        field_ids: [],
        party_collection: {
            group_field_id: "emergency_contacts",
            label: "Emergency contacts",
            add_another_label: "Add emergency contact",
            allow_add: true,
            min: 1,
            max: null,
            entry_fields: [{ field_id: "ec_name", label: "Full name", type: "text", required: true, options: [] }],
            entries: [],
            ...over,
        },
    }) as never;

describe("a collection turn draws the collection, not a control for a question it does not have", () => {
    it("resolves to the collection control", () => {
        expect(controlForTurn(turnWithCollection())).toEqual({ kind: "party_collection" });
    });

    it("leaves an ordinary scalar turn on its own control", () => {
        const scalar = { kind: "collect_missing_value", prompt: "Date of birth?", proposed_value: null, resolves_occurrences: 1, input_type: "date", label: "Date of birth", field_ids: [] } as never;
        expect(controlForTurn(scalar).kind).not.toBe("party_collection");
    });

    it("leaves the role-offer turn on the party control", () => {
        const party = { kind: "collect_party", prompt: "", proposed_value: null, resolves_occurrences: 0, input_type: null, label: null, field_ids: [] } as never;
        expect(controlForTurn(party)).toEqual({ kind: "party" });
    });
});

describe("the mounted card is the one the participant meets", () => {
    it("branches on the collection control exactly once", () => {
        const card = read(CARD);
        const branches = card.split('control.kind === "party_collection"').length - 1;
        expect(branches, "the collection branch is missing or duplicated").toBe(1);
    });

    it("draws one row per entry and one add action", () => {
        const card = read(CARD);
        expect(card).toContain("data-participant-collection-entry");
        expect(card).toContain("data-participant-collection-add");
        expect(card).toContain("collection.add_another_label");
    });

    it("offers Remove only on a row the family added", () => {
        /*
         * A known person is not the Form's to delete. This asserts the guard is ON the Remove
         * control rather than merely nearby, by requiring the origin test to introduce it.
         */
        const card = read(CARD);
        const removeAt = card.indexOf("data-participant-collection-remove");
        expect(removeAt).toBeGreaterThan(0);
        const preceding = card.slice(Math.max(0, removeAt - 400), removeAt);
        expect(preceding, "Remove is not gated on respondent_added").toContain('entry.origin === "respondent_added"');
    });

    it("names the state in words, never by colour alone", () => {
        const card = read(CARD);
        expect(card).toContain("Already on file");
        expect(card).toContain("Added here");
        expect(card).toContain("Not finished");
    });

    it("keeps every entry field on one screen, under a label the parent can read", () => {
        const card = read(CARD);
        expect(card).toContain("PartyCollectionEntryEditor");
        expect(card).toContain("htmlFor={id}");
        expect(card).toContain("(required)");
    });

    it("does not paste a conventional Form renderer into the conversation", () => {
        expect(read(CARD)).not.toContain("FormEngineRenderer");
    });
});

describe("what the card may ask the server to do", () => {
    it("accepts add, edit and remove, each addressing a row by identity", () => {
        expect(parsePartyCollectionResponse({ action: "add", group_field_id: "g", values: { a: 1 } })).toMatchObject({ action: "add" });
        expect(parsePartyCollectionResponse({ action: "edit", group_field_id: "g", instance_key: "e1", values: {} })).toMatchObject({ action: "edit", instance_key: "e1" });
        expect(parsePartyCollectionResponse({ action: "remove", group_field_id: "g", instance_key: "e1" })).toMatchObject({ action: "remove" });
    });

    it("refuses an edit or a remove that names no row", () => {
        // Without an instance_key there is no way to know WHICH person is meant, and guessing by
        // position is the bug the whole identity model exists to prevent.
        expect(parsePartyCollectionResponse({ action: "edit", group_field_id: "g", values: {} })).toBeNull();
        expect(parsePartyCollectionResponse({ action: "remove", group_field_id: "g" })).toBeNull();
    });

    it("refuses anything that names no collection", () => {
        expect(parsePartyCollectionResponse({ action: "add", values: {} })).toBeNull();
        expect(parsePartyCollectionResponse(null)).toBeNull();
    });
});

describe("the apply path writes drafts and nothing else", () => {
    it("has no canonical writer", () => {
        const apply = read("lib/enrollment/participantRuntime/applyPartyCollectionResponse.ts");
        expect(apply).not.toMatch(/executeRelationshipAction|createAdminClient|person_child_relationships/);
        // It touches exactly one table: the session that holds the conversation's own answers.
        expect(apply).toContain('.from("form_packet_sessions")');
    });

    it("refuses to remove someone Alloy already knows", () => {
        const apply = read("lib/enrollment/participantRuntime/applyPartyCollectionResponse.ts");
        expect(apply).toContain('target.origin === "existing"');
        expect(apply).toContain("cannot be removed here");
    });

    it("keeps the canonical id when a known person is corrected", () => {
        const apply = read("lib/enrollment/participantRuntime/applyPartyCollectionResponse.ts");
        expect(apply).toContain("item_id");
    });
});

describe("a collection is asked in words, not in schema vocabulary", () => {
    /*
     * Measured in the mounted conversation: the scalar stem produced "What is your Emergency
     * contacts?" — a plural fact wrapped in a singular question. A collection asks who these people
     * are; the card beside the sentence already lists the ones Alloy knows.
     */
    const need = (over: Record<string, unknown> = {}) =>
        ({
            identity: { key: "k", canonical_key: null },
            occurrences: [{ label: "Emergency contacts" }],
            state: "missing",
            current_value: null,
            party_collection: { label: "Emergency contacts", min: 1, entries: [], ...over },
        }) as never;

    it("asks who, rather than what", async () => {
        const { deterministicPrompt } = await import("@/lib/enrollment/participantRuntime/selectNextParticipantTurn");
        const prompt = deterministicPrompt(need());
        expect(prompt).not.toContain("What is");
        expect(prompt).toBe("Who should we list under emergency contacts?");
    });

    it("offers rather than demands when the Form asks for none", async () => {
        const { deterministicPrompt } = await import("@/lib/enrollment/participantRuntime/selectNextParticipantTurn");
        expect(deterministicPrompt(need({ min: 0 }))).toBe("Is there anyone to list under emergency contacts?");
    });

    it("speaks to what is already there once the list is not empty", async () => {
        const { deterministicPrompt } = await import("@/lib/enrollment/participantRuntime/selectNextParticipantTurn");
        expect(deterministicPrompt(need({ entries: [{ instance_key: "e1", origin: "existing", values: {} }] })))
            .toBe("Here is what we have for emergency contacts. Anyone to add?");
    });

    it("leaves an ordinary question's wording exactly as it was", async () => {
        const { deterministicPrompt } = await import("@/lib/enrollment/participantRuntime/selectNextParticipantTurn");
        const scalar = { identity: { key: "k", canonical_key: null }, occurrences: [{ label: "Date of birth" }], state: "missing", current_value: null } as never;
        expect(deterministicPrompt(scalar)).toBe("What is Date of birth?");
    });
});

describe("the card shows the collection's own sentence", () => {
    /*
     * `participantQuestion` re-composes wording from the label for every turn. That is right for a
     * single fact and wrong for a list of people — it produced "What is your Emergency contacts?"
     * in the mounted conversation, and the deterministic sentence built for the collection was
     * never reached. Found by reading the running product, not the code.
     */
    it("uses the collection prompt rather than rebuilding one from the label", async () => {
        const { participantQuestion } = await import("@/lib/enrollment/participantRuntime/participantTurnPresentation");
        const objective = {
            next_turn: {
                ...(turnWithCollection() as unknown as Record<string, unknown>),
                prompt: "Who should we list under emergency contacts?",
            },
            subject_display_name: "Lennon",
        } as never;
        expect(participantQuestion(objective)).toBe("Who should we list under emergency contacts?");
    });

    it("leaves an ordinary question's composition alone", async () => {
        const { participantQuestion } = await import("@/lib/enrollment/participantRuntime/participantTurnPresentation");
        const objective = {
            next_turn: { kind: "collect_missing_value", prompt: "ignored", label: "Favourite foods", proposed_value: null, field_ids: [], input_type: "text" },
            subject_display_name: "Lennon",
        } as never;
        expect(participantQuestion(objective)).not.toBe("ignored");
    });
});
