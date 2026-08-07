/**
 * Gender-token recognition for intake parsing.
 *
 * Used to keep gender words (e.g. "Girl", "boy") from being swallowed into a person's NAME —
 * `Caitlyn Girl` must parse as first "Caitlyn" (not last name "Girl"). The Create Lead form has
 * no gender field yet, so we do not persist the value; we only strip it from names so downstream
 * surname inference works. `gender` is returned for callers/fields that can use it later.
 */

export type ParsedGender = "female" | "male" | null;

/** Shared gender value vocabulary (Girl/Female/… → female|male). */
export const GENDER_WORDS: Record<string, ParsedGender> = {
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

// A standalone gender WORD (word-boundaried). Conservative: only whole tokens, never substrings of a
// name (so "Mary"/"Manny" are safe). Single letters (f/m) are intentionally NOT stripped from names —
// they collide with middle initials ("John F Smith").
const GENDER_TOKEN_RE = /\b(girls?|boys?|female|male|daughter|son)\b/gi;

/** Extract a gender from free text (first match wins). Does not mutate input. */
export function detectGender(text: string): ParsedGender {
    const wordMatch = text.match(GENDER_TOKEN_RE);
    if (wordMatch && wordMatch[0]) return GENDER_WORDS[wordMatch[0].toLowerCase()] ?? null;
    return null;
}

/**
 * Strip gender tokens from a NAME fragment and report the gender found.
 * "Caitlyn Girl" → { name: "Caitlyn", gender: "female" }.
 */
export function stripGenderFromName(fragment: string): { name: string; gender: ParsedGender } {
    let gender: ParsedGender = null;
    const name = fragment.replace(GENDER_TOKEN_RE, (m) => {
        gender = gender ?? GENDER_WORDS[m.toLowerCase()] ?? null;
        return " ";
    });
    return { name: name.replace(/\s+/g, " ").trim(), gender };
}
