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
