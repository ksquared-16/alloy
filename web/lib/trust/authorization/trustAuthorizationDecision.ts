/**
 * Trust authorization contract.
 *
 * The Trust Runtime **consumes** an already-resolved authorization decision. It
 * does not own users, roles, permissions, access profiles, route access,
 * `ai_policy`, provider configuration or tenant feature configuration, and this
 * module imports none of them: it is pure types and pure functions.
 *
 * The existing authorities resolve authorization and hand the result across this
 * seam. `lib/ai` owns that resolution today because it owns `ai_policy`, the
 * `ai.enrichment.use` permission key, the portal access rule and provider
 * availability — see `lib/ai/resolveTrustAuthorization.ts`.
 *
 * Three concerns are kept deliberately distinct, because collapsing them loses
 * information the current routes already express:
 *
 *   - **Authorization** — may this caller ask for this decision at all?
 *   - **Reasoning mode** — is deterministic/local reasoning permitted, is
 *     provider-backed reasoning permitted, or both?
 *   - **Availability** — is the permitted mode actually configured and
 *     reachable? Provider unavailable is NOT authorization denied.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 019 (authorization is not reasoning)
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.3
 */

/**
 * What the Trust Runtime itself accepts. Deliberately narrow: the runtime records
 * a refusal as a Decision Package and never re-decides authorization, so it needs
 * the verdict and an explanation — never an HTTP status, never a permission key.
 */
export type TrustRuntimeAuthorization =
    | { readonly permitted: true }
    | {
          readonly permitted: false;
          readonly outcome: "refused_policy" | "refused_permission";
          readonly detail: string;
      };

/** How reasoning may execute for this decision, once authorized. */
export const TRUST_REASONING_MODES = ["deterministic_local", "provider_backed"] as const;
export type TrustReasoningMode = (typeof TRUST_REASONING_MODES)[number];

/**
 * Whether the machinery the permitted mode needs is actually configured.
 * Separate from permission on purpose: a caller may be fully permitted to use a
 * provider that is not configured, and that is a 503, not a 403.
 */
export const TRUST_MODE_AVAILABILITIES = ["not_required", "available", "unavailable"] as const;
export type TrustModeAvailability = (typeof TRUST_MODE_AVAILABILITIES)[number];

/**
 * Why authorization refused. Normalized across consumers so the platform can
 * reason about causes, while the exact operator-facing payload is preserved
 * per consumer in {@link TrustAuthorizationRefusal}.
 */
export const TRUST_AUTHORIZATION_REFUSAL_CATEGORIES = [
    /** No authenticated session, or no resolvable admin context. */
    "unauthenticated",
    /** Authenticated, but the organization context is missing or inconsistent. */
    "organization_context_unavailable",
    /** Authenticated, but no usable actor identity for an action that records one. */
    "actor_unresolved",
    /** Authenticated and org-scoped, but this caller may not use this surface. */
    "portal_access_denied",
    /** Organization policy does not enable this feature. */
    "feature_disabled_by_policy",
    /** The organization's configuration names no reasoning mode this consumer supports. */
    "unsupported_capability",
    /** The permitted reasoning mode is switched off for this deployment. */
    "reasoning_mode_unavailable",
    /** Provider-backed reasoning is not permitted for this caller. */
    "provider_use_not_permitted",
    /** Provider-backed reasoning is permitted but the provider is not configured. */
    "provider_unavailable",
] as const;

export type TrustAuthorizationRefusalCategory = (typeof TRUST_AUTHORIZATION_REFUSAL_CATEGORIES)[number];

/**
 * A refusal, carrying both the normalized cause and the exact response the
 * consumer must still produce.
 *
 * The literal `http_status` / `error_code` / `message` are here so convergence
 * can be byte-compatible: this slice normalizes WHERE authorization is decided,
 * not WHAT each route answers. Where the three consumers differ today, they keep
 * differing, and the difference is visible in one table instead of three routes.
 */
