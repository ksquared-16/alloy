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
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { formatPhoneNumber, isFormattablePhoneNumber } from "@/lib/format/phoneNumber";

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
    /** Required documents to attach, BEFORE any paperwork is prepared. */
    | { readonly kind: "evidence" }
    /** A person to add by role — reuse someone known, or collect a new one. */
    | { readonly kind: "party" }
    /**
     * A LIST OF PEOPLE, as one obligation.
     *
     * Distinct from `party` above, which offers ONE role at a time and settles by adding a person
     * or declining. A collection is the Form's own declaration: these people, this many, shown
     * with the ones Alloy already knows. The card draws the whole list at once because the person
     * grouping IS the interaction — three answers about Jane belong to Jane, not to three turns.
     */
    | { readonly kind: "party_collection" }
    /** One address, drawn as one interaction rather than four questions. */
    | { readonly kind: "address" }
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
    if (turn.kind === "collect_party") return { kind: "party" };
    // A collection need is recognised from the need itself, so any turn that carries one draws the
    // collection rather than a control for a question the collection does not have.
    if (turn.party_collection) return { kind: "party_collection" };
    if (turn.address) return { kind: "address" };
    if (turn.kind === "collect_evidence") return { kind: "evidence" };
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
    // Sentence case, from the authored label — never the authoring tool's own casing.
    const label = participantControlLabel(turn.label);
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
    /*
     * AUTHORED, never inferred.
     *
     * This used to read the question's own words and offer "No known allergies" if they contained
     * "allerg" and "Nothing to add" otherwise — so "Please list any food sensitivities" and
     * "Allergy information" produced different paperwork for the same fact, decided by spelling.
     * A Form now says whether "there are none" is one of the answers and what it is called.
     */
    const authored = objective.next_turn.absence_label;
    if (authored) return authored;
    /*
     * No absence statement, but the Form does not insist on an answer: the parent still needs a way
     * past a question they have nothing to say to. That is a SKIP, and it says so — it is not a
     * claim that there are none, and it is why the two are worded differently.
     */
    return objective.next_turn.optional ? "Nothing to add" : null;
}

/**
 * The affirmative half of an optional question.
 *
 * A specialist asks a yes/no question and only reaches for the form when the answer is yes. This is
 * the "yes" — it reveals the authored control rather than submitting anything, so a parent who has
 * something to tell us is not typing into a box they never asked for.
 */
