/**
 * Field-label terminators for intake name fragments.
 *
 * Recognized structured-field labels end the name span so labels/values never become
 * person_name tokens (e.g. "Wrigley Gender Female" → name "Wrigley", gender female).
 *
 * Labels align with Processing document field lexicon + Create Lead intake vocabulary —
 * not one-off `if (token === "Gender")` branches.
 */

import { GENDER_WORDS, type ParsedGender } from "@/lib/intake/normalize/gender";

/**
 * Multi-word labels first; single-token labels last.
 * DOB / Born are intentionally omitted — `stripDateTokensFromFragment` owns date spans
 * (so parenthetical `(DOB 7/7/2022)` does not truncate the name into `"Caitlyn ("`).
 */
const NAME_FIELD_TERMINATOR_SPECS: ReadonlyArray<{
    /** Case-insensitive label phrase (no word-boundary wrapping). */
    label: string;
    kind: "gender" | "program" | "schedule" | "location" | "start" | "other";
}> = [
    { label: "desired start", kind: "start" },
    { label: "start date", kind: "start" },
    { label: "date of birth", kind: "other" },
    { label: "gender", kind: "gender" },
    { label: "sex", kind: "gender" },
    { label: "program", kind: "program" },
    { label: "schedule", kind: "schedule" },
    { label: "location", kind: "location" },
    { label: "campus", kind: "location" },
];

const GENDER_VALUE_RE = /^(girls?|boys?|female|male|daughter|son|f|m)\b/i;

function buildTerminatorFindRe(): RegExp {
    const alts = NAME_FIELD_TERMINATOR_SPECS.map((s) => s.label).join("|");
    // Label with optional colon/dash; word-boundaried so "Programmer" is not a hit.
    return new RegExp(`\\b(?:${alts})\\b\\s*[:\\-]?`, "ig");
}

const TERMINATOR_FIND_RE = buildTerminatorFindRe();

function kindForMatch(matchedLabel: string): (typeof NAME_FIELD_TERMINATOR_SPECS)[number]["kind"] {
    const compact = matchedLabel.replace(/\s+/g, " ").trim().toLowerCase().replace(/[:\-]\s*$/, "");
    for (const spec of NAME_FIELD_TERMINATOR_SPECS) {
        if (compact === spec.label.toLowerCase()) return spec.kind;
    }
    return "other";
}

export type NameFieldTerminatorStripResult = {
    /** Text remaining before the first field label. */
    name: string;
    /** Gender captured from a Gender/Sex label+value (or null). */
    gender: ParsedGender;
    /** True when a recognized field label terminated the name span. */
    terminated: boolean;
};

/**
 * Truncate a name fragment at the first recognized field label.
 * For Gender/Sex, also consume an immediate value token when present.
 */
export function stripNameFieldTerminators(fragment: string): NameFieldTerminatorStripResult {
    const source = fragment.trim();
    if (!source) return { name: "", gender: null, terminated: false };

    TERMINATOR_FIND_RE.lastIndex = 0;
    const match = TERMINATOR_FIND_RE.exec(source);
    if (!match || match.index == null) {
        return { name: source, gender: null, terminated: false };
    }

    const name = source.slice(0, match.index).replace(/\s+/g, " ").trim();
    const afterLabel = source.slice(match.index + match[0].length).trim();
    const kind = kindForMatch(match[0].replace(/[:\-]\s*$/, "").trim());

    let gender: ParsedGender = null;
    if (kind === "gender") {
        const valueMatch = afterLabel.match(GENDER_VALUE_RE);
        if (valueMatch?.[1]) {
            gender = GENDER_WORDS[valueMatch[1].toLowerCase()] ?? null;
        }
    }

    return { name, gender, terminated: true };
}