export type TrustAuthorizationRefusal = {
    readonly category: TrustAuthorizationRefusalCategory;
    readonly http_status: 401 | 403 | 500 | 503;
    /** Stable machine code, unchanged from the pre-convergence route. */
    readonly error_code: string;
    /** Operator-safe text. Never a credential, never a provider secret. */
    readonly message: string | null;
    /**
     * How the Trust Runtime should record this refusal, when the consumer runs a
     * Decision Contract at all. `null` means this refusal never reaches the
     * runtime — it is answered before a contract is submitted.
     */
    readonly trust_outcome: "refused_policy" | "refused_permission" | null;
};

/**
 * Non-sensitive evidence, sufficient for audit and for testing that changing one
 * authority input changes the decision predictably.
 *
 * Explicitly absent, and never to be added: API keys, tokens, provider base
 * URLs, model identifiers, connection strings, raw session material.
 */
/**
 * How far resolution has run.
 *
 * All three consumers parse a request body BETWEEN the access gates and the
 * organization-policy gates, and that ordering is observable — a caller failing
 * both sees whichever gate runs first. So resolution is two-stage, and a stage
 * marker makes an incomplete decision impossible to mistake for a complete one.
 */
export const TRUST_AUTHORIZATION_STAGES = ["access", "complete"] as const;
export type TrustAuthorizationStage = (typeof TRUST_AUTHORIZATION_STAGES)[number];

export type TrustAuthorizationEvidence = {
    /** Stable identity of the consuming surface, e.g. `task_assist_propose`. */
    readonly consumer_key: string;
    /** `access` means identity and portal gates passed and nothing more. */
    readonly stage: TrustAuthorizationStage;
    /** The org policy feature key this consumer requires. */
    readonly requested_feature_key: string;
    /** The permission key consulted, when strict permission mode applies. */
    readonly required_permission_key: string | null;
    readonly permission_granted: boolean;
    /** Resolved organization, when one was resolvable. */
    readonly org_id: string | null;
    /** Resolved actor, when one was resolvable. */
    readonly actor_user_id: string | null;
    /** `ai_policy.enabled` as resolved by its owner. */
    readonly organization_policy_enabled: boolean;
    /** Whether the requested feature appears in the org's allowed features. */
    readonly feature_allowed: boolean;
    /** Reasoning modes this decision permits. Empty on refusal. */
    readonly permitted_reasoning_modes: readonly TrustReasoningMode[];
    /** Availability of provider-backed reasoning for this consumer. */
    readonly provider_availability: TrustModeAvailability;
    /** Whether provider-backed reasoning is permitted for this caller. */
    readonly provider_use_permitted: boolean;
};

export type TrustAuthorizationDecision =
    | { readonly permitted: true; readonly evidence: TrustAuthorizationEvidence }
    | {
          readonly permitted: false;
          readonly refusal: TrustAuthorizationRefusal;
          readonly evidence: TrustAuthorizationEvidence;
      };

/**
 * Narrows the seam decision to what the runtime accepts.
 *
 * A refusal whose `trust_outcome` is `null` was answered before any Decision
 * Contract existed, so there is nothing for the runtime to record; it is treated
 * as `refused_policy` if it ever reaches the runtime, because failing closed is
 * the only safe reading of an authorization state the runtime cannot classify.
 */
export function toTrustRuntimeAuthorization(decision: TrustAuthorizationDecision): TrustRuntimeAuthorization {
    if (decision.permitted) return { permitted: true };
    return {
        permitted: false,
        outcome: decision.refusal.trust_outcome ?? "refused_policy",
        detail: decision.refusal.message ?? decision.refusal.error_code,
    };
}

/** True when the decision permits the given reasoning mode. */
export function permitsReasoningMode(decision: TrustAuthorizationDecision, mode: TrustReasoningMode): boolean {
    return isTrustAuthorizationPermitted(decision) && decision.evidence.permitted_reasoning_modes.includes(mode);
}

/**
 * Fails closed.
 *
 * Permitted means an explicit `permitted: true` AND a completed resolution. A
 * stage-`access` permit says only that identity and portal gates passed; treating
 * it as authorization would skip organization policy entirely.
 */
export function isTrustAuthorizationPermitted(decision: TrustAuthorizationDecision | null | undefined): boolean {
    return decision?.permitted === true && decision.evidence.stage === "complete";
}
