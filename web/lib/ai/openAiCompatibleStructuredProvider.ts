/**
 * OpenAI-compatible Chat Completions → structured JSON enrichment (server-only).
 * Requires org policy + strict permission path + env credentials (see resolver).
 * Never logs API keys. No persistence.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { ResolvedAiOrgPolicyV1 } from "@/lib/ai/aiPolicy";
import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import { getOpenAiBaseUrl, getOpenAiModel, hasOpenAiStructuredCredentials } from "@/lib/ai/aiEnrichmentEnv";
import type { AiStructuredProvider, AiStructuredRequestV1, AiStructuredResponseV1 } from "@/lib/ai/providerTypes";

const FEATURE_NEEDS_ATTENTION_DRAFT = "needs_attention_draft_enrichment";

const DEFAULT_TIMEOUT_MS = 55_000;

function hasDraftFeature(policy: ResolvedAiOrgPolicyV1): boolean {
    return policy.allowed_features.includes("draft_enrichment");
}

function normalizeBaseUrl(raw: string): string {
    return raw.replace(/\/+$/, "");
}

function systemPrompt(): string {
    return [
        "You are an assistant that outputs a single JSON object only (no markdown, no prose).",
        "The JSON must match this contract:",
        '{ "version": 1, "agent_key": "needs_attention_suggestion_enrichment",',
        '  "reasoning_summary_overlay": string | null (optional),',
        '  "suggested_draft_body_overlay": string | null (optional),',
        '  "tone_variant": string | null (optional),',
        '  "confidence_notes": string | null (optional),',
        '  "generated_at_iso": ISO-8601 string,',
        '  "provider_report": { "provider_key": "openai", "execution_mode": "live" }',
        "}",
        "Content must be operator-safe: no secrets, no raw PII; overlays are suggestions only — never instructions to send autonomously.",
    ].join(" ");
}

/**
 * Structured provider backed by OpenAI-compatible `/v1/chat/completions` (JSON object mode).
 * Caller must supply **redacted** `request.payload` only.
 */
