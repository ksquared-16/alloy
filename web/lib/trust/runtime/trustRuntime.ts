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
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import type { KnowledgeProviderV1 } from "@/lib/trust/knowledge/knowledgeProvider";
import { createEmptyKnowledgeProvider } from "@/lib/trust/knowledge/knowledgeProvider";
import { executionCapabilityRationale, isProviderCapableStrategyKind } from "@/lib/trust/reasoning/executionCapability";
import { parseProviderCostUnits, ZERO_COST_UNITS } from "@/lib/trust/economics/providerCostUnits";
import type {
    DecisionPackageOutcome,
    DecisionPackagePrivacyReport,
    DecisionPackageV1,
} from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import type { ReasoningCostReport } from "@/lib/trust/reasoning/reasoningStrategy";
import type { ReasoningContextV1 } from "@/lib/trust/privacy/privacyEngine";
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
    /**
     * Provider facts, when a provider participated (Phase 2.8 Gate C).
     *
     * NOT on the Decision Package, deliberately — ADR-2 keeps provider and model
     * identity off the package, and this does not smuggle it back on. It is an
     * execution-local report of the same values already persisted to
     * `trust_reasoning_usage`, surfaced so a consumer can attribute its own
     * telemetry truthfully rather than re-deriving a provider name from org
     * policy.
     *
     * That re-derivation is precisely what D-44 forbids: org policy records what
     * was ASKED for, and only the adapter knows what answered. Absent means no
     * provider participated — a fact a consumer may report as such.
     *
     * Present on refusals too, for the reason it sits on both branches of
     * `ReasoningOutcome`: a call that failed still identifies who failed.
     */
    readonly provider_execution?: ReasoningCostReport["provider_execution"];
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
    /**
     * A governed reasoning input produced from a Trust Information Package.
     *
     * **Required for any provider-capable strategy** (Phase 2.3.1). Optional
     * here rather than mandatory because the deterministic capabilities
     * certified in Phase 1 keep the compatibility path — `resolvedInformation`
     * plus `semanticMap` — until a later convergence slice migrates them. The
     * requirement is enforced by CAPABILITY, not by presence: a deterministic
     * strategy may omit it, a provider-capable one may not.
     *
     * When supplied, privacy is NOT re-run. The package already applied it via
     * the same `transformForReasoning`, and applying it twice would either be a
     * no-op pretending to be work or, worse, a second authority.
     */
    readonly eligibleReasoningInput?: EligibleReasoningInputV1;
};

type PackageDraft = {
    outcome: DecisionPackageOutcome;
    explanation: string;
};

/**
 * The privacy report for an execution in which privacy **never ran**.
 *
 * Truthful by omission rather than by assertion: no classes were present
 * because none were classified, and no steps were taken because no transform
 * executed. `transformations` is deliberately ABSENT — Phase 2.1 made that field
 * optional precisely so "no record exists" and "a record exists and is empty"
 * could stay distinguishable. Its absence is how a reader knows privacy did not
 * execute, and that is the whole signal this constant carries.
 *
 * `pii_mode` is the platform's conservative default, not a claim that a mode was
 * applied to anything.
 */
