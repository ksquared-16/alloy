/**
 * Job overview layout → Operational Proposal frame copy (BOS UX coherence Card 12).
 */

import {
    formatDiffSummaryHuman,
    formatIntentSummary,
    type ResponseKind,
} from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";
import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import type { BosProposalStatus } from "@/lib/bos/bosCapability";
import type { OperationalProposalFrameVariant } from "@/lib/adminV2/bos/operationalProposalPresentation";

export const JOB_LAYOUT_PROPOSAL_TYPE_LABEL = "Layout proposal";
export const JOB_LAYOUT_PROPOSAL_SOURCE_LABEL = "Job overview layout";
export const JOB_LAYOUT_PROPOSAL_SCOPE_LABEL = "Job record · overview layout";

export const JOB_LAYOUT_PREVIEW_MUTATION_BOUNDARY_COPY =
    "Preview before apply — job overview layout only. Nothing changes until you approve and apply.";

export const JOB_LAYOUT_APPLIED_RECEIPT_COPY = "Job overview layout saved.";

export function mapJobLayoutResponseKindToBosStatus(kind: ResponseKind): BosProposalStatus | null {
    switch (kind) {
        case "loading":
            return "draft";
        case "action_preview":
            return "validated";
        case "applied_success":
            return "applied";
        case "error":
            return "failed";
        case "no_op":
        case "unresolved_only":
            return "validated";
        default:
            return null;
    }
}

export function mapJobLayoutResponseKindToFrameVariant(kind: ResponseKind): OperationalProposalFrameVariant {
    switch (kind) {
        case "applied_success":
            return "applied";
        case "error":
            return "failed";
        case "action_preview":
            return "review_required";
        case "no_op":
        case "unresolved_only":
            return "warning";
        default:
            return "normal";
    }
}

export function jobLayoutMutationBoundaryCopy(kind: ResponseKind): string | null {
    if (kind === "applied_success") return JOB_LAYOUT_APPLIED_RECEIPT_COPY;
    if (kind === "no_op") return "Layout already matches your request — no changes to apply.";
    if (kind === "unresolved_only") return "Some asks are not supported on the overview yet — review gaps before applying.";
    if (kind === "action_preview") return JOB_LAYOUT_PREVIEW_MUTATION_BOUNDARY_COPY;
    return null;
}

/** Max 3 bullets for Details region — deterministic planner copy. */
export function buildJobLayoutDetailsBullets(params: {
    kind: ResponseKind;
    planner: JobOverviewPlannerSuccess | null;
    commandText: string;
    errorSubline?: string;
}): string[] {
    const { kind, planner, commandText, errorSubline } = params;
    const out: string[] = [];

    const q = commandText.trim();
    if (q) {
        out.push(q.length > 88 ? `${q.slice(0, 85)}…` : q);
    }

    if (kind === "applied_success") {
        out.push("Layout saved to the job overview.");
        return out.slice(0, 3);
    }

    if (kind === "error" && errorSubline) {
        out.push(errorSubline);
        return out.slice(0, 3);
    }

    if (!planner) {
        return out.slice(0, 3);
    }

    if (!q) {
        const intents = formatIntentSummary(planner.parsed_intent);
        if (intents[0]) out.push(intents[0]);
    }

    if (planner.effective_layout_change) {
        const diffLines = formatDiffSummaryHuman(planner.diff_summary);
        if (diffLines[0]) out.push(diffLines[0]);
        const u = planner.resolution.unresolved_targets?.[0];
        if (u && out.length < 3) {
            out.push(`Not placed: ${u.concept_id} — ${u.reason}`);
        }
    } else {
        const un = planner.resolution.unresolved_targets ?? [];
        if (un.length) {
            out.push("No layout diff — unsupported asks.");
            if (un[0] && out.length < 3) out.push(`${un[0].concept_id}: ${un[0].reason}`);
        } else {
            out.push("No layout diff — already matches.");
        }
    }

    return out.filter(Boolean).slice(0, 3);
}

export function safeJobLayoutJson(x: unknown): string {
    try {
        return JSON.stringify(x, null, 2);
    } catch {
        return String(x);
    }
}
