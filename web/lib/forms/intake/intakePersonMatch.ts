/**
 * Pure helpers for safer person matching (Card 8). DB queries live in applyFormIntakeSafe.
 */

export function normalizeIntakeEmail(email: string | null | undefined): string | null {
    if (typeof email !== "string") return null;
    const t = email.trim().toLowerCase();
    return t.length ? t : null;
}

/**
 * Digits-only canonical for intake matching + inserts.
 * US: strips leading country code 1 when the number is 11 digits.
 */
export function normalizeIntakePhone(phone: string | null | undefined): string | null {
    if (typeof phone !== "string") return null;
    const digits = phone.replace(/\D/g, "");
    if (!digits.length) return null;
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
}

/**
 * Exact-match variants for `persons.phone` lookups — CRM rows may store formatted strings.
 */
export function phoneLookupVariants(canonicalDigits: string): string[] {
    const out = new Set<string>();
    if (!canonicalDigits.length) return [];
    out.add(canonicalDigits);
    if (canonicalDigits.length === 10) {
        const c = canonicalDigits;
        out.add(`+1${c}`);
        out.add(`1${c}`);
        out.add(`(${c.slice(0, 3)}) ${c.slice(3, 6)}-${c.slice(6)}`);
        out.add(`${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}`);
        out.add(`${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`);
    }
    return [...out];
}

export type PersonMatchDecision =
    | { kind: "matched_email"; personId: string }
    | { kind: "matched_phone"; personId: string }
    | { kind: "ambiguous_email" }
    | { kind: "ambiguous_phone" }
    | { kind: "no_match" };

function normalizeNamePart(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
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
