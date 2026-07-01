import type { DiffSummary, JobOverviewPlannerSuccess, ParsedJobOverviewIntent } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import {
    classifySemanticOverviewNoop,
    semanticOverviewNoopHeadline,
} from "@/lib/admin/agentLab/semanticOverviewNoopSummary";

/**
 * Surface-only status for the AdminV2 command panel (not planner output).
 * Distinguishes “already satisfied” from “blocked” and from “partial with gaps”.
 */
export type AIStatusBadge =
    | "ready"
    | "partial"
    | "up_to_date"
    | "gaps_only"
    | "in_progress"
    | "applied"
    | "error";

export type ResponseKind =
    | "loading"
    | "action_preview"
    | "no_op"
    | "unresolved_only"
    | "applied_success"
    | "error";

export function badgeLabel(c: AIStatusBadge): string {
    switch (c) {
        case "ready":
            return "Ready to apply";
        case "partial":
            return "Partial — review gaps";
        case "up_to_date":
            return "Already up to date";
        case "gaps_only":
            return "Unsupported items only";
        case "in_progress":
            return "Working…";
        case "applied":
            return "Applied";
        case "error":
            return "Couldn’t complete";
        default:
            return "";
    }
}

/** Maps planner success to a product-style status (no LLM). */
export function statusFromPlanner(planner: JobOverviewPlannerSuccess): AIStatusBadge {
    if (planner.effective_layout_change) {
        return planner.resolution.unresolved_targets.length > 0 ? "partial" : "ready";
    }
    const noopKind = classifySemanticOverviewNoop(planner);
    if (noopKind === "noop_unresolved_only") return "gaps_only";
    return "up_to_date";
}

export function headlineForPreview(
    planner: JobOverviewPlannerSuccess
): { headline: string; subline?: string; kind: ResponseKind } {
    if (!planner.effective_layout_change) {
        const k = classifySemanticOverviewNoop(planner);
        const h = semanticOverviewNoopHeadline(k) ?? "No changes to apply";
        return {
            headline: h,
            subline:
                k === "noop_unresolved_only"
                    ? "Some asks aren’t supported on the overview yet."
                    : "Layout already matches.",
            kind: k === "noop_unresolved_only" ? "unresolved_only" : "no_op",
        };
    }
    return {
        headline: "Review changes before applying",
        subline: "Preview ready — job overview only.",
        kind: "action_preview",
    };
}

/** Plain-language bullets from rule-based intent — phrased as overview UI outcomes (deterministic). */
export function formatIntentSummary(p: ParsedJobOverviewIntent): string[] {
    const lines: string[] = [];
    if (p.hide_financial) lines.push("Financial band off on the overview.");
    if (p.show_financial) lines.push("Financial band on the overview.");
    if (p.customer_focused) lines.push("Customer-focused bands: relationship context and people up front.");
    if (p.service_details_higher) lines.push("Service / property details higher on the page.");
    if (p.contact_details_higher) lines.push("Contact / people block higher on the page.");
    if (p.show_main_contact) lines.push("Primary contact visible in the header or bands.");
    if (p.show_address) lines.push("Address / location surfaced on the overview.");
    if (p.show_next_service) lines.push("Next service / schedule on the overview.");
    if (p.show_service_details) lines.push("Booked service line / service details visible.");
    if (p.referenced_unreachable_contact_channels) {
        lines.push("Phone/email called out — not mappable to overview fields yet.");
    }
    if (p.contact_semantics === "mixed") {
        lines.push("Mix of contact identity and channels; channel rows stay unresolved for now.");
    } else if (p.contact_semantics === "channels") {
        lines.push("Reads as phone/email channels, not a placeable overview block.");
    } else if (p.contact_semantics === "identity") {
        lines.push("Reads as a person/contact to show on the overview.");
    }
    if (lines.length === 0) lines.push("Adjust overview layout.");
    return lines;
}

function boolPhrase(v: boolean | null | undefined): string {
    if (v === true) return "on";
    if (v === false) return "off";
    return "not set";
}

/** Short human lines from diff_summary (deterministic). */
export function formatDiffSummaryHuman(d: DiffSummary): string[] {
    const out: string[] = [];
    if (d.financial_band_enabled) {
        const { before, after } = d.financial_band_enabled;
        if (before !== after) {
            out.push(`Financial band ${boolPhrase(before)} → ${boolPhrase(after)}.`);
        }
    }
    if (d.band_order) {
        const a = JSON.stringify(d.band_order.before);
        const b = JSON.stringify(d.band_order.after);
        if (a !== b) out.push("Band order changes — what sits higher on the overview shifts.");
    }
    if (d.header_keys) {
        const a = JSON.stringify(d.header_keys.before);
        const b = JSON.stringify(d.header_keys.after);
        if (a !== b) out.push("Header chips updated or reordered.");
    }
    if (d.relationship_group_keys) {
        const a = JSON.stringify(d.relationship_group_keys.before ?? []);
        const b = JSON.stringify(d.relationship_group_keys.after ?? []);
        if (a !== b) out.push("Relationship summary groups updated.");
    }
    if (d.bands_content_changed && d.bands_content_changed.length > 0) {
        out.push(`Fields touched: ${d.bands_content_changed.join(", ")}.`);
    }
    if (out.length === 0) out.push("See technical details for raw diff.");
    return out;
}

/** @deprecated Use statusFromPlanner */
export const confidenceFromPlanner = statusFromPlanner;
