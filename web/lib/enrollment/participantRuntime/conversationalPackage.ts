/**
 * A small group of related things to ask at once — and nothing more than that.
 *
 * A package owns no canonical truth, satisfies no requirement, and has no identity beyond the turn
 * it composes. It is presentation over the SAME needs the objective already resolved: N need ids, a
 * prompt, and the rule that each need is answered, validated and applied entirely on its own. Two
 * needs travelling in one sentence is a courtesy to the parent, never a merge of two facts.
 *
 * That is the whole reason partial success is normal here. Three needs asked, two safely resolved,
 * one still ambiguous — the third is simply still outstanding, and gets asked next. Nothing about
 * the package survives to explain that; the need does.
 *
 * GROUPING IS EVIDENCE, NOT INFERENCE. The school wrote "Emergency Contact Information & Authorized
 * Adults" on its own form; Alloy did not invent that category, and does not invent any other. Needs
 * group when the packet already says they belong together AND the conversation can ask them in one
 * breath without changing subject or mixing a typed answer with a tapped one.
 *
 * Pure. No I/O. No provider.
 */

import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

/** Bigger than this stops being a question and becomes a form read aloud. */
export const MAX_PACKAGE_SIZE = 4;

export type PackageInteraction =
    /** Every member has an authored control: a date, a choice, a yes/no. Answered by tapping. */
    | "deterministic"
    /**
     * One free-text answer may carry several facts, because Trust permits interpreting it.
     *
     * Rare on purpose, and it is D-101 that decides — not the field type. This is the only mode
     * where a parent's paragraph is sent anywhere.
     */
    | "conversational_free_text"
    /**
     * Related open-text questions asked together, each answered on its own.
     *
     * The mode that carries the V1 experience. D-101 refuses provider interpretation for health
     * narrative, safeguarding and artifact-specific responses — with reasons, and the Director has
     * ruled it authoritative — so a parent's words about how their child is comforted are never
     * sent to a provider. That is a constraint on INTERPRETATION, not on conversation: the questions
     * still arrive together, under the school's own heading, and each answer settles its own need
     * through the deterministic path.
     *
     * Calling this `open_text` was the earlier mistake. The label promised a paragraph that would be
     * read as several facts, which for most of this corpus is something the platform must not do.
     */
    | "deterministic_cluster"
    /** Known values awaiting one confirmation. */
    | "confirmation";

export interface ConversationalPackage {
    /** Ordered need identity keys. The ONLY thing a provider may propose answers for. */
    readonly need_keys: readonly string[];
    /** The school's own heading for this group, when it had one. */
    readonly section_title: string | null;
    readonly interaction: PackageInteraction;
    /** Whose facts these are — a package never mixes subjects. */
    readonly voice_key: string;
}

/**
 * How this need is answered — and, for text, whether its words may be interpreted at all.
 *
 * The Trust allow-list is consulted rather than guessed at: eligibility is a property of the
 * semantic domain, so two text fields side by side can legitimately differ.
 */
function interactionFor(need: EnrollmentInformationNeed, providerEligible: (n: EnrollmentInformationNeed) => boolean): PackageInteraction {
    if (need.state === "known_requires_confirmation") return "confirmation";
    const first = need.occurrences[0];
    const t = first?.field_type ?? "text";
    if (t === "date" || t === "boolean" || t === "select" || t === "multiselect" || t === "number") return "deterministic";
    if ((first?.options?.length ?? 0) > 0) return "deterministic";
    return providerEligible(need) ? "conversational_free_text" : "deterministic_cluster";
}

/**
 * Whose fact this is, at the grain the conversation speaks in.
 *
 * A package that mixed "your phone number" with "Marisol's allergies" would read as one question
 * about two people. Keyed on the same identity the subject grammar uses, so the two can never drift.
 */
function voiceKeyFor(need: EnrollmentInformationNeed): string {
    const entity = (need.identity.entity_type ?? "").toLowerCase();
    if (entity === "person" || entity === "guardian" || entity === "contact") return "responding_adult";
    if (entity === "customer") return "household";
    if (entity === "child" || entity === "customer_member" || entity === "enrollment") return `child:${need.subject_id ?? "-"}`;
    return need.scope === "recipient" ? "responding_adult" : `scope:${need.scope}:${need.subject_id ?? "-"}`;
}

/**
 * Group the outstanding needs into packages, in the order the participant will meet them.
 *
 * Order is the objective's own — first appearance across the pinned Forms — so packaging never
 * reorders the conversation, only decides where one turn ends and the next begins. A run is closed
 * as soon as the section, the subject or the way of answering changes.
 */
export function packageOutstandingNeeds(
    needs: readonly EnrollmentInformationNeed[],
    opts?: {
        maxSize?: number;
        /**
         * Does Trust permit interpreting this need's words? Injected so packaging depends on the
         * allow-list's ANSWER without importing its rules, and so a test can state the answer.
         * Absent, nothing is treated as interpretable — the safe direction.
         */
        providerEligible?: (need: EnrollmentInformationNeed) => boolean;
    },
): ConversationalPackage[] {
    const max = Math.max(1, opts?.maxSize ?? MAX_PACKAGE_SIZE);
    const eligible = opts?.providerEligible ?? (() => false);
    const packages: ConversationalPackage[] = [];
    let run: EnrollmentInformationNeed[] = [];

    const flush = () => {
        if (!run.length) return;
        packages.push({
            need_keys: run.map((n) => n.identity.key),
            section_title: run[0]!.occurrences[0]?.section_title ?? null,
            interaction: interactionFor(run[0]!, eligible),
            voice_key: voiceKeyFor(run[0]!),
        });
        run = [];
    };

    for (const need of needs) {
        if (!need.requires_participant_action && need.state !== "known_requires_confirmation") continue;
        if (!run.length) { run = [need]; continue; }
        const head = run[0]!;
        /*
         * A date picker and a yes/no do not become easier by arriving together, so a deterministic
         * turn stays a turn of one. Packaging earns its keep on open text, where a parent answers
         * several related things in one natural sentence. The cap is applied HERE rather than by
         * trimming a finished package — trimming would silently drop needs from the conversation.
         */
        const headInteraction = interactionFor(head, eligible);
        const roomFor = headInteraction === "deterministic" ? 1 : max;
        const compatible =
            run.length < roomFor &&
            (head.occurrences[0]?.section_title ?? null) === (need.occurrences[0]?.section_title ?? null) &&
            voiceKeyFor(head) === voiceKeyFor(need) &&
            headInteraction === interactionFor(need, eligible);
        if (!compatible) flush();
        run.push(need);
    }
    flush();

    return packages;
}