export function createOpenAiCompatibleStructuredProvider(policy: ResolvedAiOrgPolicyV1): AiStructuredProvider {
    return {
        key: "openai",
        executionMode: "live",
        async completeStructured<T = unknown>(
            request: AiStructuredRequestV1,
            options?: { timeout_ms?: number },
        ): Promise<AiStructuredResponseV1<T>> {
            const completedAt = new Date().toISOString();
            const timeout_ms = options?.timeout_ms ?? DEFAULT_TIMEOUT_MS;

            if (!hasOpenAiStructuredCredentials()) {
                return {
                    outcome: "error",
                    provider_key: "openai",
                    execution_mode: "live",
                    completed_at_iso: completedAt,
                    error: {
                        code: "OPENAI_NOT_CONFIGURED",
                        message: "OPENAI_API_KEY and OPENAI_MODEL must be set.",
                        retryable: false,
                    },
                };
            }

            if (request.feature !== FEATURE_NEEDS_ATTENTION_DRAFT) {
                return {
                    outcome: "policy_denied",
                    provider_key: "openai",
                    execution_mode: "live",
                    completed_at_iso: completedAt,
                    error: {
                        code: "FEATURE_NOT_ALLOWED",
                        message: `OpenAI provider only supports feature "${FEATURE_NEEDS_ATTENTION_DRAFT}".`,
                        retryable: false,
                    },
                };
            }

            if (!hasDraftFeature(policy)) {
                return {
                    outcome: "policy_denied",
                    provider_key: "openai",
                    execution_mode: "live",
                    completed_at_iso: completedAt,
                    error: {
                        code: "POLICY_DENIED",
                        message: "draft_enrichment is not in org ai_policy.allowed_features.",
                        retryable: false,
                    },
                };
            }

            const apiKey = process.env.OPENAI_API_KEY?.trim();
            const model = getOpenAiModel();
            if (!apiKey || !model) {
                return {
                    outcome: "error",
                    provider_key: "openai",
                    execution_mode: "live",
                    completed_at_iso: completedAt,
                    error: {
                        code: "OPENAI_NOT_CONFIGURED",
                        message: "Missing OPENAI_API_KEY or OPENAI_MODEL.",
                        retryable: false,
                    },
                };
            }

            const base = normalizeBaseUrl(getOpenAiBaseUrl());
            const url = `${base}/v1/chat/completions`;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout_ms);

            try {
                const res = await fetch(url, {
                    method: "POST",
                    signal: controller.signal,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        temperature: 0.2,
                        response_format: { type: "json_object" },
                        messages: [
                            { role: "system", content: systemPrompt() },
                            {
                                role: "user",
                                content: JSON.stringify({
                                    correlation_id: request.correlation_id,
                                    request_id: request.request_id,
                                    org_id: request.org_id,
                                    feature: request.feature,
                                    redacted_context: request.payload,
                                }),
                            },
                        ],
                    }),
                });

                const text = await res.text();
                if (!res.ok) {
                    const retryable = res.status === 429 || res.status === 503;
                    return {
                        outcome: "error",
                        provider_key: "openai",
                        execution_mode: "live",
                        completed_at_iso: new Date().toISOString(),
                        error: {
                            code: "OPENAI_HTTP_ERROR",
                            message: `OpenAI-compatible HTTP ${res.status}`,
                            retryable,
                            detail: text.length > 280 ? `${text.slice(0, 280)}…` : text,
                        },
                    };
                }

                let parsedBody: unknown;
                try {
                    parsedBody = JSON.parse(text) as unknown;
                } catch {
                    return {
                        outcome: "error",
                        provider_key: "openai",
                        execution_mode: "live",
                        completed_at_iso: new Date().toISOString(),
                        error: {
                            code: "OPENAI_INVALID_RESPONSE_JSON",
                            message: "Completion response was not valid JSON.",
                            retryable: false,
                        },
                    };
                }

                const content = extractChatCompletionContent(parsedBody);
                if (content == null) {
                    return {
                        outcome: "error",
                        provider_key: "openai",
                        execution_mode: "live",
                        completed_at_iso: new Date().toISOString(),
                        error: {
                            code: "OPENAI_EMPTY_CONTENT",
                            message: "Missing assistant message content in completion.",
                            retryable: false,
                        },
                    };
                }

                let inner: unknown;
                try {
                    inner = JSON.parse(content) as unknown;
                } catch {
                    return {
                        outcome: "error",
                        provider_key: "openai",
                        execution_mode: "live",
                        completed_at_iso: new Date().toISOString(),
                        error: {
                            code: "OPENAI_MODEL_JSON_PARSE",
                            message: "Assistant content was not valid JSON.",
                            retryable: false,
                        },
                    };
                }

                const validated = safeParseAttentionSuggestionAiEnrichmentV1(inner);
                if (!validated) {
                    return {
                        outcome: "error",
                        provider_key: "openai",
                        execution_mode: "live",
                        completed_at_iso: new Date().toISOString(),
                        error: {
                            code: "OPENAI_SCHEMA_REJECTED",
                            message: "Model JSON failed AttentionSuggestionAiEnrichmentV1 validation.",
                            retryable: false,
                        },
                    };
                }

                return {
                    outcome: "ok",
                    data: validated as T,
                    provider_key: "openai",
                    execution_mode: "live",
                    completed_at_iso: new Date().toISOString(),
                };
            } catch (e) {
                const aborted = e instanceof Error && e.name === "AbortError";
                return {
                    outcome: aborted ? "timeout" : "error",
                    provider_key: "openai",
                    execution_mode: "live",
                    completed_at_iso: new Date().toISOString(),
                    error: {
                        code: aborted ? "OPENAI_TIMEOUT" : "OPENAI_REQUEST_FAILED",
                        message: aborted ? "Request timed out." : e instanceof Error ? e.message : "Request failed.",
                        retryable: aborted,
                    },
                };
            } finally {
                clearTimeout(timer);
            }
        },
    };
}

function extractChatCompletionContent(body: unknown): string | null {
    if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
    const choices = (body as Record<string, unknown>).choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first = choices[0];
    if (first == null || typeof first !== "object" || Array.isArray(first)) return null;
    const msg = (first as Record<string, unknown>).message;
    if (msg == null || typeof msg !== "object" || Array.isArray(msg)) return null;
    const c = (msg as Record<string, unknown>).content;
    return typeof c === "string" && c.trim() ? c.trim() : null;
}
