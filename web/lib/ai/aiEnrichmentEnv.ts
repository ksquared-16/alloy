/**
 * Process env gates for AI enrichment (stub + telemetry). No secrets.
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

function truthyEnv(name: string): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

/** Global gate for stub enrichment paths (org policy must also allow). */
export function isAiEnrichmentStubEnvEnabled(): boolean {
    return truthyEnv("AI_ENRICHMENT_STUB_ENABLED");
}

/** Global gate for emitting schema-bound `ai_enrichment_usage_v1` workflow events. */
export function isAiEnrichmentTelemetryEnvEnabled(): boolean {
    return truthyEnv("AI_ENRICHMENT_TELEMETRY_ENABLED");
}

/** True when OpenAI-compatible live enrichment may be configured (never log these values). */
export function hasOpenAiStructuredCredentials(): boolean {
    const key = process.env.OPENAI_API_KEY?.trim();
    const model = process.env.OPENAI_MODEL?.trim();
    return Boolean(key && model);
}

/** Model id for chat completions (e.g. `gpt-4o-mini`). Caller must guard with {@link hasOpenAiStructuredCredentials}. */
export function getOpenAiModel(): string {
    return process.env.OPENAI_MODEL?.trim() ?? "";
}

/** API origin without trailing slash; defaults to OpenAI when unset. */
export function getOpenAiBaseUrl(): string {
    const raw = process.env.OPENAI_BASE_URL?.trim();
    if (raw) return raw.replace(/\/+$/, "");
    return "https://api.openai.com";
}

/** Default Chat Completions client timeout for structured enrichment (ms). */
export const DEFAULT_OPENAI_REQUEST_TIMEOUT_MS = 20_000;
const MAX_OPENAI_REQUEST_TIMEOUT_MS = 30_000;
/** Values below this are treated as unset / invalid and fall back to {@link DEFAULT_OPENAI_REQUEST_TIMEOUT_MS}. */
const MIN_OPENAI_REQUEST_TIMEOUT_MS = 1_000;

/**
 * Timeout for OpenAI-compatible `/v1/chat/completions` calls used by structured enrichment.
 * **`OPENAI_REQUEST_TIMEOUT_MS`**: optional integer ms; defaults to **20_000**; clamped to **1_000–30_000**;
 * non-numeric or too-low values use the default.
 */
export function getOpenAiStructuredRequestTimeoutMs(): number {
    const raw = process.env.OPENAI_REQUEST_TIMEOUT_MS?.trim();
    if (!raw) return DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < MIN_OPENAI_REQUEST_TIMEOUT_MS) {
        return DEFAULT_OPENAI_REQUEST_TIMEOUT_MS;
    }
    return Math.min(MAX_OPENAI_REQUEST_TIMEOUT_MS, Math.floor(n));
}
