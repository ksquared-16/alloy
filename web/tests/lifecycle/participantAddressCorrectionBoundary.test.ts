/**
 * "it's Bend" — and why the runtime is right to refuse it.
 *
 * The reported failure looked like a gap in conversational understanding. It is a boundary, and the
 * boundary is correct: the tenant's packet binds ONE address datum, `customer:address`, while D-101
 * admits the COMPONENTIZED address domains. There is therefore no `city` need for "Bend" to be a
 * candidate correction to — a candidate for this need is a candidate for the WHOLE address, and
 * accepting it would replace "418 NE Hancock St, Portland, OR 97212" with "Bend".
 *
 * These assert the boundary so it cannot be widened by accident, and assert that refusing is no
 * longer a dead end.
 */

import { describe, expect, it } from "vitest";

import {
    D101_ELIGIBLE_FIELD_KEYS,
    turnIsEligibleForProviderInterpretation,
} from "@/lib/enrollment/participantRuntime/turnInterpretationEligibility";
import {
    PARTICIPANT_CLARIFICATION_MESSAGE,
    participantUnreadableAnswerMessage,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

const turnFor = (canonicalKey: string) =>
    ({
        kind: "confirm_known_value",
        prompt: "",
        proposed_value: "418 NE Hancock St, Portland, OR 97212",
        resolves_occurrences: 7,
        need: {
            identity: {
                key: `household:-:${canonicalKey}`,
                canonical_key: canonicalKey,
                shared_value_key: canonicalKey,
                artifact_specific: false,
            },
            occurrences: [{ field_type: "text", options: [] }],
        },
    }) as never;

describe("the D-101 address boundary", () => {
    it("does NOT admit the whole-address datum the packet actually binds", () => {
        /*
         * The finding, stated as a test. Widening this is a Director decision, and a future edit
         * that wants to must delete this assertion rather than quietly add a key.
         */
        expect(D101_ELIGIBLE_FIELD_KEYS.has("customer:address")).toBe(false);
        const verdict = turnIsEligibleForProviderInterpretation(turnFor("customer:address"));
        expect(verdict.eligible).toBe(false);
        if (verdict.eligible) return;
        expect(verdict.reason).toContain("customer:address");
        expect(verdict.reason).toContain("not on the D-101 admitted list");
    });

    it("admits the COMPONENTIZED address domains, which this tenant does not bind", () => {
        // The list anticipates an address split into fields. Where a tenant binds it that way,
        // "it's Bend" has a `city` need to be a candidate for and the gate opens on its own.
        for (const key of ["customer:city", "customer:address_line1", "customer:postal_code"]) {
            expect(D101_ELIGIBLE_FIELD_KEYS.has(key), key).toBe(true);
            expect(turnIsEligibleForProviderInterpretation(turnFor(key)).eligible, key).toBe(true);
        }
    });
});

describe("refusing is not a dead end", () => {
    const objectiveWith = (editor: unknown) =>
        ({ next_turn: { editor } }) as unknown as ParticipantObjectiveWire;

    it("says what it CAN do for an address, rather than only apologising", () => {
        const message = participantUnreadableAnswerMessage(
            objectiveWith({ kind: "address", parts: { street: "", city: "", state: "", postal: "" } }),
        );
        expect(message).toContain("change just the part that's wrong");
        expect(message).not.toBe(PARTICIPANT_CLARIFICATION_MESSAGE);
    });

    it("points at the field for any other structured fact", () => {
        expect(participantUnreadableAnswerMessage(objectiveWith({ kind: "value", inputType: "email" }))).toContain(
            "opened the field below",
        );
    });

    it("keeps the plain wording where there is nothing to open", () => {
        expect(participantUnreadableAnswerMessage(objectiveWith(null))).toBe(PARTICIPANT_CLARIFICATION_MESSAGE);
    });
});
