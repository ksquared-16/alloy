/**
 * The shared identity gate for canonical record creation.
 *
 * Add Staff proved the rule; Add Child needed the same one. Rather than a second
 * classifier for children, both consume THIS module, which does exactly two
 * things on top of the canonical candidate generators:
 *
 *   1. decides what counts as "we may already have this human" (the match bands)
 *   2. refuses to settle that question without an operator
 *
 * ── WHY A SHARED MODULE AND NOT A COPY ──
 *
 * The Child path already had a matcher: `findOrCreateChildPersonInOrg` fell back
 * to an org-wide first/last-name `ilike` and returned the first row SILENTLY, so
 * two Emma Chens collapsed into one person with no operator involved. The fix is
 * not a better fuzzy match — a better match still auto-resolves. The fix is that
 * the SAME gate Add Staff passes through now stands in front of Add Child, so
 * "possible match" can only ever mean "ask the operator".
 *
 * Nothing here matches. `generatePersonCandidates` / `generateChildCandidates`
 * own the six-band classification (Frozen Decision C: email and phone are strong
 * signals, never unique identity keys), and this module only reads their answer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    generateChildCandidates,
    generatePersonCandidates,
    normalizeEmail,
    normalizeName,
    normalizePhone,
    type CandidateConfidenceBand,
    type IdentityCandidate,
} from "@/lib/identity";
import { listHouseholdChildMembers } from "@/lib/intake/resolve/queryMatches";

/**
 * Bands that mean "we found someone who is probably already in Alloy".
 *
 * `weak` and `conflicted` are deliberately IN. Auto-linking on a weak signal
 * corrupts identity; auto-creating past one duplicates a human. Both failures
 * are worse than one extra operator decision.
 */
export const IDENTITY_MATCH_BANDS: readonly CandidateConfidenceBand[] = [
    "confirmed",
    "strong",
    "possible",
    "weak",
    "conflicted",
];

export type ResolvedIdentityCandidate = {
    /**
     * The classifier's record id, verbatim.
     *
     * `"none"` when the conflict names no single record (several rows are
     * equally plausible and the classifier refused to pick one). Such a
     * candidate is real evidence of ambiguity but cannot be SELECTED — it still
     * forces the operator onto the explicit create-new path.
     */
    record_id: string;
    /** `persons.id`, when the candidate resolves to a person row. */
    person_id: string | null;
    /**
     * `customer_members.id`, when the candidate is (or is already linked to) a
     * member of the household in context. This is the durable child subject —
     * never `person_id`. @see docs/runtime/DURABLE-RECORD-ATTENTION.md
     */
    customer_member_id: string | null;
    display_name: string;
    confidence_band: CandidateConfidenceBand;
    explanation: string;
    /** True when this candidate is ALREADY a child member of the household in context. */
    in_household: boolean;
};

export type IdentityResolution =
    /** Nothing resembling this identity exists — creating is safe. */
    | { decision: "no_match"; candidates: [] }
    /**
     * One or more existing records resemble this identity. The operator must
     * pick one, or explicitly override to create new with a reason.
     */
    | { decision: "operator_choice_required"; candidates: ResolvedIdentityCandidate[] };

export type PersonIdentitySubject = {
    kind: "person";
    subjectRef: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
};

export type ChildIdentitySubject = {
    kind: "child";
    subjectRef: string;
    firstName: string;
    lastName: string;
    dob?: string | null;
    /**
     * The household this child is being added to. Household members are checked
     * FIRST — "this child is already in this household" is a different answer
     * from "someone in the org shares this name", and only the first one can be
     * resolved by reusing a membership rather than creating one.
     */
    householdCustomerId?: string | null;
};

export type IdentitySubject = PersonIdentitySubject | ChildIdentitySubject;

function resolution(candidates: ResolvedIdentityCandidate[]): IdentityResolution {
    if (candidates.length === 0) return { decision: "no_match", candidates: [] };
    return { decision: "operator_choice_required", candidates };
}

function inMatchBand(c: IdentityCandidate): boolean {
    return c.confidenceBand !== "excluded" && IDENTITY_MATCH_BANDS.includes(c.confidenceBand);
}

