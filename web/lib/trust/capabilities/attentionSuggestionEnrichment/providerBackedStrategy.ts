/**
 * Provider-backed reasoning strategy for attention enrichment (Phase 2.8).
 *
 * **This is the first production caller of `executeGovernedProviderReasoning`.**
 * Phases 2.4 through 2.7 built the governed provider stack — the port, the
 * privacy boundary, telemetry, the hard deadline, the real adapter — and nothing
 * had ever invoked it. This connects it to a capability.
 *
 * Ownership is deliberately narrow on all three sides:
 *
 *   - this strategy owns the reasoning PURPOSE and the shape it expects back;
 *   - Trust owns governed execution, privacy, validation orchestration, the
 *     Decision Package and telemetry;
 *   - the adapter owns transport, and nothing else.
 *
 * The strategy assembles no facts. It receives an `EligibleReasoningInputV1`
 * that privacy already produced, and forwards it. It cannot reach a route
 * object, a request body or a canonical record, because it is never given one.
 *
 * **The adapter is injected, never constructed here.** `lib/trust` may not
 * contain a provider SDK, a credential, an HTTP call, or even the substring
 * naming the vendor — the boundary control scans for all of them, and it scans
 * prose too, so this sentence deliberately names none of them. Credential and
 * endpoint resolution stay with their existing owner outside Trust; this module
 * receives an already-configured port.
 *
 * **Validation is not performed here.** It is delegated to the registered
 * policy. Re-checking the answer inside the strategy would recreate, one layer
 * up, exactly the duplicated authority Phase 2.8 exists to remove.
 */

import type {
    GovernedProviderExecutionRequestV1,
    ProviderAdapterV1,
} from "@/lib/trust/provider/governedProviderExecution";
import { executeGovernedProviderReasoning } from "@/lib/trust/provider/governedProviderExecution";
import type {
    ReasoningOutcome,
    ReasoningStrategyExecutionInputV1,
    ReasoningStrategyV1,
} from "@/lib/trust/reasoning/reasoningStrategy";
import { ATTENTION_ENRICHMENT_DECISION_CLASS_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { validateAttentionEnrichmentResult } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/validationPolicy";

export const PROVIDER_BACKED_ENRICHMENT_STRATEGY_KEY = "attention_enrichment_provider_backed" as const;
export const PROVIDER_BACKED_ENRICHMENT_STRATEGY_VERSION = "1.0.0" as const;

/**
 * STABLE dependencies only — supplied once at composition time.
 *
 * Nothing request-scoped may live here. A registered strategy is constructed
 * once and reused for every execution, so closing over a per-request Eligible
 * Reasoning Input would leak one caller's governed artifact into another's
 * execution. That artifact now arrives through `reason()` instead.
 */
export type ProviderBackedEnrichmentStrategyConfig = {
    /** Configured outside Trust. This module never resolves a credential. */
    readonly adapter: ProviderAdapterV1;
    readonly requested_provider_key: string;
    readonly requested_model_key?: string;
    /** Trust's wall. Configuration, not request state — same for every execution. */
    readonly deadline_ms: number;
    /** Injected so latency is measurable without this module owning a clock. */
    readonly clock?: () => number;
};

/**
 * Builds the strategy. The runtime selects and runs it exactly like any other —
 * there is no second execution route for provider-backed reasoning.
 */
export function createProviderBackedAttentionEnrichmentStrategy(
    config: ProviderBackedEnrichmentStrategyConfig,
): ReasoningStrategyV1 {
    return {
        key: PROVIDER_BACKED_ENRICHMENT_STRATEGY_KEY,
        // Model-backed structured reasoning. Not `deterministic`: a provider
        // participates, and D-6 holds that locality never implies kind.
        kind: "small_reasoning",
        version: PROVIDER_BACKED_ENRICHMENT_STRATEGY_VERSION,
        decision_class_key: ATTENTION_ENRICHMENT_DECISION_CLASS_KEY,

        async reason(execution: ReasoningStrategyExecutionInputV1): Promise<ReasoningOutcome> {
            // Per-request governed input arrives here, never via closure.
            const eligible = execution.eligibleReasoningInput;
            if (!eligible) {
                // Belt and braces. The Phase 2.3.1 guard already refuses a
                // provider-capable strategy without governed input, so this is
                // unreachable through the runtime — but a strategy that would
                // transmit on its absence must not exist at all.
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail: "Provider-backed reasoning requires a governed Eligible Reasoning Input; none was supplied.",
                };
            }

            const request: GovernedProviderExecutionRequestV1 = {
                schema_version: 1,
                decision_class_key: ATTENTION_ENRICHMENT_DECISION_CLASS_KEY,
                correlation_id: execution.correlation_id ?? eligible.content_hash,
                input: eligible,
                requested_strategy_kind: "small_reasoning",
                requested_provider_key: config.requested_provider_key,
                ...(config.requested_model_key ? { requested_model_key: config.requested_model_key } : {}),
                deadline_ms: config.deadline_ms,
            };

            const executed = await executeGovernedProviderReasoning({
                request,
                adapter: config.adapter,
                ...(config.clock ? { clock: config.clock } : {}),
            });

            // Provider facts are forwarded, never assembled. Present on BOTH
            // branches: a call that failed still identifies who failed and still
            // spent something, and reporting only successful cost would
            // understate what reasoning consumed.
            const provider_execution = {
                identity: executed.provider_identity,
                ...(executed.usage ? { usage: executed.usage } : {}),
            };

            if (!executed.ok) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    // The CLOSED failure code only. Provider prose has no route
                    // into durable evidence, because none is ever read.
                    detail: `Governed provider execution did not produce a result (${executed.failure_code}).`,
                    provider_execution,
                };
            }

            // Content validity is Trust's call, made by the registered policy.
            const validated = validateAttentionEnrichmentResult(executed.output);
            if (!validated.ok) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail: validated.detail,
                    provider_execution,
                };
            }

            return {
                ok: true,
                proposal: {
                    recommendation: validated.enrichment as unknown as Record<string, unknown>,
                    // No calibrated confidence exists. A model's fluency is not a
                    // probability, and reporting a number would invent one.
                    confidence: null,
                    evidence: [
                        {
                            kind: "policy",
                            reference: eligible.privacy_policy_key,
                            detail: "Provider input was the governed Eligible Reasoning Input produced by Trust privacy.",
                        },
                        {
                            kind: "observation",
                            reference: eligible.content_hash,
                            detail: "Content hash of the exact facts sent to the provider.",
                        },
                    ],
                    explanation:
                        "Provider-backed enrichment overlay produced from governed semantic facts and " +
                        "validated against the registered enrichment contract.",
                    remaining_uncertainty: [
                        "Model output is a wording overlay only; the deterministic suggestion remains operational truth.",
                    ],
                },
                provider_execution,
            };
        },
    };
}
