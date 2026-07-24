/**
 * Commit-plan summary (§2).
 *
 * The concise "Approval will:" lines shown in the decision rail — derived from the SAME honest
 * matched-record cards the middle column presents, so the rail never states a plan the records
 * don't support. Human language only; no engine/table/record-type vocabulary.
 */

import type { MatchedRecordCard } from "./matchedRecordsPresentation";

export type CommitPlanTone = "link" | "create" | "review";

export interface CommitPlanLine {
    text: string;
    tone: CommitPlanTone;
}

/** Turn the matched-record cards into the concise action bullets for the rail. */
export function buildCommitPlanLines(cards: MatchedRecordCard[]): CommitPlanLine[] {
    const lines: CommitPlanLine[] = [];
    for (const c of cards) {
        if (c.role === "parent") {
            if (c.basisTone === "match") lines.push({ text: `Link ${c.name ?? "the existing parent"}`, tone: "link" });
            else if (c.basisTone === "review") lines.push({ text: "Resolve the parent match before linking", tone: "review" });
            else lines.push({ text: `Create ${c.name ?? "a new parent"}`, tone: "create" });
        } else if (c.role === "child") {
            lines.push({ text: `Create ${c.name ?? "the child"} as a new child`, tone: "create" });
        } else {
            const noun = c.title.toLowerCase();
            if (c.basisTone === "review") lines.push({ text: `Hold the ${noun} for review — nothing is created yet`, tone: "review" });
            else lines.push({ text: `Create or attach the ${noun}`, tone: "create" });
        }
    }
    return lines;
}
