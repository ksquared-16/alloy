/**
 * ONE WAY TO SHOW A PHONE NUMBER, ONE WAY TO TYPE ONE.
 *
 * Storage stays canonical E.164 (`lib/identity/normalizePhone`); nothing here is written to a record.
 * This is presentation only:
 *   - `formatPhoneDisplay`: a US number (10 digits, 11 starting with 1, or +1 and 10 digits) reads
 *     "(555) 888-9965"; any other international number keeps its "+" and digits as given (it used to be
 *     cut to its last 10 digits and shown as a US number); partial or invalid text is shown as typed;
 *     empty is "—".
 *   - `formatPhoneAsTyped`: the same shape built up while typing — "(555", "(555) 888", "(555) 888-9965".
 *   - `phoneValueFromTyped`: what an input emits — canonical E.164 once the number is complete, the
 *     operator's text while it is not, so a half-typed number is never silently "normalized".
 */
import { normalizePhone } from "@/lib/identity/normalizePhone";

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** The 10 NANP digits when the value is unambiguously a US number, else null. */
function nanpDigits(value: string): string | null {
    const trimmed = value.trim();
    const digits = digitsOf(trimmed);
    if (trimmed.startsWith("+")) return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null;
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return null;
}

export function formatPhoneDisplay(value: string | null | undefined): string {
    if (value == null) return "—";
    const text = String(value).trim();
    if (!text) return "—";
    const us = nanpDigits(text);
    if (us) return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
    if (text.startsWith("+")) {
        const digits = digitsOf(text);
        return digits.length >= 7 ? `+${digits}` : text;
    }
    return text;
}

/** Progressive US shape while typing; international input ("+…") is left as typed. */
export function formatPhoneAsTyped(input: string): string {
    const text = input ?? "";
    if (text.trim().startsWith("+")) {
        const us = nanpDigits(text);
        return us ? formatPhoneDisplay(text) : text;
    }
    let digits = digitsOf(text);
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (!digits) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Canonical E.164 when complete; the typed text (trimmed) otherwise; "" when empty. */
export function phoneValueFromTyped(input: string): string {
    const text = (input ?? "").trim();
    if (!text) return "";
    if (nanpDigits(text)) return normalizePhone(text) ?? text;
    if (text.startsWith("+") && digitsOf(text).length >= 8) return normalizePhone(text) ?? text;
    return text;
}

/** The Forms engine marks a phone field with this validation pattern (there is no phone field type). */
export const FORMS_PHONE_PATTERN = "^[+0-9()\\-\\s]{7,}$";

/**
 * Whether a field holds a phone number: its canonical key or id names one (phone, mobile, cell, tel),
 * its Forms validation pattern is the phone pattern, or its label says so.
 */
export function isPhoneField(field: { fieldKey?: string | null; id?: string | null; label?: string | null; pattern?: string | null }): boolean {
    if (field.pattern && field.pattern === FORMS_PHONE_PATTERN) return true;
    const key = `${field.fieldKey ?? ""} ${field.id ?? ""}`.toLowerCase();
    if (key.includes("phone") || key.includes("mobile")) return true;
    if (key.split(/[^a-z]+/).some((t) => t === "cell" || t === "tel")) return true;
    return /\b(phone|mobile|cell)\b/i.test(field.label ?? "");
}
