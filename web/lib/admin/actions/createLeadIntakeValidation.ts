/** Shared Create Lead intake validation — parser, UI, and submit gates. */

export const CREATE_LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidCreateLeadEmail(raw: string): boolean {
    const email = raw.trim();
    if (!email) return false;
    return CREATE_LEAD_EMAIL_RE.test(email);
}

/** Normalize to 10-digit US phone when valid; never silently truncates partial numbers. */
export function normalizeCreateLeadPhoneDigits(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
}

export function isValidCreateLeadPhone(raw: string): boolean {
    const digits = normalizeCreateLeadPhoneDigits(raw);
    return digits.length === 10;
}

export function formatCreateLeadPhoneDisplay(digits10: string): string {
    if (digits10.length !== 10) return digits10;
    return `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`;
}
