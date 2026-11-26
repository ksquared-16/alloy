/**
 * Finish one person before starting the next.
 *
 * ## The choreography this corrects
 *
 * The runtime had semantic facts and still traversed them like flattened Form destinations: the
 * queue was ordered by state, then by first appearance across the pinned artifacts. Source field
 * order therefore dictated the conversation, producing sequences that jump between people —
 * guardian, then a child date, then back to the guardian, then an emergency contact's employer —
 * because that is the order the boxes happen to sit in on a PDF.
 *
 * The invariant: **source field order and numbered slots do not dictate participant conversation
 * order.** Outstanding needs are ordered primarily by semantic subject, then by coherent topic, and
 * only then by the projection's own order.
 *
 * ## The order, and where each rank comes from
 *
 * ```
 *   0  the child's basic details        identity facts and whatever shares their section
 *   1  the primary parent/guardian      the `guardian` entity
 *   2  additional people                the generic `person` entity — second guardians, contacts
 *   3  the household                    `customer` / `household`
 *   4  the child's other topics         health, development, routines, social — by the school's
 *                                       own section headings, in the order the packet presents them
 *   5  everything with no nameable subject
 * ```
 *
 * The child comes first and comes back later on purpose: a parent settles who their child IS before
 * anything else, and the long health and development narrative is a different conversation that
 * belongs after the people are established.
 *
 * ## "Basic" is not a field list
 *
 * A child fact is basic when its canonical key is one the D-100 confirmation policy already names —
 * the platform's existing statement of "ordinary identity facts a parent verifies at a glance" — or
 * when it shares a section with one. That reuses an owner rather than adding a second vocabulary,
 * and it means an imported packet inherits the behaviour: whatever section the school put the
 * child's name in becomes the child's basic block, whatever it is called.
 *
 * Pure. No I/O.
 */

import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import { confirmationSubjectFor } from "@/lib/enrollment/participantRuntime/confirmationGroup";

export const TRAVERSAL_RANK = {
    childBasics: 0,
    primaryGuardian: 1,
    otherPeople: 2,
    household: 3,
    childTopics: 4,
    unsubjected: 5,
} as const;

/** The effective subject entity — declared, else the one the packet's layout supplies. */
function subjectEntity(need: EnrollmentInformationNeed): string | null {
    return need.identity.entity_type ?? need.identity.subject_entity_type ?? null;
}

/**
 * Sections that contain a fact the confirmation policy names.
 *
 * Computed over the whole need set rather than per need, because "the section the child's name is
 * in" is a property of the packet, not of any one destination.
 */
function basicChildSections(
    needs: readonly EnrollmentInformationNeed[],
    requiresConfirmation: ReadonlySet<string>,
): ReadonlySet<string> {
    const out = new Set<string>();
    for (const need of needs) {
        const key = need.identity.canonical_key ?? need.identity.shared_value_key;
        if (!key || !requiresConfirmation.has(key)) continue;
        if (confirmationSubjectFor(need).kind !== "child") continue;
        for (const occurrence of need.occurrences) {
            out.add(sectionKey(occurrence.form_definition_id, occurrence.section_title));
        }
    }
    return out;
}

/** A section is only comparable WITHIN one artifact — two forms may both call a page "Page 1". */
function sectionKey(formDefinitionId: string, sectionTitle: string | null): string {
    return `${formDefinitionId}::${sectionTitle ?? ""}`;
}

export type TraversalPlacement = {
    readonly rank: number;
    /** Needs sharing this stay adjacent — one person, or one of the child's topics. */
    readonly blockKey: string;
};

export function traversalPlacement(
    need: EnrollmentInformationNeed,
    context: { readonly basicSections: ReadonlySet<string>; },
): TraversalPlacement {
    const subject = confirmationSubjectFor(need);
    const entity = (subjectEntity(need) ?? "").toLowerCase();
    const occurrence = need.occurrences[0] ?? null;
    const section = occurrence ? sectionKey(occurrence.form_definition_id, occurrence.section_title) : "";

    if (subject.kind === "child") {
        // The child's basic block: the identity facts, and whatever the school put beside them.
        if (context.basicSections.has(section) || context.basicSections.size === 0) {
            return { rank: TRAVERSAL_RANK.childBasics, blockKey: `child:basics` };
        }
        /*
         * A later child topic, kept together by the school's own heading.
         *
         * Health, development, routines and social behaviour are different conversations, and the
         * packet already says which is which. Using the heading here is grouping evidence, not
         * identity — it never decides what a value means, only when it is asked.
         */
        return { rank: TRAVERSAL_RANK.childTopics, blockKey: `child:${section}` };
    }
    if (entity === "guardian" || entity === "parent") {
        return { rank: TRAVERSAL_RANK.primaryGuardian, blockKey: "guardian" };
    }
    if (subject.kind === "person") {
        return { rank: TRAVERSAL_RANK.otherPeople, blockKey: `person:${entity || "other"}` };
    }
    if (subject.kind === "household") {
        return { rank: TRAVERSAL_RANK.household, blockKey: "household" };
    }
    return { rank: TRAVERSAL_RANK.unsubjected, blockKey: `other:${section}` };
}

/**
 * Order the outstanding needs the way the conversation should meet them.
 *
 * Stable within a block: the projection's own order is preserved, so nothing reshuffles underneath
 * a parent as they answer. Confirmations still come before collections WITHIN a subject — settling
 * what is already known about someone is cheaper than typing something new about them — but a
 * confirmation never pulls the conversation away from the person currently being discussed.
 */
export function orderNeedsForTraversal(
    needs: readonly EnrollmentInformationNeed[],
    requiresConfirmation: ReadonlySet<string>,
    /**
     * EVERY need, not just the outstanding ones.
     *
     * "The section the child's name is in" is a property of the PACKET and must not move as the
     * conversation progresses. Computing it from the outstanding set meant that the moment the
     * child's identity facts were confirmed no child need carried a policy key any more, the set
     * went empty, and the fallback reclassified the entire health and development narrative as
     * basic — so it was asked immediately after the child's name instead of after the household.
     * Observed live: medications, diet, favourite foods and toilet habits at turns 2 to 6.
     */
    allNeeds: readonly EnrollmentInformationNeed[] = needs,
): EnrollmentInformationNeed[] {
    const basicSections = basicChildSections(allNeeds, requiresConfirmation);
    const blockOrder = new Map<string, number>();
    const placements = new Map<string, TraversalPlacement>();

    needs.forEach((need) => {
        const placement = traversalPlacement(need, { basicSections });
        placements.set(need.identity.key, placement);
        // First appearance decides a block's position among its peers, so the packet's own sequence
        // still shows through where nothing more meaningful distinguishes two blocks.
        if (!blockOrder.has(placement.blockKey)) blockOrder.set(placement.blockKey, blockOrder.size);
    });

    const confirmFirst = (need: EnrollmentInformationNeed) =>
        need.state === "known_requires_confirmation" ? 0 : 1;

    return needs
        .map((need, index) => ({ need, index }))
        .sort((a, b) => {
            const pa = placements.get(a.need.identity.key)!;
            const pb = placements.get(b.need.identity.key)!;
            if (pa.rank !== pb.rank) return pa.rank - pb.rank;
            const oa = blockOrder.get(pa.blockKey)!;
            const ob = blockOrder.get(pb.blockKey)!;
            if (oa !== ob) return oa - ob;
            const ca = confirmFirst(a.need);
            const cb = confirmFirst(b.need);
            if (ca !== cb) return ca - cb;
            return a.index - b.index;
        })
        .map((row) => row.need);
}
