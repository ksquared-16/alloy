/**
 * The first REAL implementation of Trust's provider port (Phase 2.7).
 *
 * This module is the other half of the dependency inversion Phase 2.4 set up.
 * Trust declares `ProviderAdapterV1` as a type and never learns how a model is
 * reached; this file knows HTTP and knows nothing about trust, privacy or
 * decision policy. It lives in `lib/ai` because `lib/trust` is asserted by
 * control to contain no `fetch(`, no provider SDK, no credential — and, quite
 * literally, not even the substring `openai`.
 *
 * The import direction is the sanctioned one and already established by
 * `lib/ai/resolveTrustAuthorization.ts`: `lib/ai` depends on Trust's TYPES,
 * never the reverse. Nothing here is imported by `lib/trust`.
 *
 *   Eligible Reasoning Input   (governed, minimized, provenanced upstream)
 *     → governed execution request
 *     → THIS ADAPTER            (translate, transport, normalize)
 *     → normalized result
 *     → registered Trust validation   (still the authority on content)
 *
 * **What this module is not allowed to decide.** Whether the model's answer is
 * acceptable is Trust's judgment, made downstream by the decision class. The
 * adapter's entire job is: send the governed input, and report truthfully what
 * came back. The previous ungoverned path conflated these — it validated the
 * model's JSON against a business schema inside the provider — and that is
 * exactly the authority this seam takes away from transport.
 *
 * **Everything the provider says is hostile input (D-18).** The failure branch
 * of `ProviderAdapterResponseV1` carries no free-text field at all, so provider
 * error prose cannot reach durable evidence even by accident. Identity is built
 * from local configuration, not from the response body, so a provider cannot
 * rename itself. Only two fields of the response envelope are ever read.
 */

import type {
    GovernedProviderExecutionRequestV1,
    ProviderAdapterResponseV1,
    ProviderAdapterV1,
    ProviderExecutionFailureCode,
    ProviderExecutionLocation,
    ProviderIdentityV1,
    ProviderUsageFactsV1,
} from "@/lib/trust/provider/governedProviderExecution";
import {
    getOpenAiBaseUrl,
    getOpenAiModel,
    hasOpenAiStructuredCredentials,
} from "@/lib/ai/aiEnrichmentEnv";
import { resolveOpenAiStructuredCompletionTemperature } from "@/lib/ai/openAiModelCapabilities";
import { sanitizeOpenAiSurfaceText } from "@/lib/ai/openAiHttpError";

/** Default OpenAI origin. The one host we can honestly call `remote` without being told. */
const OPENAI_PUBLIC_ORIGIN = "api.openai.com";

/** A provider-supplied model name is still provider-controlled text. Bound it. */
const MAX_MODEL_KEY_CHARS = 120;

/**
 * Adapter configuration.
 *
 * `api_key` is resolved by the caller from the EXISTING credential owner
 * (`OPENAI_API_KEY`, read through `lib/ai/aiEnrichmentEnv`). D-34: no new secret
 * store was created for this slice. The value lives only in this object and in
 * the `Authorization` header — it is never returned, never logged, and never
 * placed in a failure.
 */
export type OpenAiCompatibleProviderAdapterConfigV1 = {
    readonly provider_key: string;
    readonly base_url: string;
    readonly model: string;
    readonly api_key: string;
    /**
     * The ONLY way this adapter will ever report `local`.
     *
     * Deliberately not inferred. A base URL pointing at loopback is a
     * configuration fact, not evidence about where weights live — a proxy on
     * `127.0.0.1` can forward to a datacentre, and claiming `local` there would
     * be an accidental authority claim in durable telemetry. Absent an explicit
     * operator declaration, a non-OpenAI host is `unknown`.
     */
    readonly declared_execution_location?: ProviderExecutionLocation;
};

/**
 * Locality, decided from configuration alone.
 *
 * An explicit declaration wins because someone with knowledge asserted it. The
 * public OpenAI origin is `remote` as a matter of fact. Everything else —
 * including localhost — is `unknown`, which is a first-class answer.
 */
export function resolveExecutionLocation(
    baseUrl: string,
    declared?: ProviderExecutionLocation,
): ProviderExecutionLocation {
    if (declared !== undefined) return declared;
    let host: string;
    try {
        host = new URL(baseUrl).host.toLowerCase();
    } catch {
        return "unknown";
    }
    if (host === OPENAI_PUBLIC_ORIGIN || host.endsWith(`.${OPENAI_PUBLIC_ORIGIN}`)) {
        return "remote";
    }
    return "unknown";
}

function normalizeBaseUrl(raw: string): string {
    return raw.replace(/\/+$/, "");
}

