import { parseFlexibleDate } from "@/lib/intake/normalize/date";
import { splitPersonName } from "@/lib/intake/normalize/personName";

export type ParsedChildBlockEntry = {
    first_name: string;
    last_name: string | null;
    dob: string | null;
    raw_name: string;
};

const CHILD_BLOCK_HEADER_RE =
    /^(?:child|children|kid|kids|dependent|dependents|student|students)\s*[:\-]\s*(.+)$/i;

const CHILD_ENTRY_SPLIT_RE = /\s+and\s+(?=[A-Za-z])/i;

function parseDobFromFragment(fragment: string): string | null {
    const parenDateDob = fragment.match(/\((\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*DOB\s*\)/i);
    if (parenDateDob?.[1]) return parseFlexibleDate(parenDateDob[1]);

    const parenDobDate = fragment.match(/\(\s*DOB\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*\)/i);
    if (parenDobDate?.[1]) return parseFlexibleDate(parenDobDate[1]);

    const inlineDob = fragment.match(/\bDOB\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/i);
    if (inlineDob?.[1]) return parseFlexibleDate(inlineDob[1]);

    const bareDate = fragment.match(/\((\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\)/);
    if (bareDate?.[1]) return parseFlexibleDate(bareDate[1]);

    return null;
}

function parseNameFromFragment(fragment: string): { first_name: string; last_name: string | null; raw_name: string } | null {
    const trimmed = fragment.trim();
    if (!trimmed) return null;

    const withoutParens = trimmed
        .replace(/\(\s*DOB\s+[^)]+\)/gi, "")
        .replace(/\(\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*DOB\s*\)/gi, "")
        .replace(/\(\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*\)/g, "")
        .replace(/\bDOB\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const split = splitPersonName(withoutParens);
    if (split) {
        return {
            first_name: split.first,
            last_name: split.last,
            raw_name: `${split.first} ${split.last}`.trim(),
        };
    }

    const firstOnly = withoutParens.match(/^([A-Za-z][\w'\-]+)/);
    if (firstOnly?.[1]) {
        return {
            first_name: firstOnly[1],
            last_name: null,
            raw_name: firstOnly[1],
        };
    }

    return null;
}

/** Parse one or more child entries from a labeled or inline child block line. */
export function parseChildBlockEntries(line: string): ParsedChildBlockEntry[] {
    const header = line.match(CHILD_BLOCK_HEADER_RE);
    const body = header?.[1]?.trim() ?? line.trim();
    if (!body) return [];

    const fragments = body.split(CHILD_ENTRY_SPLIT_RE).map((f) => f.trim()).filter(Boolean);
    const entries: ParsedChildBlockEntry[] = [];

    for (const fragment of fragments) {
        const name = parseNameFromFragment(fragment);
        if (!name) continue;
        entries.push({
            first_name: name.first_name,
            last_name: name.last_name,
            dob: parseDobFromFragment(fragment),
            raw_name: name.raw_name,
        });
    }

    return entries;
}

export function isChildBlockLine(line: string): boolean {
    const t = line.trim();
    if (/\b(?:child|kid)\s+is\b/i.test(t)) return false;
    if (/\b(?:daughter|son)\s+is\b/i.test(t)) return false;
    if (CHILD_BLOCK_HEADER_RE.test(t)) return true;
    if (/^[A-Z][\w'\-]+\s+DOB\s+\d{1,2}[\/\-]\d{1,2}/i.test(t)) return true;
    if (/^[A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+)?\s*\(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s*DOB\s*\)/i.test(t)) {
        return true;
    }
    return false;
}
