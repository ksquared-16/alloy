import {
    decidePersonMatchFromIdLists,
    formatPersonDisplayName,
    normalizeIntakeEmail,
    normalizeIntakePhone,
    submittedIdentityMatchesPersonRecord,
} from "@/lib/forms/intake/intakePersonMatch";
import { normalizeIntakeNamePart } from "@/lib/forms/intake/intakeOpportunityDedup";
import type { IntakeRecordMatchConfidence } from "@/lib/intake/resolve/types";

export type PersonRecordSnapshot = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
};

export function normalizePersonNamePart(value: string | null | undefined): string {
    return normalizeIntakeNamePart(value);
}

export function normalizeDob(value: string | null | undefined): string | null {
    const t = (value ?? "").trim().slice(0, 10);
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function personDisplayNameFromRecord(person: PersonRecordSnapshot): string {
    return formatPersonDisplayName(person.first_name, person.last_name) ?? person.id;
}

/** Exact name match (both sides normalized). Empty last on either side fails when the other has a last. */
export function childNameMatches(args: {
    firstName: string;
    lastName: string;
    candidateFirst: string | null | undefined;
    candidateLast: string | null | undefined;
}): boolean {
    if (normalizePersonNamePart(args.candidateFirst) !== normalizePersonNamePart(args.firstName)) return false;
    const submittedLast = normalizePersonNamePart(args.lastName);
    const candidateLast = normalizePersonNamePart(args.candidateLast);
    if (submittedLast && candidateLast) return submittedLast === candidateLast;
    if (!submittedLast && !candidateLast) return true;
    // One side missing last name: still treat as name-plausible for review, not exact.
    return false;
}

/**
 * Exact child identity: same name AND agreeing DOB when both sides provide DOB.
 * Missing DOB on either side is NOT proof of a new child — callers must use
 * {@link childNameMatches} + possible_match / needs_review instead of create_new.
 */
export function childIdentityMatches(args: {
    firstName: string;
    lastName: string;
    dob: string | null;
    candidateFirst: string | null | undefined;
    candidateLast: string | null | undefined;
    candidateDob: string | null | undefined;
}): boolean {
    if (!childNameMatches(args)) return false;
    if (!args.dob) return false;
    const candidateDob = normalizeDob(args.candidateDob);
    if (!candidateDob) return false;
    return candidateDob === args.dob;
}

export type ParentMatchEvaluation = {
    confidence: IntakeRecordMatchConfidence;
    personId?: string;
    reasons: string[];
    blocking_conflicts?: string[];
    strategy: "email" | "phone" | "name" | "none";
};

/** Pure parent/guardian match evaluation from queried person rows. */
export function evaluateParentPersonMatch(input: {
    firstName: string;
    lastName: string;
    emailNorm: string | null;
    phoneNorm: string | null;
    emailMatches: PersonRecordSnapshot[];
    phoneMatches: PersonRecordSnapshot[];
    nameMatches: PersonRecordSnapshot[];
}): ParentMatchEvaluation {
    const emailIds = input.emailMatches.map((p) => p.id);
    const phoneIds = input.phoneMatches.map((p) => p.id);
    const decision = decidePersonMatchFromIdLists({
        emailNorm: input.emailNorm,
        phoneNorm: input.phoneNorm,
        emailMatchIds: emailIds,
        phoneMatchIds: phoneIds,
    });

    if (decision.kind === "ambiguous_email") {
        return {
            confidence: "conflict",
            reasons: ["Multiple persons share this email in the org."],
            blocking_conflicts: ["multiple_email_matches"],
            strategy: "email",
        };
    }
    if (decision.kind === "ambiguous_phone") {
        return {
            confidence: "conflict",
            reasons: ["Multiple persons share this phone in the org."],
            blocking_conflicts: ["multiple_phone_matches"],
            strategy: "phone",
        };
    }

    const matched =
        decision.kind === "matched_email" ?
            input.emailMatches.find((p) => p.id === decision.personId)
        : decision.kind === "matched_phone" ?
            input.phoneMatches.find((p) => p.id === decision.personId)
        :   null;

    if (matched) {
        const nameMatches = submittedIdentityMatchesPersonRecord({
            submittedFirstName: input.firstName,
            submittedLastName: input.lastName,
            personFirstName: matched.first_name,
            personLastName: matched.last_name,
        });
        if (!nameMatches) {
            return {
                confidence: "conflict",
                personId: matched.id,
                reasons: [
                    `Email or phone matches ${personDisplayNameFromRecord(matched)}, but the submitted name differs.`,
                ],
                blocking_conflicts: ["identity_name_mismatch"],
                strategy: decision.kind === "matched_email" ? "email" : "phone",
            };
        }
        return {
            confidence: "exact_match",
            personId: matched.id,
            reasons:
                decision.kind === "matched_email" ?
                    ["Exact email match."]
                :   ["Exact normalized phone match."],
            strategy: decision.kind === "matched_email" ? "email" : "phone",
        };
    }

    const fullNameMatches = input.nameMatches.filter((p) =>
        submittedIdentityMatchesPersonRecord({
            submittedFirstName: input.firstName,
            submittedLastName: input.lastName,
            personFirstName: p.first_name,
            personLastName: p.last_name,
        }),
    );
    if (fullNameMatches.length > 1) {
        return {
            confidence: "conflict",
            reasons: ["Multiple persons share this full name in the org."],
            blocking_conflicts: ["multiple_name_matches"],
            strategy: "name",
        };
    }
    if (fullNameMatches.length === 1) {
        return {
            confidence: "possible_match",
            personId: fullNameMatches[0]!.id,
            reasons: ["Full name match only — no email or phone signal."],
            strategy: "name",
        };
    }

    return { confidence: "no_match", reasons: ["No matching person found."], strategy: "none" };
}

export type ChildMatchEvaluation = {
    confidence: IntakeRecordMatchConfidence;
    personId?: string;
    customerMemberId?: string;
    reasons: string[];
    blocking_conflicts?: string[];
};

/** Pure child match evaluation from household member rows and org person rows. */
export function evaluateChildPersonMatch(input: {
    firstName: string;
    lastName: string;
    dob: string | null;
    householdMembers: Array<{
        person_id?: string | null;
        customer_member_id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        dob?: string | null;
        display_name?: string | null;
    }>;
    orgPersonMatches: PersonRecordSnapshot[];
    matchedParentPersonId?: string | null;
    matchedParentEmailNorm?: string | null;
    matchedParentPhoneNorm?: string | null;
}): ChildMatchEvaluation {
    const first = normalizePersonNamePart(input.firstName);
    const last = normalizePersonNamePart(input.lastName);
    const dob = normalizeDob(input.dob);

    const namedHouseholdMembers = input.householdMembers.filter((member) =>
        childNameMatches({
            firstName: input.firstName,
            lastName: input.lastName,
            candidateFirst: member.first_name,
            candidateLast: member.last_name,
        }),
    );

    // Same name + same household + conflicting DOB → block
    for (const member of namedHouseholdMembers) {
        const memberDob = normalizeDob(member.dob);
        if (dob && memberDob && memberDob !== dob) {
            return {
                confidence: "conflict",
                personId: member.person_id ?? undefined,
                customerMemberId: member.customer_member_id ?? undefined,
                reasons: [
                    "Child name matches an existing household member but date of birth conflicts.",
                ],
                blocking_conflicts: ["child_dob_mismatch"],
            };
        }
    }

    // Same name + same household + same DOB → strong/confirmed existing
    for (const member of namedHouseholdMembers) {
        if (
            childIdentityMatches({
                firstName: input.firstName,
                lastName: input.lastName,
                dob,
                candidateFirst: member.first_name,
                candidateLast: member.last_name,
                candidateDob: member.dob,
            })
        ) {
            return {
                confidence: "exact_match",
                personId: member.person_id ?? undefined,
                customerMemberId: member.customer_member_id ?? undefined,
                reasons: ["Child matches an existing household member (name and date of birth)."],
            };
        }
    }

    // Same name + same household + DOB missing on either side → needs review (never create_new)
    if (namedHouseholdMembers.length === 1) {
        const member = namedHouseholdMembers[0]!;
        return {
            confidence: "possible_match",
            personId: member.person_id ?? undefined,
            customerMemberId: member.customer_member_id ?? undefined,
            reasons: [
                "Child name matches an existing household member, but date of birth is incomplete — operator confirmation required.",
            ],
        };
    }
    if (namedHouseholdMembers.length > 1) {
        return {
            confidence: "conflict",
            reasons: ["Multiple household children share this name — operator selection required."],
            blocking_conflicts: ["multiple_household_child_name_matches"],
            customerMemberId: namedHouseholdMembers[0]?.customer_member_id ?? undefined,
            personId: namedHouseholdMembers[0]?.person_id ?? undefined,
        };
    }

    const orgExact = input.orgPersonMatches.filter((p) =>
        childIdentityMatches({
            firstName: input.firstName,
            lastName: input.lastName,
            dob,
            candidateFirst: p.first_name,
            candidateLast: p.last_name,
            candidateDob: p.date_of_birth,
        }),
    );

    if (dob && first && last && orgExact.length === 1) {
        return {
            confidence: "exact_match",
            personId: orgExact[0]!.id,
            reasons: ["Exact child full name and date of birth match."],
        };
    }
    if (dob && first && last && orgExact.length > 1) {
        return {
            confidence: "conflict",
            reasons: ["Multiple children share this full name and date of birth in the org."],
            blocking_conflicts: ["multiple_child_name_dob_matches"],
            personId: orgExact[0]?.id,
        };
    }

    const orgNameMatches = input.orgPersonMatches.filter((p) =>
        childNameMatches({
            firstName: input.firstName,
            lastName: input.lastName,
            candidateFirst: p.first_name,
            candidateLast: p.last_name,
        }),
    );
    if (dob && first && last) {
        const conflicting = orgNameMatches.filter((p) => {
            const candidateDob = normalizeDob(p.date_of_birth);
            return Boolean(candidateDob && candidateDob !== dob);
        });
        if (conflicting.length > 0 && orgExact.length === 0) {
            return {
                confidence: "conflict",
                personId: conflicting[0]?.id,
                reasons: ["Child name matches an existing person with a conflicting date of birth."],
                blocking_conflicts: ["child_dob_mismatch"],
            };
        }
    }

    if (dob && first && input.matchedParentPersonId) {
        const firstDobWithParent = input.orgPersonMatches.filter(
            (p) => normalizePersonNamePart(p.first_name) === first && normalizeDob(p.date_of_birth) === dob,
        );
        if (firstDobWithParent.length === 1) {
            return {
                confidence: "probable_match",
                personId: firstDobWithParent[0]!.id,
                reasons: ["First name and DOB match with a linked parent context."],
            };
        }
        if (firstDobWithParent.length > 1) {
            return {
                confidence: "conflict",
                reasons: ["Multiple children share first name and DOB in this org."],
                blocking_conflicts: ["multiple_child_first_dob_matches"],
            };
        }
    }

    if (first && !last && dob && input.matchedParentPersonId) {
        const firstDobOnly = input.orgPersonMatches.filter(
            (p) => normalizePersonNamePart(p.first_name) === first && normalizeDob(p.date_of_birth) === dob,
        );
        if (firstDobOnly.length === 1) {
            return {
                confidence: "probable_match",
                personId: firstDobOnly[0]!.id,
                reasons: ["First name and DOB match with a linked parent context."],
            };
        }
        if (firstDobOnly.length > 1) {
            return {
                confidence: "conflict",
                reasons: ["Multiple children share first name and DOB in this org."],
                blocking_conflicts: ["multiple_child_first_dob_matches"],
            };
        }
    }

    // Same name across org without confirmed DOB → possible (review), never auto-create
    if (orgNameMatches.length > 1) {
        return {
            confidence: "conflict",
            reasons: ["Multiple persons match this child name in the org."],
            blocking_conflicts: ["multiple_child_name_matches"],
            personId: orgNameMatches[0]?.id,
        };
    }
    if (orgNameMatches.length === 1) {
        return {
            confidence: "possible_match",
            personId: orgNameMatches[0]!.id,
            reasons: [
                dob
                    ? "Child name match without agreeing date of birth on the candidate — operator confirmation required."
                    : "Child name match without submitted date of birth — operator confirmation required.",
            ],
        };
    }

    return { confidence: "no_match", reasons: ["No matching child found."] };
}

export function parentContactFromCandidate(person: {
    emails: string[];
    phones: string[];
    first_name: string | null;
    last_name: string | null;
}): {
    emailNorm: string | null;
    phoneNorm: string | null;
    firstName: string;
    lastName: string;
} {
    return {
        emailNorm: normalizeIntakeEmail(person.emails[0]),
        phoneNorm: normalizeIntakePhone(person.phones[0]),
        firstName: (person.first_name ?? "").trim(),
        lastName: (person.last_name ?? "").trim(),
    };
}
