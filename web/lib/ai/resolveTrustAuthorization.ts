/**
 * Trust authorization resolution — owned by the existing authority layer.
 *
 * This module lives in `lib/ai` because `lib/ai` already owns every authority it
 * consults: the org `ai_policy` parser, the `ai.enrichment.use` permission key,
 * the portal access rule and provider availability. It composes those existing
 * outputs into one {@link TrustAuthorizationDecision} and hands it across the
 * seam. It re-implements no RBAC, no role resolution, no access-profile engine
 * and no tenant-policy engine.
 *
 * The dependency direction is deliberate: `lib/ai` imports the Trust
 * authorization CONTRACT (types only, erased at runtime). Trust never imports
 * `lib/ai` for authorization.
 *
 * What this module is not: it does not select strategies, route providers,
 * resolve privacy policy, validate, project package lifecycle or bind execution.
 *
 * @see lib/trust/authorization/trustAuthorizationDecision.ts — the contract
 */

import type { AdminAccessContextResult, AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import type { AdminContextResult, AdminContextSuccess } from "@/lib/admin/getAdminContext";
import { hasOpenAiStructuredCredentials, isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    computeOpenAiLiveInvocationPermitted,
    isAiEnrichmentUsePermissionRequired,
    resolveAiEnrichmentPortalAccess,
} from "@/lib/ai/aiEnrichmentPermissions";
import {
    evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForOpenAiTaskAssistProposeRoute,
    evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute,
    evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForStubTaskAssistProposeRoute,
    evaluateOrgPolicyForStubWorkflowAssistProposeRoute,
    type OrgPolicyGuardFailure,
} from "@/lib/ai/aiEnrichmentRouteGuards";
import type { AiAllowedFeature, ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import type {
    TrustAuthorizationDecision,
    TrustAuthorizationEvidence,
    TrustAuthorizationRefusal,
    TrustReasoningMode,
} from "@/lib/trust/authorization/trustAuthorizationDecision";

/** The three proven consumers. Adding a fourth is a deliberate act, not a default. */
export const TRUST_AUTHORIZATION_CONSUMERS = [
    "attention_draft_enrichment",
    "task_assist_propose",
    "workflow_assist_propose",
] as const;

export type TrustAuthorizationConsumerKey = (typeof TRUST_AUTHORIZATION_CONSUMERS)[number];

type OrgPolicyGuard = (metadata: unknown) => { ok: true; policy: ResolvedAiOrgPolicyV1 } | OrgPolicyGuardFailure;

/**
 * Per-consumer differences, in one table.
 *
 * Every field here exists because the three routes genuinely differ today. The
 * differences are preserved, not reconciled — this slice normalizes where
 * authorization is decided, not what each consumer answers.
 */
type TrustAuthorizationConsumerDescriptor = {
    readonly key: TrustAuthorizationConsumerKey;
    readonly featureKey: AiAllowedFeature;
    /** Message on the `provider-backed not permitted` refusal. Route-specific today. */
    readonly providerUseForbiddenMessage: string;
    /** Message on the `deterministic mode switched off` refusal. Route-specific today. */
    readonly deterministicModeDisabledMessage: string;
    /** Message when org policy names no provider this consumer supports. Route-specific today. */
    readonly unsupportedProviderMessage: string;
    /**
     * Only the enrichment consumer actually calls a provider, so only it checks
     * that one is configured. The other two run the `openai` policy branch
     * deterministically and never reach a provider — checking credentials there
     * would refuse a request that would otherwise succeed.
     */
    readonly requiresProviderCredentials: boolean;
    /** Only Task Assist persists an actor, so only it requires a resolvable one. */
    readonly requiresActorUserId: boolean;
    /** What this consumer will actually execute under an `openai` org policy. */
    readonly openAiPolicyExecutionMode: TrustReasoningMode;
    readonly evaluateStubOrgPolicy: OrgPolicyGuard;
    readonly evaluateOpenAiOrgPolicy: OrgPolicyGuard;
};

const DESCRIPTORS: Readonly<Record<TrustAuthorizationConsumerKey, TrustAuthorizationConsumerDescriptor>> = {
    attention_draft_enrichment: {
        key: "attention_draft_enrichment",
        featureKey: "draft_enrichment",
        providerUseForbiddenMessage:
            "OpenAI-compatible enrichment requires AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and permission ai.enrichment.use.",
        deterministicModeDisabledMessage: "Set AI_ENRICHMENT_STUB_ENABLED=true to enable stub enrichment.",
        unsupportedProviderMessage: "This route supports ai_policy.provider stub or openai with draft_enrichment.",
        // The only consumer that reaches a provider.
        requiresProviderCredentials: true,
        requiresActorUserId: false,
        openAiPolicyExecutionMode: "provider_backed",
        evaluateStubOrgPolicy: evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
        evaluateOpenAiOrgPolicy: evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute,
    },
    task_assist_propose: {
        key: "task_assist_propose",
        featureKey: "task_assist_draft",
        providerUseForbiddenMessage:
            "Task Assist (openai policy branch) requires AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and permission ai.enrichment.use.",
        deterministicModeDisabledMessage:
            "Set AI_ENRICHMENT_STUB_ENABLED=true to enable Task Assist stub policy routes.",
        unsupportedProviderMessage:
            "Task Assist requires ai_policy.provider stub or openai with task_assist_draft allowed.",
        requiresProviderCredentials: false,
        requiresActorUserId: true,
        // V1 propose is deterministic even under an `openai` org policy.
        openAiPolicyExecutionMode: "deterministic_local",
        evaluateStubOrgPolicy: evaluateOrgPolicyForStubTaskAssistProposeRoute,
        evaluateOpenAiOrgPolicy: evaluateOrgPolicyForOpenAiTaskAssistProposeRoute,
    },
    workflow_assist_propose: {
        key: "workflow_assist_propose",
        featureKey: "workflow_assist_draft",
        providerUseForbiddenMessage:
            "Workflow Assist (openai policy branch) requires AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and permission ai.enrichment.use.",
        deterministicModeDisabledMessage:
            "Set AI_ENRICHMENT_STUB_ENABLED=true to enable Workflow Assist stub policy routes.",
        unsupportedProviderMessage:
            "Workflow Assist requires ai_policy.provider stub or openai with workflow_assist_draft allowed.",
        requiresProviderCredentials: false,
        requiresActorUserId: false,
        openAiPolicyExecutionMode: "deterministic_local",
        evaluateStubOrgPolicy: evaluateOrgPolicyForStubWorkflowAssistProposeRoute,
        evaluateOpenAiOrgPolicy: evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute,
    },
};

export function describeTrustAuthorizationConsumer(key: TrustAuthorizationConsumerKey) {
    return DESCRIPTORS[key];
}

export type ResolveTrustAccessAuthorizationInput = {
    readonly consumer: TrustAuthorizationConsumerKey;
    /** Result of `getAdminContextCached()`, success or failure. */
    readonly ctx: AdminContextResult;
    /** Result of `getAdminAccessContextCached()`, success or failure. */
    readonly access: AdminAccessContextResult;
};

export type ResolveTrustAuthorizationInput = ResolveTrustAccessAuthorizationInput & {
    /** `org_settings.metadata` for the resolved org. Never loaded here. */
    readonly orgMetadata: unknown;
};

function evidenceBase(
    descriptor: TrustAuthorizationConsumerDescriptor,
    over: Partial<TrustAuthorizationEvidence> = {},
): TrustAuthorizationEvidence {
    return {
        consumer_key: descriptor.key,
        stage: "access",
        requested_feature_key: descriptor.featureKey,
        required_permission_key: isAiEnrichmentUsePermissionRequired() ? AI_ENRICHMENT_USE_PERMISSION_KEY : null,
        permission_granted: false,
        org_id: null,
        actor_user_id: null,
        organization_policy_enabled: false,
        feature_allowed: false,
        permitted_reasoning_modes: [],
        provider_availability: "not_required",
        provider_use_permitted: false,
        ...over,
    };
}

function refuse(
    evidence: TrustAuthorizationEvidence,
    refusal: TrustAuthorizationRefusal,
): TrustAuthorizationDecision {
    return { permitted: false, refusal, evidence };
}

/**
 * Stage-1 result.
 *
 * Carries the narrowed authority contexts on success so a route needs no second
 * `ctx.ok` check of its own. The admin context types stay on this side of the
 * seam — the Trust contract never sees them.
 */
export type TrustAccessResolution =
    | {
          readonly ok: true;
          readonly decision: TrustAuthorizationDecision;
          readonly ctx: AdminContextSuccess;
          readonly access: AdminAccessContextSuccess;
      }
    | { readonly ok: false; readonly decision: TrustAuthorizationDecision };

/**
 * **Stage 1** — identity, organization context and portal access.
 *
 * Every consumer runs this BEFORE parsing a request body, so a caller who is not
 * permitted never has their body inspected. A `permitted: true` result here
 * carries `stage: "access"` and is NOT authorization: organization policy has
 * not been consulted yet, which is why {@link isTrustAuthorizationPermitted}
 * refuses it.
 */
export function resolveTrustAccessAuthorization(input: ResolveTrustAccessAuthorizationInput): TrustAccessResolution {
    const decision = decideAccess(input);
    if (!decision.permitted || !input.ctx.ok || !input.access.ok) return { ok: false, decision };
    return { ok: true, decision, ctx: input.ctx, access: input.access };
}

function decideAccess(input: ResolveTrustAccessAuthorizationInput): TrustAuthorizationDecision {
    const descriptor = DESCRIPTORS[input.consumer];

    // ---- 1. authenticated context ------------------------------------------
    if (!input.ctx.ok) {
        return refuse(evidenceBase(descriptor), {
            category: input.ctx.status === 401 ? "unauthenticated" : "organization_context_unavailable",
            http_status: input.ctx.status,
            // `adminContextFailureResponse` answers with { error: "Unauthorized" | "Forbidden" }.
            error_code: input.ctx.status === 401 ? "Unauthorized" : "Forbidden",
            message: null,
            trust_outcome: "refused_permission",
        });
    }
    if (!input.access.ok) {
        return refuse(evidenceBase(descriptor, { org_id: input.ctx.orgId }), {
            category: input.access.status === 401 ? "unauthenticated" : "organization_context_unavailable",
            http_status: input.access.status,
            error_code: input.access.status === 401 ? "Unauthorized" : "Forbidden",
            message: null,
            trust_outcome: "refused_permission",
        });
    }

    const ctx = input.ctx;
    const access = input.access;
    const providerUsePermitted = computeOpenAiLiveInvocationPermitted(access);
    const permissionGranted = access.permissionKeys.includes(AI_ENRICHMENT_USE_PERMISSION_KEY);

    const evidence = (over: Partial<TrustAuthorizationEvidence> = {}) =>
        evidenceBase(descriptor, {
            org_id: ctx.orgId,
            actor_user_id: access.userId.trim() || null,
            permission_granted: permissionGranted,
            provider_use_permitted: providerUsePermitted,
            ...over,
        });

    // ---- 2. portal access ---------------------------------------------------
    const portal = resolveAiEnrichmentPortalAccess({ ctx, access });
    if (!portal.ok) {
        return refuse(evidence(), {
            category:
                portal.error === "ORG_CONTEXT_MISMATCH" ? "organization_context_unavailable" : "portal_access_denied",
            http_status: portal.status,
            error_code: portal.error,
            message: portal.message ?? null,
            trust_outcome: "refused_permission",
        });
    }

    return { permitted: true, evidence: evidence() };
}

/**
 * **Stage 2** — organization policy, reasoning mode, provider availability and
 * actor identity.
 *
 * Takes the stage-1 result so the two stages cannot drift apart, and so a caller
 * physically cannot reach organization policy without having passed access.
 *
 * Unknown or unsupported states fail closed: the final branch of the provider
 * switch is a refusal, not a fallthrough.
 */
export function completeTrustAuthorization(input: {
    readonly accessDecision: TrustAuthorizationDecision;
    readonly orgMetadata: unknown;
}): TrustAuthorizationDecision {
    // A refused access stage is already terminal; never re-evaluate it.
    if (!input.accessDecision.permitted) return input.accessDecision;

    const accessEvidence = input.accessDecision.evidence;
    const descriptor = DESCRIPTORS[accessEvidence.consumer_key as TrustAuthorizationConsumerKey];
    if (!descriptor) {
        // An unrecognised consumer key is a programming error, and the safe
        // reading of an authorization state we cannot classify is refusal.
        return refuse({ ...accessEvidence, stage: "complete" }, {
            category: "unsupported_capability",
            http_status: 403,
            error_code: "AI_POLICY_PROVIDER",
            message: "Unsupported Trust authorization consumer.",
            trust_outcome: "refused_policy",
        });
    }

    const providerUsePermitted = accessEvidence.provider_use_permitted;

    // ---- 3. organization policy --------------------------------------------
    const policy = parseAiPolicyFromMetadata(input.orgMetadata);
    const featureAllowed = policy.enabled && policy.allowed_features.includes(descriptor.featureKey);
    const policyEvidence = (over: Partial<TrustAuthorizationEvidence> = {}): TrustAuthorizationEvidence => ({
        ...accessEvidence,
        stage: "complete",
        organization_policy_enabled: policy.enabled,
        feature_allowed: featureAllowed,
        ...over,
    });

    if (policy.provider === "openai") {
        // Provider USE permission, before provider AVAILABILITY. A caller who may
        // not use a provider learns that first, whether or not one is configured.
        if (!providerUsePermitted) {
            return refuse(policyEvidence(), {
                category: "provider_use_not_permitted",
                http_status: 403,
                error_code: "AI_OPENAI_FORBIDDEN",
                message: descriptor.providerUseForbiddenMessage,
                trust_outcome: "refused_permission",
            });
        }
        if (descriptor.requiresProviderCredentials && !hasOpenAiStructuredCredentials()) {
            // Permitted, but nothing to reach. Availability, not authorization.
            return refuse(policyEvidence({ provider_availability: "unavailable" }), {
                category: "provider_unavailable",
                http_status: 503,
                error_code: "OPENAI_NOT_CONFIGURED",
                message: "Set OPENAI_API_KEY and OPENAI_MODEL (optional OPENAI_BASE_URL) for live enrichment.",
                trust_outcome: null,
            });
        }
        const gate = descriptor.evaluateOpenAiOrgPolicy(input.orgMetadata);
        if (!gate.ok) {
            return refuse(policyEvidence(), {
                category: "feature_disabled_by_policy",
                http_status: 403,
                error_code: gate.error,
                message: gate.message,
                trust_outcome: "refused_policy",
            });
        }
        return finalize(
            policyEvidence({
                permitted_reasoning_modes: [descriptor.openAiPolicyExecutionMode],
                provider_availability: descriptor.requiresProviderCredentials ? "available" : "not_required",
            }),
        );
    }

    if (policy.provider === "stub") {
        if (!isAiEnrichmentStubEnvEnabled()) {
            return refuse(policyEvidence(), {
                category: "reasoning_mode_unavailable",
                http_status: 403,
                error_code: "FEATURE_DISABLED",
                message: descriptor.deterministicModeDisabledMessage,
                trust_outcome: "refused_policy",
            });
        }
        const gate = descriptor.evaluateStubOrgPolicy(input.orgMetadata);
        if (!gate.ok) {
            return refuse(policyEvidence(), {
                category: "feature_disabled_by_policy",
                http_status: 403,
                error_code: gate.error,
                message: gate.message,
                trust_outcome: "refused_policy",
            });
        }
        return finalize(policyEvidence({ permitted_reasoning_modes: ["deterministic_local"] }));
    }

    // ---- fail closed --------------------------------------------------------
    // `disabled`, `anthropic`, `azure_openai` and anything a future policy adds
    // land here. An unrecognised provider is never treated as permitted.
    return refuse(policyEvidence(), {
        category: "unsupported_capability",
        http_status: 403,
        error_code: "AI_POLICY_PROVIDER",
        message: descriptor.unsupportedProviderMessage,
        trust_outcome: "refused_policy",
    });

    /** Last gate: an actor identity, for consumers that record one. */
    function finalize(finalEvidence: TrustAuthorizationEvidence): TrustAuthorizationDecision {
        if (descriptor.requiresActorUserId && !finalEvidence.actor_user_id) {
            return refuse(finalEvidence, {
                category: "actor_unresolved",
                http_status: 401,
                error_code: "ACTOR_REQUIRED",
                message: "Authenticated user id required.",
                trust_outcome: "refused_permission",
            });
        }
        return { permitted: true, evidence: finalEvidence };
    }
}

/**
 * Both stages, for callers that do not interleave anything between them.
 *
 * The three HTTP consumers do interleave — they parse a request body — so they
 * call the stages separately. This composition exists so the seam has one
 * obvious entry point and so certification can exercise it end to end.
 */
export function resolveTrustAuthorization(input: ResolveTrustAuthorizationInput): TrustAuthorizationDecision {
    return completeTrustAuthorization({
        accessDecision: resolveTrustAccessAuthorization(input).decision,
        orgMetadata: input.orgMetadata,
    });
}
