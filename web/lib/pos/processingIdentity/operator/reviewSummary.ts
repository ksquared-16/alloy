/**
 * Operator-language summary of an identity review.
 *
 * The review screen answers two questions and nothing else: how confident is the match, and what
 * will exist when I confirm. Plan ids, content hashes, opIds, atomic groups and risk bands are
 * engineering artifacts — they stay in the durable plan record where they belong, not in front of
 * an operator deciding whether a family looks right.
 */

export type ReviewSummaryResolution = {
    subject_role: string;
    decision_action: string | null;
    candidates: { recordId?: string | null; confidenceBand?: string }[];
};

export type ReviewSummaryPlanEntry = {
    kind: string;
    label: string;
    included: boolean;
};

export type IdentityConfidence = {
    /** Subjects with no plausible existing record — these become new records. */
    newRecords: number;
    /** Subjects matched to an existing record. */
    matched: number;
    /** Subjects with a plausible match the operator has not settled yet. */
    needsDecision: number;
    level: "clear" | "needs_decision";
    summary: string;
};

function plausibleCandidates(r: ReviewSummaryResolution): number {
    return (r.candidates ?? []).filter((c) => c.recordId && c.recordId !== "none").length;
}

function pluralize(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Confidence in operator language — never a raw band or score. */
export function summarizeIdentityConfidence(
    resolutions: readonly ReviewSummaryResolution[]
): IdentityConfidence {
    let newRecords = 0;
    let matched = 0;
    let needsDecision = 0;

    for (const r of resolutions) {
        const decided = (r.decision_action ?? "").trim();
        if (decided === "link_existing" || decided === "update_existing") {
            matched += 1;
            continue;
        }
        // A settled "create new" is confident even when a plausible match existed — the operator
        // already answered that question and must not be asked again.
        if (decided === "create_new") {
            newRecords += 1;
            continue;
        }
        if (plausibleCandidates(r) > 0) {
            needsDecision += 1;
            continue;
        }
        newRecords += 1;
    }

    const level = needsDecision > 0 ? "needs_decision" : "clear";
    const summary =
        needsDecision > 0
            ? `${pluralize(needsDecision, "record")} could match someone already here — choose before confirming.`
            : matched > 0
              ? `Matched ${pluralize(matched, "existing record")}; the rest are new.`
              : "Nothing here matches an existing record — everything is new.";

    return { newRecords, matched, needsDecision, level, summary };
}

/**
 * What will exist after confirming, in plain sentences. Derived from the plan's own labels so the
 * summary can never drift from the plan that actually executes.
 */
export function summarizeCommitPlan(entries: readonly ReviewSummaryPlanEntry[]): {
    lines: string[];
    recordCount: number;
} {
    const included = entries.filter((e) => e.included !== false);
    const lines: string[] = [];
    let recordCount = 0;

    for (const entry of included) {
        const kind = entry.kind.trim().toUpperCase();
        // The plan labels read "Create household · new household" — the operator needs the action,
        // not the restatement after the separator.
        const label = entry.label.split("·")[0]!.trim() || entry.label.trim();
        if (kind === "CREATE") recordCount += 1;
        lines.push(label);
    }

    return { lines, recordCount };
}
