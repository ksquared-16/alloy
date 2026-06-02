/**
 * Intake workspace command center — deterministic KPI + action queue (OI-1).
 * Uses existing list payloads only; no new APIs.
 */

import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    groupSubmissionsIntoInboxLanes,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type IntakeCommandCenterSessionRow = {
    id: string;
    status: string;
    created_at: string;
    packet_name: string;
    operator_review_status?: string | null;
};

export type IntakeCommandCenterFormRow = {
    id: string;
    name: string;
    has_published_version?: boolean;
};

export type IntakeCommandCenterKpiTone = "urgent" | "attention" | "waiting" | "healthy" | "neutral";

export type IntakeCommandCenterKpi = {
    id: string;
    label: string;
    value: number;
    tone: IntakeCommandCenterKpiTone;
    hint?: string;
};

export type IntakeActionQueueItem = {
    id: string;
    kind: "session" | "submission";
    title: string;
    summary: string;
    href: string;
    ctaLabel: string;
    tone: "urgent" | "attention" | "neutral";
    sortKey: string;
};

export type IntakeWaitingOnItem = {
    id: string;
    label: string;
    count: number;
};

export type IntakeCommandCenterSnapshot = {
    kpis: IntakeCommandCenterKpi[];
    actionQueue: IntakeActionQueueItem[];
    waitingOn: IntakeWaitingOnItem[];
    healthyLine: string;
    urgencyHeadline: string;
    primaryCta: { label: string; href: string } | null;
};

function sessionNeedsReview(session: IntakeCommandCenterSessionRow): boolean {
    if (session.status !== "completed") return false;
    const review = session.operator_review_status;
    if (review === "approved" || review === "rejected") return false;
    if (review === "needs_review" || review === "needs_correction") return true;
    return review == null;
}

function sessionHref(sessionId: string): string {
    return `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(sessionId)}`;
}

function submissionHref(row: SubmissionInboxRow): string {
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(row.form_definition_id)}/submissions/${encodeURIComponent(row.id)}`;
}

export function deriveIntakeCommandCenterSnapshot(params: {
    submissions: SubmissionInboxRow[];
    sessions: IntakeCommandCenterSessionRow[];
    forms: IntakeCommandCenterFormRow[];
    formsById: Record<string, string>;
}): IntakeCommandCenterSnapshot {
    const lanes = groupSubmissionsIntoInboxLanes(params.submissions);
    const reviewSessions = params.sessions.filter(sessionNeedsReview);
    const inProgressSessions = params.sessions.filter((s) => s.status === "in_progress");
    const unpublishedForms = params.forms.filter((f) => !f.has_published_version);
    const publishedForms = params.forms.filter((f) => f.has_published_version);

    const needsActionCount =
        lanes.needsReview.length + lanes.needsLinking.length + reviewSessions.length;
    const waitingCount = lanes.drafts.length + inProgressSessions.length;

    const kpis: IntakeCommandCenterKpi[] = [
        {
            id: "needs-action",
            label: "Needs Action",
            value: needsActionCount,
            tone: needsActionCount > 0 ? "urgent" : "healthy",
            hint: "Review, linkage, or packet decisions",
        },
        {
            id: "needs-review",
            label: "Needs Review",
            value: lanes.needsReview.length + reviewSessions.length,
            tone: lanes.needsReview.length + reviewSessions.length > 0 ? "urgent" : "neutral",
        },
        {
            id: "needs-linking",
            label: "Needs Linking",
            value: lanes.needsLinking.length,
            tone: lanes.needsLinking.length > 0 ? "attention" : "neutral",
        },
        {
            id: "waiting-on",
            label: "Waiting on Families",
            value: waitingCount,
            tone: waitingCount > 0 ? "waiting" : "neutral",
            hint: "Drafts and in-progress packets",
        },
        {
            id: "healthy",
            label: "Ready / Healthy",
            value: lanes.recentlySubmitted.length,
            tone: "healthy",
            hint: "Recently operationalized intake",
        },
        {
            id: "forms",
            label: "Forms",
            value: params.forms.length,
            tone: "neutral",
            hint: "Author, publish, and distribute",
        },
    ];

    const actionQueue: IntakeActionQueueItem[] = [];

    for (const session of reviewSessions.slice(0, 4)) {
        actionQueue.push({
            id: `session-${session.id}`,
            kind: "session",
            title: session.packet_name,
            summary: "Packet submitted — case file ready for review",
            href: sessionHref(session.id),
            ctaLabel: "Review case file",
            tone: "urgent",
            sortKey: session.created_at,
        });
    }

    for (const row of [...lanes.needsReview, ...lanes.needsLinking].slice(0, 6)) {
        const formName = params.formsById[row.form_definition_id] ?? "Form";
        actionQueue.push({
            id: `submission-${row.id}`,
            kind: "submission",
            title: formName,
            summary:
                lanes.needsReview.includes(row) ?
                    "Submitted intake flagged for operator review"
                :   "Missing CRM attach target — link before outputs",
            href: submissionHref(row),
            ctaLabel: "Review intake",
            tone: lanes.needsReview.includes(row) ? "urgent" : "attention",
            sortKey: row.submitted_at ?? row.created_at,
        });
    }

    actionQueue.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    const waitingOn: IntakeWaitingOnItem[] = [
        { id: "drafts", label: "Draft submissions", count: lanes.drafts.length },
        { id: "in-progress", label: "Packets in progress", count: inProgressSessions.length },
        { id: "unpublished", label: "Forms need publish", count: unpublishedForms.length },
    ].filter((w) => w.count > 0);

    const urgencyHeadline =
        needsActionCount > 0 ?
            `${needsActionCount} item${needsActionCount === 1 ? "" : "s"} need your attention`
        : waitingCount > 0 ?
            "No urgent review flags — families still completing intake"
        :   "Intake is calm — no urgent review flags";

    const primaryCta =
        reviewSessions[0] ?
            { label: "Review next packet", href: sessionHref(reviewSessions[0]!.id) }
        : lanes.needsReview[0] ?
            { label: "Review next submission", href: submissionHref(lanes.needsReview[0]!) }
        : lanes.needsLinking[0] ?
            { label: "Fix next linkage", href: submissionHref(lanes.needsLinking[0]!) }
        :   null;

    const healthyLine =
        needsActionCount === 0 && waitingCount === 0 ?
            `${publishedForms.length} published form${publishedForms.length === 1 ? "" : "s"} ready to distribute.`
        : `${lanes.recentlySubmitted.length} recently submitted · ${publishedForms.length} published forms`;

    return {
        kpis,
        actionQueue: actionQueue.slice(0, 8),
        waitingOn,
        healthyLine,
        urgencyHeadline,
        primaryCta,
    };
}
