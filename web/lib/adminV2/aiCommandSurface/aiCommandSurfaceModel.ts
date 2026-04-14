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
                    ? "Some requests could not be placed on the job overview with the current catalog."
                    : "Your current job overview layout already matches this request.",
            kind: k === "noop_unresolved_only" ? "unresolved_only" : "no_op",
        };
    }
    return {
        headline: "Review changes before applying",
        subline: "Preview is ready for the job overview layout.",
        kind: "action_preview",
    };
}

/** Plain-language bullets from rule-based intent (deterministic). */
export function formatIntentSummary(p: ParsedJobOverviewIntent): string[] {
    const lines: string[] = [];
    if (p.hide_financial) lines.push("Hide or turn off the financial band.");
    if (p.show_financial) lines.push("Show or turn on the financial band.");
    if (p.customer_focused) lines.push("Use a more customer-focused layout (relationship context + people).");
    if (p.service_details_higher) lines.push("Move service/property details higher on the overview.");
    if (p.contact_details_higher) lines.push("Move contact/people content higher on the overview.");
    if (p.show_main_contact) lines.push("Show the primary contact person on the overview.");
    if (p.show_address) lines.push("Show address or location.");
    if (p.show_next_service) lines.push("Show next service or schedule.");
    if (p.show_service_details) lines.push("Show booked service line / service details.");
    if (p.referenced_unreachable_contact_channels) {
        lines.push("Mentions phone or email — those are not overview fields in the catalog yet.");
    }
    if (p.contact_semantics === "mixed") {
        lines.push("Reads as both identity and channels; channels stay unresolved until catalog adds keys.");
    } else if (p.contact_semantics === "channels") {
        lines.push("Reads primarily as channels (phone/email), not as layout identity.");
    } else if (p.contact_semantics === "identity") {
        lines.push("Reads as person/contact identity for the overview.");
    }
    if (lines.length === 0) lines.push("Adjust the job overview layout.");
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
            out.push(`Financial band: ${boolPhrase(before)} → ${boolPhrase(after)}.`);
        }
    }
    if (d.band_order) {
        const a = JSON.stringify(d.band_order.before);
        const b = JSON.stringify(d.band_order.after);
        if (a !== b) out.push("Section order (bands) changed — affects what appears higher on the page.");
    }
    if (d.header_keys) {
        const a = JSON.stringify(d.header_keys.before);
        const b = JSON.stringify(d.header_keys.after);
        if (a !== b) out.push("Top header strip (chips) was updated or reordered.");
    }
    if (d.relationship_group_keys) {
        const a = JSON.stringify(d.relationship_group_keys.before ?? []);
        const b = JSON.stringify(d.relationship_group_keys.after ?? []);
        if (a !== b) out.push("Relationship groups (customer-facing summaries) were updated.");
    }
    if (d.bands_content_changed && d.bands_content_changed.length > 0) {
        out.push(`Updated fields in: ${d.bands_content_changed.join(", ")}.`);
    }
    if (out.length === 0) out.push("Layout differences are summarized in technical details.");
    return out;
}

/** @deprecated Use statusFromPlanner */
export const confidenceFromPlanner = statusFromPlanner;
