/**
 * "Nothing to add" is what the parent DID, not what they said their child's middle name is.
 *
 * The only way the runtime could stop re-asking an optional question was to store the shortcut's own
 * label as the answer, so a signed Oregon health form read "Middle name: Nothing to add".
 */

import { describe, expect, it } from "vitest";

import {
    buildEnrollmentNeedDeclinePatch,
    declineSatisfiesAbsence,
    ENROLLMENT_DECLINES_METADATA_KEY,
    readEnrollmentNeedDeclines,
} from "@/lib/enrollment/informationNeeds/enrollmentSessionDeclines";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { selectNextParticipantTurn } from "@/lib/enrollment/participantRuntime/selectNextParticipantTurn";
import { disposeParticipantCandidate } from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

const AT = "2026-08-27T10:00:00.000Z";

describe("the decline store", () => {
    it("round-trips through the session's own metadata without disturbing anything else", () => {
        const patch = buildEnrollmentNeedDeclinePatch({
            metadata: { some_other_concern: { keep: true } },
            needKey: "child_middle_name",
            declinedAtIso: AT,
        });
        expect(patch.some_other_concern).toEqual({ keep: true });
        expect(readEnrollmentNeedDeclines(patch)).toEqual({ child_middle_name: { declined_at: AT } });
    });

    it("fails closed on a malformed entry — the question simply gets asked again", () => {
        expect(readEnrollmentNeedDeclines({ [ENROLLMENT_DECLINES_METADATA_KEY]: { k: {} } })).toEqual({});
        expect(readEnrollmentNeedDeclines({ [ENROLLMENT_DECLINES_METADATA_KEY]: "nope" })).toEqual({});
        expect(readEnrollmentNeedDeclines(null)).toEqual({});
    });

    it("stops settling the need the moment a value arrives", () => {
        // The mirror image of a confirmation, which is invalidated by a value CHANGING. A decline is
        // a statement about absence, so it is invalidated by presence.
        const decline = { declined_at: AT };
        expect(declineSatisfiesAbsence(decline, false)).toBe(true);
        expect(declineSatisfiesAbsence(decline, true)).toBe(false);
        expect(declineSatisfiesAbsence(undefined, false)).toBe(false);
    });
});

const schemaWith = (required: boolean) =>
    ({
        requirement_id: "r1",
        form_definition_id: "f1",
        form_definition_version_id: "v1",
        session_item_id: "s1",
        schema: {
            fields: [{ id: "field_3", type: "text", label: "Middle Name", required }],
            sections: [],
        },
    }) as never;

function needsWith(required: boolean, declines: Record<string, { declined_at: string }>) {
    return projectEnrollmentInformationNeeds({
        forms: [schemaWith(required)],
        subjectId: null,
        sharedValues: {},
        confirmations: {} as never,
        declines,
    });
}

describe("an optional question the parent left blank", () => {
    it("settles without a value, and is not asked again", () => {
        const asked = needsWith(false, {});
        expect(asked[0].state).toBe("missing");
        const key = asked[0].identity.key;

        const settled = needsWith(false, { [key]: { declined_at: AT } });
        expect(settled[0].state).toBe("declined");
        expect(settled[0].has_value).toBe(false);
        expect(settled[0].current_value).toBeNull();
        expect(settled[0].requires_participant_action).toBe(false);

        // The selector offers `missing` and `known_requires_confirmation`; a declined need is neither.
        const turn = selectNextParticipantTurn({
            needs: { needs: settled } as never,
            progress: { requirements: [] } as never,
        });
        expect(turn.kind).not.toBe("collect_missing_value");
    });

    it("never becomes a stored value", () => {
        const key = needsWith(false, {})[0].identity.key;
        const settled = needsWith(false, { [key]: { declined_at: AT } });
        /*
         * Whole shortcut labels only.
         *
         * A bare /None/i matches "none" inside `"value_source":"none"` — the same mistake as
         * matching "hib" inside "prohibiting". What must not appear is the button's own text.
         */
        const serialized = JSON.stringify(settled[0]);
        for (const label of ["Nothing to add", "No known allergies", "Yes — I'll tell you"]) {
            expect(serialized).not.toContain(label);
        }
        expect(settled[0].current_value).toBeNull();
    });

    it("is ignored where the Form insists on an answer", () => {
        // Failing in the safe direction: the question comes back rather than being waved away.
        const key = needsWith(true, {})[0].identity.key;
        const required = needsWith(true, { [key]: { declined_at: AT } });
        expect(required[0].state).toBe("missing");
        expect(required[0].requires_participant_action).toBe(true);
    });
});

describe("who may decline", () => {
    const turn = (kind: ParticipantTurn["kind"], optional: boolean): ParticipantTurn =>
        ({
            kind,
            prompt: "",
            proposed_value: kind === "confirm_known_value" ? "Anne" : null,
            resolves_occurrences: 1,
            need: { optional, occurrences: [{ field_type: "text", options: [] }] },
        }) as never;

    it("accepts a decline on an optional collect turn", () => {
        expect(
            disposeParticipantCandidate({ turn: turn("collect_missing_value", true), candidate: { kind: "declined" }, field: null }),
        ).toEqual({ action: "decline_value" });
    });

    it("refuses to leave a required answer blank", () => {
        expect(
            disposeParticipantCandidate({ turn: turn("collect_missing_value", false), candidate: { kind: "declined" }, field: null }).action,
        ).toBe("refused");
    });

    it("refuses a decline where there is nothing to leave blank", () => {
        expect(
            disposeParticipantCandidate({ turn: turn("confirm_known_value", true), candidate: { kind: "declined" }, field: null }).action,
        ).toBe("refused");
    });
});
