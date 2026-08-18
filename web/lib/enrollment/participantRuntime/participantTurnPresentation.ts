/**
 * How a deterministic turn is PRESENTED to a participant (V1.2).
 *
 * Pure, and deliberately separate from the component: what control a turn needs and what the
 * progress line says are decisions worth testing without a DOM.
 *
 * ## Rendering never depends on a provider
 *
 * The platform already owns the turn and its `prompt`. A provider may later interpret the
 * participant's ANSWER; it is never asked to generate the QUESTION. So everything here works with
 * the provider disabled, unavailable or refused — which is what makes the fallback ordinary product
 * behaviour rather than an error state.
 */

import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

/**
 * The control a turn needs.
 *
 * `choice_or_text` is the confirm turn: quick Yes / No, with a free-text box for anything else. Both
 * paths reach the same endpoint, and the deterministic interpreter reads "yes" and a typed value
 * without any model at all.
 */
export type ParticipantTurnControl =
    | { readonly kind: "choice_or_text"; readonly affirm: string; readonly deny: string }
    | { readonly kind: "value"; readonly inputType: "date" | "email" | "tel" | "number" | "text"; readonly label: string }
    | { readonly kind: "boolean"; readonly affirm: string; readonly deny: string; readonly label: string }
    | { readonly kind: "options"; readonly options: readonly string[]; readonly label: string }
    | { readonly kind: "handoff" }
    | { readonly kind: "done" };

/**
 * Field-appropriate deterministic input, chosen from the need's canonical key.
 *
 * A `date` control for a DOB is not a nicety — it is the always-available path when interpretation
 * cannot run, so it has to be right without a model's help.
 */
export function controlForTurn(turn: ParticipantObjectiveWire["next_turn"]): ParticipantTurnControl {
    if (turn.kind === "complete") return { kind: "done" };
    if (turn.kind === "complete_artifact") return { kind: "handoff" };
    if (turn.kind === "confirm_known_value") {
        return { kind: "choice_or_text", affirm: "Yes, that's right", deny: "No, change it" };
    }

    const label = turn.label?.trim() || "your answer";
    /**
     * The AUTHORED control leads. It is what the parent would have met on the Form itself, so
     * matching it is the difference between a conversation and a text box with a question above it.
     *
     * Label-sniffing is kept only as a fallback for older forms whose fields carry no usable type —
     * it must never override an authored one, or a field an operator deliberately made free-text
     * would silently become a date picker because its label happened to say "date".
     */
    const authored = (turn.input_type ?? "").toLowerCase();
    if (authored === "date") return { kind: "value", inputType: "date", label };
    if (authored === "number") return { kind: "value", inputType: "number", label };
    if (authored === "email") return { kind: "value", inputType: "email", label };
    if (authored === "phone" || authored === "tel") return { kind: "value", inputType: "tel", label };
    if (authored === "boolean" || authored === "checkbox") {
        return { kind: "boolean", affirm: "Yes", deny: "No", label };
    }
    if ((authored === "select" || authored === "radio") && turn.options.length > 0) {
        return { kind: "options", options: turn.options, label };
    }
    // An authored TEXT field is a decision, not an absence: the operator chose free text, and a
    // label containing the word "date" must not override them.
    if (authored === "text" || authored === "textarea") return { kind: "value", inputType: "text", label };

    const lowered = label.toLowerCase();
    if (lowered.includes("birth") || lowered.includes(" date") || lowered.endsWith("date")) {
        return { kind: "value", inputType: "date", label };
    }
    if (lowered.includes("email")) return { kind: "value", inputType: "email", label };
    if (lowered.includes("phone")) return { kind: "value", inputType: "tel", label };
    return { kind: "value", inputType: "text", label };
}

/**
 * A field label written for an OPERATOR, rendered as something a parent would say.
 *
 * "Child Dob" is a column heading. It reached the participant verbatim because the turn's prompt was
 * built from the authored label, and a parent reading "What is Child Dob?" is being shown the
 * database, not asked a question.
 *
 * Deliberately a small, explicit map plus light tidying — not an NLP layer. A wrong guess here is a
 * confusing question, so the rule is: recognise the handful of facts Enrollment actually asks about,
 * and otherwise present the operator's own words unchanged rather than mangling them.
 */
