/**
 * Submissions operational inbox — lane grouping (OW-6).
 * Uses existing submission status and linkage signals only.
 */

import type { SubmissionAttachRow } from "@/lib/forms/submissionOutcomeSummary";
import { submissionListLinkageBadge } from "@/lib/forms/submissionLinkageReviewUx";

export type SubmissionInboxRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    form_definition_id: string;
    person_id?: string | null;
    customer_id?: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    payload?: { meta?: Record<string, unknown> };
};

export type SubmissionInboxLaneKey = "needsReview" | "needsLinking" | "drafts" | "recentlySubmitted";

export type SubmissionInboxPrimaryLaneKey = SubmissionInboxLaneKey;

export type SubmissionInboxLanes = Record<SubmissionInboxLaneKey, SubmissionInboxRow[]>;

export const SUBMISSION_INBOX_LANE_COPY = {
    needsReview: {
        title: "Needs review",
        lead: "Submitted intake flagged for operator review before outputs.",
        empty: "No submissions need review right now.",
        testId: "submission-inbox-lane-needs-review",
    },
    needsLinking: {
        title: "Needs linking",
        lead: "Submitted responses missing CRM attach targets or linkage attention.",
        empty: "No submissions need linking right now.",
        testId: "submission-inbox-lane-needs-linking",
    },
    drafts: {
        title: "Drafts",
        lead: "In-progress responses not yet submitted.",
        empty: "No draft submissions in this inbox.",
        testId: "submission-inbox-lane-drafts",
    },
    recentlySubmitted: {
        title: "Recently submitted",
        lead: "Submitted intake ready to open or generate outputs.",
        empty: "Submitted responses will appear here after families complete forms.",
        testId: "submission-inbox-lane-recently-submitted",
    },
} as const;

export function submissionInboxAttachRow(row: SubmissionInboxRow): SubmissionAttachRow {
    return {
        person_id: row.person_id ?? null,
        customer_id: row.customer_id ?? null,
        customer_member_id: row.customer_member_id ?? null,
        opportunity_id: row.opportunity_id ?? null,
    };
}

export function submissionInboxLinkageKind(
    row: SubmissionInboxRow
): ReturnType<typeof submissionListLinkageBadge>["kind"] {
    return submissionListLinkageBadge({
        status: row.status,
        payloadMeta: row.payload?.meta,
        attachRow: submissionInboxAttachRow(row),
    }).kind;
}

export function resolveSubmissionInboxLane(row: SubmissionInboxRow): SubmissionInboxLaneKey {
    const status = row.status.toLowerCase();
    if (status === "draft" || status === "void") return "drafts";
    if (status !== "submitted") return "drafts";

    const linkage = submissionInboxLinkageKind(row);
    if (linkage === "needs_review") return "needsReview";
    if (linkage === "needs_crm_link") return "needsLinking";
    return "recentlySubmitted";
}

function activitySortKey(row: SubmissionInboxRow): string {
    return row.submitted_at ?? row.created_at ?? "";
}

export function groupSubmissionsIntoInboxLanes(rows: SubmissionInboxRow[]): SubmissionInboxLanes {
    const lanes: SubmissionInboxLanes = {
        needsReview: [],
        needsLinking: [],
        drafts: [],
        recentlySubmitted: [],
    };

    for (const row of rows) {
        lanes[resolveSubmissionInboxLane(row)].push(row);
    }

    for (const key of Object.keys(lanes) as SubmissionInboxLaneKey[]) {
        lanes[key].sort((a, b) => activitySortKey(b).localeCompare(activitySortKey(a)));
    }

    return lanes;
}

export type SubmissionInboxActionKind = "review" | "continue" | "open";

export function submissionInboxPrimaryAction(lane: SubmissionInboxLaneKey): {
    label: string;
    kind: SubmissionInboxActionKind;
} {
    if (lane === "needsReview" || lane === "needsLinking") {
        return { label: "Review intake", kind: "review" };
    }
    if (lane === "drafts") {
        return { label: "Continue draft", kind: "continue" };
    }
    return { label: "Open", kind: "open" };
}

export function submissionInboxContextLine(row: SubmissionInboxRow): string | null {
    const meta = row.payload?.meta;
    if (meta && typeof meta === "object") {
        const reason = typeof meta.intake_review_reason === "string" ? meta.intake_review_reason.trim() : "";
        if (reason) return reason;
        if (meta.intake_needs_review === true) return "Linkage flagged for review";
    }
    if (row.person_id) return "Person linked";
    if (row.customer_member_id) return "Family member linked";
    if (row.customer_id) return "Customer linked";
    if (row.opportunity_id) return "Opportunity linked";
    return null;
}

export function submissionInboxStatusLabel(status: string): string {
    if (status === "submitted") return "Submitted";
    if (status === "draft") return "Draft";
    if (status === "void") return "Void";
    const s = status.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}
