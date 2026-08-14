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
 * **The port is resolved by its owner, never constructed here.** `lib/trust`
 * may not contain a provider SDK, a credential, an HTTP call, or even the
 * substring naming the vendor — the boundary control scans for all of them, and
 * it scans prose too, so this sentence deliberately names none of them.
 * Credential and endpoint resolution stay with their existing owner outside
 * Trust; this module is handed a vendor-neutral resolver and calls it.
 *
 * **Validation is not performed here.** It is delegated to the registered
 * policy. Re-checking the answer inside the strategy would recreate, one layer
 * up, exactly the duplicated authority Phase 2.8 exists to remove.
 */

import {
    ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE,
    assembleAttentionSuggestionAiEnrichment,
} from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import { asAiProviderKey } from "@/lib/ai/providerTypes";
import type {
    GovernedProviderExecutionRequestV1,
    GovernedReasoningProviderPortResolverV1,
} from "@/lib/trust/provider/governedProviderExecution";
import { executeGovernedProviderReasoning } from "@/lib/trust/provider/governedProviderExecution";
import type {
    ReasoningOutcome,
    ReasoningStrategyExecutionInputV1,
    ReasoningStrategyV1,
} from "@/lib/trust/reasoning/reasoningStrategy";
import { ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";

export const PROVIDER_BACKED_ENRICHMENT_STRATEGY_KEY = "attention_enrichment_provider_backed" as const;
/**
 * v2: content validation moved out of the strategy and onto the registered policy.
 * v3 (D-80/D-82): the provider is asked for model-owned wording only; the canonical
 * envelope — version, agent key, timestamp, provider identity — is assembled here
 * from trusted values. Recorded in evidence because it changes what a provider was
 * asked for, which is not something a reader should have to infer from a diff.
 */
export const PROVIDER_BACKED_ENRICHMENT_STRATEGY_VERSION = "3.0.0" as const;

/**
 * STABLE dependencies only — supplied once at composition time.
 *
 * Nothing request-scoped may live here. A registered strategy is constructed
 * once and reused for every execution, so closing over a per-request Eligible
 * Reasoning Input would leak one caller's governed artifact into another's
 * execution. That artifact now arrives through `reason()` instead.
 */
export type ProviderBackedEnrichmentStrategyConfig = {
    /**
     * The port, resolved on demand by its owner OUTSIDE Trust.
     *
     * A resolver rather than a port instance, because the strategy is built
     * once when the registry composes and the registry is frozen thereafter.
     * Capturing a configured transport at that moment would bind the process to
     * whatever configuration existed at cold start and would make a credential
     * rotation require a redeploy. Resolving per execution reads only
     * CONFIGURATION — nothing request-scoped crosses this boundary, so D-66
     * holds.
     *
     * It carries the requested provider identity as well as the transport,
     * because Trust may not name a vendor and must not invent one.
     *
     * `null` means no provider is configured. That is an operational fact, and
     * this strategy refuses on it rather than proceeding.
     */
    readonly resolvePort: GovernedReasoningProviderPortResolverV1;
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
        decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY,

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

            // Resolved here, from configuration, immediately before use. An
            // unconfigured provider refuses: authorization already answered the
            // permitted-but-unreachable case upstream, so reaching this branch
            // means configuration changed under a permitted request.
            const port = config.resolvePort();
            if (!port) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail: "No governed reasoning provider is configured for this deployment, so provider-backed reasoning could not execute.",
                };
            }

            const request: GovernedProviderExecutionRequestV1 = {
                schema_version: 1,
                decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY,
                correlation_id: execution.correlation_id ?? eligible.content_hash,
                input: eligible,
                requested_strategy_kind: "small_reasoning",
                requested_provider_key: port.requested_provider_key,
                ...(port.requested_model_key ? { requested_model_key: port.requested_model_key } : {}),
                deadline_ms: config.deadline_ms,
                // The shape this strategy expects back, stated by the strategy
                // that expects it. Model-owned wording only — the platform's own
                // fields are deliberately not asked for (D-82).
                expected_output_shape: ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_OUTPUT_SHAPE,
            };

            const executed = await executeGovernedProviderReasoning({
                request,
                adapter: port.adapter,
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

            // The model's CONTENT is mapped; the envelope around it is assembled
            // from values Alloy already holds (D-82). Mapping is not validation:
            // this reads the model-owned half of the contract and nothing more,
            // and the assembled candidate still goes to the registered policy
            // below untouched.
            //
            // Gate A validated the FINAL schema here as well. That was one
            // authority too many: Phase 2.8 exists to stop transport judging its
            // own cargo, and a strategy re-running the registered policy just
            // moves the duplicate one layer up. Two copies of a rule are two
            // things to keep in agreement, and the first time they disagreed the
            // strictest one would not be the one on the provider path. So the
            // final contract check stays where it was registered and is
            // deliberately not invoked here — a boundary control proves the
            // absence by scanning this file, prose included, which is why the
            // validator is described rather than named.
            //
            // Provider identity comes from governed execution evidence, never
            // from the model's JSON. An identity outside the operator-facing
            // vocabulary is refused rather than coerced: reporting a provider we
            // cannot name would put an invented value into immutable evidence.
            const providerKey = asAiProviderKey(executed.provider_identity.provider_key);
            if (!providerKey) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail: "Governed execution reported a provider identity outside the operator-facing vocabulary.",
                    provider_execution,
                };
            }

            const recommendation = assembleAttentionSuggestionAiEnrichment({
                // Forwarded whole. Anything the model smuggled stays visible to
                // the registered policy, which is the only thing allowed to
                // refuse it.
                providerOutput: executed.output,
                // The runtime's clock, forwarded through strategy execution —
                // the same instant the deterministic strategy stamps. Never a
                // wall clock read here, and never the model's.
                generatedAtIso: execution.nowIso,
                providerKey,
                // A governed provider actually ran. That is what `live` means,
                // and it is a fact about this execution, not a model claim.
                executionMode: "live",
            });

            return {
                ok: true,
                proposal: {
                    recommendation,
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
                        "submitted to the registered enrichment contract for validation.",
                    remaining_uncertainty: [
                        "Model output is a wording overlay only; the deterministic suggestion remains operational truth.",
                    ],
                },
                provider_execution,
            };
        },
    };
}
