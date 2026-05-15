import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DEFAULT_OPENAI_REQUEST_TIMEOUT_MS,
    getOpenAiStructuredRequestTimeoutMs,
} from "@/lib/ai/aiEnrichmentEnv";

describe("getOpenAiStructuredRequestTimeoutMs", () => {
    beforeEach(() => vi.unstubAllEnvs());
    afterEach(() => vi.unstubAllEnvs());

    it("defaults to 20s when unset", () => {
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(20_000);
        expect(DEFAULT_OPENAI_REQUEST_TIMEOUT_MS).toBe(20_000);
    });

    it("uses explicit value within range", () => {
        vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "15000");
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(15_000);
    });

    it("clamps to max 30000", () => {
        vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "999999");
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(30_000);
    });

    it("floors fractional ms", () => {
        vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "18500.9");
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(18_500);
    });

    it("falls back to default when below minimum", () => {
        vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "500");
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(DEFAULT_OPENAI_REQUEST_TIMEOUT_MS);
    });

    it("falls back to default when non-numeric", () => {
        vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "fast");
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(DEFAULT_OPENAI_REQUEST_TIMEOUT_MS);
    });

    it("accepts minimum boundary 1000", () => {
        vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "1000");
        expect(getOpenAiStructuredRequestTimeoutMs()).toBe(1_000);
    });
});
