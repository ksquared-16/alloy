/**
 * The deterministic interpreter — the fallback that is ALWAYS available (Phase 3).
 *
 * ## Why this exists before any provider does
 *
 * Enrollment must remain usable when the provider is disabled, unavailable, timing out or refused.
 * Not degraded to an error page — usable. So the deterministic path is built first and is the
 * default, and provider assistance is an enhancement layered over it.
 *
 * That ordering is also what keeps the architecture honest. If natural-language parsing were the
 * primary path, every deterministic guarantee downstream would quietly depend on model uptime.
 *
 * ## What it does, and what it deliberately does not
 *
 * It recognises unambiguous affirmations and refusals, and it accepts a value the participant typed
 * into the deterministic control for the current turn. It does NOT attempt to extract "May 6" from
 * "actually she was born 5/6/21" — that is exactly the natural-language understanding a provider is
 * for, and guessing at it here with regular expressions would be the approximate matching this
 * program has refused at every layer.
 *
 * When it cannot tell, it returns `clarification_needed`, and the runtime offers the deterministic
 * control. A parent is never stuck; they are asked plainly instead of cleverly.
 *
 * Pure. No I/O.
 */

import type {
    ParticipantTurn,
    StructuredCandidate,
} from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import { looksLikeParticipantQuestion } from "@/lib/enrollment/participantRuntime/participantQuestionShape";
import { normalizeBooleanInput } from "@/lib/enrollment/participantRuntime/normalizeParticipantValue";

/** Unambiguous affirmations only. Anything hedged falls through to clarification. */
const AFFIRMATIVE = new Set([
    "y",
    "yes",
    "yep",
    "yeah",
    "yup",
    "correct",
    "right",
    "that's right",
    "thats right",
    "confirm",
    "confirmed",
    "ok",
    "okay",
    "sure",
]);

const NEGATIVE = new Set(["n", "no", "nope", "incorrect", "wrong", "not right"]);

/** Controls whose value simply IS the words the participant wrote. */
const FREE_TEXT_CONTROLS = new Set(["text", "textarea", "long_text", "string"]);

const UNKNOWN = new Set([
    "i don't know",
    "i dont know",
    "dont know",
    "don't know",
    "not sure",
    "unsure",
    "no idea",
    "skip",
]);

export type DeterministicInterpretationInput = {
    readonly turn: ParticipantTurn;
    /** Free text the participant typed, if any. */
    readonly text?: string | null;
    /**
     * A value entered through the deterministic control for this turn.
     *
     * This is the always-available path: when parsing cannot run, the runtime renders the ordinary
     * input for the current need and the participant answers it directly. A value supplied this way
     * needs no interpretation at all — it is already structured.
     */
    readonly directValue?: unknown;
};

/**
 * Is this an unambiguous affirmation?
 *
 * "Yep, that's right." is two affirmative clauses, not natural language needing a model. Splitting
 * on punctuation and requiring EVERY clause to be affirmative is deterministic — it is set
 * membership, not similarity — and it keeps the commonest confirmation answer working with no
 * provider at all.
 *
 * Requiring every clause is what keeps it safe: "yes, but the address is wrong" contains an
 * affirmative clause and is emphatically not a confirmation, so it falls through to clarification.
 */
function isUnambiguousAffirmation(text: string): boolean {
    if (AFFIRMATIVE.has(text)) return true;
    const clauses = text
        .split(/[,;]+|\s+and\s+/)
        .map((c) => c.trim())
        .filter(Boolean);
    return clauses.length > 1 && clauses.every((c) => AFFIRMATIVE.has(c));
}

