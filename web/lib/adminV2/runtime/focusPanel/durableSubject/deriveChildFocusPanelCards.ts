/**
 * CHILD-GRAIN CARD MODELS.
 *
 * One card, `child_identity`, and it renders through the EXISTING generic path: a `profile`
 * archetype with `payload.profileFields`, which `ArchetypeCardBody` + `UniversalCard` already
 * render. No new component, no new renderer branch, no parallel Child runtime — the smallest
 * canonical Child card the brief asked for.
 *
 * ── WHY NOT REUSE THE `children` CARD ──
 *
 * `children` is a case-grain ROSTER: "who are this family's children", read-only, composed on the
 * opportunity panel. It mentions children; it does not answer "who is this child". Reusing it here
 * would put a family's whole roster on one child's record and would make the child's own identity a
 * row inside a list of itself.
 *
 * ── WHAT IS DELIBERATELY NOT ON IT ──
 *
 * Program, room, schedule type, start date, readiness. All ENROLLMENT-scoped, all requiring an
 * enrollment the durable record must open without. They are Workstream E's enrichment, driven by
 * operational context, and putting them here would rebuild the coupling this program removed.
 */

import { cardAppliesToGrain, cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
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
    if (cardAppliesToGrain("child_identity", "child")) {
        cards.set("child_identity", deriveChildIdentityCard(input.subject, input.now));
    }
    return cards;
}
