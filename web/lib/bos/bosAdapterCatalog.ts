/**
 * Catalog of BOS proposal envelope adapters (for coverage tests and future inbox UI).
 */

import type { BosCapabilityKey } from "@/lib/bos/bosCapability";

/** Capabilities with a `*ToBosProposalEnvelope` adapter in `web/lib/bos/adapters/`. */
export const BOS_CAPABILITIES_WITH_PROPOSAL_ADAPTERS: readonly BosCapabilityKey[] = [
    "task_assist",
    "workflow_assist",
    "config_layout_assist",
    "needs_attention_suggestion",
    "agent_v0_queue_definition",
    "agent_v1_record_overview_layout",
    "agent_v2_field_visibility",
] as const;

/** Registry entries without proposal adapters (orchestration / enrich-only). */
export const BOS_CAPABILITIES_WITHOUT_PROPOSAL_ADAPTERS: readonly BosCapabilityKey[] = [
    "orchestrator",
    "attention_enrich",
    "job_overview_layout",
] as const;