/**
 * The reasoning payload, and nothing else.
 *
 * `elements` is the post-privacy, semantic-key-only content the Information
 * Package produced. The surrounding keys are identifiers and hashes — they
 * carry no participant content and exist so the model is told what KIND of
 * question this is. No canonical record, no raw column, no free text from
 * anywhere but the governed input can reach this object, because the governed
 * input is the only thing in scope.
 */
function buildReasoningPayload(request: GovernedProviderExecutionRequestV1): Record<string, unknown> {
    return {
        decision_class_key: request.decision_class_key,
        correlation_id: request.correlation_id,
        spec_key: request.input.spec_key,
        spec_version: request.input.spec_version,
        privacy_policy_key: request.input.privacy_policy_key,
        content_hash: request.input.content_hash,
        elements: request.input.elements,
    };
}

function systemPrompt(): string {
    return [
        "You are a reasoning provider for a governed decision system.",
        "Return a single JSON object only — no markdown, no prose, no code fences.",
        "The caller validates your output against its own contract; return your best structured answer.",
        "The input has already been minimized. Do not ask for more data and do not invent identifiers.",
    ].join(" ");
}

export function buildChatCompletionsBody(input: {
    readonly model: string;
    readonly request: GovernedProviderExecutionRequestV1;
}): Record<string, unknown> {
    const temperature = resolveOpenAiStructuredCompletionTemperature(input.model);
    const body: Record<string, unknown> = {
        model: input.model,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: JSON.stringify(buildReasoningPayload(input.request)) },
        ],
    };
    if (temperature !== undefined) body.temperature = temperature;
    return body;
}

/**
 * HTTP status → closed failure code.
 *
 * 429 and 5xx are the genuinely transient ones and map to `provider_unavailable`,
 * which Trust already classifies as retryable. A 4xx is a request the provider
 * understood and rejected — retrying it repeats the mistake — so it is a
 * transport failure, not an availability problem.
 */
export function failureCodeForHttpStatus(status: number): ProviderExecutionFailureCode {
    if (status === 429) return "provider_unavailable";
    if (status >= 500) return "provider_unavailable";
    return "transport_failure";
}

/**
 * Usage, forwarded rather than interpreted.
 *
 * Absent means **not reported** and stays absent — recording 0 would turn
 * silence into a measurement. A number is passed through EXACTLY as given, even
 * a nonsensical one: Trust's `normalizeUsage` refuses a present-but-unusable
 * value, and letting it do so surfaces a broken provider instead of laundering
 * it. A non-numeric token count cannot be represented by the contract at all,
 * so it is omitted rather than coerced — the one thing never permitted is
 * inventing a value the provider did not report.
 *
 * `provider_cost_units` is never set. No canonical pricing mechanism exists in
 * this repository, and deriving a cost from token counts would be a fabricated
 * number in immutable evidence.
 */
export function extractUsage(rawBody: unknown): ProviderUsageFactsV1 | undefined {
    if (rawBody == null || typeof rawBody !== "object") return undefined;
    const usage = (rawBody as Record<string, unknown>).usage;
    if (usage == null || typeof usage !== "object" || Array.isArray(usage)) return undefined;
    const u = usage as Record<string, unknown>;

    const out: { input_units?: number; output_units?: number } = {};
    if (typeof u.prompt_tokens === "number") out.input_units = u.prompt_tokens;
    if (typeof u.completion_tokens === "number") out.output_units = u.completion_tokens;

    return Object.keys(out).length > 0 ? out : undefined;
}

/** Only ever the model the provider names, bounded and sanitized; otherwise what we asked for. */
function resolveModelKey(rawBody: unknown, requestedModel: string): string {
    if (rawBody != null && typeof rawBody === "object") {
        const m = (rawBody as Record<string, unknown>).model;
        if (typeof m === "string" && m.trim()) {
            return sanitizeOpenAiSurfaceText(m.trim()).slice(0, MAX_MODEL_KEY_CHARS);
        }
    }
    return requestedModel;
}

function firstChoice(rawBody: unknown): Record<string, unknown> | null {
    if (rawBody == null || typeof rawBody !== "object") return null;
    const choices = (rawBody as Record<string, unknown>).choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first = choices[0];
    if (first == null || typeof first !== "object" || Array.isArray(first)) return null;
    return first as Record<string, unknown>;
}

function messageContent(choice: Record<string, unknown>): string | null {
    const msg = choice.message;
    if (msg == null || typeof msg !== "object" || Array.isArray(msg)) return null;
    const c = (msg as Record<string, unknown>).content;
    return typeof c === "string" && c.trim() ? c.trim() : null;
}

