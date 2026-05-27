/**
 * Intake workspace operational filters (FD-1 / OI-4).
 * Client-side drill-in from workload pills — existing list data only.
 */

import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    deriveSubmissionOperationalNarrative,
    sortSubmissionsByActivity,
    submissionActivitySortKey,
    submissionCreatedOrMatchedSummary,
    submissionFamilyLabel,
} from "@/lib/forms/submissionOperationalNarrative";
import {
    groupSubmissionsIntoInboxLanes,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";

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

function submissionItem(
    row: SubmissionInboxRow,
    formsById: Record<string, string>,
    lane: SubmissionInboxLaneKey
): IntakeWorkspaceFilterItem {
    const narrative = deriveSubmissionOperationalNarrative(row);
    const formLabel = formsById[row.form_definition_id] ?? "Form";
    return {
        id: `sub-${row.id}`,
        title: narrative.headline,
        meta: narrative.detail,
        formName: formLabel,
        familyLabel: submissionFamilyLabel(row),
        createdSummary: submissionCreatedOrMatchedSummary(row),
        operatorAction: narrative.operatorAction,
        href: `${ADMIN_FORMS_UI_BASE}/${row.form_definition_id}/submissions/${row.id}`,
        cta: narrative.operatorAction,
        submission: row,
        submissionLane: lane,
        sortKey: submissionActivitySortKey(row),
        quickReview: lane === "needsReview" || lane === "needsLinking" || lane === "recentlySubmitted",
    };
}

function sortItems(items: IntakeWorkspaceFilterItem[]): IntakeWorkspaceFilterItem[] {
    return [...items].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export function countIntakeWorkspaceFilters(params: {
    submissions: SubmissionInboxRow[];
    sessions: IntakeCommandCenterSessionRow[];
    forms: { id: string; has_published_version?: boolean }[];
    packets: { id: string }[];
}): Record<IntakeWorkspaceFilterKey, number> {
    const lanes = groupSubmissionsIntoInboxLanes(params.submissions);
    const reviewSessions = params.sessions.filter(sessionNeedsReview);
    const inProgress = params.sessions.filter((s) => s.status === "in_progress");

    return {
        needs_review: lanes.needsReview.length + reviewSessions.length,
        needs_linking: lanes.needsLinking.length,
        recent: lanes.recentlySubmitted.length,
        waiting: lanes.drafts.length + inProgress.length,
        forms: params.forms.length,
        packets: params.packets.length,
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
    const lanes = groupSubmissionsIntoInboxLanes(params.submissions);
    const items: IntakeWorkspaceFilterItem[] = [];

    switch (filter) {
        case "needs_review": {
            for (const row of sortSubmissionsByActivity(lanes.needsReview)) {
                items.push(submissionItem(row, params.formsById, "needsReview"));
            }
            for (const s of params.sessions.filter(sessionNeedsReview)) {
                items.push({
                    id: `session-${s.id}`,
                    title: "Packet ready for operator review",
                    meta: `${s.packet_name} · Case file complete — approve or request corrections`,
                    href: `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(s.id)}`,
                    cta: "Review packet",
                    sortKey: s.created_at,
                });
            }
            return {
                filter,
                title: "Needs review",
                lead: "Intake flagged for human confirmation before outputs or enrollment workflows.",
                items: sortItems(items),
                empty: "Nothing needs review right now.",
            };
        }
        case "needs_linking": {
            for (const row of sortSubmissionsByActivity(lanes.needsLinking)) {
                items.push(submissionItem(row, params.formsById, "needsLinking"));
            }
            return {
                filter,
                title: "Needs linking",
                lead: "Submitted intake missing CRM attach targets — link before document generation.",
                items: sortItems(items),
                empty: "No linkage flags in this inbox.",
            };
        }
        case "recent": {
            for (const row of sortSubmissionsByActivity(lanes.recentlySubmitted)) {
                items.push(submissionItem(row, params.formsById, "recentlySubmitted"));
            }
            return {
                filter,
                title: "Recent intake",
                lead: "Newest submitted intake cleared for review — generate documents or continue workflows.",
                items: sortItems(items),
                empty: "No recently submitted intake in this workload.",
            };
        }
        case "waiting": {
            for (const s of params.sessions.filter((x) => x.status === "in_progress")) {
                items.push({
                    id: `session-${s.id}`,
                    title: "Family completing packet",
                    meta: `${s.packet_name} · In progress — monitor for completion`,
                    href: `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(s.id)}`,
                    cta: "Monitor",
                    sortKey: s.created_at,
                });
            }
            for (const row of sortSubmissionsByActivity(lanes.drafts)) {
                items.push(submissionItem(row, params.formsById, "drafts"));
            }
            return {
                filter,
                title: "Waiting on families",
                lead: "In-progress packets and draft submissions.",
                items: sortItems(items),
                empty: "No families are mid-intake right now.",
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