export function interpretParticipantResponseDeterministically(
    input: DeterministicInterpretationInput,
): StructuredCandidate {
    // A directly entered value bypasses interpretation entirely. It still passes deterministic
    // validation downstream — structured is not the same as valid.
    if (input.directValue !== undefined && input.directValue !== null && input.directValue !== "") {
        return { kind: "corrected_value", value: input.directValue };
    }

    const text = (input.text ?? "").trim().toLowerCase();
    if (!text) return { kind: "unresolved" };

    /*
     * A QUESTION IS NOT AN ANSWER, AND IS CHECKED BEFORE ANYTHING CAN BE TAKEN WHOLE.
     *
     * This sits above every branch below on purpose. The free-text rule further down takes the
     * participant's words as the value, and it was reached by "What do I still need to do?" — which
     * became a child's emergency contact first name, settled, on its way to a form that prints.
     *
     * Placed here it also protects the confirm branch: asking a question while a known value is on
     * screen is not agreement with that value.
     */
    if (looksLikeParticipantQuestion(input.text)) {
        // The words travel so the runtime can answer them; they are never a value.
        return { kind: "question", value: (input.text ?? "").trim() };
    }

    const normalized = text.replace(/[.!]+$/, "");
    if (UNKNOWN.has(normalized)) return { kind: "unresolved" };

    if (input.turn.kind === "confirm_known_value") {
        if (isUnambiguousAffirmation(normalized)) return { kind: "confirmed" };
        // A bare "no" says the value is wrong but not what it should be. Refusing to guess is the
        // point: the runtime re-asks for the correct value rather than inventing one.
        if (NEGATIVE.has(normalized)) return { kind: "clarification_needed" };
    }

    /*
     * A PLAIN answer to a PLAIN question is the answer.
     *
     * "Enrollment must remain usable when the provider is disabled, unavailable, timing out or
     * refused" is this module's first paragraph, and it was not true: every free-text need reached
     * the provider or nowhere. A parent asked "What is your name?" typed "Alex Sigwalk", the
     * deterministic layer declined to read it, D-101 does not admit `guardian_name`, and the
     * runtime answered "Sorry — I didn't catch that" forever. There was no way past that question
     * on any path.
     *
     * This is not natural-language parsing and does not become it. Nothing is EXTRACTED: the words
     * are taken whole, and only where taking them whole cannot be wrong —
     *
     *   • a COLLECT turn, so there is no proposed value that an answer could be agreeing with;
     *   • a free-text control, so a date, a number and a choice all still require their own control
     *     and are never guessed at from prose;
     *   • not an affirmation or a refusal, which are conversation about a value rather than a value.
     *
     * "actually she was born 5/6/21" is still refused, because a date need is not free text. What
     * is admitted is the case where the parent answered the question they were asked.
     */
    /*
     * YES AND NO ARE THE WHOLE ANSWER TO A YES/NO QUESTION.
     *
     * The free-text rule below refuses anything that is not a free-text control, and it is right to:
     * a date or a choice carries a shape the words would have to be PARSED into. A boolean carries
     * no shape. There are two answers, the vocabulary for them is already owned by
     * `normalizeBooleanInput`, and nothing is extracted — "yeah" is not evidence ABOUT the answer,
     * it is the answer.
     *
     * Without this, an authored boolean could only ever be answered by pressing a button. The
     * surface deliberately shows no composer on a boolean turn, so this is not the parent's usual
     * path; it is the one that has to work when the buttons are not how the words arrived — a
     * dictated reply, an assistive client, a resumed draft. A question answerable two ways that
     * accepts only one of them is a dead end for whoever is on the other side.
     */
    if (input.turn.kind === "collect_missing_value" && answersBoolean(input.turn)) {
        const decided = normalizeBooleanInput(input.text);
        if (decided.kind === "normalized" && typeof decided.value === "boolean") {
            return { kind: "corrected_value", value: decided.value };
        }
        // Anything else about a yes/no question is conversation, and falls through to clarification.
    }

    if (input.turn.kind === "collect_missing_value" && acceptsWholeText(input.turn)) {
        const spoken = (input.text ?? "").trim();
        if (spoken && !isUnambiguousAffirmation(normalized) && !NEGATIVE.has(normalized)) {
            return { kind: "corrected_value", value: spoken };
        }
    }

    // Anything else is natural language this layer does not pretend to parse.
    return { kind: "clarification_needed" };
}

/**
 * Is every destination behind this need an authored yes/no?
 *
 * Same test shape as `acceptsWholeText` and the same reason: one need can fill several controls, so
 * a boolean answer is only the answer when EVERY one of them is a boolean.
 */
function answersBoolean(turn: ParticipantTurn): boolean {
    const occurrences = turn.need?.occurrences ?? [];
    if (occurrences.length === 0) return false;
    return occurrences.every((o) => o.field_type === "boolean" || o.field_type === "checkbox");
}

/**
 * Can this need's whole answer be its typed words?
 *
 * Only a free-text control. A date, a number or a choice carries a shape the words would have to be
 * PARSED into, and parsing is exactly what this layer refuses to do — those needs keep their own
 * deterministic control, which is the always-available path they already had.
 */
function acceptsWholeText(turn: ParticipantTurn): boolean {
    const occurrences = turn.need?.occurrences ?? [];
    if (occurrences.length === 0) return false;
    /*
     * EVERY destination has to be free text.
     *
     * One need can fill several controls, and a shape that fits one of them is not an answer for
     * the others: if any occurrence is a date, a choice or a number, the words would have to be
     * parsed into that shape somewhere, and that is what this layer refuses to do.
     */
    return occurrences.every((o) => FREE_TEXT_CONTROLS.has(o.field_type) && o.options.length === 0);
}
