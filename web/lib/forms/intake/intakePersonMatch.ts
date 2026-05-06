/**
 * Pure helpers for safer person matching (Card 8). DB queries live in applyFormIntakeSafe.
 */

export function normalizeIntakeEmail(email: string | null | undefined): string | null {
    if (typeof email !== "string") return null;
    const t = email.trim().toLowerCase();
    return t.length ? t : null;
}

/** Collapse common separators; trim. Does not guarantee parity with all stored phone formats. */
export function normalizeIntakePhone(phone: string | null | undefined): string | null {
    if (typeof phone !== "string") return null;
    let t = phone.trim();
    if (!t.length) return null;
    t = t.replace(/[\s().-]/g, "");
    return t.length ? t : null;
}

export type PersonMatchDecision =
    | { kind: "matched_email"; personId: string }
    | { kind: "matched_phone"; personId: string }
    | { kind: "ambiguous_email" }
    | { kind: "ambiguous_phone" }
    | { kind: "no_match" };

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
