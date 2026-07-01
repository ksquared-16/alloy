export const INTAKE_PHONE_BARE_RE = /\b\d{10}\b/;

export const INTAKE_PHONE_FORMATTED_RE =
    /(?:\+?1[-.\s]?)?\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;

/** Normalize to digits-only; strips leading US country code 1 when 11 digits. */
export function normalizePhoneDigits(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
}

export function isValidPhone(raw: string): boolean {
    return normalizePhoneDigits(raw).length === 10;
}

export function formatPhoneDisplay(digits10: string): string {
    if (digits10.length !== 10) return digits10;
    return `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`;
}

function trimLine(v: string): string {
    return v.trim();
}

export function findPhoneCandidate(text: string): string | null {
    const lines = text.split(/\r?\n/).map((l) => trimLine(l)).filter(Boolean);
    for (const line of lines) {
        const digitsOnly = line.replace(/\D/g, "");
        if (/^[\d\s\-+().]+$/.test(line) && digitsOnly.length >= 7) {
            return line;
        }
        const bare = line.match(INTAKE_PHONE_BARE_RE);
        if (bare) return bare[0];
        const formatted = line.match(INTAKE_PHONE_FORMATTED_RE);
        if (formatted) return formatted[0];
    }
    const bare = text.match(INTAKE_PHONE_BARE_RE);
    if (bare) return bare[0];
    const formatted = text.match(INTAKE_PHONE_FORMATTED_RE);
    if (formatted) return formatted[0];
    return null;
}

export type PhoneClassification = {
    value: string;
    validation_state: "valid" | "invalid";
};

export function classifyPhone(raw: string): PhoneClassification {
    const digits = normalizePhoneDigits(raw);
    return {
        value: digits,
        validation_state: isValidPhone(digits) ? "valid" : "invalid",
    };
}
