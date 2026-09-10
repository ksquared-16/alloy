import { describe, expect, it } from "vitest";

import { looksLikeParticipantQuestion } from "@/lib/enrollment/participantRuntime/participantQuestionShape";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import { disposeParticipantCandidate } from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

/**
 * A PARENT'S QUESTION BECAME THEIR CHILD'S EMERGENCY CONTACT.
 *
 * The runtime takes free text whole on a collect turn — "a plain answer to a plain question is the
 * answer" — behind three guards, none of which asked whether the words were an answer at all. Live
 * QA typed
 *
 *     "What do I still need to do?"
 *
 * and it was written as Emergency contact first name, settled, on its way to a form with a fidelity
 * map that prints. These pin the boundary that stops it, at the two layers that decide: what the
 * words ARE, and what the platform DOES about them.
 */

const collectTurn = (label: string): ParticipantTurn =>
    ({
        kind: "collect_missing_value",
        need: {
            identity: { key: "k", scope: "child", subject_id: null, canonical_key: null, shared_value_key: "s" },
            // `acceptsWholeText` requires every destination to be a free-text control with no
            // options — that is the branch the question guard has to sit in front of.
            occurrences: [{ label, form_field_id: "field_13", required: false, field_type: "text", options: [] }],
        },
        input_type: "text",
    }) as unknown as ParticipantTurn;

describe("what the words are", () => {
    it.each([
        "What do I still need to do?",
        "Why do you need the immunization record?",
        "Have I signed everything?",
        "Am I done?",
        "What information do you already have?",
        "can I upload this later",
        "help me understand this",
        "I don't understand what this means",
    ])("reads %j as a question", (text) => {
        expect(looksLikeParticipantQuestion(text)).toBe(true);
    });

    it.each(["Dana", "Dana Reyes", "Bo Certopp", "None known", "Aunt", "418 Maple Court", "5555550302"])(
        "still reads %j as an answer",
        (text) => {
            expect(looksLikeParticipantQuestion(text)).toBe(false);
        },
    );

    it("does not mistake a short name for a question just because of its first word", () => {
        // "Will" and "May" are names. A lead word only counts inside something sentence-shaped.
        expect(looksLikeParticipantQuestion("Will")).toBe(false);
        expect(looksLikeParticipantQuestion("May Chen")).toBe(false);
        expect(looksLikeParticipantQuestion("Do Nguyen")).toBe(false);
    });

    it("treats a question mark as the participant saying so themselves", () => {
        expect(looksLikeParticipantQuestion("Dana?")).toBe(true);
    });
});

describe("what the platform does about them", () => {
    const interpret = (text: string) =>
        interpretParticipantResponseDeterministically({ turn: collectTurn("Emergency contact first name"), text });

    it("NEGATIVE 1 — 'What do I still need to do?' is not a value", () => {
        const c = interpret("What do I still need to do?");
        expect(c.kind).toBe("question");
        const d = disposeParticipantCandidate({ turn: collectTurn("Emergency contact first name"), candidate: c, field: null });
        expect(d.action).toBe("answer_question");
        // The thing that used to happen, asserted as impossible.
        expect(d.action).not.toBe("write_shared_value");
    });

    it("NEGATIVE 2 — 'Why do you need this?' is not a value", () => {
        const d = disposeParticipantCandidate({
            turn: collectTurn("Emergency contact first name"),
            candidate: interpret("Why do you need this?"),
            field: null,
        });
        expect(d.action).toBe("answer_question");
    });

    it("POSITIVE 3 — a legitimate answer still writes", () => {
        const c = interpret("Dana");
        expect(c.kind).toBe("corrected_value");
        expect(c.value).toBe("Dana");
    });

    it("NEGATIVE 4 — a question while a canonical-mapped value is on screen dirties nothing", () => {
        /*
         * The confirm turn is the dangerous one: asking a question while a known value is displayed
         * is not agreement with that value. The guard sits above the confirm branch for this reason.
         */
        const confirmTurn = {
            kind: "confirm_known_value",
            need: {
                identity: {
                    key: "k",
                    scope: "child",
                    subject_id: null,
                    canonical_key: "customer_member:first_name",
                    shared_value_key: "child_first_name",
                },
                occurrences: [
                    { label: "Child First Name", form_field_id: "field_1", required: true, field_type: "text", options: [] },
                ],
            },
            proposed_value: "Pathb",
        } as unknown as ParticipantTurn;

        const c = interpretParticipantResponseDeterministically({
            turn: confirmTurn,
            text: "Why do you need this?",
        });
        expect(c.kind).toBe("question");
        const d = disposeParticipantCandidate({ turn: confirmTurn, candidate: c, field: null });
        expect(d.action).toBe("answer_question");
        expect(d.action).not.toBe("confirm_value");
    });

    it("NEGATIVE 5 — a question carries no value anywhere it could be persisted", () => {
        /*
         * The disposition is the only thing downstream reads. It carries the question TEXT and no
         * `value`, so there is nothing a later write could pick up and put on paperwork.
         */
        const d = disposeParticipantCandidate({
            turn: collectTurn("Emergency contact first name"),
            candidate: interpret("What do I still need to do?"),
            field: null,
        });
        expect(d).toEqual({ action: "answer_question", question: "What do I still need to do?" });
        expect(d).not.toHaveProperty("value");
        expect(d).not.toHaveProperty("pending");
    });
});
