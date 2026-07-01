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

export function childIdentityMatches(args: {
    firstName: string;
    lastName: string;
    dob: string | null;
    candidateFirst: string | null | undefined;
    candidateLast: string | null | undefined;
    candidateDob: string | null | undefined;
}): boolean {
    if (normalizePersonNamePart(args.candidateFirst) !== normalizePersonNamePart(args.firstName)) return false;
    if (normalizePersonNamePart(args.candidateLast) !== normalizePersonNamePart(args.lastName)) return false;
    if (args.dob) {
        return normalizeDob(args.candidateDob) === args.dob;
    }
    return true;
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
    }>;
    orgPersonMatches: PersonRecordSnapshot[];
    matchedParentPersonId?: string | null;
    matchedParentEmailNorm?: string | null;
    matchedParentPhoneNorm?: string | null;
}): ChildMatchEvaluation {
    const first = normalizePersonNamePart(input.firstName);
    const last = normalizePersonNamePart(input.lastName);
    const dob = normalizeDob(input.dob);

    for (const member of input.householdMembers) {
        if (
            childIdentityMatches({
                firstName: input.firstName,
                lastName: input.lastName,
                dob,
                candidateFirst: member.first_name,
                candidateLast: member.last_name,
                candidateDob: member.dob,
            }) &&
            member.person_id
        ) {
            return {
                confidence: "exact_match",
                personId: member.person_id,
                customerMemberId: member.customer_member_id ?? undefined,
                reasons: ["Child matches an existing household member."],
            };
        }
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

    if (dob && first && input.matchedParentPersonId) {
        const firstDobMatches = input.orgPersonMatches.filter(
            (p) =>
                normalizePersonNamePart(p.first_name) === first &&
                normalizeDob(p.date_of_birth) === dob &&
                childIdentityMatches({
                    firstName: input.firstName,
                    lastName: "",
                    dob,
                    candidateFirst: p.first_name,
                    candidateLast: p.last_name,
                    candidateDob: p.date_of_birth,
                }),
        );
        if (firstDobMatches.length === 1) {
            return {
                confidence: "probable_match",
                personId: firstDobMatches[0]!.id,
                reasons: ["First name and DOB match with a linked parent context."],
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

    const nameOnly = input.orgPersonMatches.filter(
        (p) =>
            normalizePersonNamePart(p.first_name) === first &&
            (last ? normalizePersonNamePart(p.last_name) === last : true),
    );
    if (nameOnly.length > 1) {
        return {
            confidence: "conflict",
            reasons: ["Multiple persons match this child name in the org."],
            blocking_conflicts: ["multiple_child_name_matches"],
        };
    }
    if (nameOnly.length === 1 && !dob) {
        return {
            confidence: "possible_match",
            personId: nameOnly[0]!.id,
            reasons: ["Name-only child match — date of birth not confirmed."],
        };
    }

    if (first && last && !dob && nameOnly.length === 1) {
        return {
            confidence: "possible_match",
            personId: nameOnly[0]!.id,
            reasons: ["Child name match without date of birth confirmation."],
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
