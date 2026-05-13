/**
 * Org policy pre-checks for AI enrichment HTTP routes (Phase 2.5 — Card 11.6).
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import { parseAiPolicyFromMetadata, type ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";

export type OrgPolicyGuardFailure = {
    ok: false;
    error: string;
    message: string;
};

/**
 * Stub draft-enrichment admin route: org must enable AI, use stub provider, and allow `draft_enrichment`.
 */
export function evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute(
    orgMetadata: unknown,
): { ok: true; policy: ResolvedAiOrgPolicyV1 } | OrgPolicyGuardFailure {
    const policy = parseAiPolicyFromMetadata(orgMetadata);
    if (!policy.enabled) {
        return {
            ok: false,
            error: "AI_POLICY_DISABLED",
            message: "Org metadata.ai_policy.enabled must be true.",
        };
    }
    if (policy.provider !== "stub") {
        return {
            ok: false,
            error: "AI_POLICY_PROVIDER",
            message: "This route only runs the stub provider; set ai_policy.provider to stub.",
        };
    }
    if (!policy.allowed_features.includes("draft_enrichment")) {
        return {
            ok: false,
            error: "AI_FEATURE_NOT_ALLOWED",
            message: "draft_enrichment must appear in ai_policy.allowed_features.",
        };
    }
    return { ok: true, policy };
}