export function optionalAffirmLabel(objective: ParticipantObjectiveWire): string | null {
    /*
     * Offered wherever there is an alternative to giving detail — an authored absence answer, or an
     * optional question. ABSENCE IS NOT OPTIONALITY: a REQUIRED question can have a true absence
     * answer ("No known allergies" is an answer, not a refusal to give one), and without this a
     * required allergies question would show the family no way to say there are none.
     */
    if (!objective.next_turn.optional && !objective.next_turn.absence_label) return null;
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
/** Canonical facts Enrollment actually asks about, keyed by the fact rather than its printing. */
const KNOWN_BY_CANONICAL_KEY: Record<string, string> = {
    child_first_name: "first name",
    child_last_name: "last name",
    /*
     * The WHOLE name, which a real packet asks for far more often than the halves.
     *
     * Missing here, a summary row printed the authored label verbatim — "Student Name: ·
     * Wrigley Kurzman", trailing colon and all — beside a guardian row that correctly read "Name",
     * because only the guardian's key was mapped. The map is the handful of facts Enrollment
     * actually asks about, and since Admissions binds the child's full name this is one of them.
     */
    child_full_name: "full name",
    display_name: "full name",
    guardian_full_name: "name",
    child_date_of_birth: "date of birth",
    dob: "date of birth",
    date_of_birth: "date of birth",
    guardian_name: "name",
    name: "name",
    phone: "phone number",
    guardian_phone: "phone number",
    email: "email address",
    guardian_email: "email address",
    address: "address",
    allergies: "allergies",
    start_date: "first day",
};

export function naturalFieldLabel(label: string | null | undefined, canonicalKey?: string | null): string {
    // The canonical key first: it names the FACT, while the label only records where it was printed.
    // "Childs Last Name" is a bilingual column heading with its apostrophe lost to OCR; the key
    // behind it is `child_last_name`, and that is the thing worth recognising.
    const fromKey = canonicalKey ? KNOWN_BY_CANONICAL_KEY[canonicalKey.toLowerCase().split(":").pop() ?? ""] : undefined;
    if (fromKey) return fromKey;
    const raw = authoredOrHumanizedLabel(label);
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
    // Sentence-case authored text is left exactly as written — a school's own words for its own
    // parents are not the platform's to re-case, which is a decision this repository already made.
    return /^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/.test(raw) ? raw.toLowerCase() : raw;
}

/**
 * A label written for an authoring tool, made presentable WITHOUT inventing a doctrine.
 *
 * The authored label leads: it is what the parent would have met on the Form itself, so an operator
 * who wrote "Child's date of birth" gets exactly that. Only a label that is still an internal
 * key — `child_dob`, `EMERGENCY_CONTACT` — goes through the platform's established display-label
 * behaviour (`humanizeOperatorSlug`), which is where "never show raw keys in primary UI" already
 * lives. Nothing here touches the canonical key; this is presentation of a label, not identity.
 */
function authoredOrHumanizedLabel(label: string | null | undefined): string {
    const raw = (label ?? "").trim();
    if (!raw) return "";
    // A key, not a sentence: underscores, or SHOUTING with no spaces. Anything a person wrote — any
    // label with a space and ordinary casing — is left exactly as authored.
    const looksLikeKey = /_/.test(raw) || (/^[A-Z0-9]+$/.test(raw) && raw.length > 1);
    return looksLikeKey ? humanizeOperatorSlug(raw) : raw;
}

/**
 * The label above a deterministic control — sentence case, never authoring casing.
 *
 * "Child Dob" is a column heading and it reached the participant verbatim. The conversational
 * label is already resolved for the question; the control simply capitalises it, so the input a
 * parent types into is captioned "Date of birth", not "Child Dob".
 */
export function participantControlLabel(label: string | null | undefined): string {
    const natural = naturalFieldLabel(label);
    if (!natural || natural === "this") return "Your answer";
    return natural.charAt(0).toUpperCase() + natural.slice(1);
}

/**
 * A stored value as a parent would read it.
 *
 * Dates go through the PLATFORM formatter (`formatDisplayDate`, `Aug 19, 2025`) — the same doctrine
 * every operator surface uses. There is deliberately no Participant Runtime date format: a parent
 * and an operator looking at the same birthday must read the same thing.
 *
 * `2021-08-08` is a database string, not an answer. The ISO branch below is the one place a raw
 * date can enter participant copy, and it always leaves formatted.
 */
export function displayValue(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const raw = String(value).trim();
    if (isIsoDateString(raw)) {
        // UTC, matching the storage grain: a date-only value has no timezone and must not shift.
        const formatted = formatDisplayDate(raw, { timeZone: "UTC" });
        if (formatted && !isIsoDateString(formatted)) return formatted;
    }
    /*
     * A phone is STORED as ten digits and READ as a phone number.
     *
     * The normalizer is right to keep `5415551234` — one canonical string, no punctuation to
     * disagree about. But that is a storage decision, and it was reaching the parent verbatim in
     * the correction surface, where it reads as a serial number rather than the number they gave.
     * Formatting is presentation, so it happens here and the stored value never changes.
     *
     * Through the platform primitive, so a number stored as `+15415557788` by an earlier canonical
     * writer reads the same as one the family typed, and an international number is left alone.
     */
    if (isFormattablePhoneNumber(raw)) return formatPhoneNumber(raw);
    return raw;
}

/** `2021-08-08` and `2021-08-08T00:00:00Z` — the shapes that must never reach a parent. */
export function isIsoDateString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(value.trim());
}

/**
 * The question the participant actually reads.
 *
 * Built from the SUBJECT, a natural label and the proposed value — never from the internal prompt,
 * which is written for the runtime. A confirm turn states what is on file and asks whether it is
 * right; a collect turn asks for the one thing that is missing, named the way a parent would.
 */
/**
 * The name a specialist would USE at the table — the child's first name.
 *
 * The full display name identifies the record; the conversation is with a parent about their
 * child, and "I have John's birthday…" is how that sentence is said. Derived from the resolved
 * subject name, so a mid-conversation correction changes what the child is called immediately.
 */
