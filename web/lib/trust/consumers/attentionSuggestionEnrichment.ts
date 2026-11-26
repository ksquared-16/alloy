/**
 * Consumer adapter — attention suggestion enrichment.
 *
 * The narrowest seam: the capability resolves its own authoritative truth,
 * submits a Decision Contract, and receives a Decision Package. It never names
 * a strategy, never names a provider, and never mutates anything.
 *
 * The operator-facing enrichment overlay is unchanged: it is now carried inside
 * a Decision Package instead of arriving straight from a provider.
 *
 * ## Where the affirmative provider choice is made (Phase 2.8 Gate C)
 *
 * This module chooses the decision CLASS, and that choice is the whole of D-42's
 * affirmative requirement. Provider-backed reasoning is reachable only through
 * `attention_suggestion_enrichment_provider_backed`, only that class prefers a
 * `small_reasoning` strategy, and this is the only place that class is ever
 * named for execution — behind
 * `permitsReasoningMode(authorization, "provider_backed")`.
 *
 * It still names no strategy and no provider. Selection stays with the registry
 * (D-65); what changes is which governed question is asked.
 *
 * The default is the deterministic class. Every path that cannot establish
 * affirmative provider permission — absent authorization, a legacy boolean
 * caller, a refusal, a decision permitting only `deterministic_local` — lands
 * there, because the condition is an explicit positive rather than the absence
 * of a negative.
 *
 * @see docs/platform/planning/trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-PLAN.md
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";
import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import type {
    TrustAuthorizationDecision,
    TrustRuntimeAuthorization,
} from "@/lib/trust/authorization/trustAuthorizationDecision";
import { permitsReasoningMode, toTrustRuntimeAuthorization } from "@/lib/trust/authorization/trustAuthorizationDecision";
import {
    ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY,
    ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY,
} from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import { attentionEnrichmentInformationSpec } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import { buildEligibleReasoningInput, buildInformationPackage } from "@/lib/trust/information/informationPackage";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { resolvePrivacyPolicy } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningCostReport } from "@/lib/trust/reasoning/reasoningStrategy";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import type { TrustRuntimeStep } from "@/lib/trust/runtime/trustRuntime";

/**
 * Meaning of each element the Decision Class consumes. Classification is by
 * meaning: `draft_body` is a communication regardless of which column it came
 * from, and `reasoning_summary` is operational regardless of who wrote it.
 */
export const ATTENTION_SUGGESTION_SEMANTIC_MAP: Readonly<Record<string, InformationClass>> = {
    primary_reason_code: "operational",
    next_action_key: "operational",
    template_key: "operational",
    channel: "communications",
    reasoning_summary: "operational",
    draft_body: "communications",
};

export type AttentionSuggestionEnrichmentDecisionInput = {
    readonly org_id: string;
    readonly deterministic: AttentionSuggestionV1 | null;
    readonly correlation_id: string;
    readonly initiating_actor: TrustInitiatingActor;
    readonly channel: TrustChannel;
    /**
     * The canonical, already-resolved authorization decision. When present it is
     * authoritative and the legacy booleans below are ignored.
     */
    readonly authorization?: TrustAuthorizationDecision;
    /**
     * Legacy inputs, retained so existing callers and the V1 certification suite
     * keep working unchanged. Superseded by {@link authorization}.
     */
    readonly policy_permits?: boolean;
    readonly policy_denial_reason?: string | null;
    readonly permission_permits?: boolean;
    readonly permission_denial_reason?: string | null;
    readonly repository?: TrustRepository;
    readonly nowIso?: string;
    readonly clock?: () => number;
    readonly supersedesPackageId?: string | null;
};

export type AttentionSuggestionEnrichmentDecision = {
    readonly package: DecisionPackageV1;
    readonly step_trace: readonly TrustRuntimeStep[];
    /**
     * The overlay the existing surface renders, or null on any refusal.
     * Extracted from the package — never from a provider response.
     */
    readonly enrichment: AttentionSuggestionAiEnrichmentV1 | null;
    /**
     * Which governed question was asked. Reported so a caller can attribute
     * telemetry without inferring the mode from org policy — the policy says
     * what was configured, this says what actually executed.
     */
    readonly reasoning_mode: "deterministic_local" | "provider_backed";
    /** Provider facts, when one participated. Absent means none did. */
    readonly provider_execution?: ReasoningCostReport["provider_execution"];
};

/**
 * Builds the governed artifact the provider-backed class requires.
 *
 * Returns `null` when it cannot be built, and that is a deliberate shape. The
 * runtime already refuses a provider-capable strategy that arrives without a
 * governed input (the Phase 2.3.1 guard), and that refusal is a persisted
 * Decision Package with an accurate explanation. Synthesizing a second refusal
 * here would produce a package Trust never built, or worse, an exception on a
 * path whose whole contract is "always resolves".
 *
 * So a package that cannot be built becomes an execution with no governed
 * input, and Trust records the refusal. Nothing reaches a provider either way.
 */
function buildGovernedInput(input: {
    readonly deterministic: AttentionSuggestionV1 | null;
    readonly org_id: string;
    readonly correlation_id: string;
}): EligibleReasoningInputV1 | null {
    if (!input.deterministic) return null;

    const built = buildInformationPackage({
        spec: attentionEnrichmentInformationSpec,
        source: input.deterministic,
        // Opaque identifiers only. `buildInformationPackage` records these for
        // provenance and never reads a value out of them.
        sourceRefs: {
            org_id: input.org_id,
            correlation_id: input.correlation_id,
            suggestion_id: input.deterministic.suggestion_id,
        },
    });
    if (!built.ok) return null;

    // The policy is resolved from the registry by the SAME key the decision
    // class references, so the runtime's "minimized under a different policy"
    // check compares an artifact to the policy that actually produced it. A
    // policy constructed here instead would let the two drift and turn a real
    // privacy mismatch into a passing comparison.
    const policy = resolvePrivacyPolicy(ATTENTION_SUGGESTION_MINIMIZATION_POLICY_KEY);
    if (!policy) return null;

    const eligible = buildEligibleReasoningInput({ package: built.package, policy });
    return eligible.ok ? eligible.input : null;
}

