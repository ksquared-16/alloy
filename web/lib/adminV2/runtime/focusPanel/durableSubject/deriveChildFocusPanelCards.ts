/**
 * CHILD-GRAIN CARD MODELS.
 *
 * The card that answers "who is this child" is `children` — the platform's CONFIGURED child card,
 * whose fields, labels, order, visibility and edit affordance come from the tenant's Children
 * Surface. It is the same card, from the same producer, that a Work Unit's Focus Panel and a Search
 * destination render, and it reaches this grain because the registry declares that it can.
 *
 * ── WHY THIS FILE NO LONGER LEADS WITH `child_identity` ──
 *
 * `children` looked like a family ROSTER, so a durable child record was given a small card of its
 * own instead. The result was two platform answers to one question: a child opened from a case
 * showed photo, gender, allergies, medical notes and special instructions with an Edit action, and
 * the same child opened from a record showed four fields and no way to change any of them. Which
 * one an operator saw depended on how they had arrived.
 *
 * The card was never really a roster — its content is a child's own field vocabulary and its focused
 * perspective renders exactly one child. The collection was the container, not the subject. A
 * durable child composes itself as the one member of its own collection
 * (`durableChildCollectionRow`), so the card composes from real truth here, and `ChildrenCard` reads
 * the grain and opens on that member rather than on a roster of one.
 *
 * `child_identity` remains as an INTERNAL FALLBACK for a composition that resolves no Children
 * Surface at all. It is not a presentation choice, and routing a host to it to avoid wiring the
 * configured card is how the two answers appeared in the first place.
 *
 * ── WHAT IS DELIBERATELY NOT FILLED IN ──
 *
 * Program, room, schedule type, start date, readiness. All ENROLLMENT-scoped, all requiring a
 * participation the durable record must open without. The configured card still RENDERS those rows,
 * in their configured order, reading unset. Fabricating them from the child record would be
 * inventing participation, which is exactly the coupling the durable grain removed.
 */

import { cardAppliesToGrain, cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { buildChildrenCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { system5ArchetypeForCard } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import { system5IconForCard } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import type {
    FocusPanelCardKey,
    FocusPanelCardModel,
    FocusPanelProfileField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    childAgeLabel,
    type DurableChildSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

function formatYmd(ymd: string | null): string | null {
    if (!ymd) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

/**
 * The identity card for a durable Child.
 *
 * The insight is age when known, because age is the fact an operator reads first about a child.
 * A missing DOB is stated as unknown rather than omitted: for a child added from a phone call, "date
 * of birth not recorded" is information, and a silently absent row would read as "nothing to see".
 *
 * `visible` is always true. Unlike Employment — which can truthfully say "this relationship does not
 * exist" — a child record always has an identity; there is no not-applicable state for who someone is.
 */
export function deriveChildIdentityCard(
    subject: DurableChildSubject,
    now: Date,
): FocusPanelCardModel {
    const age = childAgeLabel(subject.dateOfBirth, now);
    const dob = formatYmd(subject.dateOfBirth);

    const profileFields: FocusPanelProfileField[] = [
        { label: "Name", value: subject.label },
        { label: "Date of birth", value: dob },
        { label: "Age", value: age },
        {
            label: "Household",
            value: subject.householdName,
            /*
             * The family, as a RECORD rather than as a printed name.
             *
             * `customer_members.customer_id` IS the durable household's id, so this reference needs
             * no lookup and no case: it is the same edge that made the household name available on
             * this card in the first place. A child with no household (the column is nullable)
             * carries no reference and the row stays plain text — the honest outcome, rather than a
             * control that opens nothing.
             */
            record: subject.householdId
                ? { subject_type: "household", subject_id: subject.householdId }
                : null,
        },
    ];

    return {
        key: "child_identity",
        archetype: system5ArchetypeForCard("child_identity"),
        iconName: system5IconForCard("child_identity"),
        title: cardTitle("child_identity") ?? "Child",
        insight: age ? `${age} old` : "Date of birth not recorded",
        secondaryInsight: subject.householdName,
        tier: "reference",
        span: 2,
        density: "standard",
        // A former member is still a record; the chip says so rather than hiding the card.
        statusChip: subject.isActive ? null : "Former member",
        statusTone: subject.isActive ? "neutral" : "neutral",
        // Read-only. Child identity is authored where child identity is authored; a second execution
        // path here would be the mistake Employment's card docblock already names.
        primaryAction: null,
        payload: { profileFields },
        visible: true,
    };
}

export type DeriveChildFocusPanelCardsInput = {
    subject: DurableChildSubject;
    /** Injected so the age label is deterministic in tests; nothing reads the clock implicitly. */
    now: Date;
};

/**
 * Every child-grain card model, keyed by card. Only keys the registry declares for `child` are
 * built; anything else is omitted deterministically, never emitted as an empty shell.
 */
export function deriveChildFocusPanelCards(
    input: DeriveChildFocusPanelCardsInput,
): Map<FocusPanelCardKey, FocusPanelCardModel> {
    const cards = new Map<FocusPanelCardKey, FocusPanelCardModel>();

    /*
     * The configured child card, built from the SAME producer the case panel uses, against the
     * subject's own truth. `buildChildrenCardModel` reads the canonical child collection through
     * `normalizeFocusPanelChildrenRowsFromTruth`, which admits the durable key — so this composes
     * the child themselves, not a family's roster borrowed for the occasion.
     */
    if (cardAppliesToGrain("children", "child")) {
        cards.set("children", buildChildrenCardModel(input.subject.truth));
        return cards;
    }

    // Fallback only: a runtime that has withdrawn the `children` declaration still identifies the
    // child rather than composing nothing.
    if (cardAppliesToGrain("child_identity", "child")) {
        cards.set("child_identity", deriveChildIdentityCard(input.subject, input.now));
    }
    return cards;
}