function familiarName(objective: ParticipantObjectiveWire): string {
    const subject = (objective.subject_display_name ?? "").trim();
    return subject.split(/\s+/)[0] ?? "";
}

/**
 * One run of the current message, and whether it is the SCANNABLE part.
 *
 * A parent confirming a birthday should be able to find the date without reading the sentence.
 * Emphasis is reserved for the value under discussion — deliberately not the whole sentence, which
 * would turn every question into a heading and flatten the hierarchy it is meant to create.
 */
export type ParticipantMessageSegment = { readonly text: string; readonly emphasis: boolean };

export function participantQuestionSegments(
    objective: ParticipantObjectiveWire,
): readonly ParticipantMessageSegment[] {
    const turn = objective.next_turn;
    if (turn.kind === "confirm_known_value") {
        const shown = displayValue(turn.proposed_value);
        if (shown) {
            const whole = participantQuestion(objective);
            const at = whole.indexOf(shown);
            if (at >= 0) {
                return [
                    { text: whole.slice(0, at), emphasis: false },
                    { text: shown, emphasis: true },
                    { text: whole.slice(at + shown.length), emphasis: false },
                ].filter((s) => s.text.length > 0);
            }
        }
    }
    return [{ text: participantQuestion(objective), emphasis: false }];
}


/**
 * Whose fact is this, in the words a person would use?
 *
 * The subject belongs to the NEED — its grain and its canonical entity — and never to the imported
 * label. A guardian's phone number arrives on a page headed "Parent/Guardian #1 Phone Number", under
 * a Form built around a child, and the previous real run duly asked the parent for "Marisol's phone
 * number". Reading the grain instead is the whole repair.
 *
 *  - the child            → the child's familiar name
 *  - the responding adult → you / your
 *  - the household        → your family's
 *  - a signature          → you / your
 */
export type ConversationVoice = {
    /** "Marisol's" / "your" / "your family's" — the possessive before a fact. */
    possessive: string;
    /** "Marisol" / "you" — the subject of a sentence. */
    subject: string;
    /** True when the person being spoken to owns the fact, so "Do you…" reads correctly. */
    secondPerson: boolean;
    /**
     * The auxiliary that AGREES with `subject` — "do you", "does your family", "does Marisol".
     *
     * `secondPerson` was carrying this meaning and could not: it is true both for "you", which
     * takes *do*, and for "your family", which takes *does*. A sentence built from `subject` and a
     * hard-coded "Does" therefore asked a parent "Does you have a phone number?". Agreement
     * belongs with the pronoun that decides it, so every sentence reads it from here rather than
     * re-deriving it and getting it wrong somewhere else.
     */
    aux: "do" | "does";
};

/** "Do" / "Does" at the head of a question. */
export function capitalizedAux(voice: ConversationVoice): string {
    return voice.aux === "do" ? "Do" : "Does";
}

export function conversationVoice(objective: ParticipantObjectiveWire): ConversationVoice {
    const turn = objective.next_turn as { scope?: string | null; entity_type?: string | null };
    return voiceForSubject({
        entityType: turn.entity_type ?? null,
        scope: turn.scope ?? null,
        childName: familiarName(objective),
    });
}

/**
 * The same voice, addressed by SUBJECT rather than by the current turn.
 *
 * A grouped confirmation speaks about a subject before any one of its facts is the turn, so the
 * heading needs the voice without a turn to read it from. Extracted rather than duplicated: the card
 * that says "let's check your details" and the question that follows it must never describe
 * different people, and the only way to guarantee that is for both to ask this one function.
 */
