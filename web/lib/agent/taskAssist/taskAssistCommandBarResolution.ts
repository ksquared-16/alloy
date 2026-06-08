/**
 * Card 9b — Heuristic classification for Task Assist command bar (no LLM).
 * Used only to route ambient vs server search; server remains authoritative for matches.
 */

const AMBIENT_HEAD =
    /^(please\s+)?(text|sms|email|message|send|draft|remind(?:er)?(\s+them)?)\s+(them|him|her|this\s+family|this\s+opportunity|the\s+family)\b/i;

const AMBIENT_ONLY = /^(please\s+)?(them|him|her|this\s+family|this\s+opportunity|the\s+family)\b/i;

/** Strip common intent verbs so "text the Smith family" → "the Smith family" (then caller may strip articles). */
export function stripTaskAssistCommandPrefixes(raw: string): string {
    return raw
        .trim()
        .replace(/^\s*(please\s+)?(text|sms|email|message|send|draft|remind(?:er)?)\s+/i, "")
        .trim();
}

/**
 * True when the operator appears to refer only to the current record (pronouns / deictic),
 * with no additional proper-name fragment for search.
 */
export function looksLikeAmbientOnlyCommand(raw: string): boolean {
    const t = raw.trim();
    if (t.length === 0 || t.length > 200) return false;
    if (AMBIENT_HEAD.test(t)) return true;
    const after = stripTaskAssistCommandPrefixes(t);
    if (after.length === 0) return false;
    return AMBIENT_ONLY.test(after.trim());
}

/** Extract a search string for entity-search `q` (still server-sanitized). */
export function extractTaskAssistEntitySearchQuery(raw: string): string {
    let s = stripTaskAssistCommandPrefixes(raw);
    s = s.replace(/^(the|a|an)\s+/i, "").trim();
    return s;
}