async function resolvePersonSubject(
    supabase: SupabaseClient,
    orgId: string,
    subject: PersonIdentitySubject
): Promise<IdentityResolution> {
    const candidates = await generatePersonCandidates(supabase, orgId, {
        subjectRef: subject.subjectRef,
        firstName: normalizeName(subject.firstName) ?? "",
        lastName: normalizeName(subject.lastName) ?? "",
        emailNorm: normalizeEmail(subject.email ?? null),
        phoneNorm: normalizePhone(subject.phone ?? null),
        factRefs: [],
    });

    return resolution(
        candidates.filter(inMatchBand).map((c) => ({
            record_id: c.recordId,
            // A person subject has no household context, so a person candidate is
            // exactly a person. `recordId` passes through verbatim — including the
            // `"none"` sentinel, which Add Staff has always surfaced as-is.
            person_id: c.recordId,
            customer_member_id: null,
            display_name: c.displayName ?? c.recordId,
            confidence_band: c.confidenceBand,
            explanation: c.explanation,
            in_household: false,
        }))
    );
}

async function resolveChildSubject(
    supabase: SupabaseClient,
    orgId: string,
    subject: ChildIdentitySubject
): Promise<IdentityResolution> {
    const householdCustomerId = (subject.householdCustomerId ?? "").trim() || null;

    const candidates = await generateChildCandidates(
        supabase,
        orgId,
        {
            subjectRef: subject.subjectRef,
            firstName: subject.firstName.trim(),
            lastName: subject.lastName.trim(),
            dob: (subject.dob ?? "").trim() || null,
            factRefs: [],
        },
        { householdCustomerId }
    );

    const matches = candidates.filter(inMatchBand);
    if (matches.length === 0) return { decision: "no_match", candidates: [] };

    /**
     * The classifier answers with ONE id per candidate and a `matchedEntityType`
     * that can disagree with it (an evaluation carrying both a person and a
     * member reports the person id under the member type). Rather than trust
     * either field, resolve every id against the household's own members — the
     * only place that can say which table an id belongs to.
     */
    const members = householdCustomerId
        ? await listHouseholdChildMembers(supabase, orgId, householdCustomerId)
        : [];
    const memberById = new Map<string, (typeof members)[number]>();
    const memberByPersonId = new Map<string, (typeof members)[number]>();
    for (const m of members) {
        const memberId = (m.customer_member_id ?? "").trim();
        if (memberId) memberById.set(memberId, m);
        const personId = (m.person_id ?? "").trim();
        if (personId) memberByPersonId.set(personId, m);
    }

    return resolution(
        matches.map((c) => {
            const asMember = memberById.get(c.recordId) ?? null;
            const linkedMember = asMember ?? memberByPersonId.get(c.recordId) ?? null;
            const isSentinel = c.recordId === "none";

            const memberId = (linkedMember?.customer_member_id ?? "").trim() || null;
            const personId = asMember
                ? (asMember.person_id ?? "").trim() || null
                : isSentinel
                  ? null
                  : c.recordId;

            const memberName = linkedMember
                ? (linkedMember.display_name ?? "").trim() ||
                  [linkedMember.first_name, linkedMember.last_name].filter(Boolean).join(" ").trim()
                : "";

            return {
                record_id: c.recordId,
                person_id: personId,
                customer_member_id: memberId,
                display_name:
                    memberName ||
                    (c.displayName && c.displayName !== "none" ? c.displayName : "") ||
                    [subject.firstName, subject.lastName].filter(Boolean).join(" ").trim() ||
                    c.recordId,
                confidence_band: c.confidenceBand,
                explanation: c.explanation,
                in_household: Boolean(memberId),
            };
        })
    );
}

/**
 * Resolve who this identity might already be.
 *
 * Returns `no_match` ONLY when nothing in any match band came back. Every other
 * answer is `operator_choice_required` — this function never picks a record.
 */
export async function resolvePersonCandidates(
    supabase: SupabaseClient,
    orgId: string,
    subject: IdentitySubject
): Promise<IdentityResolution> {
    if (subject.kind === "child") return resolveChildSubject(supabase, orgId, subject);
    return resolvePersonSubject(supabase, orgId, subject);
}
