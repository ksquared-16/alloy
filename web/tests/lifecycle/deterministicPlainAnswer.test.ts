/**
 * "Enrollment must remain usable when the provider is disabled, unavailable, timing out or refused."
 *
 * That was the deterministic interpreter's first paragraph and it was not true: every free-text need
 * reached the provider or nowhere. A parent asked "What is your name?" typed their name, this layer
 * declined to read it, D-101 does not admit `guardian_name`, and the runtime replied "Sorry — I
 * didn't catch that" forever. There was no way past that question on any path.
 */

import { describe, expect, it } from "vitest";

import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

const occurrence = (field_type: string, options: string[] = []) =>
    ({
        requirement_id: "r",
        form_definition_id: "f",
        form_definition_version_id: "v",
        session_item_id: "s",
        form_field_id: "field_5",
        label: "Parents Or Guardians Names",
        required: true,
        section_title: null,
        field_type,
        options,
    }) as never;

const turn = (kind: ParticipantTurn["kind"], occurrences: unknown[], proposed: unknown = null): ParticipantTurn =>
    ({
        kind,
        prompt: "What is your name?",
        proposed_value: proposed,
        resolves_occurrences: occurrences.length,
        need: { occurrences } as never,
    }) as ParticipantTurn;

describe("a plain answer to a plain question", () => {
    it("takes the words whole for a free-text collect turn", () => {
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn("collect_missing_value", [occurrence("text")]),
                text: "Alex Sigwalk",
            }),
        ).toEqual({ kind: "corrected_value", value: "Alex Sigwalk" });
    });

    it("preserves what the parent actually typed, casing and all", () => {
        const r = interpretParticipantResponseDeterministically({
            turn: turn("collect_missing_value", [occurrence("textarea")]),
            text: "  Bend Montessori, Room 3  ",
        });
        expect(r).toEqual({ kind: "corrected_value", value: "Bend Montessori, Room 3" });
    });

    it("still refuses to parse prose into a shape", () => {
        // A date need keeps its own control. "actually she was born 5/6/21" is not admitted here.
        for (const type of ["date", "number", "boolean", "signature", "file_ref"]) {
            expect(
                interpretParticipantResponseDeterministically({
                    turn: turn("collect_missing_value", [occurrence(type)]),
                    text: "actually she was born 5/6/21",
                }),
            ).toEqual({ kind: "clarification_needed" });
        }
    });

    it("refuses when a choice is on offer — words are not one of the options", () => {
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn("collect_missing_value", [occurrence("text", ["Yes", "No"])]),
                text: "probably",
            }),
        ).toEqual({ kind: "clarification_needed" });
    });

    it("refuses when ONE of several destinations needs a shape", () => {
        // A shape that fits one control is not an answer for the others.
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn("collect_missing_value", [occurrence("text"), occurrence("date")]),
                text: "Alex Sigwalk",
            }),
        ).toEqual({ kind: "clarification_needed" });
    });

    it("never turns a confirmation into a value", () => {
        // At a collect turn there is nothing to affirm, so these are conversation, not answers.
        for (const words of ["yes", "correct", "no", "nope"]) {
            expect(
                interpretParticipantResponseDeterministically({
                    turn: turn("collect_missing_value", [occurrence("text")]),
                    text: words,
                }),
            ).toEqual({ kind: "clarification_needed" });
        }
    });

    it("still hears I don't know as unresolved rather than as a name", () => {
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn("collect_missing_value", [occurrence("text")]),
                text: "I don't know",
            }),
        ).toEqual({ kind: "unresolved" });
    });

    it("leaves a confirm turn exactly as it was", () => {
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn("confirm_known_value", [occurrence("text")], "Sigwalk"),
                text: "Alex Sigwalk",
            }),
        ).toEqual({ kind: "clarification_needed" });
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn("confirm_known_value", [occurrence("text")], "Sigwalk"),
                text: "yes",
            }),
        ).toEqual({ kind: "confirmed" });
    });
});
