/**
 * Live provider adapter — **design only** (Phase 2.5 — Card 11.7).
 * No HTTP, no SDKs, no secrets. Implementations ship only after explicit approval.
 *
 * Architectural rules:
 * - Deterministic resolver output remains operational truth; adapters return **overlays** only.
 * - All requests pass through {@link redactObjectForAi} (or equivalent) **before** transport.
 * - Telemetry uses schema-bound payloads only (no prompt bodies).
 *
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { AiStructuredRequestV1, AiStructuredResponseV1 } from "@/lib/ai/providerTypes";

/** Supported vendor / transport families for future wiring (not exhaustive). */
export type AlloyLiveProviderFamily = "openai" | "azure_openai" | "openai_compatible" | "anthropic" | "local_self_hosted";

/** Normalized HTTP-facing config — **no secrets** in this object (use env / vault refs at runtime). */
export type AlloyLiveProviderEndpointConfigV1 = {
    schema_version: 1;
    family: AlloyLiveProviderFamily;
    /** Placeholder: resolve from env at runtime — never embed secrets in JSON. */
    base_url_env_key: string;
    /** Deployment or model id — non-secret identifier only. */
    deployment_or_model_id: string;
    /** API version string for Azure-style hosts. */
    api_version?: string | null;
};

/** Retry policy — **design**; implement with jitter + idempotency keys when live. */
export type AlloyProviderRetryPolicyV1 = {
    max_attempts: number;
    /** Exponential backoff cap (ms). */
    max_backoff_ms: number;
    /** HTTP status codes safe to retry (429, 503, …). */
    retry_on_status: readonly number[];
};

export type AlloyProviderTimeoutPolicyV1 = {
    /** Wall-clock budget for the full structured call (including transport). */
    structured_timeout_ms: number;
    /** Optional separate connect TLS budget (future). */
    connect_timeout_ms?: number;
};

/** Capability metadata for routing / UI (no secrets). */
export type AlloyProviderCapabilityV1 = {
    structured_json: boolean;
    /** Streaming not used for structured enrichment v1. */
    streaming: boolean;
    /** Max prompt chars policy hook (enforced server-side). */
    max_context_chars_hint?: number;
};

/**
 * Future adapter: maps internal {@link AiStructuredRequestV1} → wire format + parses JSON response.
 * **TODO:** implement only after security review; inject HTTP client + secrets outside this module.
 */
export type AlloyLiveStructuredProviderAdapter = {
    readonly family: AlloyLiveProviderFamily;
    readonly capabilities: AlloyProviderCapabilityV1;
    readonly timeouts: AlloyProviderTimeoutPolicyV1;
    readonly retries: AlloyProviderRetryPolicyV1;
    /**
     * Execute structured call. **Must not** be invoked from the browser.
     * Returns same envelope shape as {@link AiStructuredProvider} for uniform callers.
     */
    completeStructuredLive<T = unknown>(
        request: AiStructuredRequestV1,
        options?: { signal?: AbortSignal },
    ): Promise<AiStructuredResponseV1<T>>;
};
