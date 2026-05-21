/**
 * Operational Proposal — shared presentation types and labels (BOS UX coherence Card 7).
 * @see docs/sprints/05_2026/bos_ux_coherence_design.md §5
 */

import type { BosCapabilityKey, BosProposalStatus, BosRiskLevel } from "@/lib/bos/bosCapability";
import { BOS_CAPABILITY_REGISTRY } from "@/lib/bos/bosCapabilityRegistry";

/** Visual emphasis for frame shell (presentation only). */
export type OperationalProposalFrameVariant =
    | "normal"
    | "review_required"
    | "blocked"
    | "stale"
    | "applied"
    | "failed"
    | "warning";

/** Operator-facing status labels (design §5.2 region 9). */
export const OPERATIONAL_PROPOSAL_STATUS_LABELS: Record<BosProposalStatus, string> = {
    draft: "Draft",
    validated: "Ready to review",
    approved: "Approved",
    applied: "Applied",
    rejected: "Rejected",
    superseded: "Superseded",
    failed: "Failed",
    expired: "Expired",
};

/** Specialist subtitles for proposal header (capability_key → short product name). */
export const OPERATIONAL_PROPOSAL_CAPABILITY_LABELS: Record<BosCapabilityKey, string> = Object.fromEntries(
    BOS_CAPABILITY_REGISTRY.map((d) => [d.capability_key, d.label])
) as Record<BosCapabilityKey, string>;

export function operationalProposalStatusLabel(status: BosProposalStatus | null | undefined): string | null {
    if (!status) return null;
    return OPERATIONAL_PROPOSAL_STATUS_LABELS[status] ?? status;
}

export function operationalProposalCapabilityLabel(key: BosCapabilityKey | null | undefined): string | null {
    if (!key) return null;
    return OPERATIONAL_PROPOSAL_CAPABILITY_LABELS[key] ?? key;
}

/** Header line: `Task Assist · Draft message` */
export function formatOperationalProposalTypeLine(args: {
    capabilityKey?: BosCapabilityKey | null;
    proposalTypeLabel: string;
}): string {
    const type = args.proposalTypeLabel.trim();
    const cap = operationalProposalCapabilityLabel(args.capabilityKey);
    if (cap && type) return `${cap} · ${type}`;
    return type || cap || "Operational proposal";
}

export function operationalProposalRiskLabel(risk: BosRiskLevel | null | undefined): string | null {
    if (!risk || risk === "none") return null;
    switch (risk) {
        case "low":
            return "Low risk";
        case "medium":
            return "Medium risk";
        case "high":
            return "High risk";
        default:
            return null;
    }
}

export const OPERATIONAL_PROPOSAL_APPROVAL_REQUIRED_COPY = "Approval required";
export const OPERATIONAL_PROPOSAL_REVIEW_REQUIRED_COPY = "Review required";
export const OPERATIONAL_PROPOSAL_USING_ACTIVE_RECORD_PREFIX = "Using active record";
export const OPERATIONAL_PROPOSAL_BLOCKED_DEFAULT_COPY =
    "Blocked — this proposal does not match the active operational context.";
export const OPERATIONAL_PROPOSAL_STALE_DEFAULT_COPY =
    "Blocked — open the matching record or confirm the target before applying.";

export function resolveOperationalProposalFrameVariant(args: {
    presentationVariant?: OperationalProposalFrameVariant | null;
    status?: BosProposalStatus | null;
    requiresApproval?: boolean;
    blocked?: boolean;
    stale?: boolean;
}): OperationalProposalFrameVariant {
    if (args.presentationVariant) return args.presentationVariant;
    if (args.stale || args.blocked) return args.stale ? "stale" : "blocked";
    if (args.status === "applied") return "applied";
    if (args.status === "failed") return "failed";
    if (args.requiresApproval) return "review_required";
    return "normal";
}
