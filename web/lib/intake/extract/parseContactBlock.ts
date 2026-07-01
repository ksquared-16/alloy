import { findEmailCandidate } from "@/lib/intake/normalize/email";
import { findPhoneCandidate } from "@/lib/intake/normalize/phone";
import { expandSharedSurnameNames } from "@/lib/intake/normalize/sharedSurnameNames";
import { isChildContextLine, splitPersonName } from "@/lib/intake/normalize/personName";
import { isChildBlockLine } from "@/lib/intake/extract/parseChildBlockEntries";

const PARENT_PREFIX_RE = /^(?:parents?|guardians?|contact|primary(?:\s+contact)?)\s*[:\-]\s*/i;

export type ParsedContactBlock = {
    adult_names: string[];
    emails: string[];
    phones: string[];
    /** Text remaining after contact tokens and labels are removed. */
    name_remainder: string;
};

function stripContactTokens(line: string): string {
    let remainder = line;
    for (let i = 0; i < 4; i++) {
        const email = findEmailCandidate(remainder);
        if (email) {
            remainder = remainder.replace(email, " ");
            continue;
        }
        const phone = findPhoneCandidate(remainder);
        if (phone) {
            remainder = remainder.replace(phone, " ");
            continue;
        }
        break;
    }
    return remainder.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseAdultNamesFromRemainder(text: string): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (/^(?:child|children|kid|kids|dependent|dependents|student|students)\b/i.test(trimmed)) {
        return [];
    }

    const slashChunks = trimmed
        .split(/\s*\/\s*/)
        .map((c) => c.trim())
        .filter(Boolean);
    if (slashChunks.length >= 2 && slashChunks.every((c) => splitPersonName(c))) {
        return slashChunks;
    }

    const expanded = expandSharedSurnameNames(trimmed);
    if (expanded.length > 0) {
        return expanded.filter((name) => Boolean(splitPersonName(name) || /^[A-Za-z][\w'\-]+$/.test(name)));
    }

    return [];
}

/** True when a line mixes adult-like names with email and/or phone tokens. */
export function looksLikeContactBlockLine(line: string): boolean {
    const t = line.trim();
    if (!t || isChildContextLine(t) || isChildBlockLine(t)) return false;
    const hasEmail = Boolean(findEmailCandidate(t));
    const hasPhone = Boolean(findPhoneCandidate(t));
    if (!hasEmail && !hasPhone) return false;

    let remainder = stripContactTokens(t);
    remainder = remainder.replace(PARENT_PREFIX_RE, "").trim();
    if (!remainder) return false;

    const names = parseAdultNamesFromRemainder(remainder);
    return names.length >= 1;
}

/**
 * Parse compact adult/contact lines such as:
 * Sarah & Rudy Emerson 1222344321 sarah@emerson.net
 * Parents: Sarah and Rudy Emerson, 1222344321, sarah@emerson.net
 * Sarah Emerson / Rudy Emerson / 1222344321 / sarah@emerson.net
 */
export function parseContactBlock(line: string): ParsedContactBlock | null {
    const t = line.trim();
    if (!t || isChildContextLine(t) || isChildBlockLine(t)) return null;

    const emails: string[] = [];
    const phones: string[] = [];
    let working = t;

    for (let i = 0; i < 4; i++) {
        const email = findEmailCandidate(working);
        if (email) {
            emails.push(email);
            working = working.replace(email, " ");
            continue;
        }
        const phone = findPhoneCandidate(working);
        if (phone) {
            phones.push(phone);
            working = working.replace(phone, " ");
            continue;
        }
        break;
    }

    let nameRemainder = working.replace(PARENT_PREFIX_RE, "").replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
    const adult_names = parseAdultNamesFromRemainder(nameRemainder);

    if (adult_names.length === 0) return null;

    const hasContact = emails.length > 0 || phones.length > 0;
    if (!hasContact) return null;

    return {
        adult_names,
        emails,
        phones,
        name_remainder: nameRemainder,
    };
}
