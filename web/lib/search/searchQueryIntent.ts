/**
 * Alloy Search Platform V2 — deterministic query intent.
 *
 * A query is approximately:
 *
 *     identity / subject terms   +   context / destination terms
 *
 * `Joe Smith schedule` → subject terms ["joe","smith"], context term "schedule",
 * which PROMOTES the schedule context/destination on the Joe subject. Joe stays
 * one subject; only the ordering of his contexts and destinations changes.
 *
 * No LLM. No tenant branching. Two vocabularies feed this:
 *
 *   1. PLATFORM CAPABILITY TERMS (below) — these name Alloy *capabilities*
 *      (schedule, household, communications…), which are platform-owned concepts,
 *      so the vocabulary is platform-owned too.
 *
 *   2. CONFIGURED PROCESS TERMS — supplied by the caller from the tenant's
 *      published Business Process configuration. "Enrollment" works for one
 *      tenant and "Admissions" for another through the SAME code path. There is
 *      no childcare-specific or process-name-specific branching in this file.
 */

/** Context/destination keys the platform can promote. */
export const SEARCH_CAPABILITY_KEYS = {
    schedule: "schedule",
    household: "household",
    children: "children",
    communications: "communications",
    workItems: "work_items",
    location: "location",
} as const;

export type SearchCapabilityKey = (typeof SEARCH_CAPABILITY_KEYS)[keyof typeof SEARCH_CAPABILITY_KEYS];

/**
 * Platform capability vocabulary: operator words → promoted capability key.
 * Deliberately small and about Alloy capabilities, never about a domain.
 */
const CAPABILITY_TERMS: ReadonlyArray<readonly [string, SearchCapabilityKey]> = [
    ["schedule", SEARCH_CAPABILITY_KEYS.schedule],
    ["schedules", SEARCH_CAPABILITY_KEYS.schedule],
    ["scheduling", SEARCH_CAPABILITY_KEYS.schedule],
    ["household", SEARCH_CAPABILITY_KEYS.household],
    ["households", SEARCH_CAPABILITY_KEYS.household],
    ["family", SEARCH_CAPABILITY_KEYS.household],
    ["child", SEARCH_CAPABILITY_KEYS.children],
    ["children", SEARCH_CAPABILITY_KEYS.children],
    ["siblings", SEARCH_CAPABILITY_KEYS.children],
    ["communications", SEARCH_CAPABILITY_KEYS.communications],
    ["communication", SEARCH_CAPABILITY_KEYS.communications],
    ["comms", SEARCH_CAPABILITY_KEYS.communications],
    ["email", SEARCH_CAPABILITY_KEYS.communications],
    ["message", SEARCH_CAPABILITY_KEYS.communications],
    ["messages", SEARCH_CAPABILITY_KEYS.communications],
    ["phone", SEARCH_CAPABILITY_KEYS.communications],
    ["work", SEARCH_CAPABILITY_KEYS.workItems],
    ["tasks", SEARCH_CAPABILITY_KEYS.workItems],
    ["campus", SEARCH_CAPABILITY_KEYS.location],
    ["location", SEARCH_CAPABILITY_KEYS.location],
    ["site", SEARCH_CAPABILITY_KEYS.location],
];

/** A configured process, as supplied by the tenant's Business Process configuration. */
export type SearchProcessVocabularyEntry = {
    /** Configured `process_key` — the stable machine key. */
    key: string;
    /** Configured operator-facing label, e.g. "Annual Registration". */
    label: string;
};

export type SearchIntent = {
    /** Terms used to match a canonical subject. */
    subject_terms: string[];
    /** Terms recognised as context/destination intent. */
    context_terms: string[];
    /**
     * Context/destination keys to promote, in the order the operator implied them.
     * Capability keys (`schedule`) and configured process keys both appear here.
     */
    promoted_keys: string[];
};

/** Words that carry no matching or intent value. */
const STOP_WORDS = new Set(["the", "a", "an", "of", "for", "and", "in", "on", "at", "to"]);

function normalizeTokens(raw: string): string[] {
    return raw
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter((t) => t.length > 0);
}

/**
 * Parse a raw query into subject terms plus promoted context keys.
 *
 * Longest-phrase-first so a multi-word configured label ("annual registration")
 * is consumed as one intent rather than two stray subject terms.
 *
 * Guard: if consuming intent would leave NO subject terms, nothing is consumed.
 * A bare `schedule` is then a name search, not an intent with no subject — that
 * keeps the function total and stops intent from swallowing a real query.
 */
export function parseSearchIntent(
    raw: string,
    options?: { processVocabulary?: readonly SearchProcessVocabularyEntry[] }
): SearchIntent {
    const tokens = normalizeTokens(raw);
    if (!tokens.length) return { subject_terms: [], context_terms: [], promoted_keys: [] };

    // Build phrase → promoted key, longest phrase first.
    const phrases: Array<{ words: string[]; key: string }> = [];
    for (const entry of options?.processVocabulary ?? []) {
        const words = normalizeTokens(entry.label).filter((w) => !STOP_WORDS.has(w));
        if (words.length) phrases.push({ words, key: entry.key });
        // The process_key itself is also matchable ("subsidy_renewal" → subsidy renewal).
        const keyWords = normalizeTokens(entry.key.replace(/[_-]+/g, " ")).filter((w) => !STOP_WORDS.has(w));
        if (keyWords.length && keyWords.join(" ") !== words.join(" ")) {
            phrases.push({ words: keyWords, key: entry.key });
        }
    }
    for (const [term, key] of CAPABILITY_TERMS) phrases.push({ words: [term], key });
    phrases.sort((a, b) => b.words.length - a.words.length);

    const consumed = new Array<boolean>(tokens.length).fill(false);
    const contextTerms: string[] = [];
    const promoted: string[] = [];

    for (const phrase of phrases) {
        const n = phrase.words.length;
        for (let i = 0; i + n <= tokens.length; i += 1) {
            let match = true;
            for (let j = 0; j < n; j += 1) {
                if (consumed[i + j] || tokens[i + j] !== phrase.words[j]) {
                    match = false;
                    break;
                }
            }
            if (!match) continue;
            for (let j = 0; j < n; j += 1) consumed[i + j] = true;
            contextTerms.push(phrase.words.join(" "));
            if (!promoted.includes(phrase.key)) promoted.push(phrase.key);
        }
    }

    const subjectTerms = tokens.filter((t, i) => !consumed[i] && !STOP_WORDS.has(t));

    // Never let intent consume the entire query — a query with no subject is not
    // a search, it is a category. Fall back to treating everything as a name.
    if (!subjectTerms.length) {
        return {
            subject_terms: tokens.filter((t) => !STOP_WORDS.has(t)),
            context_terms: [],
            promoted_keys: [],
        };
    }

    return { subject_terms: subjectTerms, context_terms: contextTerms, promoted_keys: promoted };
}

/** The retrieval string for candidate matching — subject terms only. */
export function subjectMatchTerm(intent: SearchIntent): string {
    return intent.subject_terms.join(" ");
}