const PRIVACY_NOT_EXECUTED: DecisionPackagePrivacyReport = {
    pii_mode: "strict",
    classes_present: [],
    redaction_steps: [],
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

    /**
     * Privacy evidence, once privacy has produced any.
     *
     * `null` means privacy never executed, and `finish()` then reports
     * {@link PRIVACY_NOT_EXECUTED}. Assigned exactly once, at the moment real
     * evidence exists, and only ever READ afterwards — so every terminal path
     * downstream of privacy reports what privacy actually did, and no path
     * upstream of it can claim anything.
     *
     * Deliberately an execution-local binding rather than a package threaded
     * through the call chain: it is owned by this one invocation, it cannot
     * escape, and nothing else can mutate it. Nothing is recomputed at
     * `finish()` — the value is the canonical transform's own output.
     */
    let privacyEvidence: DecisionPackagePrivacyReport | null = null;

    /**
     * Provider execution facts, once a strategy has reported any (Phase 2.5).
     *
     * Same ownership shape as `privacyEvidence`: execution-local, assigned once
     * at the moment the facts exist, read afterwards. `null` means no provider
     * participated, and telemetry then records nothing rather than zero.
     *
     * The runtime does not assemble these — it forwards what the strategy
     * forwarded from the normalized execution result. Trust persists; the
     * adapter never writes telemetry itself.
     */
    let providerExecution: ReasoningCostReport["provider_execution"] | null = null;

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

    // A governed input must belong to THIS decision, or it governs nothing.
    // Checked before classification so a mismatched package can never reach a
    // privacy or reasoning step at all.
    const eligible = input.eligibleReasoningInput ?? null;
    if (eligible) {
        if (eligible.decision_class_key !== contract.decision_class_key) {
            return finish({
                outcome: "refused_policy",
                explanation:
                    `The supplied governed reasoning input was built for a different decision class than this contract declares, ` +
                    `so it cannot be used to govern this decision.`,
            });
        }
        if (eligible.privacy_policy_key !== decisionClass.privacy_policy_key) {
            return finish({
                outcome: "refused_policy",
                explanation:
                    `The supplied governed reasoning input was minimized under a different privacy policy than this decision class ` +
                    `references, so the privacy applied to it is not the privacy this class requires.`,
            });
        }
    }

    // ---- 2. classify information -------------------------------------------
    // Classification is recorded either way. With a governed input it already
    // happened, inside the package builder, using this same `classifyElements`
    // — so the step is reported because the work occurred, not skipped as if it
    // never mattered.
    trace.push("classify_information");
    const classesPresent = eligible
        ? eligible.classes_present
        : classifyElements(flattenDeclaredElements(input.resolvedInformation), input.semanticMap).classes_present;
    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_information_classified",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { classes_present: classesPresent },
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

    let baseContext;
    if (eligible) {
        // Privacy is NOT re-run. `buildEligibleReasoningInput` already applied
        // this exact engine under this exact policy; running it again would
        // either be a no-op dressed as work or a second authority deciding the
        // same question. The evidence travels with the input.
        baseContext = {
            transformed: eligible.elements,
            knowledge: [],
            redaction_steps: eligible.redaction_steps,
            classes_present: eligible.classes_present,
            pii_mode: eligible.pii_mode as ReasoningContextV1["pii_mode"],
            transformations: eligible.transformations,
            text_minimizations: eligible.text_minimizations,
            participant_redactions: eligible.participant_redactions,
            // D-101 evidence forwarded with the governed input, not recomputed.
            acknowledged_unminimized_classes: eligible.acknowledged_unminimized_classes ?? [],
            acknowledged_untransformed_classes: eligible.acknowledged_untransformed_classes ?? [],
        };
    } else {
        const classification = classifyElements(
            flattenDeclaredElements(input.resolvedInformation),
            input.semanticMap,
        );
        const transformed = transformForReasoning({ classification, policy: privacyPolicy, knowledge: [] });
        if (!transformed.ok) {
            // Privacy RAN here — it ran and refused. The per-element records it
            // produced before refusing are real evidence, and the classes it
            // classified are real, so a `refused_privacy` package reports them
            // rather than the never-executed default. Steps stay empty because
            // structural minimization genuinely never ran: the transform aborted
            // first. Nothing here is fabricated or inferred.
            privacyEvidence = {
                pii_mode: privacyPolicy.pii_mode,
                classes_present: classification.classes_present,
                redaction_steps: [],
                // The REFUSED element's record is deliberately excluded, and the
                // reason is the whole of Phase 2.1's key-leak lesson: a record
                // carries the element's key, and the element that refuses is
                // exactly the one whose key is caller-supplied. Preserving it
                // would let a smuggled `provider_key` or `proposed_command`
                // write its own name into an immutable package through the
                // evidence — the same back door the refusal explanation was
                // already hardened against.
                //
                // Every record that survives describes an ADMITTED element, and
                // an admitted element was mapped by the capability's semantic
                // map, so its key is declared rather than caller-invented. An
                // unmapped key defaults to `identity` and refuses at its own
                // position, so it can never appear among these.
                //
                // Nothing is lost: the outcome is `refused_privacy` and the
                // explanation already names the information class and the
                // transformation that could not be performed.
                transformations: transformed.transformations
                    .filter((t) => t.disposition !== "refused")
                    .map((t) => ({
                        key: t.key,
                        information_class: t.information_class,
                        transformation: t.transformation,
                        disposition: t.disposition,
                        support: t.support,
                    })),
                text_minimizations: [],
            };
            return finish({ outcome: "refused_privacy", explanation: transformed.detail });
        }
        baseContext = transformed.context;
    }

    // Privacy has now executed and produced a full result. Captured ONCE, from
    // the canonical transform's own output, so every terminal path after this
    // line reports what privacy actually did. The success path below reads this
    // same value, so a refusal and a recommendation cannot report differently.
    privacyEvidence = {
        pii_mode: baseContext.pii_mode,
        classes_present: baseContext.classes_present,
        redaction_steps: baseContext.redaction_steps.map((s) => ({ path: s.path, kind: s.kind })),
        transformations: baseContext.transformations.map((t) => ({
            key: t.key,
            information_class: t.information_class,
            transformation: t.transformation,
            disposition: t.disposition,
            support: t.support,
        })),
        text_minimizations: baseContext.text_minimizations.map((m) => ({
            detector_key: m.detector_key,
            redaction_kind: m.redaction_kind,
            replaced_count: m.replaced_count,
        })),
        participant_redactions: baseContext.participant_redactions.map((p) => ({
            redaction_kind: p.redaction_kind,
            replaced_count: p.replaced_count,
            roster_token_count: p.roster_token_count,
        })),
    };

    await emitTrustEvent({
        org_id: contract.org_id,
        event_type: "trust_privacy_transformed",
        contract_id: contract.id,
        decision_class_key: contract.decision_class_key,
        correlation_id: contract.correlation_id,
        detail: { redaction_steps_total: baseContext.redaction_steps.length },
    });

    // ---- 4. retrieve authorized knowledge ----------------------------------
    // Deliberately AFTER privacy preparation: knowledge CONTENT enters the
    // reasoning context only once the context has been minimized (Decision 021).
    trace.push("retrieve_authorized_knowledge");
    const knowledge = await knowledgeProvider.retrieve(decisionClass.knowledge_categories);
    const context = { ...baseContext, knowledge };
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
    // ---- 5a. provider-capable reasoning requires a governed input ----------
    // Phase 2.3.1. Placed here because capability is only knowable once a
    // strategy is selected, and strictly before `execute_reasoning` — so a
    // provider-capable strategy can never be handed raw capability-supplied
    // information, whatever a caller passed.
    //
    // Capability comes from the strategy LADDER, not from `async` (a calling
    // convention) and not from where a model runs (D-6: a local model is still
    // model reasoning). Every strategy registered today is `deterministic`, so
    // this refuses nothing that exists.
    if (isProviderCapableStrategyKind(selection.strategy.kind) && !eligible) {
        return finish(
            {
                outcome: "refused_policy",
                explanation:
                    `Reasoning of kind "${selection.strategy.kind}" is provider-capable and may only proceed from a governed ` +
                    `Trust Information Package, which this execution did not supply. ` +
                    `${executionCapabilityRationale(selection.strategy.kind)} ` +
                    `Raw capability-supplied information carries storage-shaped keys and undeclared fields, so it is not a ` +
                    `safe origin for reasoning that could leave the platform.`,
            },
            {
                strategy: selection.strategy.key,
                strategyKind: selection.strategy.kind,
                level: selection.escalation_level,
                strategyVersion: selection.strategy.version,
            },
        );
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
    // The governed input is FORWARDED, not rebuilt, and privacy is not re-run:
    // this is the same artifact the caller supplied and the Phase 2.3.1 guard
    // above already checked. A deterministic strategy simply ignores it.
    const reasoning = await selection.strategy.reason({
        context,
        nowIso,
        ...(input.eligibleReasoningInput ? { eligibleReasoningInput: input.eligibleReasoningInput } : {}),
        correlation_id: contract.correlation_id,
    });
    // Captured before the cost check below, so a strategy whose COST report is
    // unusable still records which provider produced that unusable report.
    providerExecution = reasoning.provider_execution ?? null;
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
        // The SAME captured evidence a refusal would report. One source, so a
        // recommendation and a refusal from the same execution can never
        // describe different privacy.
        privacy_report: privacyEvidence ?? PRIVACY_NOT_EXECUTED,
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
    return { package: pkg, step_trace: trace, ...(providerExecution ? { provider_execution: providerExecution } : {}) };

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
            // Provider identity and provider-reported usage, when a provider
            // participated. Omitted entirely otherwise, so a deterministic row
            // asserts no provider rather than an empty one.
            ...(providerExecution
                ? {
                      provider_key: providerExecution.identity.provider_key,
                      model_key: providerExecution.identity.model_key ?? null,
                      model_version: providerExecution.identity.model_version ?? null,
                      execution_location: providerExecution.identity.execution_location,
                      input_units: providerExecution.usage?.input_units ?? null,
                      output_units: providerExecution.usage?.output_units ?? null,
                      provider_reported_cost_units: providerExecution.usage?.provider_cost_units ?? null,
                  }
                : {}),
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
            privacy_report: privacyEvidence ?? PRIVACY_NOT_EXECUTED,
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
        return {
            package: refusal,
            step_trace: trace,
            ...(providerExecution ? { provider_execution: providerExecution } : {}),
        };
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
