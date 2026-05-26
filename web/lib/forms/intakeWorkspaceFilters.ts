/**
 * Intake workspace operational filters (FD-1).
 * Client-side drill-in from KPI tiles — existing list data only.
 */

import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    groupSubmissionsIntoInboxLanes,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";

export type IntakeWorkspaceFilterKey =
    | "needs_review"
    | "needs_linking"
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
    { id: "waiting", label: "Waiting on families", shortLabel: "Waiting" },
    { id: "forms", label: "Forms", shortLabel: "Forms" },
    { id: "packets", label: "Packets", shortLabel: "Packets" },
];

export type IntakeWorkspaceFilterItem = {
    id: string;
    title: string;
    meta: string;
    href: string;
    cta: string;
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
            for (const s of params.sessions.filter(sessionNeedsReview)) {
                items.push({
                    id: `session-${s.id}`,
                    title: s.packet_name,
                    meta: "Packet ready for case-file review",
                    href: `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(s.id)}`,
                    cta: "Review",
                });
            }
            for (const row of lanes.needsReview) {
                items.push({
                    id: `sub-${row.id}`,
                    title: params.formsById[row.form_definition_id] ?? "Form",
                    meta: "Submitted — intake flagged",
                    href: `${ADMIN_FORMS_UI_BASE}/${row.form_definition_id}/submissions/${row.id}`,
                    cta: "Review",
                });
            }
            return {
                filter,
                title: "Needs review",
                lead: "Packets and submissions waiting for operator review.",
                items: items.sort((a, b) => b.meta.localeCompare(a.meta)),
                empty: "Nothing needs review right now.",
            };
        }
        case "needs_linking": {
            for (const row of lanes.needsLinking) {
                items.push({
                    id: `sub-${row.id}`,
                    title: params.formsById[row.form_definition_id] ?? "Form",
                    meta: "Link CRM records before outputs",
                    href: `${ADMIN_FORMS_UI_BASE}/${row.form_definition_id}/submissions/${row.id}`,
                    cta: "Link records",
                });
            }
            return {
                filter,
                title: "Needs linking",
                lead: "Submissions missing CRM attach targets or linkage confirmation.",
                items,
                empty: "No linkage flags in this inbox.",
            };
        }
        case "waiting": {
            for (const s of params.sessions.filter((x) => x.status === "in_progress")) {
                items.push({
                    id: `session-${s.id}`,
                    title: s.packet_name,
                    meta: "Packet in progress",
                    href: `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(s.id)}`,
                    cta: "Monitor",
                });
            }
            for (const row of lanes.drafts) {
                items.push({
                    id: `sub-${row.id}`,
                    title: params.formsById[row.form_definition_id] ?? "Form",
                    meta: "Draft — not submitted",
                    href: `${ADMIN_FORMS_UI_BASE}/${row.form_definition_id}/submissions/${row.id}`,
                    cta: "Open",
                });
            }
            return {
                filter,
                title: "Waiting on families",
                lead: "In-progress packets and draft submissions.",
                items,
                empty: "No families are mid-intake right now.",
            };
        }
        case "forms": {
            for (const f of params.forms) {
                items.push({
                    id: `form-${f.id}`,
                    title: f.name,
                    meta: f.has_published_version ? "Published" : "Needs publish",
                    href: `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(f.id)}`,
                    cta: "Open",
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
                    meta: "Packet workflow",
                    href: `${FORMS_MODULE_ROUTES.packetDefinitions}/${encodeURIComponent(p.id)}`,
                    cta: "Builder",
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
    if (counts.waiting > 0) return "waiting";
    return "forms";
}
