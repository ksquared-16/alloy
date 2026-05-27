/**
 * Workload visibility diagnostics — operator notes only (Test 2B).
 */

import { groupSubmissionsIntoInboxLanes, resolveSubmissionInboxLane } from "@/lib/forms/submissionInboxPresentation";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import { deriveSubmissionOperationalNarrative } from "@/lib/forms/submissionOperationalNarrative";

export type IntakeWorkloadDiagnosticRow = {
    id: string;
    lane: string;
    submitted_at: string | null;
    intake_needs_review: boolean | null;
    headline: string;
};

export function buildIntakeWorkloadDiagnostics(submissions: SubmissionInboxRow[]): IntakeWorkloadDiagnosticRow[] {
    return submissions
        .filter((r) => r.status === "submitted")
        .map((row) => {
            const meta = row.payload?.meta;
            const needsReview =
                meta && typeof meta === "object" && !Array.isArray(meta) ?
                    (meta as Record<string, unknown>).intake_needs_review === true
                :   null;
            const narrative = deriveSubmissionOperationalNarrative(row);
            return {
                id: row.id,
                lane: resolveSubmissionInboxLane(row),
                submitted_at: row.submitted_at,
                intake_needs_review: needsReview,
                headline: narrative.headline,
            };
        });
}

export function intakeWorkloadLaneCounts(submissions: SubmissionInboxRow[]): Record<string, number> {
    const lanes = groupSubmissionsIntoInboxLanes(submissions);
    return {
        needsReview: lanes.needsReview.length,
        needsLinking: lanes.needsLinking.length,
        recentlySubmitted: lanes.recentlySubmitted.length,
        drafts: lanes.drafts.length,
    };
}
