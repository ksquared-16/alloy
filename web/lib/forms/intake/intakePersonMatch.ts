/**
 * Pure helpers for safer person matching (Card 8). DB queries live in applyFormIntakeSafe.
 * Normalization delegates to `lib/identity` compatibility adapters (B1a).
 */

import {
    normalizeIntakeEmailCompat,
    normalizeIntakePhoneCompat,
    normalizeNamePartCompat,
    phoneLookupVariantsCompat,
} from "@/lib/identity";

export function normalizeIntakeEmail(email: string | null | undefined): string | null {
    return normalizeIntakeEmailCompat(email);
}

/**
 * Digits-only form for intake matching + inserts (legacy; not E.164).
 * US: strips leading country code 1 when the number is 11 digits.
 */
export function normalizeIntakePhone(phone: string | null | undefined): string | null {
    return normalizeIntakePhoneCompat(phone);
}

/**
 * Exact-match variants for `persons.phone` lookups — CRM rows may store formatted strings.
 */
export function phoneLookupVariants(canonicalDigits: string): string[] {
    return phoneLookupVariantsCompat(canonicalDigits);
}

export type PersonMatchDecision =
    | { kind: "matched_email"; personId: string }
    | { kind: "matched_phone"; personId: string }
    | { kind: "ambiguous_email" }
    | { kind: "ambiguous_phone" }
    | { kind: "no_match" };

function normalizeNamePart(value: string | null | undefined): string {
    return normalizeNamePartCompat(value);
}

/** True when submitted guardian name exactly matches the matched person record (case-insensitive). */
export function submittedIdentityMatchesPersonRecord(params: {
    submittedFirstName: string | null | undefined;
    submittedLastName: string | null | undefined;
    personFirstName: string | null | undefined;
    personLastName: string | null | undefined;
}): boolean {
    const submittedFirst = normalizeNamePart(params.submittedFirstName);
    const submittedLast = normalizeNamePart(params.submittedLastName);
    const personFirst = normalizeNamePart(params.personFirstName);
    const personLast = normalizeNamePart(params.personLastName);

    if (!submittedFirst && !submittedLast) return true;
    if (!personFirst && !personLast) return true;

    return submittedFirst === personFirst && submittedLast === personLast;
}

export function formatPersonDisplayName(
    firstName: string | null | undefined,
    lastName: string | null | undefined
): string | null {
    const label = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
    return label || null;
}

/**
 * Decide match from full id lists (same org), after email-first then phone.
 * Rules: multiple email matches → ambiguous_email (do not consult phone). Else phone round.
 */
export function decidePersonMatchFromIdLists(params: {
    emailNorm: string | null;
    phoneNorm: string | null;
    emailMatchIds: string[];
    phoneMatchIds: string[];
}): PersonMatchDecision {
    const { emailNorm, phoneNorm, emailMatchIds, phoneMatchIds } = params;

    if (emailNorm) {
        if (emailMatchIds.length > 1) return { kind: "ambiguous_email" };
        if (emailMatchIds.length === 1) return { kind: "matched_email", personId: emailMatchIds[0]! };
    }

    if (phoneNorm) {
        if (phoneMatchIds.length > 1) return { kind: "ambiguous_phone" };
        if (phoneMatchIds.length === 1) return { kind: "matched_phone", personId: phoneMatchIds[0]! };
    }

    return { kind: "no_match" };
}
