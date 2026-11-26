/**
 * Provider-backed reasoning strategy for participant conversational interpretation (V1.1).
 *
 * Ownership is narrow on all three sides, exactly as the attention enrichment strategy established:
 *
 *   - this strategy owns the reasoning PURPOSE and the shape it expects back;
 *   - Trust owns governed execution, privacy, validation orchestration, the Decision Package and
 *     telemetry;
 *   - the adapter owns transport, and nothing else.
 *
 * The strategy assembles no facts. It receives an `EligibleReasoningInputV1` that privacy already
 * produced under D-101/D-102 and forwards it. It cannot reach a route object, a request body, a
 * session or a canonical record, because it is never given one.
 *
 * **The port is resolved by its owner, never constructed here.** Credential and endpoint resolution
 * stay outside Trust; this module is handed a vendor-neutral resolver and calls it.
 *
 * **Validation is not performed here.** Envelope normalization only — whether the value is
 * acceptable for the current need belongs to Participant Runtime, one layer further out, and
 * re-checking it here would recreate the duplicated authority this pattern exists to remove.
 */

import {
    PARTICIPANT_INTERPRETATION_PROVIDER_OUTPUT_SHAPE,
    safeParseParticipantInterpretation,
} from "@/lib/ai/participantInterpretationSchema";
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
import { PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY } from "@/lib/trust/capabilities/participantConversationInterpretation/keys";

export const PARTICIPANT_INTERPRETATION_STRATEGY_KEY =
    "participant_conversation_interpretation_provider_backed" as const;
export const PARTICIPANT_INTERPRETATION_STRATEGY_VERSION = "1.0.0" as const;

/**
 * STABLE dependencies only — supplied once at composition time.
 *
 * Nothing request-scoped may live here. A registered strategy is constructed once and reused for
 * every execution, so closing over a per-request governed input would leak one participant's
 * artifact into another's execution. That artifact arrives through `reason()` instead.
 */
export type ParticipantInterpretationStrategyConfig = {
    readonly resolvePort: GovernedReasoningProviderPortResolverV1;
    /** Trust's wall. Configuration, not request state. */
    readonly deadline_ms: number;
    readonly clock?: () => number;
};

export function createParticipantInterpretationStrategy(
    config: ParticipantInterpretationStrategyConfig,
): ReasoningStrategyV1 {
    return {
        key: PARTICIPANT_INTERPRETATION_STRATEGY_KEY,
        // A provider participates, so the kind is model-backed. Locality never implies kind (D-6).
        kind: "small_reasoning",
        version: PARTICIPANT_INTERPRETATION_STRATEGY_VERSION,
        decision_class_key: PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY,

        async reason(execution: ReasoningStrategyExecutionInputV1): Promise<ReasoningOutcome> {
            const eligible = execution.eligibleReasoningInput;
            if (!eligible) {
                // Belt and braces: the provider-capable guard already refuses this upstream, but a
                // strategy that would transmit without governed input must not exist at all.
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail:
                        "Participant interpretation requires a governed Eligible Reasoning Input; none was supplied.",
                };
            }

            // Resolved from configuration immediately before use. Unconfigured refuses rather than
            // proceeding — and the participant still completes their Enrollment deterministically.
            const port = config.resolvePort();
            if (!port) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail:
                        "No governed reasoning provider is configured for this deployment, so participant interpretation could not execute.",
                };
            }

            const request: GovernedProviderExecutionRequestV1 = {
                schema_version: 1,
                decision_class_key: PARTICIPANT_CONVERSATION_INTERPRETATION_PROVIDER_BACKED_CLASS_KEY,
                correlation_id: execution.correlation_id ?? eligible.content_hash,
                input: eligible,
                requested_strategy_kind: "small_reasoning",
                requested_provider_key: port.requested_provider_key,
                ...(port.requested_model_key ? { requested_model_key: port.requested_model_key } : {}),
                deadline_ms: config.deadline_ms,
                expected_output_shape: PARTICIPANT_INTERPRETATION_PROVIDER_OUTPUT_SHAPE,
            };

            const executed = await executeGovernedProviderReasoning({
                request,
                adapter: port.adapter,
                ...(config.clock ? { clock: config.clock } : {}),
            });

            // Forwarded, never assembled, and present on BOTH branches: a call that failed still
            // identifies who failed and still spent something. Absent usage stays absent — a
            // fabricated zero would understate cost as confidently as it misreports it.
            const provider_execution = {
                identity: executed.provider_identity,
                ...(executed.usage ? { usage: executed.usage } : {}),
            };

            if (!executed.ok) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    // The CLOSED failure code only. Provider prose has no route into evidence.
                    detail: `Governed provider execution did not produce a result (${executed.failure_code}).`,
                    provider_execution,
                };
            }

            // Envelope normalization. Every property beyond the contract is dropped by the parser,
            // so a model that emitted a field key, a command or a stage emitted nothing.
            const parsed = safeParseParticipantInterpretation(executed.output);
            if (!parsed.ok) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail: `Provider interpretation did not satisfy the result contract: ${parsed.detail}`,
                    provider_execution,
                };
            }

            return {
                ok: true,
                proposal: {
                    recommendation: parsed.value,
                    // No calibrated probability exists for an interpretation, and inventing one would
                    // put a number into evidence that means nothing. Null is the honest value.
                    confidence: null,
                    evidence: [],
                    explanation: `Participant response interpreted as "${parsed.value.interpretation}" for the current turn.`,
                    remaining_uncertainty: [],
                },
                provider_execution,
            };
        },
    };
}
