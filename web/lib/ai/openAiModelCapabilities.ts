/**
 * OpenAI Chat Completions capability hints for our structured enrichment client.
 * Extend {@link supportsCustomTemperature} when vendor behavior for a model id is known.
 * Unknown models omit `temperature` (safest default).
 */

const TEMP_MIN = 0;
const TEMP_MAX = 2;

function normalizeModelId(model: string): string {
    return model.trim().toLowerCase();
}

function readOptionalEnvTemperature(): number | undefined {
    const raw = process.env.OPENAI_CHAT_TEMPERATURE?.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(TEMP_MAX, Math.max(TEMP_MIN, n));
}

/**
 * Whether we may send a non-default `temperature` on `/v1/chat/completions` for this model id.
 * Unknown or newer models default to **false** (omit `temperature` — API default only).
 */
export function supportsCustomTemperature(model: string): boolean {
    const m = normalizeModelId(model);
    if (!m) return false;

    if (m.startsWith("gpt-5")) return false;

    if (/^o\d/.test(m)) return false;

    if (m.startsWith("gpt-4o")) return true;
    if (m.startsWith("gpt-4")) return true;
    if (m.startsWith("gpt-3.5")) return true;

    return false;
}

/**
 * `temperature` for structured enrichment requests, or **undefined** to omit the field
 * (OpenAI default — required for models that reject explicit values).
 */
export function resolveOpenAiStructuredCompletionTemperature(model: string): number | undefined {
    if (!supportsCustomTemperature(model)) return undefined;
    return readOptionalEnvTemperature() ?? 0.2;
}

/**
 * `reasoning_effort` for structured single-fact requests, or **undefined** to omit the field.
 *
 * The gpt-5 family are reasoning models whose DEFAULT effort spends multiple seconds thinking —
 * measured live: a one-sentence participant interpretation on `gpt-5-mini` overran Trust's 8s
 * decision deadline and every governed execution failed as a timeout. The work these clients send
 * is a bounded JSON extraction; `minimal` answers it in the sub-second range the deadline assumes.
 *
 * Models outside the gpt-5 family omit the field entirely — chat/completions rejects unknown
 * parameters on models that do not reason, and the safest default is the API's own.
 */
export function resolveOpenAiReasoningEffort(model: string): string | undefined {
    const m = normalizeModelId(model);
    if (!m) return undefined;
    if (m.startsWith("gpt-5")) return "minimal";
    return undefined;
}