/**
 * Runs one enrichment decision through the Trust Runtime.
 *
 * Always resolves. Every failure mode — denied policy, denied permission,
 * missing suggestion, privacy restriction, failed validation, unable to reason
 * — comes back as a Decision Package with a refusal outcome and a null
 * overlay, which is exactly the shape the existing surface already handles.
 */
export async function decideAttentionSuggestionEnrichment(
    input: AttentionSuggestionEnrichmentDecisionInput,
): Promise<AttentionSuggestionEnrichmentDecision> {
    const repository = input.repository ?? createSupabaseTrustRepository();

    // ---- the affirmative provider choice, and the only one ------------------
    // An explicit positive: a caller with no authorization decision at all, a
    // legacy-boolean caller, or a decision permitting only deterministic
    // reasoning all evaluate false here and take the deterministic class.
    const providerBacked = input.authorization
        ? permitsReasoningMode(input.authorization, "provider_backed")
        : false;
    const reasoning_mode = providerBacked ? "provider_backed" : "deterministic_local";
    const decisionClassKey = providerBacked
        ? ATTENTION_SUGGESTION_ENRICHMENT_PROVIDER_BACKED_CLASS_KEY
        : ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY;

    const built = createDecisionContract({
        org_id: input.org_id,
        decision_class_key: decisionClassKey,
        intent: "Propose operator-facing wording for an existing deterministic attention suggestion.",
        context: {
            surface: "needs_attention_suggestion",
            entity_type: input.deterministic?.target.entity_type ?? null,
            entity_id: input.deterministic?.target.entity_id ?? null,
        },
        correlation_id: input.correlation_id,
        initiating_actor: input.initiating_actor,
        channel: input.channel,
        nowIso: input.nowIso,
    });

    // A contract that cannot be built still produces a package: the runtime
    // refuses an unregistered class rather than throwing.
    const contract = built.contract;

    // Authorization is resolved by its existing owners before the contract is
    // executed. The Trust Runtime records the refusal; it never re-decides
    // authorization, and it never reads RBAC or tenant policy itself.
    const authorization: TrustRuntimeAuthorization = input.authorization
        ? toTrustRuntimeAuthorization(input.authorization)
        : legacyAuthorization(input);

    return runDecision();

    /**
     * The pre-Slice-0.3 shape: two booleans resolved by the caller. Retained so
     * the V1 certification suite and any remaining caller behave identically.
     * Absent booleans mean "permitted", matching the previous default.
     */
    function legacyAuthorization(
        legacy: AttentionSuggestionEnrichmentDecisionInput,
    ): TrustRuntimeAuthorization {
        if (legacy.policy_permits === false) {
            return {
                permitted: false,
                outcome: "refused_policy",
                detail: legacy.policy_denial_reason ?? "Organization AI policy does not permit this decision class.",
            };
        }
        if (legacy.permission_permits === false) {
            return {
                permitted: false,
                outcome: "refused_permission",
                detail:
                    legacy.permission_denial_reason ??
                    "Caller lacks the permission required for this decision class.",
            };
        }
        return { permitted: true };
    }

    async function runDecision(): Promise<AttentionSuggestionEnrichmentDecision> {
        const resolvedInformation = authorization.permitted
            ? {
                  deterministic_attention_suggestion: input.deterministic
                      ? {
                            primary_reason_code: input.deterministic.source.primary_reason_code,
                            next_action_key: input.deterministic.next_action.key,
                            template_key: input.deterministic.suggested_content?.template_key ?? null,
                            channel: input.deterministic.suggested_content?.channel ?? null,
                            reasoning_summary: input.deterministic.reasoning.summary,
                            draft_body: input.deterministic.suggested_content?.body ?? null,
                        }
                      : null,
              }
            : {};

        // Built only for the provider-backed class, and only once authorization
        // permitted the decision at all. A refused decision assembles no facts:
        // minimizing information for a request that will not run would perform
        // privacy work on data nobody was allowed to reason about.
        //
        // `resolvedInformation` is still supplied on this path. It is not the
        // reasoning input — the runtime uses the governed artifact for
        // classification and privacy and ignores it — but the class's
        // `required_information` is checked against it before anything else, so
        // it is what keeps "no suggestion supplied" the same refusal on both
        // paths.
        const eligibleReasoningInput =
            providerBacked && authorization.permitted
                ? buildGovernedInput({
                      deterministic: input.deterministic,
                      org_id: input.org_id,
                      correlation_id: input.correlation_id,
                  })
                : null;

        const execution = await executeDecisionContract({
            contract,
            resolvedInformation,
            semanticMap: ATTENTION_SUGGESTION_SEMANTIC_MAP,
            repository,
            authorization,
            ...(eligibleReasoningInput ? { eligibleReasoningInput } : {}),
            nowIso: input.nowIso,
            clock: input.clock,
            supersedesPackageId: input.supersedesPackageId ?? null,
        });

        const enrichment =
            execution.package.outcome === "recommended" && execution.package.recommendation
                ? safeParseAttentionSuggestionAiEnrichmentV1(execution.package.recommendation)
                : null;

        return {
            package: execution.package,
            step_trace: execution.step_trace,
            enrichment,
            reasoning_mode,
            ...(execution.provider_execution ? { provider_execution: execution.provider_execution } : {}),
        };
    }
}
