import { findEmailCandidate, INTAKE_EMAIL_EXTRACT_RE, INTAKE_LOOSE_EMAIL_EXTRACT_RE } from "@/lib/intake/normalize/email";
import { findPhoneCandidate, isValidPhone, normalizePhoneDigits } from "@/lib/intake/normalize/phone";

export const NAME_STOP_WORDS = new Set([
    "called",
    "emailed",
    "texted",
    "reached",
    "contacted",
    "inquiry",
    "inquired",
    "today",
    "yesterday",
    "about",
    "regarding",
]);

export type SplitPersonNameResult = { first: string; last: string } | null;

export function splitPersonName(raw: string): SplitPersonNameResult {
    const cleaned = raw.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.includes("@")) return null;
    if (/^[\d\s\-+().]+$/.test(cleaned)) return null;
    const parts = cleaned.split(" ").filter(Boolean);
    if (parts.length < 2) return null;
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export function isContactOnlyLine(line: string): boolean {
    const t = line.trim();
    if (!t) return false;
    if (INTAKE_EMAIL_EXTRACT_RE.test(t) || INTAKE_LOOSE_EMAIL_EXTRACT_RE.test(t)) return true;
    const digits = normalizePhoneDigits(t);
    if (/^[\d\s\-+().]+$/.test(t) && digits.length >= 7) return true;
    return false;
}

export function looksLikeNameLine(line: string): boolean {
    const t = line.trim();
    if (!t || t.includes("@")) return false;
    if (findPhoneCandidate(t) && normalizePhoneDigits(t).length >= 7) return false;
    if (INTAKE_EMAIL_EXTRACT_RE.test(t) || INTAKE_LOOSE_EMAIL_EXTRACT_RE.test(t)) return false;
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 4 || !/^[A-Za-z]/.test(parts[0] ?? "")) return false;
    if (parts.some((p) => NAME_STOP_WORDS.has(p.toLowerCase()))) return false;
    return true;
}

/** True when the line is primarily about a child (avoid treating as parent name). */
export function isChildContextLine(line: string): boolean {
    const t = line.trim();
    if (!t) return false;
    if (/^(?:child|kid|son|daughter|student|enrollee?)\s*[:\-]/i.test(t)) return true;
    if (/\b(?:child|kid)\s+is\b/i.test(t)) return true;
    if (/\b(?:daughter|son)\s+is\b/i.test(t)) return true;
    if (/\b(?:daughter|son)\s+[A-Za-z]/i.test(t) && !/^(?:daughter|son)\s*:/i.test(t)) return true;
    if (/\b(?:years?\s+old|yrs?\s+old|\d{1,2}yo)\b/i.test(t) && /\b(?:child|kid|son|daughter|he|she)\b/i.test(t)) {
        return true;
    }
    return false;
}

export function extractNameFromContactBlobLine(line: string): SplitPersonNameResult {
    if (!findEmailCandidate(line) && !findPhoneCandidate(line)) return null;
    if (/^(?:parent|guardian|child|kid|son|daughter)\s*[:\-]/i.test(line)) return null;

    let remainder = line;
    const emailRaw = findEmailCandidate(line);
    if (emailRaw) remainder = remainder.replace(emailRaw, " ");
    const phoneRaw = findPhoneCandidate(line);
    if (phoneRaw) remainder = remainder.replace(phoneRaw, " ");
    remainder = remainder.replace(/\s+/g, " ").trim();
    if (!remainder || remainder.includes(":")) return null;
    return splitPersonName(remainder);
}
