/**
 * Server-only AI provider contracts (Phase 1 — Cards 1 & 4).
 * No vendor SDKs; execution paths remain stub/disabled until Card 5+.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

/** Declarative provider identity — reserved keys must not perform network I/O until explicitly wired. */
export type AiProviderKey = "disabled" | "stub" | "openai" | "anthropic" | "azure_openai";

export type AiProviderExecutionMode = "disabled" | "stub" | "live";

export type AiStructuredRequestV1 = {
    schema_version: 1;
    request_id: string;
    correlation_id: string;
    /** Feature gate key, e.g. `needs_attention_draft_enrichment`. */
    feature: string;
    org_id: string;
    /** Pre-redacted JSON-safe payload only — never raw DB rows. */
    payload: Record<string, unknown>;
    /** ISO timestamp from caller clock. */
    requested_at_iso: string;
};

export type AiProviderOutcome = "ok" | "disabled" | "policy_denied" | "timeout" | "error";

/** Safe subset of OpenAI `error` + HTTP status — no raw response body, no secrets. */
export type OpenAiProviderHttpErrorMeta = {
    http_status: number;
    openai_error_type?: string | null;
    openai_error_code?: string | null;
    openai_error_message?: string | null;
};

export type AiProviderErrorEnvelope = {
    code: string;
    message: string;
    retryable?: boolean;
    /** Avoid raw vendor bodies; prefer {@link openai_http} for OpenAI-compatible HTTP failures. */
    detail?: string;
    /** Present for parsed OpenAI-compatible HTTP error responses (server / local diagnostics only). */
    openai_http?: OpenAiProviderHttpErrorMeta;
};

/**
 * Provider response: structured JSON only.
 * Callers must validate `data` against a Zod/schema at the route boundary (future).
 */
export type AiStructuredResponseV1<T = unknown> = {
    outcome: AiProviderOutcome;
    /** Present when outcome is `ok` (stub may return empty object). */
    data?: T;
    error?: AiProviderErrorEnvelope;
    /** Provider self-report; always `disabled`/`stub` until live path is approved. */
    provider_key: AiProviderKey;
    execution_mode: AiProviderExecutionMode;
    completed_at_iso: string;
};

/**
 * Future live providers implement this interface.
 * Phase 1 ships only {@link createDisabledAiProvider}.
 */
export type AiStructuredProvider = {
    readonly key: AiProviderKey;
    readonly executionMode: AiProviderExecutionMode;
    completeStructured<T = unknown>(
        request: AiStructuredRequestV1,
        options?: { timeout_ms?: number },
    ): Promise<AiStructuredResponseV1<T>>;
};
