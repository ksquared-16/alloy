/**
 * Packet sessions operational inbox — lane grouping and row presentation (OW-5).
 * Uses existing session fields only; no review semantic changes.
 */

import {
    enrollmentPacketLinkageHint,
    enrollmentPacketProgressLine,
    enrollmentPacketSubjectLine,
    enrollmentPacketWarningCount,
    type EnrollmentPacketSessionLike,
} from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    isPacketReviewAwaitingDecision,
    operatorReviewStatusLabel,
    operatorReviewStatusTone,
    packetSessionStatusLabel,
    packetSessionStatusTone,
} from "@/lib/forms/review/formsReviewPresentation";

export type PacketSessionInboxRow = EnrollmentPacketSessionLike & {
    id: string;
    packet_definition_id: string;
    packet_name: string | null;
};

export type PacketSessionInboxLaneKey =
    | "needsReview"
    | "needsCorrection"
    | "inProgress"
    | "recentlyCompleted"
    | "other";

export type PacketSessionInboxLanes = Record<PacketSessionInboxLaneKey, PacketSessionInboxRow[]>;

export const PACKET_SESSION_INBOX_LANE_COPY = {
    needsReview: {
        title: "Needs review",
        lead: "Submitted packets waiting for your decision.",
        empty: "No packet sessions need review.",
        testId: "packet-inbox-lane-needs-review",
    },
    needsCorrection: {
        title: "Needs correction",
        lead: "Sessions flagged for correction before approval.",
        empty: "No packets need correction right now.",
        testId: "packet-inbox-lane-needs-correction",
    },
    inProgress: {
        title: "In progress",
        lead: "Families still completing packet steps.",
        empty: "No packets are currently in progress.",
        testId: "packet-inbox-lane-in-progress",
    },
    recentlyCompleted: {
        title: "Recently completed",
        lead: "Reviewed or closed sessions from the last intake runs.",
        empty: "Completed sessions will appear here after families submit packets.",
        testId: "packet-inbox-lane-recently-completed",
    },
} as const;

/** Primary inbox lanes shown above the fold (excludes cancelled / uncategorized). */
export const PACKET_SESSION_INBOX_PRIMARY_LANES: PacketSessionInboxLaneKey[] = [
    "needsReview",
    "needsCorrection",
    "inProgress",
    "recentlyCompleted",
];

export function resolvePacketSessionInboxLane(session: PacketSessionInboxRow): PacketSessionInboxLaneKey {
    const status = session.status ?? "";
    const reviewStatus = session.operator_review_status ?? null;

    if (status === "in_progress") return "inProgress";

    if (status === "completed") {
        if (reviewStatus === "needs_correction") return "needsCorrection";
        if (isPacketReviewAwaitingDecision(status, reviewStatus)) return "needsReview";
        if (reviewStatus === "approved" || reviewStatus === "rejected") return "recentlyCompleted";
    }

    return "other";
}

function activitySortKey(session: PacketSessionInboxRow): string {
    return session.completed_at ?? session.created_at ?? "";
}

export function groupPacketSessionsIntoInboxLanes(sessions: PacketSessionInboxRow[]): PacketSessionInboxLanes {
    const lanes: PacketSessionInboxLanes = {
        needsReview: [],
        needsCorrection: [],
        inProgress: [],
        recentlyCompleted: [],
        other: [],
    };

    for (const session of sessions) {
        lanes[resolvePacketSessionInboxLane(session)].push(session);
    }

    for (const key of Object.keys(lanes) as PacketSessionInboxLaneKey[]) {
        lanes[key].sort((a, b) => activitySortKey(b).localeCompare(activitySortKey(a)));
    }

    return lanes;
}

export type PacketSessionInboxActionKind = "review" | "monitor" | "open";

export function packetSessionInboxPrimaryAction(lane: PacketSessionInboxLaneKey): {
    label: string;
    kind: PacketSessionInboxActionKind;
} {
    if (lane === "needsReview" || lane === "needsCorrection") {
        return { label: "Review case file", kind: "review" };
    }
    if (lane === "inProgress") {
        return { label: "Continue monitoring", kind: "monitor" };
    }
    return { label: "Open", kind: "open" };
}

export function packetSessionInboxReviewHref(sessionId: string): string {
    return `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(sessionId)}`;
}

export function packetSessionInboxSubjectLine(session: PacketSessionInboxRow): string {
    const subject = enrollmentPacketSubjectLine(session);
    const packetName = session.packet_name?.trim();
    if (packetName && subject !== packetName) return subject;
    if (subject && subject !== "Enrollment packet") return subject;
    return enrollmentPacketLinkageHint(session) ?? "";
}

export function packetSessionInboxStatusBadges(session: PacketSessionInboxRow, lane: PacketSessionInboxLaneKey) {
    const status = session.status ?? "";
    const reviewStatus = session.operator_review_status ?? null;

    if (lane === "needsReview" || lane === "needsCorrection") {
        return [
            {
                label: operatorReviewStatusLabel(reviewStatus),
                tone: operatorReviewStatusTone(reviewStatus),
            },
        ];
    }

    if (lane === "recentlyCompleted" && reviewStatus) {
        return [
            {
                label: operatorReviewStatusLabel(reviewStatus),
                tone: operatorReviewStatusTone(reviewStatus),
            },
        ];
    }

    return [
        {
            label: packetSessionStatusLabel(status),
            tone: packetSessionStatusTone(status),
        },
    ];
}

export function packetSessionInboxMetaLine(session: PacketSessionInboxRow): string | null {
    const parts: string[] = [];
    const progress = enrollmentPacketProgressLine(session);
    if (progress) parts.push(progress);

    const warnCount = enrollmentPacketWarningCount(session);
    if (warnCount > 0) {
        parts.push(`${warnCount} review hint${warnCount === 1 ? "" : "s"}`);
    }

    const linkage = enrollmentPacketLinkageHint(session);
    if (linkage) parts.push(linkage);

    return parts.length > 0 ? parts.join(" · ") : null;
}

export {
    enrollmentPacketProgressLine,
    enrollmentPacketSubjectLine,
    enrollmentPacketWarningCount,
};
