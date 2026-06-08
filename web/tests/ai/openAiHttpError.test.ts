import { describe, expect, it } from "vitest";

import { buildOpenAiHttpProviderError, parseOpenAiErrorJsonBody, sanitizeOpenAiSurfaceText } from "@/lib/ai/openAiHttpError";

describe("openAiHttpError", () => {
    it("sanitizeOpenAiSurfaceText redacts key-like substrings", () => {
        expect(sanitizeOpenAiSurfaceText("Wrong key sk-1234567890abcdef")).not.toMatch(/sk-[a-zA-Z0-9]/);
        expect(sanitizeOpenAiSurfaceText("Use Bearer sk-secret-here")).toContain("[redacted]");
    });

    it("parseOpenAiErrorJsonBody extracts OpenAI error object", () => {
        const body = JSON.stringify({
            error: {
                message: "Incorrect API key provided",
                type: "invalid_request_error",
                param: null,
                code: "invalid_api_key",
            },
        });
        const p = parseOpenAiErrorJsonBody(body);
        expect(p?.openai_error_code).toBe("invalid_api_key");
        expect(p?.openai_error_type).toBe("invalid_request_error");
        expect(p?.openai_error_message).toContain("Incorrect API key");
    });

    it("buildOpenAiHttpProviderError maps status + OpenAI fields without raw body", () => {
        const raw = JSON.stringify({
            error: { message: "You exceeded your quota", type: "insufficient_quota", code: "insufficient_quota" },
        });
        const b = buildOpenAiHttpProviderError({ httpStatus: 429, responseText: raw, retryable: true });
        expect(b.code).toBe("OPENAI_HTTP_429_INSUFFICIENT_QUOTA");
        expect(b.message).toContain("429");
        expect(b.message).toContain("insufficient_quota");
        expect(b.openai_http.http_status).toBe(429);
        expect(b.openai_http.openai_error_message).toContain("quota");
        expect(b.retryable).toBe(true);
    });

    it("buildOpenAiHttpProviderError avoids echoing raw HTML/text bodies", () => {
        const html = "<html><title>Cloudflare</title></html>".repeat(20);
        const b = buildOpenAiHttpProviderError({ httpStatus: 502, responseText: html, retryable: true });
        expect(b.openai_http.openai_error_message).toBeNull();
        expect(b.code).toBe("OPENAI_HTTP_502");
        expect(b.message).toContain("non-JSON");
    });
});
