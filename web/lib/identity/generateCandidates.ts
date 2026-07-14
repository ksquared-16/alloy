import type { PersonRecordSnapshot } from "@/lib/intake/resolve/matchIdentity";
import {
    evaluateParentPersonMatch,
    personDisplayNameFromRecord,
} from "@/lib/intake/resolve/matchIdentity";
import {
    listPersonsByEmail,
    listPersonsByExactName,
    listPersonsByPhone,
} from "@/lib/intake/resolve/queryMatches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLegacyConfidenceToBand, sortCandidatesByBand, bandRank } from "./confidenceBand";
import { CHILD_CANDIDATE_CAP, IDENTITY_RESOLVER_VERSION, PERSON_CANDIDATE_CAP } from "./constants";
import type { ChildSubjectInput, IdentityCandidate, PersonSubjectInput } from "./candidateTypes";
import { signalsFromLegacyEvaluation } from "./signals";
import {
    evaluateChildPersonMatch,
    normalizeDob,
    normalizePersonNamePart,
} from "@/lib/intake/resolve/matchIdentity";
import {
    listHouseholdChildMembers,
    listOrgChildPersonMatches,
    type HouseholdChildMemberRow,
} from "@/lib/intake/resolve/queryMatches";

function assertOrgScoped(orgId: string): void {
    if (!orgId?.trim()) throw new Error("generatePersonCandidates: orgId is required");
}

/** Exclude opportunities/leads with null org_id from candidate discovery (B0 follow-up). */
export function isEligibleOrgScopedRecord(orgId: string | null | undefined, expectedOrgId: string): boolean {
    return Boolean(orgId && orgId === expectedOrgId);
}

export function classifyPersonCandidateFromEvaluation(input: {
    subject: PersonSubjectInput;
    evaluation: ReturnType<typeof evaluateParentPersonMatch>;
    person: PersonRecordSnapshot | null;
}): IdentityCandidate | null {
    const { evaluation, person, subject } = input;
    if (!evaluation.personId && evaluation.confidence === "no_match") {
        return null;
    }
    const recordId = evaluation.personId ?? "none";
    const band = mapLegacyConfidenceToBand(evaluation.confidence, evaluation.strategy);
    const { signals, blockingConflicts } = signalsFromLegacyEvaluation({
        confidence: evaluation.confidence,
        reasons: evaluation.reasons,
        blockingConflicts: evaluation.blocking_conflicts,
        strategy: evaluation.strategy,
        factRefs: subject.factRefs,
    });

    if (subject.trustedTokenMatchPersonId && subject.trustedTokenMatchPersonId === evaluation.personId) {
        signals.unshift({
            key: "trusted_token",
            kind: "supporting",
            strength: "deterministic",
            subjectFactRefs: subject.factRefs ?? [],
            recordFieldRefs: [],
            reasonCode: "trusted_existing_record_token",
            explanation: "Trusted submission or packet token matched this person.",
        });
    }

    return {
        subjectRef: subject.subjectRef,
        entityType: "person",
        recordId,
        matchedEntityType: evaluation.personId ? "person" : undefined,
        confidenceBand:
            subject.trustedTokenMatchPersonId &&
            evaluation.personId &&
            subject.trustedTokenMatchPersonId === evaluation.personId ?
                "confirmed"
            :   band,
        signals,
        blockingConflicts,
        explanation: evaluation.reasons.join(" "),
        resolverVersion: IDENTITY_RESOLVER_VERSION,
        displayName: person ? personDisplayNameFromRecord(person) : recordId,
    };
}

export async function generatePersonCandidates(
    supabase: SupabaseClient,
    orgId: string,
    subject: PersonSubjectInput,
): Promise<IdentityCandidate[]> {
    assertOrgScoped(orgId);

    const emailMatches =
        subject.emailNorm ? await listPersonsByEmail(supabase, orgId, subject.emailNorm) : [];
    const phoneMatches =
        subject.phoneNorm ? await listPersonsByPhone(supabase, orgId, subject.phoneNorm) : [];
    const nameMatches =
        subject.firstName && subject.lastName ?
            await listPersonsByExactName(supabase, orgId, subject.firstName, subject.lastName)
        :   [];

    const evaluation = evaluateParentPersonMatch({
        firstName: subject.firstName,
        lastName: subject.lastName,
        emailNorm: subject.emailNorm,
        phoneNorm: subject.phoneNorm,
        emailMatches: emailMatches.slice(0, PERSON_CANDIDATE_CAP),
        phoneMatches: phoneMatches.slice(0, PERSON_CANDIDATE_CAP),
        nameMatches: nameMatches.slice(0, PERSON_CANDIDATE_CAP),
    });

    const primary =
        evaluation.personId ?
            emailMatches.find((p) => p.id === evaluation.personId) ??
            phoneMatches.find((p) => p.id === evaluation.personId) ??
            nameMatches.find((p) => p.id === evaluation.personId) ??
            null
        :   null;

    const candidate = classifyPersonCandidateFromEvaluation({ subject, evaluation, person: primary });
    if (!candidate) return [];

    // Ambiguity: surface multiple email/phone rows as separate weak candidates (capped)
    const extras: IdentityCandidate[] = [];
    if (evaluation.confidence === "conflict") {
        const pool = [...emailMatches, ...phoneMatches].slice(0, PERSON_CANDIDATE_CAP);
        const seen = new Set<string>();
        for (const p of pool) {
            if (seen.has(p.id) || p.id === evaluation.personId) continue;
            seen.add(p.id);
            extras.push({
                subjectRef: subject.subjectRef,
                entityType: "person",
                recordId: p.id,
                matchedEntityType: "person",
                confidenceBand: "weak",
                signals: [
                    {
                        key: "ambiguous_pool",
                        kind: "supporting",
                        strength: "weak",
                        subjectFactRefs: subject.factRefs ?? [],
                        recordFieldRefs: ["persons.id"],
                        reasonCode: "ambiguous_contact_pool",
                        explanation: "Additional person in ambiguous contact match pool.",
                    },
                ],
                blockingConflicts: [],
                explanation: "Ambiguous supporting candidate.",
                resolverVersion: IDENTITY_RESOLVER_VERSION,
                displayName: personDisplayNameFromRecord(p),
            });
        }
    }

    return sortCandidatesByBand([candidate, ...extras]).slice(0, PERSON_CANDIDATE_CAP);
}