export function voiceForSubject(input: {
    readonly entityType: string | null;
    readonly scope: string | null;
    readonly childName: string;
}): ConversationVoice {
    const child = input.childName;
    const childPossessive = child ? `${child}'s` : "your child's";
    const turn = { scope: input.scope, entity_type: input.entityType };

    // The canonical entity is the strongest signal, because it names the record the fact lives on.
    switch ((turn.entity_type ?? "").toLowerCase()) {
        case "person":
        case "guardian":
        case "contact":
            return { possessive: "your", subject: "you", secondPerson: true, aux: "do" };
        case "customer":
            return { possessive: "your family's", subject: "your family", secondPerson: true, aux: "does" };
        case "child":
        case "customer_member":
        // An enrolment fact is about the child being enrolled — "Marisol's first day", not the
        // family's. The record it lives on is the enrolment; the person it describes is the child.
        case "enrollment":
            return { possessive: childPossessive, subject: child || "your child", secondPerson: false, aux: "does" };
    }

    // No canonical entity — fall back to grain. `recipient` is the person signing: they are here.
    if ((turn.scope ?? "") === "recipient") return { possessive: "your", subject: "you", secondPerson: true, aux: "do" };
    if ((turn.scope ?? "") === "household") return { possessive: "your family's", subject: "your family", secondPerson: true, aux: "does" };
    return { possessive: childPossessive, subject: child || "your child", secondPerson: false, aux: "does" };
}


/**
 * The school already asked it — ask it their way.
 *
 * Many destinations are not field labels at all but whole questions the school wrote: "How would you
 * describe your child's gender?", "Does your child become tired or nap during the day?". Wrapping
 * one in the platform's own frame produced "What is Marisol's How would you describe your child's
 * gender??" — the wrong subject, the school's question buried inside it, and two question marks.
 *
 * So an authored question is asked as written, with one substitution: the school wrote "your child"
 * because it did not know the child's name, and the specialist sitting beside the parent does.
 */
