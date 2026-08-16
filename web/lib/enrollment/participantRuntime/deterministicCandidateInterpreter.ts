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

    const normalized = text.replace(/[.!]+$/, "");
    if (UNKNOWN.has(normalized)) return { kind: "unresolved" };

    if (input.turn.kind === "confirm_known_value") {
        if (isUnambiguousAffirmation(normalized)) return { kind: "confirmed" };
        // A bare "no" says the value is wrong but not what it should be. Refusing to guess is the
        // point: the runtime re-asks for the correct value rather than inventing one.
        if (NEGATIVE.has(normalized)) return { kind: "clarification_needed" };
    }

    // Anything else is natural language this layer does not pretend to parse.
    return { kind: "clarification_needed" };
}
