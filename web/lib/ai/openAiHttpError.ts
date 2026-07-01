/**
 * Parse OpenAI-compatible error JSON for HTTP failures — no raw bodies on wire to clients.
 * @see https://platform.openai.com/docs/guides/error-codes
 */

import type { OpenAiProviderHttpErrorMeta } from "@/lib/ai/providerTypes";

export type ParsedOpenAiErrorFields = {
    openai_error_type: string | null;
    openai_error_code: string | null;
    openai_error_message: string | null;
};

const MAX_SURFACE = 480;

function clip(raw: string, max: number): string {
    const t = raw.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
}

function safeField(raw: unknown, max: number): string | null {
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return clip(t, max);
}

/**
 * Removes patterns that could echo API keys or bearer tokens from vendor messages.
 */
export function sanitizeOpenAiSurfaceText(text: string): string {
    let s = text;
    s = s.replace(/\bsk-[a-zA-Z0-9]{8,}\b/gi, "[redacted]");
    s = s.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
    s = s.replace(/api[_-]?key\s*[:=]\s*\S+/gi, "api_key=[redacted]");
    return clip(s, MAX_SURFACE);
}

export function parseOpenAiErrorJsonBody(responseText: string): ParsedOpenAiErrorFields | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(responseText) as unknown;
    } catch {
        return null;
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const err = (parsed as Record<string, unknown>).error;
    if (err == null || typeof err !== "object" || Array.isArray(err)) return null;
    const er = err as Record<string, unknown>;
    const openai_error_type = safeField(er.type, 120);
    const openai_error_code = safeField(er.code, 120);
    const msgRaw = safeField(er.message, 4000);
    const openai_error_message = msgRaw ? sanitizeOpenAiSurfaceText(msgRaw) : null;
    if (!openai_error_type && !openai_error_code && !openai_error_message) return null;
    return { openai_error_type, openai_error_code, openai_error_message };
}

function stableHttpErrorCode(httpStatus: number, openaiCode: string | null | undefined): string {
    if (openaiCode && /^[a-z0-9_]+$/i.test(openaiCode)) {
        return `OPENAI_HTTP_${httpStatus}_${openaiCode.toUpperCase()}`;
    }
    return `OPENAI_HTTP_${httpStatus}`;
}

/**
 * Builds a provider-safe error for non-2xx chat completions — never includes the raw response body.
 */
export function buildOpenAiHttpProviderError(input: {
    httpStatus: number;
    responseText: string;
    retryable: boolean;
}): { code: string; message: string; retryable: boolean; openai_http: OpenAiProviderHttpErrorMeta } {
    const parsed = parseOpenAiErrorJsonBody(input.responseText);
    const openai_http: OpenAiProviderHttpErrorMeta = {
        http_status: input.httpStatus,
        openai_error_type: parsed?.openai_error_type ?? null,
        openai_error_code: parsed?.openai_error_code ?? null,
        openai_error_message: parsed?.openai_error_message ?? null,
    };

    const parts: string[] = [`HTTP ${input.httpStatus}`];
    if (openai_http.openai_error_code) parts.push(openai_http.openai_error_code);
    if (openai_http.openai_error_message) parts.push(openai_http.openai_error_message);
    else if (!parsed) parts.push("non-JSON or unrecognized error body");

    const message = sanitizeOpenAiSurfaceText(parts.join(" — "));
    const code = stableHttpErrorCode(input.httpStatus, openai_http.openai_error_code);

    return { code, message, retryable: input.retryable, openai_http };
}