export function naturalFieldLabel(label: string | null | undefined): string {
    const raw = (label ?? "").trim();
    if (!raw) return "this";
    const key = raw.toLowerCase().replace(/[^a-z]+/g, " ").trim();
    const known: Record<string, string> = {
        "child dob": "date of birth",
        "child date of birth": "date of birth",
        "date of birth": "date of birth",
        dob: "date of birth",
        "child full name": "full name",
        "child first name": "first name",
        "child last name": "last name",
        allergies: "allergies",
        "guardian email": "email address",
        "guardian phone": "phone number",
    };
    if (known[key]) return known[key];
    // Otherwise: the operator's label, lower-cased only when it is Title Case boilerplate.
    return /^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(raw) ? raw.toLowerCase() : raw;
}

/** A stored value as a parent would read it. Dates especially — "2021-08-08" is not an answer. */
export function displayValue(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const raw = String(value).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (iso) {
        const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
            });
        }
    }
    return raw;
}

/**
 * The question the participant actually reads.
 *
 * Built from the SUBJECT, a natural label and the proposed value — never from the internal prompt,
 * which is written for the runtime. A confirm turn states what is on file and asks whether it is
 * right; a collect turn asks for the one thing that is missing, named the way a parent would.
 */
export function participantQuestion(objective: ParticipantObjectiveWire): string {
    const turn = objective.next_turn;
    const subject = (objective.subject_display_name ?? "").trim();
    // Always `'s`, including for names ending in s — "Test Process's", the way the parent would say
    // it. The plural-possessive rule does not apply to a personal name.
    const possessive = subject ? `${subject}'s` : "your child's";
    const label = naturalFieldLabel(turn.label);

    if (turn.kind === "confirm_known_value") {
        const shown = displayValue(turn.proposed_value);
        return shown
            ? `I have ${possessive} ${label} as ${shown}. Is that correct?`
            : `Is ${possessive} ${label} still correct?`;
    }
    if (turn.kind === "collect_missing_value") {
        return `What is ${possessive} ${label}?`;
    }
    if (turn.kind === "complete_artifact") {
        return subject
            ? `I have everything I need for ${subject}'s paperwork. Please review and finish it below.`
            : "I have everything I need. Please review and finish the paperwork below.";
    }
    if (turn.kind === "complete") {
        return "That's everything — thank you.";
    }
    return turn.prompt;
}

/**
 * The opening line, shown once while shared facts are still being settled.
 *
 * States the bargain plainly: we already hold some of this, so we will check it rather than ask for
 * it again. That is the whole reason the experience is a conversation and not a form.
 */
export function participantIntro(objective: ParticipantObjectiveWire): string | null {
    if (objective.phase !== "shared_collection") return null;
    const subject = (objective.subject_display_name ?? "").trim();
    return subject
        ? `Welcome to Enrollment for ${subject}. I already have some information on file, so I'll confirm that first and only ask for what's missing.`
        : "I already have some information on file, so I'll confirm that first and only ask for what's missing.";
}

/**
 * The participant-facing progress line.
 *
 * Backed ONLY by `things_remaining`, which counts needs still requiring participant action. A
 * percentage is deliberately not offered: the requirement denominator legitimately contains
 * unrealized and unsupported items, so a percentage over it would move for reasons a parent cannot
 * see and would imply precision the number does not have.
 */
export function progressLine(objective: ParticipantObjectiveWire): string {
    if (objective.complete) return "All done — thank you.";
    const remaining = objective.things_remaining;
    if (objective.phase === "artifact_review") {
        return "Just the paperwork left to review and sign.";
    }
    if (remaining <= 0) return "Almost there — one last step.";
    // Parent-centric, and true: these are the questions left, not Form controls or upload slots.
    // "8 to add · 1 to sign or upload" described the implementation to someone who cannot see it.
    return remaining === 1 ? "1 thing left to check" : `${remaining} things left to check`;
}

/**
 * What the participant is told when interpretation could not read their answer.
 *
 * Product language only. Trust refusal codes, provider names, decision classes and privacy vocabulary
 * never reach a parent: they describe an internal boundary the participant cannot act on, and a
 * message they cannot act on is worse than a plain request to try again.
 */
export const PARTICIPANT_CLARIFICATION_MESSAGE =
    "Sorry — I didn't catch that. You can use the buttons or type the value directly.";
