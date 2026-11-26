/** Normalize phone/email addresses for identity matching. */

export function normalizeSmsAddress(raw: string): string {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return raw.trim().startsWith("+") ? `+${digits}` : digits ? `+${digits}` : "";
}

export function normalizeEmailAddress(raw: string): string {
    return (raw || "").trim().toLowerCase();
}

export function normalizeIdentityAddress(channel: string, raw: string): string {
    const ch = channel.toLowerCase();
    if (ch === "email") return normalizeEmailAddress(raw);
    if (ch === "sms" || ch === "voice") return normalizeSmsAddress(raw);
    return (raw || "").trim();
}
