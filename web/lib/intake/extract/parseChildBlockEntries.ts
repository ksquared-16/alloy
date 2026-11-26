import { findDateInText, INTAKE_US_DATE_RE, parseFlexibleDate } from "@/lib/intake/normalize/date";
import { splitPersonName } from "@/lib/intake/normalize/personName";
import { stripGenderFromName, type ParsedGender } from "@/lib/intake/normalize/gender";
import { stripNameFieldTerminators } from "@/lib/intake/normalize/nameFieldTerminators";

export type ParsedChildBlockEntry = {
    first_name: string;
    last_name: string | null;
    dob: string | null;
    raw_name: string;
    gender: ParsedGender;
};

const CHILD_BLOCK_HEADER_RE =
    /^(?:child|children|kid|kids|dependent|dependents|student|students)\s*[:\-]\s*(.+)$/i;

const CHILD_ENTRY_AND_SPLIT_RE = /\s+and\s+(?=[A-Za-z])/i;
const CHILD_ENTRY_COMMA_SPLIT_RE = /[;,](?=\s*[A-Za-z])/;

function splitChildSegments(body: string): string[] {
    const byAnd = body.split(CHILD_ENTRY_AND_SPLIT_RE).map((f) => f.trim()).filter(Boolean);
    const segments: string[] = [];
    for (const part of byAnd) {
        const byComma = part.split(CHILD_ENTRY_COMMA_SPLIT_RE).map((f) => f.trim()).filter(Boolean);
        segments.push(...byComma);
    }
    return segments;
}

function parseDobFromFragment(fragment: string): string | null {
    const parenDateDob = fragment.match(/\(([^)]+?)\s*DOB\s*\)/i);
    if (parenDateDob?.[1]) {
        const parsed = parseFlexibleDate(parenDateDob[1].trim());
        if (parsed) return parsed;
    }

    const parenDobDate = fragment.match(/\(\s*DOB\s+([^)]+)\)/i);
    if (parenDobDate?.[1]) {
        const parsed = parseFlexibleDate(parenDobDate[1].trim());
        if (parsed) return parsed;
    }

    const inlineDob = fragment.match(/\bDOB\s+(.+?)(?:\s*$|\s+and\b|[;,)]|\))/i);
    if (inlineDob?.[1]) {
        const parsed = parseFlexibleDate(inlineDob[1].trim());
        if (parsed) return parsed;
    }

    const bareDate = fragment.match(/\(([^)]+)\)/);
    if (bareDate?.[1]) {
        const parsed = parseFlexibleDate(bareDate[1].trim());
        if (parsed) return parsed;
    }

    const trailingNumeric = fragment.trim().match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*$/);
    if (trailingNumeric?.[1]) {
        const parsed = parseFlexibleDate(trailingNumeric[1]);
        if (parsed) return parsed;
    }

    const inlineDate = findDateInText(fragment);
    if (inlineDate?.normalized) return inlineDate.normalized;

    return null;
}

function stripDateTokensFromFragment(fragment: string): string {
    return fragment
        .replace(/\(\s*DOB\s+[^)]+\)/gi, "")
        .replace(/\([^)]*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s*DOB\s*\)/gi, "")
        .replace(/\(\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s*\)/g, "")
        .replace(/\bDOB\s+[\d/A-Za-z.,\-\s]+/gi, "")
        .replace(INTAKE_US_DATE_RE, " ")
        .replace(/\(\s*[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?[^)]*\)/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseNameFromFragment(fragment: string): { first_name: string; last_name: string | null; raw_name: string; gender: ParsedGender } | null {
    const trimmed = fragment.trim();
    if (!trimmed) return null;

    // Field labels (Gender, DOB, Program, …) terminate the name span before any split — otherwise
    // "Wrigley Gender Female" becomes first=Wrigley last=Gender and blocks surname inheritance.
    const terminated = stripNameFieldTerminators(trimmed);
    let working = terminated.name;
    let gender: ParsedGender = terminated.gender;

    // Strip bare gender VALUE tokens (girl/boy/…) that remain without a Gender/Sex label —
    // "Caitlyn Girl" → first "Caitlyn"; surname inferred downstream. Do this before date strip
    // so trailing "Girl" is not swallowed by the greedy "DOB …" date strip.
    const strippedGender = stripGenderFromName(working);
    working = strippedGender.name;
    gender = gender ?? strippedGender.gender;

    const withoutDates = stripDateTokensFromFragment(working);
    const split = splitPersonName(withoutDates);
    if (split) {
        return {
            first_name: split.first,
            last_name: split.last,
            raw_name: `${split.first} ${split.last}`.trim(),
            gender,
        };
    }

    const firstOnly = withoutDates.match(/^([A-Za-z][\w'\-]+)/);
    if (firstOnly?.[1]) {
        return {
            first_name: firstOnly[1],
            last_name: null,
            raw_name: firstOnly[1],
            gender,
        };
    }

    return null;
}

/** Parse one or more child entries from a labeled or inline child block line. */
export function parseChildBlockEntries(line: string): ParsedChildBlockEntry[] {
    const header = line.match(CHILD_BLOCK_HEADER_RE);
    const body = header?.[1]?.trim() ?? line.trim();
    if (!body) return [];

    const fragments = splitChildSegments(body);
    const entries: ParsedChildBlockEntry[] = [];

    for (const fragment of fragments) {
        const name = parseNameFromFragment(fragment);
        if (!name) continue;
        entries.push({
            first_name: name.first_name,
            last_name: name.last_name,
            dob: parseDobFromFragment(fragment),
            raw_name: name.raw_name,
            gender: name.gender,
        });
    }

    return entries;
}

export function isChildBlockLine(line: string): boolean {
    const t = line.trim();
    if (/\b(?:child|kid)\s+is\b/i.test(t)) return false;
    if (/\b(?:daughter|son)\s+is\b/i.test(t)) return false;
    if (CHILD_BLOCK_HEADER_RE.test(t)) return true;
    const inlineDob = t.match(/^[A-Za-z][\w'\-]+\s+DOB\s+(.+)$/i);
    if (inlineDob?.[1] && parseFlexibleDate(inlineDob[1].trim())) return true;
    if (/^[A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?\s*\(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s*DOB\s*\)/i.test(t)) {
        return true;
    }
    if (/^[A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?\s*\(\s*[A-Za-z]+\s+\d{1,2}/i.test(t) && /\bDOB\b/i.test(t)) {
        return true;
    }
    return false;
}
