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

/**
 * OpenAI draft-enrichment admin route: org must enable AI, use `openai` provider, and allow `draft_enrichment`.
 */
export function evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute(
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
    if (policy.provider !== "openai") {
        return {
            ok: false,
            error: "AI_POLICY_PROVIDER",
            message: "This route’s live path requires ai_policy.provider openai.",
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

/**
 * Task Assist propose route (stub): org must enable AI, stub provider, and allow `task_assist_draft`.
 * @see docs/sprints/05_2026/task_assist_v1.md
 */
export function evaluateOrgPolicyForStubTaskAssistProposeRoute(
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
            message: "This path requires ai_policy.provider stub (or use the openai policy branch).",
        };
    }
    if (!policy.allowed_features.includes("task_assist_draft")) {
        return {
            ok: false,
            error: "AI_FEATURE_NOT_ALLOWED",
            message: "task_assist_draft must appear in ai_policy.allowed_features.",
        };
    }
    return { ok: true, policy };
}

/**
 * Task Assist propose route (openai policy): org enables AI with `openai` provider and `task_assist_draft`.
 * V1 propose is deterministic only — no OpenAI HTTP call from this handler.
 */
export function evaluateOrgPolicyForOpenAiTaskAssistProposeRoute(
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
    if (policy.provider !== "openai") {
        return {
            ok: false,
            error: "AI_POLICY_PROVIDER",
            message: "This branch requires ai_policy.provider openai.",
        };
    }
    if (!policy.allowed_features.includes("task_assist_draft")) {
        return {
            ok: false,
            error: "AI_FEATURE_NOT_ALLOWED",
            message: "task_assist_draft must appear in ai_policy.allowed_features.",
        };
    }
    return { ok: true, policy };
}
