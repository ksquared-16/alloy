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
    /**
     * A confirm turn. `correction` is the control the parent meets after "Change" — the SAME typed
     * control the authored Form uses, so correcting a date of birth is a date picker and not a text
     * box that happens to be next to a date.
     */
    | {
          readonly kind: "choice_or_text";
          readonly affirm: string;
          readonly deny: string;
          readonly correction: ParticipantValueControl;
      }
    | ParticipantValueControl
    | { readonly kind: "handoff" }
    | { readonly kind: "done" };

/** The controls that actually collect a value. Shared by collection and by correction. */
export type ParticipantValueControl =
    | {
          readonly kind: "value";
          readonly inputType: "date" | "email" | "tel" | "number" | "text";
          readonly label: string;
          /** Long prose gets a textarea rather than a single line. */
          readonly multiline?: boolean;
      }
    | { readonly kind: "boolean"; readonly affirm: string; readonly deny: string; readonly label: string }
    | {
          readonly kind: "options";
          readonly options: readonly string[];
          readonly label: string;
          /** More than one choice may be selected. */
          readonly multiple?: boolean;
      };

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
        return {
            kind: "choice_or_text",
            affirm: "Yes, that's right",
            deny: "Change",
            correction: valueControlForTurn(turn),
        };
    }

    return valueControlForTurn(turn);
}

/**
 * The typed control for a need, from the AUTHORED field type.
 *
 * One function, used for both collecting a missing value and correcting a known one — a date of
 * birth is a date whichever way the parent arrives at it.
 */
export function valueControlForTurn(turn: ParticipantObjectiveWire["next_turn"]): ParticipantValueControl {
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
    if ((authored === "multiselect" || authored === "checkbox_group") && turn.options.length > 0) {
        return { kind: "options", options: turn.options, label, multiple: true };
    }
    if (authored === "textarea" || authored === "long_text") {
        return { kind: "value", inputType: "text", label, multiline: true };
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
 * The wording for skipping an optional need.
 *
 * Offered ONLY where the authored Form says the field may be left unanswered. "None" is the honest
 * answer for a fact like allergies, and it is the answer the artifact should carry — a parent forced
 * to type "na" has put a false value into a document they will later sign.
 */
export function optionalSkipLabel(objective: ParticipantObjectiveWire): string | null {
    if (!objective.next_turn.optional) return null;
    const label = naturalFieldLabel(objective.next_turn.label).toLowerCase();
    if (label.includes("allerg")) return "No known allergies";
    return "Nothing to add";
}

/**
 * The affirmative half of an optional question.
 *
 * A specialist asks a yes/no question and only reaches for the form when the answer is yes. This is
 * the "yes" — it reveals the authored control rather than submitting anything, so a parent who has
 * something to tell us is not typing into a box they never asked for.
 */
export function optionalAffirmLabel(objective: ParticipantObjectiveWire): string | null {
    if (!objective.next_turn.optional) return null;
    return "Yes — I'll tell you";
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
    const them = subject || "your child";
    const label = naturalFieldLabel(turn.label);

    if (turn.kind === "confirm_known_value") {
        const shown = displayValue(turn.proposed_value);
        // "birthday", not "date of birth" — a specialist sitting next to a parent does not read
        // them the column name.
        const spoken = label === "date of birth" ? "birthday" : label;
        return shown
            ? `I have ${possessive} ${spoken} as ${shown}. Is that still right?`
            : `Is ${possessive} ${spoken} still right?`;
    }
    if (turn.kind === "collect_missing_value") {
        // Allergies is the reference case: a specialist ASKS whether there are any. They do not
        // present a field called Allergies and wait for the parent to work out what to type.
        if (label.includes("allerg")) {
            return `Does ${them} have any allergies we should know about?`;
        }
        return `What is ${possessive} ${label}?`;
    }
    if (turn.kind === "complete_artifact") {
        return subject
            ? `That's everything I needed. I filled out ${subject}'s enrollment paperwork — take a quick look and change anything that isn't right.`
            : "That's everything I needed. I filled out the paperwork — take a quick look and change anything that isn't right.";
    }
    if (turn.kind === "complete") {
        return "That's everything — thank you.";
    }
    return turn.prompt;
}

/** The line that introduces the signature, once the paperwork has been reviewed. */
export function participantSignaturePrompt(): string {
    return "Everything look good? One last step — sign below.";
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
        ? `I already have most of ${subject}'s information, so I'll just check it with you and ask for anything I'm missing.`
        : "I already have most of your child's information, so I'll just check it with you and ask for anything I'm missing.";
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
    if (objective.phase === "artifact_review") return "";
    if (remaining <= 0) return "";
    // Parent-centric, and true: these are the questions left, not Form controls or upload slots.
    // "8 to add · 1 to sign or upload" described the implementation to someone who cannot see it.
    // Subtle, and never a stepper: "Step 2 of 3" describes the machine's plan, not the parent's.
    return remaining === 1 ? "Just one more thing" : `Just ${remaining} things left`;
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
