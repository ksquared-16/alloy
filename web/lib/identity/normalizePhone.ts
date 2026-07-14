/**
 * Canonical phone normalization (Decision C).
 * Storage form is E.164 for NANP: `+1XXXXXXXXXX`.
 * Email/phone are strong signals, not unique identity keys.
 */

/** Digits only; strips a leading US country code `1` when the value is 11 digits. */
export function phoneDigitsNanp(value: string | null | undefined): string {
    if (value === null || value === undefined) return "";
    const digits = String(value).replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
}

/**
 * Canonical E.164 storage form.
 * - empty / no digits → null
 * - 10-digit NANP → `+1XXXXXXXXXX`
 * - 11-digit NANP starting with 1 → `+1XXXXXXXXXX`
 * - already `+…` → `+` + digits
 * - other digit lengths → `+` + digits (best-effort; not asserted as valid NANP)
 */
export function normalizePhone(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (trimmed === "") return null;

    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;

    if (trimmed.startsWith("+")) {
        return `+${digits}`;
    }

    if (digits.length === 10) {
        return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith("1")) {
        return `+${digits}`;
    }

    return `+${digits}`;
}

/** True when the canonical form is a 10-digit NANP number as `+1XXXXXXXXXX`. */
export function isNanpE164(value: string | null | undefined): boolean {
    const n = typeof value === "string" ? value : normalizePhone(value);
    return typeof n === "string" && /^\+1\d{10}$/.test(n);
}
