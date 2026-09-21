import { describe, expect, it } from "vitest";

import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import { semanticEditorFor } from "@/lib/enrollment/participantRuntime/semanticValueEditor";
import { valueControlForTurn } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

/**
 * AN AUTHORED BOOLEAN STAYS A BOOLEAN ON EVERY PATH.
 *
 * Kelly met "Does Toureeb have siblings?" as a text box with Save/Cancel. That specimen turned out
 * to be pinned to Admissions v4, where the field genuinely IS text — the runtime was faithful to
 * the form it was given. Tracing every OTHER path for an authored boolean is what found the real
 * defects, and each of them is asserted here.
 */

const boolTurn = (over: Partial<ParticipantTurn> = {}): ParticipantTurn =>
    ({
        kind: "collect_missing_value",
        need: {
            identity: { canonical_key: null },
            occurrences: [{ form_field_id: "field_43", field_type: "boolean", options: [] }],
        },
        ...over,
    }) as unknown as ParticipantTurn;

describe("the words yes and no answer a yes/no question", () => {
    for (const [said, expected] of [
        ["yes", true], ["Yes", true], ["yeah", true], ["yep", true],
        ["no", false], ["nope", false], ["Nah", false],
    ] as const) {
        it(`takes "${said}" as ${expected}`, () => {
            const out = interpretParticipantResponseDeterministically({ text: said, turn: boolTurn() } as never);
            expect(out).toEqual({ kind: "corrected_value", value: expected });
        });
    }

    it("still refuses words that are not an answer", () => {
        const out = interpretParticipantResponseDeterministically({ text: "sometimes on weekends", turn: boolTurn() } as never);
        expect(out.kind).toBe("clarification_needed");
    });

    it("still treats a question as a question, never as an answer", () => {
        const out = interpretParticipantResponseDeterministically({ text: "what do I still need to do?", turn: boolTurn() } as never);
        expect(out.kind).toBe("question");
    });

    it("does not take a bare yes as the answer to a FREE TEXT question", () => {
        const textTurn = boolTurn({
            need: {
                identity: { canonical_key: null },
                occurrences: [{ form_field_id: "field_39", field_type: "long_text", options: [] }],
            },
        } as never);
        const out = interpretParticipantResponseDeterministically({ text: "yes", turn: textTurn } as never);
        // "yes" is an affirmation, not prose about a child's developmental history.
        expect(out.kind).toBe("clarification_needed");
    });

    it("refuses a yes/no word when the need also fills a destination that is not boolean", () => {
        const mixed = boolTurn({
            need: {
                identity: { canonical_key: null },
                occurrences: [
                    { form_field_id: "a", field_type: "boolean", options: [] },
                    { form_field_id: "b", field_type: "text", options: [] },
                ],
            },
        } as never);
        expect(interpretParticipantResponseDeterministically({ text: "yes", turn: mixed } as never).kind).toBe(
            "clarification_needed",
        );
    });
});

describe("every control offered for a boolean is a boolean control", () => {
    const wireTurn = (inputType: string): ParticipantObjectiveWire["next_turn"] =>
        ({ input_type: inputType, label: "Does your child have siblings?", options: [] }) as never;

    it("the question itself offers Yes and No", () => {
        const control = valueControlForTurn(wireTurn("boolean"));
        expect(control.kind).toBe("boolean");
        expect(control).toMatchObject({ affirm: "Yes", deny: "No" });
    });

    it("correcting a settled answer offers the same two, never a text box", () => {
        const editor = semanticEditorFor({ canonicalKey: null, inputType: "boolean", options: [], value: true });
        expect(editor).toEqual({ kind: "options", options: ["Yes", "No"] });
    });

    it("the unreadable-answer fallback opens that same editor", () => {
        // The fallback opens `next_turn.editor`; for a boolean that editor is the Yes/No control
        // above, so there is no path on which a yes/no question becomes free text.
        const editor = semanticEditorFor({ canonicalKey: null, inputType: "checkbox", options: [], value: false });
        expect(editor).toEqual({ kind: "options", options: ["Yes", "No"] });
    });
});

/**
 * THE BRANCH ORDER IS THE BUG.
 *
 * The card's optional branch was tested BEFORE its boolean branch, so a question the school wrote as
 * yes/no AND marked optional offered "Nothing to add" / "Yes — I'll tell you", and the second of
 * those reveals the authored control as a TEXT box. The options branch carries a comment about this
 * exact defect being fixed for select fields; boolean was never given the same treatment.
 *
 * This is a source-order assertion and says nothing about reachability on its own — the live proof
 * that a boolean turn renders Yes/No is in the browser certification. It exists so the ordering
 * cannot silently regress, which is how it got this way.
 */
describe("a boolean is decided before optionality is", () => {
    it("tests control.kind === boolean ahead of the optional shortcut", async () => {
        const { readFileSync } = await import("node:fs");
        const src = readFileSync(
            new URL("../../app/forms/embed/[token]/EnrollmentConversationCard.tsx", import.meta.url),
            "utf8",
        );
        const boolAt = src.indexOf('} else if (control.kind === "boolean") {');
        const optionalAt = src.indexOf("} else if (optionalUnanswered && skipLabel && affirmLabel) {");
        expect(boolAt).toBeGreaterThan(-1);
        expect(optionalAt).toBeGreaterThan(-1);
        expect(boolAt).toBeLessThan(optionalAt);
    });
});
