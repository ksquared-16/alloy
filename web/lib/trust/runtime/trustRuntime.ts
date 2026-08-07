/**
 * Trust Runtime — the orchestrator.
 *
 * Executes the canonical V1 order, exactly once, in exactly this sequence:
 *
 *   Decision Contract
 *   → resolve required truth and context
 *   → classify information
 *   → apply privacy transformations
 *   → retrieve authorized knowledge
 *   → select strategy
 *   → execute reasoning
 *   → deterministic validation
 *   → trust evaluation
 *   → Decision Package
 *
 * Every exit from this function is a Decision Package. Refusal is the default:
 * there is no path that returns a bare error, and no path that mutates
 * operational state.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 021
 */

import { randomUUID } from "crypto";

import type { TrustRuntimeAuthorization } from "@/lib/trust/authorization/trustAuthorizationDecision";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import { classifyElements } from "@/lib/trust/classification/informationClasses";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import { TRUST_RUNTIME_VERSION } from "@/lib/trust/contract/decisionContractTypes";
import { DECISION_CLASS_REGISTRY_VERSION, resolveDecisionClass } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { emitTrustEvent } from "@/lib/trust/events/trustEvents";
import { assembleTrustEvidence } from "@/lib/trust/governance/trustEvidence";
import type { KnowledgeProviderV1 } from "@/lib/trust/knowledge/knowledgeProvider";
import { createEmptyKnowledgeProvider } from "@/lib/trust/knowledge/knowledgeProvider";
import { parseProviderCostUnits, ZERO_COST_UNITS } from "@/lib/trust/economics/providerCostUnits";
import type { DecisionPackageOutcome, DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { resolvePrivacyPolicy, transformForReasoning } from "@/lib/trust/privacy/privacyEngine";
import { selectStrategy } from "@/lib/trust/strategy/strategyEngine";
import { orchestrateValidation, resolveValidationPolicyVersion } from "@/lib/trust/validation/validationOrchestrator";

/** The named steps, in canonical order. Recorded so ordering is assertable. */
export const TRUST_RUNTIME_STEPS = [
    "resolve_truth_and_context",
    "classify_information",
    "apply_privacy_transformations",
    "retrieve_authorized_knowledge",
    "select_strategy",
    "execute_reasoning",
    "deterministic_validation",
    "trust_evaluation",
    "build_decision_package",
] as const;

export type TrustRuntimeStep = (typeof TRUST_RUNTIME_STEPS)[number];

export type TrustRuntimeExecution = {
    readonly package: DecisionPackageV1;
    /** Steps actually executed, in order. Certification scenario S6 reads this. */
    readonly step_trace: readonly TrustRuntimeStep[];
};

export type TrustRuntimeInput = {
    readonly contract: DecisionContractV1;
    /**
     * Elements resolved by the CAPABILITY, not by the runtime. The Trust Runtime
     * never reaches into operational storage — the capability supplies what its
     * contract declared it requires.
     */
    readonly resolvedInformation: Readonly<Record<string, unknown>>;
    /** Meaning of each element. Classification is by meaning, never by field name. */
    readonly semanticMap: Readonly<Record<string, InformationClass>>;
    readonly repository: TrustRepository;
    readonly knowledgeProvider?: KnowledgeProviderV1;
    readonly nowIso?: string;
    readonly clock?: () => number;
    /** Set when this execution supersedes an earlier package (material modification). */
    readonly supersedesPackageId?: string | null;
    /**
     * Authorization decided by its EXISTING owner — org AI policy, the permission
     * resolver — before the contract was submitted. The Trust Runtime records
     * that refusal as a Decision Package; it never re-decides authorization,
     * because authorization is not reasoning (Decision 019).
     */
    readonly authorization?: TrustRuntimeAuthorization;
};

type PackageDraft = {
    outcome: DecisionPackageOutcome;
    explanation: string;
};

/**
 * Executes one Decision Contract and returns exactly one Decision Package.
 */
export async function executeDecisionContract(input: TrustRuntimeInput): Promise<TrustRuntimeExecution> {
    const { contract, repository } = input;
    const nowIso = input.nowIso ?? new Date().toISOString();
    const clock = input.clock ?? Date.now;
    const startedAt = clock();
    const trace: TrustRuntimeStep[] = [];
    const knowledgeProvider = input.knowledgeProvider ?? createEmptyKnowledgeProvider();

    await repository.insertContract(contract);
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_decision_requested",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
    });

    const decisionClass = resolveDecisionClass(contract.decision_class_key);

    // Authorization was decided by its owner. Record it and stop — no
    // classification, no privacy transform, no reasoning.
    if (input.authorization && input.authorization.permitted === false) {
        return finish({ outcome: input.authorization.outcome, explanation: input.authorization.detail });
    }

    // An unregistered class cannot be governed, so it cannot be reasoned about.
    if (!decisionClass) {
        return finish({
            outcome: "refused_unsupported_class",
            explanation: `Decision class ${contract.decision_class_key} is not registered with the Trust Runtime, so no governance applies to it and no reasoning may occur.`,
        });
    }

    // ---- 1. resolve required truth and context ------------------------------
    trace.push("resolve_truth_and_context");
    await repository.advanceContractLifecycle({
        org_id: contract.org_id,
        contract_id: contract.id,
        lifecycle_state: "prepared",
    });
    const missing = decisionClass.required_information.filter(
        (key) => input.resolvedInformation[key] === undefined || input.resolvedInformation[key] === null,
    );
    if (missing.length > 0) {
        return finish({
            outcome: "refused_insufficient_information",
            explanation: `Required information was not available: ${missing.join(", ")}. Reasoning did not begin.`,
        });
    }
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_decision_prepared",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
    });

    // ---- 2. classify information -------------------------------------------
    trace.push("classify_information");
    const elements = flattenDeclaredElements(input.resolvedInformation);
    const classification = classifyElements(elements, input.semanticMap);
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_information_classified",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { classes_present: classification.classes_present },
    });

    // ---- 3. apply privacy transformations ----------------------------------
    trace.push("apply_privacy_transformations");
    const privacyPolicy = resolvePrivacyPolicy(decisionClass.privacy_policy_key);
    if (!privacyPolicy) {
        return finish({
            outcome: "refused_policy",
            explanation: `No privacy policy is registered for key ${decisionClass.privacy_policy_key}; reasoning may not proceed without one.`,
        });
    }
    const transformed = transformForReasoning({ classification, policy: privacyPolicy, knowledge: [] });
    if (!transformed.ok) {
        return finish({ outcome: "refused_privacy", explanation: transformed.detail });
    }
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_privacy_transformed",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { redaction_steps_total: transformed.context.redaction_steps.length },
    });

    // ---- 4. retrieve authorized knowledge ----------------------------------
    // Deliberately AFTER privacy preparation: knowledge CONTENT enters the
    // reasoning context only once the context has been minimized (Decision 021).
    trace.push("retrieve_authorized_knowledge");
    const knowledge = await knowledgeProvider.retrieve(decisionClass.knowledge_categories);
    const context = { ...transformed.context, knowledge };
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_knowledge_retrieved",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { assets: knowledge.length },
    });

    // ---- 5. select strategy -------------------------------------------------
    trace.push("select_strategy");
    const selection = selectStrategy(decisionClass);
    if (!selection.ok) {
        return finish({
            outcome: selection.refusal_code === "STRATEGY_EXCEEDS_ESCALATION_BUDGET" ? "refused_budget" : "refused_policy",
            explanation: selection.detail,
        });
    }
    await repository.advanceContractLifecycle({
        org_id: contract.org_id,
        contract_id: contract.id,
        lifecycle_state: "executing",
    });
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_strategy_selected",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { strategy_kind: selection.strategy.kind, escalation_level: selection.escalation_level },
    });

    // ---- 6. execute reasoning ----------------------------------------------
    // Awaited, so a synchronous and an asynchronous strategy travel the same
    // path. `await` on a non-promise is a no-op beyond one microtask, so an
    // existing deterministic strategy behaves exactly as before.
    trace.push("execute_reasoning");
    const reasoning = await selection.strategy.reason({ context, nowIso });
    // A strategy reports what it spent; the runtime never derives a cost. An
    // unusable report is refused rather than repaired — silently recording 0
    // for a NaN would report a provider-backed execution as free.
    const reportedCost = parseProviderCostUnits(reasoning.cost_units);
    if (!reportedCost.ok) {
        return finish(
            {
                outcome: "failed_reasoning",
                explanation:
                    `Strategy ${selection.strategy.key} reported an unusable provider cost: ${reportedCost.detail}` +
                    // Keep the strategy's own reason when it also declined, so a
                    // cost defect never hides an operational one.
                    (reasoning.ok ? "" : ` The strategy also declined: ${reasoning.detail}`),
            },
            {
                strategy: selection.strategy.key,
                strategyKind: selection.strategy.kind,
                level: selection.escalation_level,
                strategyVersion: selection.strategy.version,
            },
        );
    }
    const costUnits = reportedCost.value;

    if (!reasoning.ok) {
        return finish(
            { outcome: "failed_reasoning", explanation: reasoning.detail },
            {
                strategy: selection.strategy.key,
                strategyKind: selection.strategy.kind,
                level: selection.escalation_level,
                costUnits,
            },
        );
    }
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_reasoning_completed",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
    });

    // ---- 7. deterministic validation ---------------------------------------
    trace.push("deterministic_validation");
    const validation = await orchestrateValidation({
        policy_key: decisionClass.validation_policy_key,
        recommendation: reasoning.proposal.recommendation,
    });
    if (!validation.ok) {
        return finish(
            { outcome: "refused_policy", explanation: validation.detail },
            { strategy: selection.strategy.key, strategyKind: selection.strategy.kind, level: selection.escalation_level },
        );
    }
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: validation.report.passed ? "trust_validation_succeeded" : "trust_validation_failed",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { validators: validation.report.results.map((r) => r.validator_key) },
    });
    await repository.advanceContractLifecycle({
        org_id: contract.org_id,
        contract_id: contract.id,
        lifecycle_state: "validated",
    });

    // ---- 8. trust evaluation ------------------------------------------------
    trace.push("trust_evaluation");
    const trust = assembleTrustEvidence({
        decisionClass,
        context,
        proposal: reasoning.proposal,
        validation: validation.report,
        strategyKind: selection.strategy.kind,
    });

    if (!validation.report.passed) {
        return finish(
            {
                outcome: "failed_validation",
                explanation: `Deterministic validation refused the proposal: ${validation.report.results
                    .filter((r) => !r.passed)
                    .map((r) => `${r.validator_key} — ${r.detail}`)
                    .join("; ")}`,
            },
            {
                strategy: selection.strategy.key,
                strategyKind: selection.strategy.kind,
                level: selection.escalation_level,
                strategyVersion: selection.strategy.version,
            },
        );
    }

    // ---- 9. build decision package -----------------------------------------
    trace.push("build_decision_package");
    const latency = clock() - startedAt;
    const pkg: DecisionPackageV1 = {
        schema_version: 1,
        id: randomUUID(),
        org_id: contract.org_id,
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        outcome: "recommended",
        recommendation: reasoning.proposal.recommendation,
        explanation: reasoning.proposal.explanation,
        evidence: reasoning.proposal.evidence,
        remaining_uncertainty: reasoning.proposal.remaining_uncertainty,
        confidence: reasoning.proposal.confidence,
        trust_vector: trust.vector,
        trust_score: trust.score,
        trust_semantics_version: trust.semantics_version,
        review_requirement: trust.review_requirement,
        validation: validation.report,
        privacy_report: {
            pii_mode: context.pii_mode,
            classes_present: context.classes_present,
            redaction_steps: context.redaction_steps.map((s) => ({ path: s.path, kind: s.kind })),
            // Projected, not spread: the record carries a rationale sentence the
            // package has no reason to persist, and a spread would silently
            // admit any field a future record gains.
            transformations: context.transformations.map((t) => ({
                key: t.key,
                information_class: t.information_class,
                transformation: t.transformation,
                disposition: t.disposition,
                support: t.support,
            })),
        },
        economics: {
            strategy_key: selection.strategy.key,
            strategy_kind: selection.strategy.kind,
            escalation_level: selection.escalation_level,
            latency_ms: latency,
            cache_utilized: false,
            provider_cost_units: costUnits,
        },
        knowledge_versions: knowledge,
        learning_metadata: {
            learning_policy_key: decisionClass.learning_policy_key,
            eligible_for_learning: decisionClass.learning_policy_key !== "none_v1",
        },
        alternatives: [],
        supersedes_package_id: input.supersedesPackageId ?? null,
        strategy_key: selection.strategy.key,
        strategy_version: selection.strategy.version,
        validation_version: resolveValidationPolicyVersion(decisionClass.validation_policy_key),
        runtime_version: TRUST_RUNTIME_VERSION,
        registry_version: DECISION_CLASS_REGISTRY_VERSION,
        created_at_iso: nowIso,
    };

    await persist(pkg, {
        strategy: selection.strategy.key,
        strategyKind: selection.strategy.kind,
        level: selection.escalation_level,
    });
    return { package: pkg, step_trace: trace };

    // ---- refusal / completion helpers --------------------------------------

    async function persist(
        p: DecisionPackageV1,
        econ: { strategy: string | null; strategyKind: string | null; level: number },
    ): Promise<void> {
        await repository.insertPackage(p);
        await repository.insertReasoningUsage({
            org_id: p.org_id,
            contract_id: p.contract_id,
            decision_class_key: p.decision_class_key,
            strategy_key: econ.strategy,
            strategy_kind: econ.strategyKind,
            escalation_level: econ.level,
            latency_ms: p.economics.latency_ms,
            cache_utilized: false,
            // The package and the usage row carry the SAME measured cost. The
            // package holds it because a unit count is provider-independent;
            // the usage row is where provider economics are aggregated (ADR-2).
            provider_cost_units: p.economics.provider_cost_units,
            outcome: p.outcome,
        });
        await repository.advanceContractLifecycle({
            org_id: p.org_id,
            contract_id: p.contract_id,
            lifecycle_state: "completed",
        });
        await emitTrustEvent({
            org_id: p.org_id,
            event_type: "trust_decision_package_created",
            contract_id: p.contract_id,
            decision_class_key: p.decision_class_key,
            correlation_id: contract.correlation_id,
            detail: { outcome: p.outcome, package_id: p.id, trust_score: p.trust_score },
        });
    }

    /**
     * Builds and persists a Decision Package for a non-recommended outcome.
     * A refusal is a package, never an exception.
     */
    async function finish(
        draft: PackageDraft,
        econ?: {
            strategy: string | null;
            strategyKind: string | null;
            level: number;
            strategyVersion?: string;
            /** Already validated by the caller; a refusal may still have cost. */
            costUnits?: number;
        },
    ): Promise<TrustRuntimeExecution> {
        const latency = clock() - startedAt;
        const refusal: DecisionPackageV1 = {
            schema_version: 1,
            id: randomUUID(),
            org_id: contract.org_id,
            contract_id: contract.id,
            decision_class_key: contract.decision_class_key,
            outcome: draft.outcome,
            recommendation: null,
            explanation: draft.explanation,
            evidence: [],
            remaining_uncertainty: [
                "No recommendation was produced. The operator's existing deterministic experience is unaffected.",
            ],
            confidence: null,
            trust_vector: null,
            trust_score: null,
            trust_semantics_version: null,
            review_requirement: decisionClass?.review_requirement ?? "operator_review",
            validation: null,
            privacy_report: { pii_mode: "strict", classes_present: [], redaction_steps: [] },
            economics: {
                strategy_key: econ?.strategy ?? null,
                strategy_kind: econ?.strategyKind ?? null,
                escalation_level: econ?.level ?? 0,
                latency_ms: latency,
                cache_utilized: false,
                provider_cost_units: econ?.costUnits ?? ZERO_COST_UNITS,
            },
            knowledge_versions: [],
            learning_metadata: {
                learning_policy_key: decisionClass?.learning_policy_key ?? "none_v1",
                eligible_for_learning: false,
            },
            alternatives: [],
            supersedes_package_id: input.supersedesPackageId ?? null,
            strategy_key: econ?.strategy ?? null,
            strategy_version: econ?.strategyVersion ?? null,
            validation_version: null,
            runtime_version: TRUST_RUNTIME_VERSION,
            registry_version: DECISION_CLASS_REGISTRY_VERSION,
            created_at_iso: nowIso,
        };
        await persist(refusal, {
            strategy: econ?.strategy ?? null,
            strategyKind: econ?.strategyKind ?? null,
            level: econ?.level ?? 0,
        });
        return { package: refusal, step_trace: trace };
    }
}

/**
 * Flattens the capability-supplied information into named elements.
 *
 * Only the top level is treated as an element: a capability declares the
 * elements its contract requires, so nesting would mean an element the contract
 * never named — and an unnamed element cannot be classified by meaning.
 */
function flattenDeclaredElements(resolved: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(resolved)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
                out[childKey] = childValue;
            }
            continue;
        }
        out[key] = value;
    }
    return out;
}
