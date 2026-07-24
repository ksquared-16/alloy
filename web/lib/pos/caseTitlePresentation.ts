/**
 * Configurable case / queue-row title (§6).
 *
 * A case title should name the person + what this is, not repeat the form name on every row.
 * Forms may carry a title template of SAFE canonical tokens (no executable expressions); a case
 * substitutes them at intake. Unknown/empty tokens collapse gracefully, and an all-empty result
 * falls back to the form name so a row is never blank.
 *
 * Default: "{person_name} — {purpose}"  →  "Nadia Northfield — New enrollment lead"
 * The form name still travels as source context ("Submitted through Firefly Lead Capture").
 */

export const DEFAULT_CASE_TITLE_TEMPLATE = "{person_name} — {purpose}";

/** The only tokens a template may reference. Anything else is left literal (never evaluated). */
export const CASE_TITLE_TOKENS = [
    "person_name",
    "child_name",
    "form_name",
    "purpose",
    "business_process",
    "stage",
    "location",
    "submitted_date",
] as const;

export type CaseTitleToken = (typeof CASE_TITLE_TOKENS)[number];

export type CaseTitleTokens = Partial<Record<CaseTitleToken, string | null | undefined>>;

const TOKEN_RE = /\{([a-z_]+)\}/g;

function cleanupSeparators(s: string): string {
    // Drop dangling separators left by empty tokens ("— ", " · ", leading/trailing punctuation).
    return s
        .replace(/\s*[—·|-]\s*(?=$)/g, "")
        .replace(/^\s*[—·|-]\s*/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s*([—·|])\s*\1\s*/g, " $1 ")
        .trim();
}

/**
 * Resolve a case title from a template + tokens. Only whitelisted tokens are substituted; a
 * `{token}` whose value is missing is removed. Returns the form name (or "Untitled case") when the
 * template resolves to nothing.
 */
export function resolveCaseTitle(input: { template?: string | null; tokens: CaseTitleTokens }): string {
    const template = (input.template && input.template.trim()) || DEFAULT_CASE_TITLE_TEMPLATE;
    const allowed = new Set<string>(CASE_TITLE_TOKENS);

    const filled = template.replace(TOKEN_RE, (match, name: string) => {
        if (!allowed.has(name)) return match; // unknown token → leave literal, never evaluate
        const value = input.tokens[name as CaseTitleToken];
        return value != null && String(value).trim() ? String(value).trim() : "";
    });

    const cleaned = cleanupSeparators(filled);
    if (cleaned) return cleaned;

    const fallback = input.tokens.form_name;
    return fallback && String(fallback).trim() ? String(fallback).trim() : "Untitled case";
}
