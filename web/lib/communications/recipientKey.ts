/**
 * Recipient identity normalization for CARD 1.5 threading (SMS/email).
 */

export function normalizeRecipientKeySms(raw: string | null | undefined): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const digits = s.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (s.startsWith("+")) return `+${s.slice(1).replace(/\D/g, "")}`;
    return s;
}

export function normalizeRecipientKeyEmail(raw: string | null | undefined): string {
    return String(raw ?? "").trim().toLowerCase();
}
