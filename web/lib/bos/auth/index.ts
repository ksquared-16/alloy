/**
 * BOS auth/access barrel — re-exports existing gates; no new permission model.
 * @see docs/product/bos-foundation.md
 */

import type { BosCapabilityKey } from "@/lib/bos/bosCapability";
import { getBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";

export {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    computeOpenAiLiveInvocationPermitted,
    isAiEnrichmentUsePermissionRequired,
    resolveAiEnrichmentPortalAccess,
    type AiEnrichmentRouteAccessFailure,
} from "@/lib/ai/aiEnrichmentPermissions";

export {
    evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";

export { parseAiPolicyFromMetadata, type ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";

export { getBosCapabilityDefinition, tryGetBosCapabilityDefinition } from "@/lib/bos/bosCapabilityRegistry";

/**
 * Returns registry permission / policy hints for a capability (documentation + future route guards).
 * Does **not** enforce access — routes keep their existing checks.
 */
export function getBosCapabilityAccessHints(capabilityKey: BosCapabilityKey) {
    const def = getBosCapabilityDefinition(capabilityKey);
    return {
        capability_key: def.capability_key,
        org_policy_features: def.org_policy_features,
        propose_permission_keys: def.propose_permission_keys,
        apply_permission_keys: def.apply_permission_keys,
        requires_human_approval: def.requires_human_approval,
        apply_policy: def.apply_policy,
    };
}

/** True when propose routes use {@link resolveAiEnrichmentPortalAccess} in strict/legacy mode today. */
export function bosCapabilityUsesEnrichmentPortalProposeGate(capabilityKey: BosCapabilityKey): boolean {
    const def = getBosCapabilityDefinition(capabilityKey);
    return (
        capabilityKey === "task_assist" ||
        capabilityKey === "workflow_assist" ||
        capabilityKey === "attention_enrich" ||
        def.propose_permission_keys.includes("ai.enrichment.use")
    );
}
