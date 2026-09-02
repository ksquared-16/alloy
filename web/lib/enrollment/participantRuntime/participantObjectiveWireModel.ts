/**
 * What a PARTICIPANT is allowed to see of their own Enrollment objective (Phase 3).
 *
 * The internal projection carries org ids, revision ids, requirement ids, session item ids and
 * per-occurrence Form plumbing. A parent needs none of that, and a public surface that returns
 * internal identifiers because they were convenient is how identifiers become an API nobody meant
 * to publish.
 *
 * So the wire model is an explicit allow-list: progress counts, the current turn, and the remaining
 * work described in the participant's own terms. Adding a field here is a visible decision.
 *
 * Pure. No I/O.
 */

import type { ParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { packageOutstandingNeeds } from "@/lib/enrollment/participantRuntime/conversationalPackage";
import {
    activeConfirmationGroup,
    collectedAnswers,
    confirmationRef,
    groupSettledConfirmations,
    identityFactRank,
    type ConfirmationGroup,
} from "@/lib/enrollment/participantRuntime/confirmationGroup";
import {
    semanticEditorFor,
    type SemanticEditor,
} from "@/lib/enrollment/participantRuntime/semanticValueEditor";
import { turnIsEligibleForProviderInterpretation } from "@/lib/enrollment/participantRuntime/turnInterpretationEligibility";
import {
    displayValue,
    naturalFieldLabel,
    questionForNeed,
    voiceForSubject,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";
import {
    projectParticipantWorkProgress,
    type ParticipantWorkProgress,
} from "@/lib/enrollment/participantRuntime/participantWorkProgress";

/**
 * Which part of the experience the participant is in.
 *
 * `shared_collection` — confirming and supplying facts that populate every artifact at once. The raw
 * Form must NOT be presented underneath: a parent who has just answered a question should not then
 * find the same box below it.
 * `artifact_review` — shared facts are settled; what remains belongs to a specific document
 * (acknowledgment, signature, an artifact-only field). This is where the populated artifact is shown.
 * `complete` — nothing remains.
 */
export type ParticipantPhase = "shared_collection" | "artifact_review" | "complete";

export type ParticipantObjectiveWire = {
    readonly stage_key: string | null;
    /** The child this Enrollment is about, for participant copy. Never an internal identifier. */
    readonly subject_display_name: string | null;
    readonly phase: ParticipantPhase;
    readonly progress: {
        readonly total: number;
        readonly satisfied: number;
        readonly remaining: number;
    };
    /** "3 things remaining", backed by deterministic need state. */
    readonly things_remaining: number;
    /**
     * The participant's OWN progress — unique semantic facts plus the paperwork, never requirements.
     *
     * Separate from `progress` above deliberately: that one is the requirement rollup and is the
     * denominator a parent must not be shown. This one is the conversation they are actually having.
     */
    readonly work: ParticipantWorkProgress;
    readonly next_turn: {
        readonly kind: string;
        readonly prompt: string;
        readonly proposed_value: unknown;
        /** How many Form fields this one answer resolves — the ask-once ratio, shown honestly. */
        readonly resolves_occurrences: number;
        /** The control type to render when a deterministic input is needed. */
        readonly input_type: string | null;
        readonly label: string | null;
        /**
         * WHOSE fact this is, and which canonical fact it is.
         *
         * The conversation's subject is a property of the need, never of the imported label. Without
         * these the surface had only the child's name to reach for, and asked a guardian for
         * "Marisol's phone number".
         */
        readonly scope?: string | null;
        readonly entity_type?: string | null;
        readonly canonical_key?: string | null;
        /**
         * The conversational topic this question belongs to, when it has siblings.
         *
         * A cluster is presentation over needs the objective already resolved — the grouping comes
         * from `packageOutstandingNeeds`, never from the component, so the surface cannot invent a
         * relationship the packet did not evidence. Exactly one member is `active`: the turn the
         * runtime selected, and the only one the composer is answering.
         */
        readonly cluster?: {
            readonly title: string | null;
            readonly questions: readonly {
                readonly need_key: string;
                readonly question: string;
                readonly state: "settled" | "active" | "upcoming";
                readonly answer: string | null;
            }[];
        } | null;
        /**
         * The known facts about ONE semantic subject, confirmed together.
         *
         * Present only when the subject has more than one fact awaiting confirmation. Everything in
         * it is presentation over needs the objective already resolved — the membership comes from
         * `confirmationGroup.ts`, which reads canonical identity and never an artifact's headings,
         * so the surface cannot draw two people as one.
         *
         * `facts` carries EVERY member, including the ones drawn into the heading, because "Make a
         * change" has to expose each semantic value on its own.
         */
        readonly confirmation_group?: {
            /** "Let's make sure I have Solene's details right." */
            readonly title: string;
            /** "Solene's details" — the noun phrase, for a compact settled record. */
            readonly heading: string;
            /** The composed identity line — "Solene Marchetti" — or null when nothing names them. */
            readonly headline: string | null;
            readonly facts: readonly {
                /** Opaque handle. The browser addresses a fact without naming a field. */
                readonly ref: string;
                readonly label: string;
                readonly value: string;
                /** The authored control, for correcting this one fact in place. */
                readonly input_type: string | null;
                readonly options: readonly string[];
                /**
                 * The STRUCTURED editor this fact deserves, chosen server-side.
                 *
                 * Chosen here rather than in the browser because the choice reads the canonical
                 * key — and the canonical key is exactly what must not cross to a participant
                 * surface. The component receives the editor, never the fact's identity.
                 */
                readonly editor: SemanticEditor;
                /** Drawn in the heading rather than as its own row. Still its own need. */
                readonly in_headline: boolean;
            }[];
        } | null;
        /**
         * The STRUCTURED editor to open when the parent presses Change.
         *
         * Change used to reveal the authored control, and for a plain text field the surface
         * renders no second text box — so a parent who had just said "let me correct this" was left
         * facing a composer prompting them to type a message. For a whole address that is worse:
         * the only way to fix a city was to retype the street and ZIP from memory.
         */
        readonly editor: SemanticEditor | null;
        /**
         * Required attachments this turn is asking for, before any paperwork is prepared.
         *
         * Field id and the school's own words for the document — nothing about storage, entity or
         * classification, which the upload route derives server-side from the pinned schema.
         */
        /**
         * A person to add, by ROLE.
         *
         * Never a numbered slot: the parent is asked about people, and projection decides which box
         * each person lands in afterwards from canonical relationship priority.
         */
        readonly party: {
            readonly role_label: string;
            /** People already holding this role for this child. */
            readonly existing: readonly string[];
            /** Household people offerable for reuse — opaque handles, never person ids. */
            readonly candidates: readonly { readonly ref: string; readonly name: string; readonly detail: string | null }[];
            /** Zero means declining is always available, which is every role today. */
            readonly minimum: number;
        } | null;
        readonly evidence: readonly {
            readonly field_id: string;
            readonly title: string;
            readonly description: string | null;
            readonly artifact_title: string;
        }[];
        /** Closed option set, when the authored control has one. Empty otherwise. */
        readonly options: readonly string[];
        /** The authored Form permits leaving this unanswered — offer a real way past it. */
        readonly optional: boolean;
        /**
         * The artifact fields this single answer fills.
         *
         * Already visible to the participant — they are the ids of controls on their own form — and
         * they are what lets the surface show the answer in the paperwork the instant it is given,
         * rather than leaving a field the parent just answered looking empty until a reload.
         */
        readonly field_ids: readonly string[];
    };
    /**
     * What the parent has already settled, as a SEMANTIC RECORD rather than a button transcript.
     *
     * Projected from the same durable needs the conversation is made of, so it survives a reload
     * and cannot drift from what is stored. That is what makes the Edit affordance beside each row
     * honest: a fact is still addressable after the conversation has moved past it.
     */
    readonly settled: readonly {
        readonly heading: string;
        readonly headline: string | null;
        readonly facts: readonly {
            readonly ref: string;
            readonly label: string;
            readonly value: string;
            readonly editor: SemanticEditor;
        }[];
    }[];
    /**
     * Answers the participant gave DURING this session.
     *
     * Settled and evidenced exactly like a confirmation, and NOT one — a parent who has just told
     * the school their child's sleep routine has not verified anything. Kept separate so a
     * confirmation card can never accumulate them, and flat rather than grouped by subject: this is
     * conversation history that recedes, not a summary of what the platform holds about a person.
     */
    readonly collected: readonly {
        readonly ref: string;
        readonly label: string;
        readonly value: string;
        readonly editor: SemanticEditor;
    }[];
    /**
     * An outstanding question the runtime raised about this need.
     *
     * The QUESTION only — never the pending value. The parent answers yes or no; the server alone
     * knows what yes refers to, so a tampered browser still cannot name a value to be written.
     */
    readonly pending_clarification: { readonly question: string } | null;
    /** Whether anything at all is left for the participant. */
    readonly complete: boolean;
};

/**
 * The child's name as the CONVERSATION currently knows it.
 *
 * The canonical record's display name is only the starting point: a parent who corrects the name
 * mid-conversation must be spoken to with the name they just gave, not the record they corrected —
 * "I have John's birthday…", never "Test Process4's" after the parent said John Peters. The needs
 * projection already resolves that precedence (session shared value over canonical), so the wire
 * reads the resolved `child_full_name` need and falls back to the record only when no such need
 * carries a value.
 */
function resolvedSubjectDisplayName(
    objective: ParticipantEnrollmentObjective,
    fallback: string | null | undefined,
): string | null {
    const nameNeed = objective.needs.needs.find(
        (n) => n.identity.shared_value_key === "child_full_name" && typeof n.current_value === "string",
    );
    const resolved = ((nameNeed?.current_value as string | undefined) ?? "").trim();
    return resolved || ((fallback ?? "").trim() || null);
}


/**
 * The topic the current question sits in, or null when it stands alone.
 *
 * Only a `deterministic_cluster` produces one. A single deterministic turn is a question, not a
 * topic, and a `conversational_free_text` package is answered as one paragraph — neither is helped
 * by a list of siblings, and showing one would misdescribe what the parent is being asked for.
 */
function activeCluster(
    objective: ParticipantEnrollmentObjective,
    subjectName: string | null,
): ParticipantObjectiveWire["next_turn"]["cluster"] {
    const activeKey = objective.next_turn.need?.identity.key ?? null;
    if (!activeKey) return null;

    const packages = packageOutstandingNeeds(objective.needs.needs, {
        // Settled members stay in the topic so the parent watches it fill in, not shrink.
        includeSettled: true,
        providerEligible: (need) =>
            turnIsEligibleForProviderInterpretation({
                kind: "collect_missing_value",
                need,
                prompt: "",
                proposed_value: null,
                resolves_occurrences: need.occurrence_count,
            }).eligible,
    });
    const pkg = packages.find((p) => p.need_keys.includes(activeKey));
    if (!pkg || pkg.interaction !== "deterministic_cluster" || pkg.need_keys.length < 2) return null;

    const byKey = new Map(objective.needs.needs.map((n) => [n.identity.key, n]));
    const questions = pkg.need_keys.flatMap((key) => {
        const need = byKey.get(key);
        if (!need) return [];
        const settled = !need.requires_participant_action && need.state !== "known_requires_confirmation";
        return [{
            need_key: key,
            question: questionForNeed(need, subjectName),
            state: (key === activeKey ? "active" : settled ? "settled" : "upcoming") as "settled" | "active" | "upcoming",
            answer: settled && need.has_value ? String(need.current_value ?? "") : null,
        }];
    });
    return { title: pkg.section_title, questions };
}

/**
 * A card row is a NOUN; a question is a sentence.
 *
 * Many destinations are whole questions the school wrote — "How would you describe your child's
 * gender?" — and `naturalFieldLabel` rightly hands those back untouched, because that is how they
 * should be ASKED. Beside a value in a summary card the same words read as an interrogation with the
 * answer already filled in, and they wrap to three lines on a phone.
 *
 * So where the authored label is a question or simply too long to sit beside a value, the row falls
 * back to the canonical FIELD KEY, humanized through the platform's own display-label behaviour.
 * That is not a guess: the key is what the fact IS, which is exactly what a row label wants.
 */
const CARD_ROW_MAX = 28;

function cardRowLabel(natural: string, fieldKey: string | null): string {
    const tidy = natural.trim();
    const tooLong = tidy.length > CARD_ROW_MAX;
    if (!tidy.endsWith("?") && !tooLong) return tidy;
    const key = (fieldKey ?? "").trim();
    if (!key) return tidy;
    // `child_first_name` under the `child` entity is already handled above; this is for keys like
    // `gender`, `nap_routine`, `medical_notes` whose label is the school's own question.
    return humanizeOperatorSlug(key).toLowerCase();
}

/**
 * One fact, as a parent reads it — shared by the active card and the settled record.
 *
 * Both surfaces must describe the same fact identically; composing them twice is how a value comes
 * to be formatted one way while it is being confirmed and another way once it has been.
 */
function factRow(need: import("@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes").EnrollmentInformationNeed, ref: string) {
    const occurrence = need.occurrences[0] ?? null;
    const natural = naturalFieldLabel(occurrence?.label ?? null, need.identity.canonical_key ?? null);
    const spoken = natural === "date of birth" ? "birthday" : cardRowLabel(natural, need.identity.field_key);
    const options = occurrence?.options ?? [];
    return {
        ref,
        label: spoken.charAt(0).toUpperCase() + spoken.slice(1),
        value: displayValue(need.current_value),
        input_type: occurrence?.field_type ?? null,
        options,
        editor: semanticEditorFor({
            canonicalKey: need.identity.canonical_key,
            inputType: occurrence?.field_type ?? null,
            options,
            value: need.current_value,
        }),
    };
}

/**
 * The noun phrase for a subject — "Chidinma's details", "Your details".
 *
 * A settled record is a heading over values, not a question, so it must not reuse the card's
 * sentence. Derived from the same voice, so the two can never describe different people.
 */
function subjectHeading(possessive: string): string {
    const phrase = `${possessive} details`;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * The voice for one confirmation group's subject.
 *
 * Extracted so the active card and the settled record resolve it identically.
 */
function groupVoice(group: ConfirmationGroup, subjectName: string | null) {
    return voiceForSubject({
        entityType: group.subject.entity_type,
        scope: group.subject.kind === "child" ? "child" : "household",
        childName: (subjectName ?? "").trim().split(/\s+/)[0] ?? "",
    });
}

/**
 * The answers given in this session, as rows the parent can read and still change.
 *
 * No heading, no subject, no "Confirmed": this is not a claim about what the platform holds, it is
 * what the parent said. The label and value composition is shared with the confirmation card so the
 * same fact never reads two ways.
 */
function collectedRecord(objective: ParticipantEnrollmentObjective): ParticipantObjectiveWire["collected"] {
    const byKey = new Map(objective.needs.needs.map((n) => [n.identity.key, n]));
    return collectedAnswers(objective.needs.needs).flatMap((member) => {
        const need = byKey.get(member.need_key);
        if (!need) return [];
        const { ref, label, value, editor } = factRow(need, member.ref);
        return [{ ref, label, value, editor }];
    });
}

/**
 * The settled semantic record.
 *
 * Grouped by the SAME subject rule as the active card, so a group a parent confirmed together stays
 * together afterwards rather than dissolving into the rows it was made of.
 */
function settledRecord(
    objective: ParticipantEnrollmentObjective,
    subjectName: string | null,
): ParticipantObjectiveWire["settled"] {
    const byKey = new Map(objective.needs.needs.map((n) => [n.identity.key, n]));
    return groupSettledConfirmations(objective.needs.needs).flatMap((group) => {
        const voice = groupVoice(group, subjectName);
        const rows = group.members.flatMap((member) => {
            const need = byKey.get(member.need_key);
            if (!need) return [];
            const { ref, label, value, editor } = factRow(need, member.ref);
            return [{ ref, label, value, editor }];
        });
        if (rows.length === 0) return [];
        // The identity facts compose the heading line here too — "Chidinma Okonkwo" above the
        // values, exactly as the card showed them before they were agreed to.
        const identityRefs = new Set(group.members.filter((m) => m.is_identity).map((m) => m.ref));
        const identityRows = group.members
            .filter((m) => m.is_identity)
            .map((m) => byKey.get(m.need_key))
            .filter((n): n is NonNullable<typeof n> => Boolean(n))
            .sort((a, b) => identityFactRank(a) - identityFactRank(b));
        let headline = "";
        for (const need of identityRows) {
            const shown = displayValue(need.current_value).trim();
            if (!shown || headline.toLowerCase().includes(shown.toLowerCase())) continue;
            headline = headline ? `${headline} ${shown}` : shown;
        }
        return [{
            heading: subjectHeading(voice.possessive),
            headline: headline || null,
            /*
             * EVERY row, including the ones drawn into the heading.
             *
             * The record exists so a parent can see what they agreed to and change it. A name folded
             * into the heading and then omitted from the rows would be the one fact they could read
             * and not correct.
             */
            facts: rows,
            _identity: identityRefs,
        }].map(({ _identity, ...rest }) => rest);
    });
}

/**
 * The grouped confirmation card for the CURRENT turn, or null when this turn stands alone.
 *
 * Composition only. Membership was decided by `confirmationGroup.ts` from canonical identity; this
 * turns those needs into words — the subject's own voice for the heading, the platform's own value
 * formatter for each fact, and the authored control type so a correction is made with the control
 * the Form itself would have used.
 */
function confirmationGroupCard(
    objective: ParticipantEnrollmentObjective,
    subjectName: string | null,
): ParticipantObjectiveWire["next_turn"]["confirmation_group"] {
    const turn = objective.next_turn;
    if (turn.kind !== "confirm_known_value") return null;
    const group = activeConfirmationGroup(objective.needs.needs, turn.need?.identity.key ?? null);
    if (!group) return null;

    const byKey = new Map(objective.needs.needs.map((n) => [n.identity.key, n]));
    const voice = groupVoice(group, subjectName);

    /*
     * The heading, built from the facts that NAME this subject.
     *
     * A value already contained in what has been composed is skipped rather than repeated, so a
     * record carrying both `first_name`/`last_name` and a `full_name` reads "Solene Marchetti" once.
     * Every one of those needs still appears in `facts`, and is still confirmed on its own.
     */
    const identity = group.members
        .filter((m) => m.is_identity)
        .map((m) => ({ member: m, need: byKey.get(m.need_key) }))
        .filter((row): row is { member: typeof row.member; need: NonNullable<typeof row.need> } => Boolean(row.need))
        .sort((a, b) => identityFactRank(a.need) - identityFactRank(b.need));

    const consumed = new Set<string>();
    let headline = "";
    for (const row of identity) {
        const shown = displayValue(row.need.current_value).trim();
        if (!shown) continue;
        if (headline.toLowerCase().includes(shown.toLowerCase())) {
            // Already said. The need is still a member; it simply adds no new words to the heading.
            consumed.add(row.member.ref);
            continue;
        }
        headline = headline ? `${headline} ${shown}` : shown;
        consumed.add(row.member.ref);
    }

    const facts = group.members.flatMap((member) => {
        const need = byKey.get(member.need_key);
        if (!need) return [];
        return [{ ...factRow(need, member.ref), in_headline: consumed.has(member.ref) }];
    });

    return {
        /*
         * A STRAIGHT apostrophe, matching every other sentence the runtime composes.
         *
         * `participantQuestion` builds its possessive as `${name}'s`, so a curly one here produced
         * "Let’s make sure I have Solene's details right." — two apostrophes of different shapes
         * in one sentence. Typography is a property of the voice, not of the file it is written in.
         */
        title: `Let's make sure I have ${voice.possessive} details right.`,
        heading: subjectHeading(voice.possessive),
        headline: headline || null,
        facts,
    };
}

export function participantObjectiveWireModel(
    objective: ParticipantEnrollmentObjective,
    context?: {
        readonly subjectDisplayName?: string | null;
        /** The outstanding question for the CURRENT need, resolved by the caller from session state. */
        readonly pendingClarificationQuestion?: string | null;
    },
): ParticipantObjectiveWire {
    const turn = objective.next_turn;
    const firstOccurrence = turn.need?.occurrences[0] ?? null;
    const subjectName = resolvedSubjectDisplayName(objective, context?.subjectDisplayName);

    /**
     * PHASE IS DERIVED FROM THE TURN — one authority, not two.
     *
     * It used to be derived independently, from `known_requiring_confirmation.length + missing.length`.
     * That produced a state the product must never reach: the turn selector skips a need that does
     * not require participant action, so an OPTIONAL missing fact left the turn at
     * `complete_artifact` while the phase still said `shared_collection`. The card rendered
     * "review and finish it below" because it reads the turn; the host suppressed the artifact
     * because it reads the phase. The parent got a handoff with nothing beneath it.
     *
     * Two readers of the same situation disagreed because they asked different questions. Now the
     * turn — which is the deterministic runtime's own answer to "what next" — decides both.
     */
    /*
     * `collect_evidence` is participant COLLECTION, not review.
     *
     * The host defers the packet Form while the phase is `shared_collection`, which is exactly what
     * must happen while a required document is outstanding: no artifact is shown, and [Review
     * paperwork] is not reachable, because the paperwork has not been prepared.
     */
    const phase: ParticipantPhase =
        turn.kind === "complete"
            ? "complete"
            : turn.kind === "complete_artifact"
              ? "artifact_review"
              : "shared_collection";

    return {
        stage_key: objective.stage_key,
        subject_display_name: resolvedSubjectDisplayName(objective, context?.subjectDisplayName),
        phase,
        progress: {
            total: objective.progress.total_requirements,
            satisfied: objective.progress.satisfied_requirements,
            remaining: objective.progress.remaining_requirements,
        },
        things_remaining: objective.needs.needs_requiring_action,
        work: projectParticipantWorkProgress({ needs: objective.needs.needs, phase }),
        next_turn: {
            kind: turn.kind,
            prompt: turn.prompt,
            proposed_value: turn.proposed_value,
            resolves_occurrences: turn.resolves_occurrences,
            // Enough for the surface to render the deterministic control when the provider is
            // unavailable — the fallback has to be renderable from this payload alone.
            input_type: firstOccurrence ? inputTypeForNeed(objective, firstOccurrence.form_field_id) : null,
            label: firstOccurrence?.label ?? null,
            cluster: activeCluster(objective, subjectName),
            party: turn.party
                ? {
                      role_label: turn.party.role_label,
                      existing: turn.party.existing.map((p) => p.full_name),
                      candidates: objective.party_candidates.map((c) => ({
                          ref: confirmationRef(c.person_id),
                          name: c.full_name,
                          detail: c.phone ?? c.email ?? null,
                      })),
                      minimum: turn.party.minimum,
                  }
                : null,
            evidence: (turn.evidence ?? []).map((e) => ({
                field_id: e.field_id,
                title: e.title,
                description: e.description,
                artifact_title: e.artifact_title,
            })),
            editor: turn.need
                ? semanticEditorFor({
                      canonicalKey: turn.need.identity.canonical_key,
                      inputType: firstOccurrence?.field_type ?? null,
                      options: firstOccurrence?.options ?? [],
                      value: turn.proposed_value,
                  })
                : null,
            confirmation_group: confirmationGroupCard(objective, subjectName),
            scope: turn.need?.identity.scope ?? null,
            /*
             * The EFFECTIVE subject — declared entity, else the one the packet's layout says this
             * destination sits among. The distinction between the two is preserved on the identity
             * server-side; a participant surface needs to know who it is talking about, not how the
             * platform came to know.
             */
            entity_type: turn.need?.identity.entity_type ?? turn.need?.identity.subject_entity_type ?? null,
            canonical_key: turn.need?.identity.canonical_key ?? null,
            options: firstOccurrence ? optionsForNeed(objective, firstOccurrence.form_field_id) : [],
            optional: turn.need?.optional === true,
            field_ids: (turn.need?.occurrences ?? []).map((o) => o.form_field_id),
        },
        settled: settledRecord(objective, subjectName),
        collected: collectedRecord(objective),
        pending_clarification: context?.pendingClarificationQuestion
            ? { question: context.pendingClarificationQuestion }
            : null,
        complete: turn.kind === "complete",
    };
}

/**
 * The control type for the current need.
 *
 * Derived from the need's own first occurrence rather than guessed from the value: the authored Form
 * control is what the participant will ultimately fill, so the conversational input should match it.
 */
function inputTypeForNeed(
    objective: ParticipantEnrollmentObjective,
    formFieldId: string,
): string | null {
    const need = objective.next_turn.need;
    if (!need) return null;
    const occurrence = need.occurrences.find((o) => o.form_field_id === formFieldId);
    // The authored type, not "text". This returned a constant, which is why a date of birth and a
    // free-text note reached the participant as the same undifferentiated box.
    return occurrence ? occurrence.field_type : null;
}

/** The authored option set for the current need, when the control is a closed one. */
function optionsForNeed(
    objective: ParticipantEnrollmentObjective,
    formFieldId: string,
): readonly string[] {
    const need = objective.next_turn.need;
    if (!need) return [];
    return need.occurrences.find((o) => o.form_field_id === formFieldId)?.options ?? [];
}
