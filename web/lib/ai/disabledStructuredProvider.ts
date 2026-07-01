import type { AiStructuredProvider, AiStructuredRequestV1, AiStructuredResponseV1, AiProviderKey } from "@/lib/ai/providerTypes";

const KEY: AiProviderKey = "disabled";

/**
 * Always returns `outcome: "disabled"` — no I/O, no persistence.
 * Use when org policy is off, global kill switch, or stub env is off.
 */
export function createDisabledAiProvider(): AiStructuredProvider {
    return {
        key: KEY,
        executionMode: "disabled",
        async completeStructured<T>(request: AiStructuredRequestV1, options?: { timeout_ms?: number }): Promise<AiStructuredResponseV1<T>> {
            void request;
            void options;
            return {
                outcome: "disabled",
                provider_key: KEY,
                execution_mode: "disabled",
                completed_at_iso: new Date().toISOString(),
                error: {
                    code: "AI_PROVIDER_DISABLED",
                    message: "AI provider execution is disabled (Phase 1 foundation).",
                    retryable: false,
                },
            };
        },
    };
}
