/**
 * Normalize contact email and phone for admin PATCH.
 * Empty string becomes null; email is trimmed + lowercased; phone toward E.164.
 */

export function normalizeEmail(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim().toLowerCase();
    return s === "" ? null : s;
}

/**
 * Strip non-digits, preserve leading +; 10 digits -> +1xxxxxxxxx.
 */
export function normalizePhone(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (trimmed === "") return null;
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return trimmed;
    if (trimmed.startsWith("+")) return "+" + digits;
    if (digits.length === 10) return "+1" + digits;
    if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
    return "+" + digits;
}
