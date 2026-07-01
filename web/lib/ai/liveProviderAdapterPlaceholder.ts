/**
 * Placeholder for future live structured provider (Phase 2.5 — Card 11.7).
 * **Never** performs network I/O — returns `disabled` outcome until an approved adapter is wired.
 */

import type { AiStructuredProvider, AiStructuredRequestV1, AiStructuredResponseV1 } from "@/lib/ai/providerTypes";

export const LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED = "LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED" as const;

/**
 * Reserved scaffold — use when building the first live path behind env + policy gates.
 * TODO: replace with real adapter that honors {@link AlloyLiveStructuredProviderAdapter}.
 */
export function createLiveProviderAdapterPlaceholder(): AiStructuredProvider {
    return {
        key: "openai",
        executionMode: "disabled",
        async completeStructured<T = unknown>(
            request: AiStructuredRequestV1,
            options?: { timeout_ms?: number },
        ): Promise<AiStructuredResponseV1<T>> {
            void request;
            void options;
            const completed_at_iso = new Date().toISOString();
            return {
                outcome: "disabled",
                provider_key: "openai",
                execution_mode: "disabled",
                completed_at_iso,
                error: {
                    code: LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED,
                    message: "Live provider adapter is not configured (scaffold only).",
                    retryable: false,
                    detail: "no_network_phase_2_5",
                },
            };
        },
    };
}
