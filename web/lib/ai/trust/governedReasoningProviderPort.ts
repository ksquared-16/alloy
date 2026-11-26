/**
 * The composition seam for Trust's provider port (Phase 2.8 Gate C).
 *
 * Trust's registry composes at module load and is frozen — there is no
 * registration API after startup, which is what makes the composed graph a
 * property of the manifest rather than of import order. A provider-backed
 * strategy therefore has to be constructed with its dependencies *at
 * composition time*, and one of those dependencies is a configured transport.
 *
 * That creates a problem this module exists to solve. `lib/trust` may not
 * contain a transport, an SDK, a credential — or, per the boundary control,
 * even the vendor's name in prose. So Trust cannot name the concrete adapter,
 * not even in an import specifier. What it CAN name is a port: a
 * vendor-neutral function that answers "is a governed reasoning provider
 * configured, and if so, here it is."
 *
 * The indirection is one function deep on purpose. This module resolves nothing
 * itself — it delegates to the existing environment-backed factory, which
 * delegates to the existing credential owner (`lib/ai/aiEnrichmentEnv`). No new
 * secret store, no second configuration path, no cache: D-34 still holds, and a
 * memoized adapter would freeze a credential rotation into the process.
 *
 * **`null` is a first-class answer.** A provider that is not configured is not
 * a provider, and Trust already treats an absent port as "no provider
 * execution" rather than as an error. Authorization refuses an unconfigured
 * provider upstream with a 503 (`provider_availability: "unavailable"`), so a
 * null here means configuration changed underneath a permitted request — which
 * must refuse, never proceed.
 */

import { getOpenAiModel } from "@/lib/ai/aiEnrichmentEnv";
import { createOpenAiCompatibleProviderAdapterFromEnv } from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import type { GovernedReasoningProviderPortV1 } from "@/lib/trust/provider/governedProviderExecution";

/**
 * The provider identity governed reasoning requests today.
 *
 * It matches `ai_policy.provider === "openai"` — the same value the org policy
 * names and the same one the pre-governance telemetry reported — so a governed
 * execution is attributable to the same provider the operator already sees.
 * Requested, never authoritative: what actually answered comes back from the
 * adapter as `ProviderIdentityV1`.
 */
export const GOVERNED_REASONING_REQUESTED_PROVIDER_KEY = "openai" as const;

/**
 * Resolves the process's configured governed reasoning port, or `null`.
 *
 * Deliberately a function rather than a constant. Reading configuration at
 * module load would bind the port to whatever the environment happened to be
 * when the registry composed — which in a serverless runtime is a cold-start
 * accident, and in tests is whatever ran first.
 */
export function resolveGovernedReasoningProviderPort(): GovernedReasoningProviderPortV1 | null {
    const adapter = createOpenAiCompatibleProviderAdapterFromEnv();
    if (!adapter) return null;

    // The same accessor the adapter itself used. Read again rather than
    // returned by the factory, because the factory's contract is a transport —
    // teaching it to also report configuration would give one function two jobs.
    const model = getOpenAiModel();

    return {
        adapter,
        requested_provider_key: GOVERNED_REASONING_REQUESTED_PROVIDER_KEY,
        ...(model ? { requested_model_key: model } : {}),
    };
}
