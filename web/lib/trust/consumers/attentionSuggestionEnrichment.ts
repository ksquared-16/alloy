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
 * @see docs/platform/planning/trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-PLAN.md
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { AttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/enrichmentContracts";
import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import type { TrustAuthorizationDecision, TrustRuntimeStep } from "@/lib/trust/runtime/trustRuntime";

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
    /** Set false when org policy or permission already denied the request. */
    readonly policy_permits: boolean;
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
};

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

    const built = createDecisionContract({
        org_id: input.org_id,
        decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
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

    // Policy and permission are resolved by their existing owners before the
    // contract is executed. The Trust Runtime records the refusal; it does not
    // re-decide authorization.
    const authorization: TrustAuthorizationDecision = !input.policy_permits
        ? {
              permitted: false,
              outcome: "refused_policy",
              detail: input.policy_denial_reason ?? "Organization AI policy does not permit this decision class.",
          }
        : input.permission_permits === false
          ? {
                permitted: false,
                outcome: "refused_permission",
                detail: input.permission_denial_reason ?? "Caller lacks the permission required for this decision class.",
            }
          : { permitted: true };

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

    const execution = await executeDecisionContract({
        contract,
        resolvedInformation,
        semanticMap: ATTENTION_SUGGESTION_SEMANTIC_MAP,
        repository,
        authorization,
        nowIso: input.nowIso,
        clock: input.clock,
        supersedesPackageId: input.supersedesPackageId ?? null,
    });

    const enrichment =
        execution.package.outcome === "recommended" && execution.package.recommendation
            ? safeParseAttentionSuggestionAiEnrichmentV1(execution.package.recommendation)
            : null;

    return { package: execution.package, step_trace: execution.step_trace, enrichment };
}
