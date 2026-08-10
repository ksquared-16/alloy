/**
 * Alloy Search Platform V2 — deterministic ranking.
 *
 * Search V1 had no ranking at all: fixed group order, then alphabetical. V2 scores
 * every result and records WHY, so ordering is stable, explainable, and testable
 * rather than an opaque number.
 *
 * Determinism rules:
 *   - score depends only on (query intent, candidate, contexts) — never on row
 *     order, clock, or database ordering
 *   - ties break on subject kind, then name, then id, so equal scores still order
 *     identically across runs
 */

import type {
    SearchContext,
    SearchRanking,
    SearchRankingReason,
    SearchSubjectKind,
} from "@/lib/search/searchContracts";
import type { SearchIntent } from "@/lib/search/searchQueryIntent";
import type { SearchCandidate } from "@/lib/search/searchRetrieval";

const WEIGHTS = {
    exact_name: 1000,
    prefix_name: 500,
    token_name: 200,
    /** Every subject term matched, not just the retrieval token. */
    all_terms: 150,
    household_name: 60,
    identifier: 400,
    /** A context the operator's query explicitly asked for. */
    context_term: 300,
    related_penalty: -120,
} as const;

/**
 * Subject-kind bias. Small — it only breaks near-ties, and never lets a weak name
 * match outrank a strong one. Children and people are what operators look for
 * most; a household or campus is usually the frame, not the target.
 */
const KIND_BIAS: Record<SearchSubjectKind, number> = {
    child: 40,
    person: 35,
    household: 20,
    location: 15,
};

export function scoreSearchCandidate(args: {
    candidate: SearchCandidate;
    contexts: SearchContext[];
    intent: SearchIntent;
}): SearchRanking {
    const { candidate, contexts, intent } = args;
    const reasons: SearchRankingReason[] = [];
    let score = 0;

    const name = candidate.display_name.toLowerCase().trim();
    const terms = intent.subject_terms.map((t) => t.toLowerCase());
    const joined = terms.join(" ");

    if (joined && name === joined) {
        score += WEIGHTS.exact_name;
        reasons.push("exact_name");
    } else if (joined && name.startsWith(joined)) {
        score += WEIGHTS.prefix_name;
        reasons.push("prefix_name");
    } else if (terms.some((t) => name.includes(t))) {
        score += WEIGHTS.token_name;
        reasons.push("token_name");
    }

    // Every subject term matched somewhere in the signal set.
    const haystack = candidate.match_text.toLowerCase();
    if (terms.length > 1 && terms.every((t) => haystack.includes(t))) {
        score += WEIGHTS.all_terms;
    }

    // Matched through a relation rather than the subject's own name — still a
    // valid result (that is how `Smith schedule` reaches Joe and Emma), but it
    // must not outrank a subject that matched directly.
    if (candidate.matched_via_relation) {
        score += WEIGHTS.related_penalty;
        reasons.push("related_name");
    }

    // Contexts the query explicitly asked for.
    const promoted: string[] = [];
    for (const key of intent.promoted_keys) {
        const hit = contexts.find((c) => c.key === key || (c.kind === "schedule" && key === "schedule"));
        if (hit) {
            score += WEIGHTS.context_term;
            promoted.push(hit.key);
            if (!reasons.includes("context_term")) reasons.push("context_term");
        }
    }

    score += KIND_BIAS[candidate.kind];
    reasons.push("subject_kind_bias");

    return { score, reasons, promoted_context_keys: promoted };
}

/** Deterministic ordering: score desc, then kind, then name, then id. */
export function compareRankedResults(
    a: { ranking: SearchRanking; subject: { kind: SearchSubjectKind; display_name: string; id: string } },
    b: { ranking: SearchRanking; subject: { kind: SearchSubjectKind; display_name: string; id: string } }
): number {
    if (b.ranking.score !== a.ranking.score) return b.ranking.score - a.ranking.score;
    if (a.subject.kind !== b.subject.kind) {
        return KIND_BIAS[b.subject.kind] - KIND_BIAS[a.subject.kind];
    }
    const byName = a.subject.display_name.localeCompare(b.subject.display_name, undefined, {
        sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.subject.id.localeCompare(b.subject.id);
}

/**
 * Order contexts so the ones the operator asked for lead.
 * `Joe Smith schedule` puts Schedule first while Joe stays one subject.
 */
export function orderContextsByIntent(
    contexts: SearchContext[],
    promotedKeys: readonly string[]
): SearchContext[] {
    const promoted: SearchContext[] = [];
    const rest: SearchContext[] = [];
    for (const c of contexts) {
        const isPromoted = promotedKeys.some(
            (k) => c.key === k || (c.kind === "schedule" && k === "schedule")
        );
        (isPromoted ? promoted : rest).push(c);
    }
    return [...promoted, ...rest];
}
