/**
 * BOS proposal envelope — normalized wrapper over native capability payloads.
 * @see docs/product/bos-foundation.md
 */

import type { BosCapabilityDomain, BosCapabilityKey, BosProposalStatus, BosRiskLevel } from "@/lib/bos/bosCapability";

export const BOS_PROPOSAL_ENVELOPE_VERSION = 1 as const;

export type BosProposalEnvelopeValidationV1 = {
    ok: boolean;
    errors: string[];
    warnings: string[];
};

export type BosProposalEnvelopeWarningV1 = {
    code?: string;
    message: string;
    severity?: "warning" | "error";
};

/** Machine- or human-oriented change summary; shape varies by capability. */
export type BosProposalEnvelopeDiffV1 = {
    summary_lines: string[];
    /** Optional structured rows (e.g. workflow edit review, config operations). */
    rows?: Array<Record<string, unknown>>;
};

export type BosProposalEnvelopeSourceV1 = {
    /** e.g. `command_surface`, `opportunity_drawer`. */
    surface: string;
    org_id: string;
    actor_user_id?: string | null;
    /** Originating module path hint. */
    module?: string | null;
};

export type BosProposalEnvelopeV1 = {
    version: typeof BOS_PROPOSAL_ENVELOPE_VERSION;
    proposal_id: string;
    capability_key: BosCapabilityKey;
    /** Legacy native `agent_key` when present on raw payload. */
    agent_key: string | null;
    domain: BosCapabilityDomain;
    status: BosProposalStatus;
    risk_level: BosRiskLevel;
    requires_approval: boolean;
    summary: string;
    affected_surfaces: string[];
    validation: BosProposalEnvelopeValidationV1;
    warnings: BosProposalEnvelopeWarningV1[];
    diff: BosProposalEnvelopeDiffV1 | null;
    source: BosProposalEnvelopeSourceV1;
    created_at: string;
    /** Unmodified native proposal / suggestion object. */
    raw_payload: unknown;
    correlation_id?: string | null;
    request_id?: string | null;
};
