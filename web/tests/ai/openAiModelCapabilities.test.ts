import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    resolveOpenAiStructuredCompletionTemperature,
    supportsCustomTemperature,
} from "@/lib/ai/openAiModelCapabilities";

describe("openAiModelCapabilities", () => {
    beforeEach(() => vi.unstubAllEnvs());
    afterEach(() => vi.unstubAllEnvs());

    it("supportsCustomTemperature is false for gpt-5 family and unknown ids", () => {
        expect(supportsCustomTemperature("gpt-5-mini")).toBe(false);
        expect(supportsCustomTemperature("gpt-5")).toBe(false);
        expect(supportsCustomTemperature("my-custom-deployment-001")).toBe(false);
    });

    it("supportsCustomTemperature is true for gpt-4o / gpt-4 / gpt-3.5 families", () => {
        expect(supportsCustomTemperature("gpt-4o-mini")).toBe(true);
        expect(supportsCustomTemperature("gpt-4-turbo-preview")).toBe(true);
        expect(supportsCustomTemperature("gpt-4-0613")).toBe(true);
        expect(supportsCustomTemperature("gpt-3.5-turbo")).toBe(true);
    });

    it("resolveOpenAiStructuredCompletionTemperature omits for unsupported models", () => {
        expect(resolveOpenAiStructuredCompletionTemperature("gpt-5-mini")).toBeUndefined();
    });

    it("resolveOpenAiStructuredCompletionTemperature uses env override when supported", () => {
        vi.stubEnv("OPENAI_CHAT_TEMPERATURE", "0.7");
        expect(resolveOpenAiStructuredCompletionTemperature("gpt-4o")).toBe(0.7);
    });

    it("resolveOpenAiStructuredCompletionTemperature clamps env value", () => {
        vi.stubEnv("OPENAI_CHAT_TEMPERATURE", "9");
        expect(resolveOpenAiStructuredCompletionTemperature("gpt-4o")).toBe(2);
    });
});
