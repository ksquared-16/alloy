/**
 * DURABLE CHILD SUBJECT — the shape, and the pure projections over it.
 *
 * ── THE CHILD IS THE MEMBER ROW ──
 *
 * `customer_members` is the canonical child identity, and the schema says why:
 *
 *     display_name  NOT NULL          ← the child always has a name here
 *     first_name / last_name / dob    ← identity facts live ON the member row
 *     person_id     NULLABLE          ← a durable `persons` row is OPTIONAL
 *
 * So a child can exist with **no `persons` row at all** and must still be identifiable. Keying the
 * subject on `person_id` — which is what every caller had to do before Workstream A, because the
 * attention resolver had no child arm — silently reframes the question as "this person" and loses
 * every child whose person is null.
 *
 * The person row, when there is one, is enrichment: it carries the durable human identity that
 * outlives any single household membership. It is never the identity of record here.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──
 *
 * Program, room, schedule type, start date and readiness are ENROLLMENT-scoped
 * (`inquiry_child.*` in the child surface's field vocabulary). They require an enrollment, and the
 * whole point of a durable child record is that it opens without one. They belong on an enrichment
 * card driven by operational context (Workstream E), not on identity.
 */

import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";

/** The composed durable Child subject. */
export type DurableChildSubject = {
    /** `customer_members.id` — the identity of record. */
    memberId: string;
    /** Durable `persons.id` behind the member, when one exists. Null is ordinary, not an error. */
    personId: string | null;
    /** The household this child belongs to. */
    householdId: string | null;
    /** Operator-facing name, from the member row's NOT NULL `display_name`. */
    label: string;
    dateOfBirth: string | null;
    /** Household name, when resolved. Context on the identity card, never a second subject. */
    householdName: string | null;
    /** Whether the membership is current. A former member is still a record. */
    isActive: boolean;
    /** The composed record — the panel's `context.truth`. */
    truth: Record<string, unknown>;
};

/** The panel grain for a durable child. Named here so no caller re-derives it. */
export const DURABLE_CHILD_GRAIN: OperationalGrain = "child";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/**
 * Age from a date of birth, in the operator's units.
 *
 * Under 2 years reads in months, because "18 months" and "1 year" are different children to anyone
 * staffing a room. Returns null for a missing or unparseable DOB rather than guessing — an unknown
 * age is a real state for a child added from a phone call.
 *
 * `now` is injected so the label is testable; nothing here reads the clock implicitly.
 */
export function childAgeLabel(dobIso: string | null | undefined, now: Date): string | null {
    const dob = trimOrNull(dobIso);
    if (!dob) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
    if (!m) return null;
    const birth = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(birth)) return null;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (today < birth) return null;

    let months =
        (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]));
    if (now.getUTCDate() < Number(m[3])) months -= 1;
    if (months < 0) return null;

    if (months < 24) return `${months} mo`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}

/**
 * THE SUBJECT, EXPRESSED AS THE ONE MEMBER OF ITS OWN COLLECTION.
 *
 * The canonical Children card renders a COLLECTION because on a case it renders a family's roster.
 * On a durable child record the roster has exactly one member and it is the record itself — the same
 * degenerate-case reasoning `personEmploymentSignal` already uses for a durable person's Employment.
 *
 * This is the ONE place that shape is decided, so the server composer and any client host produce
 * an identical row. Two builders would be two answers to "what is this child", and the card would
 * quietly render whichever host it happened to be mounted on.
 *
 * ── WHAT IT CARRIES, AND WHAT IT REFUSES TO ──
 *
 * Identity and profile scalars, because those are CHILD facts: they live on the member row (or the
 * person behind it) and are true with no enrollment anywhere. `resolveIdentityFieldValue` and
 * `buildChildrenCardEvidence` read several of them off the RAW entry rather than the mapped drawer
 * row — `gender`, `allergies`, `medical_notes`, `special_instructions`, the photo keys — which is
 * why the composed truth is spread in rather than a fixed handful of fields being copied out.
 *
 * Program, room, schedule type and start date are absent, and absent BY CONSTRUCTION rather than by
 * omission: they are participation facts on the opportunity-customer-member row, and a durable host
 * has no participation. The configured card still renders those rows, in their configured order,
 * reading "Not set" — a card with facts this host has not fetched, never a different card.
 */
export function durableChildCollectionRow(subject: DurableChildSubject): Record<string, unknown> {
    return {
        ...subject.truth,
        // The collection's identity keys, pinned last so nothing in the composed truth can move them.
        id: subject.memberId,
        customer_member_id: subject.memberId,
        person_id: subject.personId,
        display_name: subject.label,
        dob: subject.dateOfBirth,
    };
}
