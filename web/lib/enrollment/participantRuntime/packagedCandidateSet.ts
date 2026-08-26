/**
 * One participant response, several named needs — and not one inch more authority than before.
 *
 * The single-need contract already says what a provider may return: a `StructuredCandidate` that
 * addresses nothing. No field key, no semantic key, no requirement id, no target. It can only
 * respond ABOUT the turn the platform selected.
 *
 * This extends that by exactly one dimension: the platform now selects several needs, names them,
 * and will accept at most one candidate per name. Everything else is deliberately unchanged —
 * each candidate is normalized, type-checked, plausibility-checked and applied through the SAME
 * path a lone answer takes, one need at a time. Two facts arriving in one sentence never become one
 * fact, and a package that resolves two of three is an ordinary outcome, not a failure.
 *
 * What a provider still cannot do, now stated against a set rather than a single turn:
 *   · name a need the platform did not offer — the answer is discarded, not written;
 *   · answer the same need twice;
 *   · invent a field, a person, a requirement, or a stage transition;
 *   · make anything true. It proposes; deterministic validation disposes.
 *
 * Pure. No I/O. No provider call lives here.
 */

import type { StructuredCandidate } from "./participantTurnTypes";

export interface PackagedCandidate {
    /** A need identity key the platform explicitly offered for THIS package. */
    readonly need_key: string;
    readonly candidate: StructuredCandidate;
}

export interface PackagedCandidateSet {
    readonly answers: readonly PackagedCandidate[];
}

export type PackagedCandidateRejection =
    /** Named something outside the package. The most important one to refuse loudly. */
    | { code: "need_not_offered"; need_key: string }
    | { code: "duplicate_need"; need_key: string }
    | { code: "malformed"; detail: string };

export interface PackagedCandidateReview {
    /** Candidates the platform will now validate individually. Order follows the offer. */
    readonly accepted: readonly PackagedCandidate[];
    /** Offered needs the response did not answer. They simply remain outstanding. */
    readonly unanswered: readonly string[];
    /** Why anything was discarded. Never silent — a refusal the parent cannot see is a bug. */
    readonly rejected: readonly PackagedCandidateRejection[];
}

const CANDIDATE_KINDS = new Set(["confirmed", "corrected_value", "unresolved", "clarification_needed"]);

/**
 * Bound a provider's response to the needs that were offered.
 *
 * Deliberately total: every input lands in `accepted`, `unanswered` or `rejected`, so a caller can
 * never act on a candidate this function has not classified. Partial answers are the normal case,
 * which is why an unanswered need is reported plainly rather than treated as an error.
 */
export function reviewPackagedCandidates(
    offeredNeedKeys: readonly string[],
    response: unknown,
): PackagedCandidateReview {
    const offered = new Set(offeredNeedKeys);
    const accepted: PackagedCandidate[] = [];
    const rejected: PackagedCandidateRejection[] = [];
    const seen = new Set<string>();

    const answers = (response as { answers?: unknown } | null)?.answers;
    if (!Array.isArray(answers)) {
        return { accepted: [], unanswered: [...offeredNeedKeys], rejected: [{ code: "malformed", detail: "no answers array" }] };
    }

    for (const raw of answers) {
        const needKey = (raw as { need_key?: unknown })?.need_key;
        const candidate = (raw as { candidate?: unknown })?.candidate as StructuredCandidate | undefined;
        if (typeof needKey !== "string" || !needKey) {
            rejected.push({ code: "malformed", detail: "answer without a need_key" });
            continue;
        }
        if (!offered.has(needKey)) {
            // The provider reached outside its package. Nothing is written, and it is recorded.
            rejected.push({ code: "need_not_offered", need_key: needKey });
            continue;
        }
        if (seen.has(needKey)) {
            rejected.push({ code: "duplicate_need", need_key: needKey });
            continue;
        }
        if (!candidate || typeof candidate !== "object" || !CANDIDATE_KINDS.has((candidate as { kind?: string }).kind ?? "")) {
            rejected.push({ code: "malformed", detail: `candidate for ${needKey} is not a StructuredCandidate` });
            continue;
        }
        seen.add(needKey);
        accepted.push({ need_key: needKey, candidate });
    }

    // Answer order follows the OFFER, not the provider — the conversation's sequence is the
    // platform's to decide, and a model must not be able to reorder what the parent is asked next.
    accepted.sort((a, b) => offeredNeedKeys.indexOf(a.need_key) - offeredNeedKeys.indexOf(b.need_key));

    return {
        accepted,
        unanswered: offeredNeedKeys.filter((k) => !seen.has(k)),
        rejected,
    };
}

/**
 * The bounded context a provider is given for a package.
 *
 * Named explicitly so the payload cannot grow by accident: it carries the needs' own questions and
 * authored constraints, and nothing about the record behind them.
 */
export interface PackagedProviderContext {
    readonly needs: readonly {
        readonly need_key: string;
        readonly question: string;
        readonly field_type: string;
        readonly options: readonly string[];
        readonly required: boolean;
    }[];
    readonly section_title: string | null;
    readonly participant_response: string;
    /** The child's familiar name, when the package speaks about the child. Nothing else. */
    readonly subject_display_name: string | null;
}