export function classifyChildCandidateFromEvaluation(input: {
    subject: ChildSubjectInput;
    evaluation: ReturnType<typeof evaluateChildPersonMatch>;
    person: PersonRecordSnapshot | null;
}): IdentityCandidate | null {
    const { evaluation, person, subject } = input;
    if (!evaluation.personId && evaluation.confidence === "no_match") return null;

    const band = mapLegacyConfidenceToBand(evaluation.confidence);
    const { signals, blockingConflicts } = signalsFromLegacyEvaluation({
        confidence: evaluation.confidence,
        reasons: evaluation.reasons,
        blockingConflicts: evaluation.blocking_conflicts,
        factRefs: subject.factRefs,
    });

    if (evaluation.customerMemberId) {
        signals.push({
            key: "household_member",
            kind: "supporting",
            strength: "strong",
            subjectFactRefs: subject.factRefs ?? [],
            recordFieldRefs: ["customer_members.id"],
            reasonCode: "existing_household_child_member",
            explanation: "Child matches an existing household member record.",
        });
    }

    return {
        subjectRef: subject.subjectRef,
        entityType: "child",
        recordId: evaluation.personId ?? evaluation.customerMemberId ?? "none",
        matchedEntityType: evaluation.customerMemberId ? "customer_member" : "person",
        confidenceBand: band,
        signals,
        blockingConflicts,
        explanation: evaluation.reasons.join(" "),
        resolverVersion: IDENTITY_RESOLVER_VERSION,
        displayName: person ? personDisplayNameFromRecord(person) : subject.firstName,
    };
}

export async function generateChildCandidates(
    supabase: SupabaseClient,
    orgId: string,
    subject: ChildSubjectInput,
    context: {
        householdCustomerId?: string | null;
        matchedParentPersonId?: string | null;
    } = {},
): Promise<IdentityCandidate[]> {
    assertOrgScoped(orgId);

    const firstName = subject.firstName.trim();
    const lastName = subject.lastName.trim();
    const dob = normalizeDob(subject.dob);

    const householdMembers: HouseholdChildMemberRow[] =
        context.householdCustomerId ?
            (await listHouseholdChildMembers(supabase, orgId, context.householdCustomerId)).slice(
                0,
                CHILD_CANDIDATE_CAP,
            )
        :   [];

    const orgMatches = (
        await listOrgChildPersonMatches(supabase, orgId, firstName, lastName, dob)
    ).slice(0, CHILD_CANDIDATE_CAP);

    const evaluation = evaluateChildPersonMatch({
        firstName,
        lastName,
        dob,
        householdMembers,
        orgPersonMatches: orgMatches,
        matchedParentPersonId: context.matchedParentPersonId ?? subject.guardianPersonId ?? null,
    });

    const person =
        evaluation.personId ? orgMatches.find((p) => p.id === evaluation.personId) ?? null : null;

    const primary = classifyChildCandidateFromEvaluation({ subject, evaluation, person });
    const out: IdentityCandidate[] = primary ? [primary] : [];

    if (evaluation.confidence === "conflict") {
        for (const p of orgMatches.slice(0, CHILD_CANDIDATE_CAP)) {
            if (p.id === evaluation.personId) continue;
            out.push({
                subjectRef: subject.subjectRef,
                entityType: "child",
                recordId: p.id,
                matchedEntityType: "person",
                confidenceBand: "weak",
                signals: [],
                blockingConflicts: [],
                explanation: "Ambiguous child name/DOB pool member.",
                resolverVersion: IDENTITY_RESOLVER_VERSION,
                displayName: personDisplayNameFromRecord(p),
            });
        }
    }

    return sortCandidatesByBand(out).slice(0, CHILD_CANDIDATE_CAP);
}

/** Prefer household-coherent parent+child pairs over independent top matches. */
export function scoreHouseholdCoherence(input: {
    parentBand: import("./candidateTypes").CandidateConfidenceBand;
    childBand: import("./candidateTypes").CandidateConfidenceBand;
    sharedHousehold: boolean;
}): number {
    let score = bandRank(input.parentBand) + bandRank(input.childBand);
    if (input.sharedHousehold) score += 4;
    return score;
}

export function childNameKey(first: string, last: string): string {
    return `${normalizePersonNamePart(first)}|${normalizePersonNamePart(last)}`;
}