function authoredQuestionPrompt(label: string, child: string | null): string | null {
    const raw = (label ?? "").trim();
    if (raw.length < 8) return null;
    const isQuestion = raw.endsWith("?") || /^(has|have|does|do|did|is|are|was|were|can|could|will|would|should|how|what|when|where|which|who|why)\b/i.test(raw);
    if (!isQuestion) return null;
    let text = raw.replace(/\s*[:?]+\s*$/, "").trim();
    if (child) {
        text = text
            .replace(/\byour child's\b/gi, `${child}'s`)
            .replace(/\byour student's\b/gi, `${child}'s`)
            .replace(/\byour child\b/gi, child)
            .replace(/\byour student\b/gi, child);
    }
    return `${text}?`;
}


/**
 * The participant-facing question for a need that is NOT the current turn.
 *
 * A cluster shows its siblings, and they must be worded exactly as they will be when their turn
 * comes — same grain, same voice, same authored-question handling. So this composes the minimal
 * turn shape and asks the one function that already knows how to say it, rather than growing a
 * second wording path that would drift from the first.
 */
export function questionForNeed(
    need: {
        identity: { scope?: string | null; entity_type?: string | null; canonical_key?: string | null };
        state: string;
        current_value: unknown;
        occurrence_count: number;
        occurrences: readonly { label: string }[];
    },
    subjectDisplayName: string | null,
): string {
    const confirming = need.state === "known_requires_confirmation";
    return participantQuestion({
        subject_display_name: subjectDisplayName,
        next_turn: {
            kind: confirming ? "confirm_known_value" : "collect_missing_value",
            prompt: "",
            proposed_value: confirming ? need.current_value : null,
            resolves_occurrences: need.occurrence_count,
            input_type: null,
            label: need.occurrences[0]?.label ?? null,
            options: [],
            optional: false,
            field_ids: [],
            scope: need.identity.scope ?? null,
            entity_type: need.identity.entity_type ?? null,
            canonical_key: need.identity.canonical_key ?? null,
        },
    } as unknown as ParticipantObjectiveWire);
}

/** "a middle name", "an emergency contact" — article by sound, not by spelling rules nobody reads. */
function indefiniteArticle(label: string): string {
    return /^[aeiou]/i.test(label.trim()) ? "an" : "a";
}

export function participantQuestion(objective: ParticipantObjectiveWire): string {
    const turn = objective.next_turn;
    const subject = familiarName(objective);
    // Always `'s`, including for names ending in s — "Test Process's", the way the parent would say
    // it. The plural-possessive rule does not apply to a personal name.
    const voice = conversationVoice(objective);
    const possessive = voice.possessive;
    const them = voice.subject;
    // The canonical key names the fact; the imported label only describes where it was printed.
    const label = naturalFieldLabel(turn.label, (turn as { canonical_key?: string | null }).canonical_key ?? null);

    /*
     * A COLLECTION ALREADY HAS ITS SENTENCE.
     *
     * This function re-composes wording from the LABEL for every turn, which is right for a single
     * fact and wrong for a list of people: it produced "What is your Emergency contacts?" — a plural
     * heading wrapped in a singular question. The runtime already built the right sentence for a
     * collection (`deterministicPrompt`), and the card beside it lists the people, so the words are
     * taken as given rather than rebuilt here.
     */
    if (turn.party_collection && turn.prompt?.trim()) return turn.prompt.trim();
    /*
     * An address turn keeps the runtime's own sentence: it names the address and says whether Alloy
     * already holds one, which no re-composition from a field label can do.
     *
     * One substitution, the same one an authored question gets: the runtime has no child name, so
     * a child's address is composed as "your child's home address", and here — where the name IS
     * known — the parent hears the child's own name instead.
     */
    if (turn.address && turn.prompt?.trim()) {
        const spoken = turn.prompt.trim();
        return subject ? spoken.replace(/\byour child's\b/gi, `${subject}'s`) : spoken;
    }

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
        /*
         * THE SCHOOL'S OWN QUESTION OUTRANKS EVERY HEURISTIC, INCLUDING THIS ONE.
         *
         * The allergies rule below used to run first, and it tested the LABEL for "allerg" — the
         * same substring test the field semantics work was written to retire. A Form that
         * authored, in full, "Does your child have any allergies?" was therefore not asked its own
         * question: the rule replaced it with a sentence about whoever the destination happened to
         * name, so a question about the CHILD reached the parent as "Does your family have any
         * allergies we should know about?". Different subject, different fact, and the school's
         * words discarded to get there.
         *
         * So the authored question is tried first. The rule beneath it keeps doing exactly the job
         * it was written for — turning a bare label, "Allergies", into something a specialist
         * would say out loud — and no longer overrules an administrator who already said it.
         */
        const authored = authoredQuestionPrompt(turn.label ?? "", subject);
        if (authored) return authored;
        // Allergies is the reference case: a specialist ASKS whether there are any. They do not
        // present a field called Allergies and wait for the parent to work out what to type.
        if (label.includes("allerg")) {
            return `${capitalizedAux(voice)} ${them} have any allergies we should know about?`;
        }

        /*
         * NO CANONICAL OWNER, SO NO POSSESSIVE.
         *
         * A bespoke school prompt — "General health:", "Primary Physician Name:" — binds to nothing,
         * so there is no record to say whose it is. The household fallback filled that silence with
         * "your family's", and produced "What is your family's General health?": a claim of ownership
         * the platform cannot support, wrapped around wording the school already got right.
         *
         * These prompts are the school's own, and the topic heading above them supplies the context
         * a possessive was standing in for. So they are asked as written.
         */
        /*
         * NEVER A NAKED LABEL.
         *
         * This branch used to return the authored label with a question mark bolted on, so a parent
         * was asked, in its entirety, "Middle Name?" — the runtime knew it was talking about Malik
         * and said none of it. Every active question must be understandable on its own, which means
         * carrying its subject.
         *
         * Where the destination declares no entity, `subject_entity_type` supplies one from the
         * packet's own layout, and where even that is absent the question still gets a stem and a
         * possessive rather than being handed over raw.
         */
        /*
         * NO SUBJECT, NO INVENTED POSSESSIVE.
         *
         * A destination the packet gives no subject for keeps the school's own words. That was a
         * deliberate earlier decision and it is still right: "General health" belongs to nobody the
         * runtime can name, and "What is your family's General health?" is worse than the label.
         *
         * What changed is that far fewer destinations are subject-less than before, because
         * `subject_entity_type` reads the packet's layout. "Middle Name" sits between child-bound
         * boxes, so it now HAS a subject and gets a real question.
         */
        const hasSubject = Boolean((turn as { entity_type?: string | null }).entity_type);
        if (!hasSubject) {
            const own = (turn.label ?? "").trim().replace(/\s*[:?]+\s*$/, "");
            if (own.length >= 2) return `${own}?`;
        }
        if (turn.optional) {
            // A yes/no shape for an optional attribute — the same shape allergies already uses, and
            // what a specialist actually says: "Does Malik have a middle name?", "Do you have a
            // phone number?". The auxiliary agrees with the subject; hard-coding "Does" here is
            // what produced "Does you have a phone number?".
            return `${capitalizedAux(voice)} ${them} have ${indefiniteArticle(label)} ${label}?`;
        }
        // "What is your phone number?" — not "What is your your phone number?".
        return possessive === "your" ? `What is your ${label}?` : `What is ${possessive} ${label}?`;
    }
    if (turn.kind === "collect_party") {
        // The runtime's own sentence — a question about a PERSON, never about a numbered box.
        return turn.prompt;
    }
    if (turn.kind === "collect_evidence") {
        /*
         * ASKED BEFORE ANY PAPERWORK IS PREPARED.
         *
         * The runtime used to reach this obligation inside the artifact review, having already said
         * it filled the paperwork out. The sentence names the document rather than the form, because
         * that is what the parent has to go and find.
         */
        return turn.prompt;
    }
    if (turn.kind === "complete_artifact") {
        /*
         * PREPARATION LANGUAGE MUST BE TRUTHFUL.
         *
         * "I filled out your paperwork" was said while a required attachment had not been asked for,
         * let alone supplied. This turn is now only reachable once collection AND required evidence
         * are complete — the selector puts `collect_evidence` ahead of it — so the sentence can
         * describe what is actually happening, in the present tense.
         */
        return subject
            ? `Great — that's everything I need. I'm preparing ${subject}'s paperwork now.`
            : "Great — that's everything I need. I'm preparing the paperwork now.";
    }
    if (turn.kind === "complete") {
        return "That's everything — thank you.";
    }
    return turn.prompt;
}

/**
 * The line that introduces the last step, once the paperwork has been reviewed.
 *
 * Not every document is signed. The completed Admissions application asks for no signature, and
 * saying "One last step — sign below" above a page with nothing to sign told the parent to look for
 * something that was not there.
 */
export function participantSignaturePrompt(signatureExpected = true): string {
    return signatureExpected
        ? "Everything look right? One last step — sign below."
        : "Everything look right? Finish this one when you're ready.";
}

/**
 * The opening line, shown once while shared facts are still being settled.
 *
 * States the bargain plainly: we already hold some of this, so we will check it rather than ask for
 * it again. That is the whole reason the experience is a conversation and not a form.
 *
 * ## It only says that when it is TRUE
 *
 * This line was unconditional, and on the certified Admissions packet it was false. That packet
 * binds four canonical destinations out of eighty, and for a family whose record holds none of
 * them the platform knows literally nothing — yet every parent was told "I already have most of
 * Toureeb's information" and then asked all eighty questions. The eighty-item objective did report
 * sixteen units already settled, which looked like corroboration and was not: fifteen of them are
 * the packet's OPTIONAL questions, which settle by being optional rather than by being known.
 *
 * So the claim is now made only when there is something behind it — the same `known` projection the
 * summary underneath it is drawn from, so the sentence and the list can never disagree.
 */
export function participantIntro(objective: ParticipantObjectiveWire): string | null {
    if (objective.phase !== "shared_collection") return null;
    const subject = familiarName(objective);
    /*
     * STABLE FOR THE WHOLE SITTING.
     *
     * `known` empties as the parent confirms each fact, so branching on it alone made the opening
     * line — which stays in the transcript above them — change its words after the first answer.
     * `settled` is the other half of the same truth: every row in it is a confirmation of PRIOR
     * truth, so "we had something" is `known` or `settled`, and the sentence stops moving.
     */
    if (objective.known.length === 0 && objective.settled.length === 0) {
        /*
         * Nothing on file. Say what IS true — there is paperwork to finish and it will be a
         * conversation — rather than a claim about records the parent would find empty.
         */
        return subject
            ? `Let's finish ${subject}'s enrollment paperwork. I'll ask you one thing at a time and fill the forms in as we go.`
            : "Let's finish your child's enrollment paperwork. I'll ask you one thing at a time and fill the forms in as we go.";
    }
    return subject
        ? `Let's finish ${subject}'s enrollment paperwork. Here's what I already have — I'll ask you for anything that's missing.`
        : "Let's finish your child's enrollment paperwork. Here's what I already have — I'll ask you for anything that's missing.";
}

/**
 * The participant-facing progress line.
 *
 * Backed ONLY by `things_remaining`, which counts needs still requiring participant action. A
 * percentage is deliberately not offered: the requirement denominator legitimately contains
 * unrealized and unsupported items, so a percentage over it would move for reasons a parent cannot
 * see and would imply precision the number does not have.
 */
/**
 * The quiet orientation rail — a phrase, and the participant's own percentage.
 *
 * `null` means show nothing: a rail that appears mid-conversation with no honest number is chrome.
 * The percentage is `work`, never `progress` — see `participantWorkProgress.ts` for why the
 * requirement denominator is the wrong one to put in front of a parent.
 */
export type ParticipantProgressDisplay = {
    readonly label: string;
    readonly percent: number;
};

export function participantProgressDisplay(
    objective: ParticipantObjectiveWire,
): ParticipantProgressDisplay | null {
    const work = objective.work;
    if (!work || work.total <= 0) return null;
    if (objective.complete) return { label: "All done", percent: 100 };
    if (objective.phase === "artifact_review") {
        // Truthful about what is left, and it is not another question: the paperwork itself.
        return { label: "Ready to review", percent: work.percent };
    }
    const remaining = objective.things_remaining;
    if (remaining <= 0) return { label: "Almost there", percent: work.percent };
    // Orientation, not gamification: no streaks, no celebration, no "you're doing great".
    if (remaining === 1) return { label: "One more thing", percent: work.percent };

    /*
     * WHERE they are, not how many are left.
     *
     * "41 things left" is a true number and a discouraging one, and it is the count this product
     * has spent the whole slice refusing to show — first as "Question 17 of 92", now in its last
     * hiding place. A parent working through a topic wants to know which topic; the percentage
     * beside it already says how far along they are.
     */
    /*
     * The block the conversation is IN, not the page the box sits on.
     *
     * The cluster's title is the school's own section heading, so the rail read "Contact
     * Information" while the question underneath it asked about the second guardian — two names for
     * where the parent is, disagreeing. The turn's group is the same block the conversation is
     * labelled with; the cluster heading stays as the fallback for a turn with no nameable subject.
     */
    const topic = objective.next_turn.group?.title ?? objective.next_turn.cluster?.title;
    if (topic) return { label: topic, percent: work.percent };
    if (work.percent >= 70) return { label: "Almost there", percent: work.percent };
    return { label: "In progress", percent: work.percent };
}

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

/**
 * What to say when the runtime could not read a typed answer — and there IS a better way.
 *
 * ## The dead end this closes
 *
 * A parent answered "it's Bend" to a question about their address and got "Sorry — I didn't catch
 * that." That is true, and it is useless: it names no way forward, and their only remaining option
 * was to retype an address they had not meant to change.
 *
 * The reason the runtime cannot read it is worth being honest about. The tenant's packet binds ONE
 * address datum — `customer:address` — while D-101 admits the COMPONENTIZED address domains
 * (`address_line1`, `city`, `postal_code`). So there is no `city` need for "Bend" to be a candidate
 * correction to; a candidate for this need would be a candidate for the ENTIRE address, and
 * accepting it would replace "418 NE Hancock St, Portland, OR 97212" with "Bend". Refusing is
 * correct. Saying only "sorry" is not.
 *
 * So where the fact has a structured editor, the runtime says what it can do instead and opens it.
 * This widens NOTHING: no new domain becomes interpretable, no provider is consulted, and the
 * deterministic controls are unchanged. It replaces a dead end with a door.
 */
export function participantUnreadableAnswerMessage(
    objective: ParticipantObjectiveWire,
): string {
    const editor = objective.next_turn.editor;
    if (editor?.kind === "address") {
        return "I can only change an address as a whole, so I've opened it below — change just the part that's wrong.";
    }
    if (editor) {
        return "Sorry — I didn't catch that. I've opened the field below so you can set it directly.";
    }
    return PARTICIPANT_CLARIFICATION_MESSAGE;
}
