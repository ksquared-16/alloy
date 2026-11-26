import { normalizeEmailAsIntakeString } from "@/lib/identity";

/** Strict email-shaped token with TLD segment. */
export const INTAKE_EMAIL_EXTRACT_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Finds email-shaped tokens including invalid TLDs — validated separately. */
export const INTAKE_LOOSE_EMAIL_EXTRACT_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+/i;

export const INTAKE_VALID_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
    return normalizeEmailAsIntakeString(raw);
}

export function isValidEmail(raw: string): boolean {
    const email = raw.trim();
    if (!email) return false;
    return INTAKE_VALID_EMAIL_RE.test(email);
}

export function findEmailCandidate(text: string): string | null {
    const valid = text.match(INTAKE_EMAIL_EXTRACT_RE);
    if (valid?.[0]) return valid[0];
    const loose = text.match(INTAKE_LOOSE_EMAIL_EXTRACT_RE);
    if (loose?.[0]) return loose[0];
    return null;
}

export type EmailClassification = {
    value: string;
    validation_state: "valid" | "invalid";
};

export function classifyEmail(raw: string): EmailClassification {
    const value = raw.trim();
    return {
        value,
        validation_state: isValidEmail(value) ? "valid" : "invalid",
    };
}
