/**
 * Gender-token recognition for intake parsing.
 *
 * Used to keep gender words (e.g. "Girl", "boy") from being swallowed into a person's NAME —
 * `Caitlyn Girl` must parse as first "Caitlyn" (not last name "Girl"). The Create Lead form has
 * no gender field yet, so we do not persist the value; we only strip it from names so downstream
 * surname inference works. `gender` is returned for callers/fields that can use it later.
 */

export type ParsedGender = "female" | "male" | null;

const GENDER_WORDS: Record<string, ParsedGender> = {
    girl: "female",
    girls: "female",
    female: "female",
    daughter: "female",
    "f": "female",
    boy: "male",
    boys: "male",
    male: "male",
    son: "male",
    "m": "male",
};

// A standalone gender word (word-boundaried). Kept conservative: only whole tokens, never substrings
// of a name (so "Mary" / "Manny" are safe — we match on exact lowercased tokens, and single-letter
// f/m only when isolated).
const GENDER_TOKEN_RE = /\b(girls?|boys?|female|male|daughter|son)\b/gi;
const SINGLE_LETTER_GENDER_RE = /(?:^|\s)([fm])(?=\s|$)/gi;

/** Extract a gender from free text (first match wins). Does not mutate input. */
export function detectGender(text: string): ParsedGender {
    const lower = text.toLowerCase();
    const wordMatch = lower.match(GENDER_TOKEN_RE);
    if (wordMatch && wordMatch[0]) return GENDER_WORDS[wordMatch[0].toLowerCase()] ?? null;
    return null;
}

/**
 * Strip gender tokens from a NAME fragment and report the gender found.
 * "Caitlyn Girl" → { name: "Caitlyn", gender: "female" }. Single-letter f/m stripped only when isolated.
 */
export function stripGenderFromName(fragment: string): { name: string; gender: ParsedGender } {
    let gender: ParsedGender = null;
    let name = fragment.replace(GENDER_TOKEN_RE, (m) => {
        gender = gender ?? GENDER_WORDS[m.toLowerCase()] ?? null;
        return " ";
    });
    name = name.replace(SINGLE_LETTER_GENDER_RE, (whole, letter: string) => {
        gender = gender ?? GENDER_WORDS[letter.toLowerCase()] ?? null;
        return " ";
    });
    return { name: name.replace(/\s+/g, " ").trim(), gender };
}
