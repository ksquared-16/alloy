/**
 * "Now, about Parent/Guardian #2."
 *
 * ## What was missing
 *
 * The traversal already finishes one person before starting the next, and a parent could not tell.
 * Eighty questions arrived as eighty questions: the guardian's employer, then the guardian's
 * employer address, then — with no seam of any kind — the second guardian's name, then an emergency
 * contact's phone number. The conversation had context and never said so, which is the difference
 * between talking to a specialist and filling in a form that asks one box at a time.
 *
 * ## The smallest thing that fixes it
 *
 * A NAME for the block the conversation is in, derived from the block it is already in. No new
 * ordering, no new grouping, no wizard: `traversalPlacement` decides the blocks, and this says what
 * to call one. The surface speaks only when the key CHANGES, so a run of six questions about the
 * same person carries one line and not six headings.
 *
 * ## Where each title comes from
 *
 * ```
 *   a person       Alloy's own relationship vocabulary, singular, numbered when there are several
 *   the child      their basics block speaks their name; a later topic speaks the SCHOOL's heading
 *   the household  the household
 *   anything else  nothing — an unnameable block is better left unannounced than labelled "Other"
 * ```
 *
 * The school's own heading is used for the child's later topics deliberately: "Health Information
 * and Developmental History" is what that packet calls it, and inventing a friendlier name would
 * describe a section the parent can see with words the school never chose.
 *
 * Pure. No I/O.
 */

import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import { confirmationSubjectFor } from "@/lib/enrollment/participantRuntime/confirmationGroup";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import { personSlotKey, type ParticipantPersonLabel } from "@/lib/enrollment/participantRuntime/participantPersonLabel";
import {
    traversalContext,
    traversalPlacement,
    TRAVERSAL_RANK,
} from "@/lib/enrollment/participantRuntime/participantTraversalOrder";

export type ParticipantConversationGroup = {
    /** Stable for as long as the conversation stays with this subject. The surface compares it. */
    readonly key: string;
    /** "Guardian #2", "Emergency contact #1", "Lennon's details", "Health and developmental history". */
    readonly title: string;
};

/** "emergency_contact" -> "Emergency contact". Sentence case: it is a phrase, not a heading. */
function humanizeRole(role: string): string {
    const words = role.replace(/[_-]+/g, " ").trim();
    if (!words) return "";
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** The school's own heading, sentence-cased so it reads as speech rather than a page banner. */
function humanizeSection(title: string): string {
    const trimmed = title.trim().replace(/\s*[:]\s*$/, "");
    if (!trimmed) return "";
    // Leave an ALL-CAPS or Title Case heading alone beyond the first letter: these are proper
    // names of sections the parent will also see on the paperwork.
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function participantConversationGroup(input: {
    readonly need: EnrollmentInformationNeed | null;
    readonly allNeeds: readonly EnrollmentInformationNeed[];
    readonly requiresConfirmation: ReadonlySet<string>;
    /** The child's familiar name, for their own block. */
    readonly childName: string | null;
    /**
     * Who each numbered slot is about, keyed `role#ordinal` — see `participantPersonLabel`.
     *
     * Optional so every existing caller keeps the numbered titles exactly as they were; supplying
     * it is what turns "Guardian #1" into "Kelly Kurzman · Primary contact".
     */
    readonly personLabels?: ReadonlyMap<string, ParticipantPersonLabel>;
}): ParticipantConversationGroup | null {
    const need = input.need;
    if (!need) return null;

    const placement = traversalPlacement(need, traversalContext(input.allNeeds, input.requiresConfirmation));
    const subject = confirmationSubjectFor(need);

    if (subject.kind === "person") {
        const role = subject.entity_type ?? "";
        const definition = relationshipDefinitionForRole(role);
        const base = humanizeRole(definition?.iteration_alias ?? role);
        if (!base) return null;
        /*
         * The ordinal is spoken only when there IS more than one of this role in the packet.
         * "Physician #1" on a form with one physician is a number the parent has no use for;
         * "Emergency contact #2" on a form with three is the only thing that tells them which.
         */
        const peers = new Set(
            input.allNeeds
                .map((n) => confirmationSubjectFor(n))
                .filter((s) => s.kind === "person" && s.entity_type === role)
                .map((s) => s.ordinal ?? 1),
        );
        /*
         * A PERSON, WHERE THE PLATFORM KNOWS ONE.
         *
         * "Guardian #1" names a box on a page. The moment a real person is behind it — canonically,
         * or because the family has just typed their name into this slot's own name box — the block
         * is called by that person's name and their own relationship. The numbered form remains for
         * a slot nobody has filled yet, which is the only case where the position IS the identity.
         */
        const identity = input.personLabels?.get(personSlotKey(role, subject.ordinal ?? 1));
        if (identity?.name) {
            return { key: placement.blockKey, title: `${identity.name} · ${identity.role_label}` };
        }
        const title = peers.size > 1 ? `${base} #${subject.ordinal ?? 1}` : base;
        return { key: placement.blockKey, title };
    }

    if (subject.kind === "child") {
        if (placement.rank === TRAVERSAL_RANK.childBasics) {
            const name = (input.childName ?? "").trim();
            return { key: placement.blockKey, title: name ? `${name}'s details` : "Your child's details" };
        }
        const section = humanizeSection(need.occurrences[0]?.section_title ?? "");
        if (!section) return null;
        /*
         * A CHILD TOPIC LEADS WITH THE CHILD, exactly as a person row leads with the person.
         *
         * The section heading alone read as a peer of the people listed beside it, and on this
         * packet that was actively misleading: "Emergency Contact Information & Authorized Adults"
         * sat directly under "Marisol Vega · Emergency contact" and held two answers that are about
         * the CHILD — whether there are custody arrangements, and whether anyone has a restraining
         * order. A parent scanning that summary would reasonably read them as Marisol's.
         *
         * The school's own words are kept, because the parent meets them on the paperwork and
         * inventing a friendlier name would describe a section they can see with words nobody chose.
         * What changes is only WHOSE topic it is said to be — `subject · qualifier`, the same
         * grammar every person row already uses, so no row in the summary is a page location.
         */
        const name = (input.childName ?? "").trim();
        return { key: placement.blockKey, title: name ? `${name} · ${section}` : section };
    }

    if (subject.kind === "household") {
        return { key: placement.blockKey, title: "Your family" };
    }

    // Unnameable. Saying nothing is the honest option; "Other" would be a label for the platform's
    // own uncertainty, printed at a parent.
    return null;
}