/**
 * Creates the adapter. Pure with respect to configuration — the caller owns
 * credential resolution, so this is fully testable without an environment.
 */
export function createOpenAiCompatibleProviderAdapter(
    config: OpenAiCompatibleProviderAdapterConfigV1,
): ProviderAdapterV1 {
    const execution_location = resolveExecutionLocation(config.base_url, config.declared_execution_location);
    const base = normalizeBaseUrl(config.base_url);

    const identity = (model_key: string): ProviderIdentityV1 => ({
        provider_key: config.provider_key,
        model_key,
        execution_location,
    });

    // Identity on a failure still names who failed, using LOCAL configuration
    // only — a provider that never answered cannot tell us who it was.
    const failureIdentity = (): ProviderIdentityV1 => identity(config.model);

    const fail = (
        failure_code: ProviderExecutionFailureCode,
        usage?: ProviderUsageFactsV1,
    ): ProviderAdapterResponseV1 => ({
        ok: false,
        failure_code,
        provider_identity: failureIdentity(),
        ...(usage ? { usage } : {}),
    });

    return {
        adapter_key: "openai_compatible_chat_completions_v1",

        async execute(
            request: GovernedProviderExecutionRequestV1,
            options?: { readonly signal: AbortSignal },
        ): Promise<ProviderAdapterResponseV1> {
            let res: Response;
            try {
                res = await fetch(`${base}/v1/chat/completions`, {
                    method: "POST",
                    // Trust's deadline, handed to the real transport. This is
                    // the whole point of D-19 reaching the wire: without it the
                    // socket outlives the decision it was serving.
                    signal: options?.signal,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${config.api_key}`,
                    },
                    body: JSON.stringify(buildChatCompletionsBody({ model: config.model, request })),
                });
            } catch (e) {
                // The thrown value is never read. It is provider- or
                // runtime-controlled and a closed code says everything we are
                // entitled to assert.
                const aborted = e instanceof Error && e.name === "AbortError";
                return fail(aborted ? "timeout" : "transport_failure");
            }

            let text: string;
            try {
                text = await res.text();
            } catch (e) {
                const aborted = e instanceof Error && e.name === "AbortError";
                return fail(aborted ? "timeout" : "transport_failure");
            }

            if (!res.ok) {
                // Deliberately NOT parsing the error body for prose. The
                // failure branch has nowhere to put it, and the status alone
                // carries everything the closed vocabulary can express.
                return fail(failureCodeForHttpStatus(res.status));
            }

            let body: unknown;
            try {
                body = JSON.parse(text) as unknown;
            } catch {
                return fail("malformed_response");
            }

            const usage = extractUsage(body);
            const model_key = resolveModelKey(body, config.model);

            const choice = firstChoice(body);
            if (choice == null) return fail("malformed_response", usage);

            // A safety stop is the provider declining to answer — a different
            // fact from a broken envelope, and the vocabulary has a word for it.
            if (choice.finish_reason === "content_filter") {
                return { ok: false, failure_code: "provider_refused", provider_identity: identity(model_key), ...(usage ? { usage } : {}) };
            }

            const content = messageContent(choice);
            if (content == null) return fail("malformed_response", usage);

            let output: unknown;
            try {
                output = JSON.parse(content) as unknown;
            } catch {
                return fail("malformed_response", usage);
            }
            if (output == null || typeof output !== "object" || Array.isArray(output)) {
                return fail("malformed_response", usage);
            }

            // `output` is the MODEL's JSON, not the provider's envelope. Envelope
            // fields other than `choices`, `usage` and `model` are never read, so
            // a provider cannot smuggle a field into the result by adding it to
            // the response body. Whether `output` is acceptable is Trust's call.
            return {
                ok: true,
                output: output as Record<string, unknown>,
                provider_identity: identity(model_key),
                ...(usage ? { usage } : {}),
            };
        },
    };
}

/**
 * Environment-backed factory using the EXISTING credential owner.
 *
 * Returns `null` rather than a half-configured adapter when credentials are
 * absent — a provider you cannot reach is not a provider, and Trust already
 * treats an absent adapter as "no provider execution".
 */
export function createOpenAiCompatibleProviderAdapterFromEnv(options?: {
    readonly declared_execution_location?: ProviderExecutionLocation;
}): ProviderAdapterV1 | null {
    if (!hasOpenAiStructuredCredentials()) return null;
    const api_key = process.env.OPENAI_API_KEY?.trim();
    const model = getOpenAiModel();
    if (!api_key || !model) return null;

    return createOpenAiCompatibleProviderAdapter({
        provider_key: "openai",
        base_url: getOpenAiBaseUrl(),
        model,
        api_key,
        declared_execution_location: options?.declared_execution_location,
    });
}
