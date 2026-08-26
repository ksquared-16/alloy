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
    /** Open text — the case where a natural answer may carry several facts at once. */
    | "open_text"
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

/** Deterministic controls are answered by tapping, and must not be blended into prose. */
function interactionFor(need: EnrollmentInformationNeed): PackageInteraction {
    if (need.state === "known_requires_confirmation") return "confirmation";
    const first = need.occurrences[0];
    const t = first?.field_type ?? "text";
    if (t === "date" || t === "boolean" || t === "select" || t === "multiselect" || t === "number") return "deterministic";
    if ((first?.options?.length ?? 0) > 0) return "deterministic";
    return "open_text";
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
    opts?: { maxSize?: number },
): ConversationalPackage[] {
    const max = Math.max(1, opts?.maxSize ?? MAX_PACKAGE_SIZE);
    const packages: ConversationalPackage[] = [];
    let run: EnrollmentInformationNeed[] = [];

    const flush = () => {
        if (!run.length) return;
        packages.push({
            need_keys: run.map((n) => n.identity.key),
            section_title: run[0]!.occurrences[0]?.section_title ?? null,
            interaction: interactionFor(run[0]!),
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
        const headInteraction = interactionFor(head);
        const roomFor = headInteraction === "deterministic" ? 1 : max;
        const compatible =
            run.length < roomFor &&
            (head.occurrences[0]?.section_title ?? null) === (need.occurrences[0]?.section_title ?? null) &&
            voiceKeyFor(head) === voiceKeyFor(need) &&
            headInteraction === interactionFor(need);
        if (!compatible) flush();
        run.push(need);
    }
    flush();

    return packages;
}
