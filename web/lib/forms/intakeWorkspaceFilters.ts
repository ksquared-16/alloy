/**
 * Intake workspace operational filters (FD-1 / OI-4 / IC-3).
 * Client-side drill-in from workload pills — submission-backed, case-presented.
 */

import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    buildIntakeCasePresentationRows,
    type IntakeCasePresentationRow,
} from "@/lib/forms/intakeCasePresentation";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";
import {
    groupSubmissionsIntoInboxLanes,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type IntakeWorkspaceFilterKey =
    | "needs_review"
    | "needs_linking"
    | "recent"
    | "waiting"
    | "forms"
    | "packets";

export const INTAKE_WORKSPACE_FILTERS: {
    id: IntakeWorkspaceFilterKey;
    label: string;
    shortLabel: string;
}[] = [
    { id: "needs_review", label: "Needs review", shortLabel: "Review" },
    { id: "needs_linking", label: "Needs linking", shortLabel: "Linking" },
    { id: "recent", label: "Recent intake", shortLabel: "Recent" },
    { id: "waiting", label: "Waiting on families", shortLabel: "Waiting" },
    { id: "forms", label: "Forms", shortLabel: "Forms" },
    { id: "packets", label: "Packets", shortLabel: "Packets" },
];

export type IntakeWorkspaceFilterItem = {
    id: string;
    title: string;
    meta: string;
    formName?: string;
    familyLabel?: string | null;
    createdSummary?: string | null;
    operatorAction?: string;
    href: string;
    cta: string;
    submission?: SubmissionInboxRow;
    submissionLane?: SubmissionInboxLaneKey;
    sortKey: string;
    quickReview?: boolean;
    /** IC-3 — derived intake case presentation */
    caseKey?: string;
    submissionCount?: number;
    latestActivityAt?: string;
    hasSignature?: boolean;
    hasGeneratedDocument?: boolean;
    attentionReasons?: string[];
    isCaseRow?: boolean;
};

export type IntakeWorkspaceFilterPanel = {
    filter: IntakeWorkspaceFilterKey;
    title: string;
    lead: string;
    items: IntakeWorkspaceFilterItem[];
    empty: string;
};

function sessionNeedsReview(session: IntakeCommandCenterSessionRow): boolean {
    if (session.status !== "completed") return false;
    const review = session.operator_review_status;
    if (review === "approved" || review === "rejected") return false;
    if (review === "needs_review" || review === "needs_correction") return true;
    return review == null;
}

function sortItems(items: IntakeWorkspaceFilterItem[]): IntakeWorkspaceFilterItem[] {
    return [...items].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function submissionsById(submissions: SubmissionInboxRow[]): Map<string, SubmissionInboxRow> {
    return new Map(submissions.map((row) => [row.id, row]));
}

function buildIntakeCases(params: {
    submissions: SubmissionInboxRow[];
    sessions: IntakeCommandCenterSessionRow[];
    formsById: Record<string, string>;
}): IntakeCasePresentationRow[] {
    return buildIntakeCasePresentationRows({
        submissions: params.submissions,
        sessions: params.sessions,
        formsById: params.formsById,
    });
}

/** Map derived intake case to existing workspace filter lanes. */
export function intakeCaseMatchesWorkspaceFilter(
    intakeCase: IntakeCasePresentationRow,
    filter: IntakeWorkspaceFilterKey
): boolean {
    const { status_bucket, review_state } = intakeCase;
    switch (filter) {
        case "needs_review":
            return (
                status_bucket === "review_required" ||
                status_bucket === "needs_attention" ||
                review_state === "packet_review_pending"
            );
        case "needs_linking":
            return status_bucket === "needs_linking";
        case "recent":
            return status_bucket === "recent" || status_bucket === "auto_operationalized";
        case "waiting":
            return status_bucket === "waiting" || status_bucket === "packet_in_progress";
        default:
            return false;
    }
}

function filterIntakeCases(
    cases: IntakeCasePresentationRow[],
    filter: IntakeWorkspaceFilterKey
): IntakeCasePresentationRow[] {
    return cases.filter((intakeCase) => intakeCaseMatchesWorkspaceFilter(intakeCase, filter));
}

function primarySubmissionForCase(
    intakeCase: IntakeCasePresentationRow,
    byId: Map<string, SubmissionInboxRow>
): SubmissionInboxRow | undefined {
    for (const id of intakeCase.submission_ids) {
        const row = byId.get(id);
        if (row) return row;
    }
    return undefined;
}

function caseFilterItem(
    intakeCase: IntakeCasePresentationRow,
    byId: Map<string, SubmissionInboxRow>,
    formsById: Record<string, string>,
    filter: IntakeWorkspaceFilterKey
): IntakeWorkspaceFilterItem {
    const primarySubmission = primarySubmissionForCase(intakeCase, byId);
    const primaryFormName =
        primarySubmission ? (formsById[primarySubmission.form_definition_id] ?? "Form") : undefined;

    return {
        id: `case-${intakeCase.case_key}`,
        title: intakeCase.display_title,
        meta: intakeCase.subtitle,
        formName:
            intakeCase.submission_count > 1 ?
                `${intakeCase.submission_count} forms`
            :   primaryFormName,
        operatorAction: intakeCase.recommended_next_action,
        href: intakeCase.href,
        cta: intakeCase.recommended_next_action,
        submission: primarySubmission,
        sortKey: intakeCase.sort_key,
        quickReview: filter === "needs_review" || filter === "needs_linking" || filter === "recent",
        caseKey: intakeCase.case_key,
        submissionCount: intakeCase.submission_count,
        latestActivityAt: intakeCase.latest_activity_at,
        hasSignature: intakeCase.has_signature,
        hasGeneratedDocument: intakeCase.has_generated_document,
        attentionReasons: intakeCase.attention_reasons,
        isCaseRow: true,
    };
}

function sessionFilterItem(
    session: IntakeCommandCenterSessionRow,
    variant: "needs_review" | "waiting"
): IntakeWorkspaceFilterItem {
    if (variant === "needs_review") {
        return {
            id: `session-${session.id}`,
            title: "Packet ready for operator review",
            meta: `${session.packet_name} · Case file complete — approve or request corrections`,
            href: `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(session.id)}`,
            cta: "Review packet",
            sortKey: session.created_at,
        };
    }

    return {
        id: `session-${session.id}`,
        title: "Waiting for packet completion",
        meta: `${session.packet_name} · Family still completing required forms`,
        href: `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(session.id)}`,
        cta: "Monitor",
        sortKey: session.created_at,
    };
}

function coveredPacketSessionIds(cases: IntakeCasePresentationRow[]): Set<string> {
    const ids = new Set<string>();
    for (const intakeCase of cases) {
        if (intakeCase.packet_session_id) ids.add(intakeCase.packet_session_id);
    }
    return ids;
}

export function countIntakeWorkspaceFilters(params: {
    submissions: SubmissionInboxRow[];
    sessions: IntakeCommandCenterSessionRow[];
    forms: { id: string; has_published_version?: boolean }[];
    packets: { id: string }[];
    formsById?: Record<string, string>;
}): Record<IntakeWorkspaceFilterKey, number> {
    const formsById = params.formsById ?? {};
    const cases = buildIntakeCases({
        submissions: params.submissions,
        sessions: params.sessions,
        formsById,
    });
    const coveredSessions = coveredPacketSessionIds(cases);

    const reviewSessions = params.sessions.filter(
        (session) => sessionNeedsReview(session) && !coveredSessions.has(session.id)
    );
    const inProgressSessions = params.sessions.filter(
        (session) => session.status === "in_progress" && !coveredSessions.has(session.id)
    );

    return {
        needs_review: filterIntakeCases(cases, "needs_review").length + reviewSessions.length,
        needs_linking: filterIntakeCases(cases, "needs_linking").length,
        recent: filterIntakeCases(cases, "recent").length,
        waiting: filterIntakeCases(cases, "waiting").length + inProgressSessions.length,
        forms: params.forms.length,
        packets: params.packets.length,
    };
}

/** Submission lane counts — preserved for diagnostics (pre-case aggregation). */
export function countIntakeWorkspaceSubmissionLanes(submissions: SubmissionInboxRow[]): {
    needsReview: number;
    needsLinking: number;
    recentlySubmitted: number;
    drafts: number;
} {
    const lanes = groupSubmissionsIntoInboxLanes(submissions);
    return {
        needsReview: lanes.needsReview.length,
        needsLinking: lanes.needsLinking.length,
        recentlySubmitted: lanes.recentlySubmitted.length,
        drafts: lanes.drafts.length,
    };
}

export function buildIntakeWorkspaceFilterPanel(
    filter: IntakeWorkspaceFilterKey,
    params: {
        submissions: SubmissionInboxRow[];
        sessions: IntakeCommandCenterSessionRow[];
        forms: { id: string; name: string; has_published_version?: boolean }[];
        packets: { id: string; name: string }[];
        formsById: Record<string, string>;
    }
): IntakeWorkspaceFilterPanel {
    const byId = submissionsById(params.submissions);
    const cases = buildIntakeCases({
        submissions: params.submissions,
        sessions: params.sessions,
        formsById: params.formsById,
    });
    const coveredSessions = coveredPacketSessionIds(cases);
    const items: IntakeWorkspaceFilterItem[] = [];

    switch (filter) {
        case "needs_review": {
            for (const intakeCase of filterIntakeCases(cases, "needs_review")) {
                items.push(caseFilterItem(intakeCase, byId, params.formsById, filter));
            }
            for (const session of params.sessions.filter(
                (s) => sessionNeedsReview(s) && !coveredSessions.has(s.id)
            )) {
                items.push(sessionFilterItem(session, "needs_review"));
            }
            return {
                filter,
                title: "Needs review",
                lead: "Intake cases flagged for human confirmation before outputs or enrollment workflows.",
                items: sortItems(items),
                empty: "No intake cases need review.",
            };
        }
        case "needs_linking": {
            for (const intakeCase of filterIntakeCases(cases, "needs_linking")) {
                items.push(caseFilterItem(intakeCase, byId, params.formsById, filter));
            }
            return {
                filter,
                title: "Needs linking",
                lead: "Intake cases missing a family match — link before document generation.",
                items: sortItems(items),
                empty: "No intake cases need family matching.",
            };
        }
        case "recent": {
            for (const intakeCase of filterIntakeCases(cases, "recent")) {
                items.push(caseFilterItem(intakeCase, byId, params.formsById, filter));
            }
            return {
                filter,
                title: "Recent intake",
                lead: "Recently operationalized intake cases — generate documents or continue workflows.",
                items: sortItems(items),
                empty: "No recently operationalized intake cases.",
            };
        }
        case "waiting": {
            for (const intakeCase of filterIntakeCases(cases, "waiting")) {
                items.push(caseFilterItem(intakeCase, byId, params.formsById, filter));
            }
            for (const session of params.sessions.filter(
                (s) => s.status === "in_progress" && !coveredSessions.has(s.id)
            )) {
                items.push(sessionFilterItem(session, "waiting"));
            }
            return {
                filter,
                title: "Waiting on families",
                lead: "Intake cases and packets waiting on family completion.",
                items: sortItems(items),
                empty: "No intake cases are waiting on completion.",
            };
        }
        case "forms": {
            for (const f of params.forms) {
                items.push({
                    id: `form-${f.id}`,
                    title: f.name,
                    meta: f.has_published_version ? "Published — ready to distribute" : "Needs publish before distribution",
                    href: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(f.id)}`,
                    cta: "Open",
                    sortKey: f.name,
                });
            }
            return {
                filter,
                title: "Forms",
                lead: "Form definitions — open to author or distribute.",
                items,
                empty: "No forms in this organization.",
            };
        }
        case "packets": {
            for (const p of params.packets) {
                items.push({
                    id: `pkt-${p.id}`,
                    title: p.name,
                    meta: "Multi-step intake workflow definition",
                    href: `${FORMS_MODULE_ROUTES.packetDefinitions}/${encodeURIComponent(p.id)}`,
                    cta: "Builder",
                    sortKey: p.name,
                });
            }
            return {
                filter,
                title: "Packets",
                lead: "Multi-step intake workflows.",
                items,
                empty: "No packet definitions yet.",
            };
        }
    }
}

export function defaultIntakeWorkspaceFilter(counts: Record<IntakeWorkspaceFilterKey, number>): IntakeWorkspaceFilterKey {
    if (counts.needs_review > 0) return "needs_review";
    if (counts.needs_linking > 0) return "needs_linking";
    if (counts.recent > 0) return "recent";
    if (counts.waiting > 0) return "waiting";
    return "forms";
}
