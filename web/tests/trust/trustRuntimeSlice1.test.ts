/**
 * Trust Runtime V1 — Slice 1 certification.
 *
 * Covers the runtime-layer acceptance criteria and certification scenarios that
 * do not require a database. Database-enforced invariants (immutability,
 * one-package-per-contract, append-only) are certified by the SQL suite at
 * `certification/trust-runtime-v1/`, because asserting them in TypeScript would
 * prove only that the service layer behaves — not that the database refuses.
 */

import { describe, expect, it } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { safeParseAttentionSuggestionAiEnrichmentV1 } from "@/lib/ai/attentionSuggestionAiEnrichmentSchema";
import { createStubAiProvider } from "@/lib/ai/stubProvider";
import {
    ATTENTION_SUGGESTION_SEMANTIC_MAP,
    decideAttentionSuggestionEnrichment,
} from "@/lib/trust/consumers/attentionSuggestionEnrichment";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import {
    ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
    listDecisionClassKeys,
    resolveDecisionClass,
} from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { TRUST_SEMANTICS_V1, scoreTrustVector } from "@/lib/trust/governance/trustGovernance";
import { assembleTrustEvidence } from "@/lib/trust/governance/trustEvidence";
import { DECISION_PACKAGE_OUTCOMES } from "@/lib/trust/package/decisionPackageTypes";
import type {
    ReasoningUsageInput,
    TrustObservationInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";
import { executeDecisionContract, TRUST_RUNTIME_STEPS } from "@/lib/trust/runtime/trustRuntime";
import { selectStrategy } from "@/lib/trust/strategy/strategyEngine";
import type { DecisionContractV1, DecisionContractLifecycleState } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";

const NOW = "2026-08-02T12:00:00.000Z";
const ORG = "11111111-1111-1111-1111-111111111111";

/**
 * In-memory repository that ALSO enforces the invariants the database enforces.
 * If runtime logic ever tried to mutate a package, this fake fails the test in
 * the same way Postgres would fail production.
 */
function createRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const observations: TrustObservationInput[] = [];
    const usage: ReasoningUsageInput[] = [];
    const lifecycle: DecisionContractLifecycleState[] = [];

    const repository: TrustRepository = {
        async insertContract(contract) {
            contracts.push(contract);
        },
        async advanceContractLifecycle({ lifecycle_state }) {
            lifecycle.push(lifecycle_state);
        },
        async insertPackage(pkg) {
            if (packages.some((p) => p.contract_id === pkg.contract_id)) {
                throw new Error("one-package-per-contract violated");
            }
            packages.push(pkg);
        },
        async insertObservation(o) {
            observations.push(o);
        },
        async insertReasoningUsage(u) {
            usage.push(u);
        },
    };

    return { repository, contracts, packages, observations, usage, lifecycle };
}

function suggestion(overrides: Partial<AttentionSuggestionV1> = {}): AttentionSuggestionV1 {
    return {
        version: 1,
        agent_key: "needs_attention_suggestion",
        suggestion_id: "sugg-1",
        target: { entity_type: "opportunities", entity_id: "22222222-2222-2222-2222-222222222222" },
        source: {
            resolver: "opportunity_attention",
            resolver_version: 3,
            primary_reason_code: "no_contact_attempt",
            reason_codes: ["no_contact_attempt"],
        },
        next_action: {
            key: "send_follow_up",
            label: "Send a follow-up",
            action_family: "send_message",
            confidence: "deterministic",
        },
        reasoning: { summary: "No contact attempt recorded since the inquiry arrived.", factors: [] },
        suggested_content: {
            channel: "sms",
            template_key: "follow_up_v1",
            body: "Hi Dana, checking in about Ellis — call me at 555-123-4567.",
            variables: {},
        },
        generated_at_iso: NOW,
        ...overrides,
    };
}

async function runDecision(input: {
    deterministic: AttentionSuggestionV1 | null;
    policy_permits?: boolean;
    permission_permits?: boolean;
}) {
    const harness = createRecordingRepository();
    const decision = await decideAttentionSuggestionEnrichment({
        org_id: ORG,
        deterministic: input.deterministic,
        correlation_id: "corr-1",
        initiating_actor: { actor_type: "operator", actor_id: "33333333-3333-3333-3333-333333333333" },
        channel: "operator",
        policy_permits: input.policy_permits ?? true,
        permission_permits: input.permission_permits,
        repository: harness.repository,
        nowIso: NOW,
        clock: () => 0,
    });
    return { ...harness, decision };
}

// ---------------------------------------------------------------------------
// S1 · A1 · C5 · C6 — happy path
// ---------------------------------------------------------------------------

describe("S1 happy path — one contract produces one complete Decision Package", () => {
    it("produces a recommended package with every required section", async () => {
        const { decision, contracts, packages, usage } = await runDecision({ deterministic: suggestion() });
        const pkg = decision.package;

        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);

        expect(pkg.outcome).toBe("recommended");
        expect(pkg.recommendation).not.toBeNull();
        expect(pkg.evidence.length).toBeGreaterThan(0);
        expect(pkg.explanation.trim()).not.toBe("");
        expect(pkg.remaining_uncertainty.length).toBeGreaterThan(0);
        expect(pkg.trust_vector).not.toBeNull();
        expect(pkg.trust_score).not.toBeNull();
        expect(pkg.validation?.passed).toBe(true);
        expect(pkg.privacy_report.pii_mode).toBe("strict");
        expect(pkg.economics.provider_cost_units).toBe(0);

        // C5 — the four reproducibility version fields.
        expect(pkg.strategy_key).toBeTruthy();
        expect(pkg.strategy_version).toBeTruthy();
        expect(pkg.validation_version).toBeTruthy();
        expect(pkg.runtime_version).toBeTruthy();
        expect(pkg.registry_version).toBeTruthy();
    });

    it("C6 — confidence and trust score have different provenance", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        const pkg = decision.package;

        // Confidence comes from the strategy.
        expect(pkg.confidence).toBe(1);

        // Trust score comes from Governance-owned semantics applied to the
        // vector — recomputing it from the stored vector reproduces it exactly,
        // and confidence is not an input to that computation.
        expect(pkg.trust_score).toBe(scoreTrustVector(pkg.trust_vector!, TRUST_SEMANTICS_V1));
        expect(Object.keys(pkg.trust_vector!)).not.toContain("confidence");
    });

    it("C6 — a maximally confident proposal can still score below 1", () => {
        const cls = resolveDecisionClass(ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY)!;
        // Same proposal, same confidence, but a class that requires no human
        // oversight is trusted LESS, not more.
        const automatic = assembleTrustEvidence({
            decisionClass: { ...cls, review_requirement: "automatic" },
            context: {
                transformed: {},
                knowledge: [],
                redaction_steps: [],
                classes_present: [],
                pii_mode: "strict",
                transformations: [],
            },
            proposal: {
                recommendation: {},
                confidence: 1,
                evidence: [{ kind: "authoritative_record", reference: "r", detail: "d" }],
                explanation: "explained",
                remaining_uncertainty: [],
            },
            validation: { policy_key: "k", policy_version: "1", results: [], passed: true },
            strategyKind: "deterministic",
        });
        expect(automatic.score).toBeLessThan(1);
    });

    it("the overlay the surface renders satisfies the existing authoritative contract", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        expect(decision.enrichment).not.toBeNull();
        expect(safeParseAttentionSuggestionAiEnrichmentV1(decision.package.recommendation)).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// S6 · B1–B4 — canonical order
// ---------------------------------------------------------------------------

describe("S6 canonical order (Decision 021)", () => {
    it("B1 — executes exactly the canonical step sequence", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        expect(decision.step_trace).toEqual([...TRUST_RUNTIME_STEPS]);
    });

    it("B4 — knowledge retrieval happens after privacy transformation", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        const trace = decision.step_trace;
        expect(trace.indexOf("retrieve_authorized_knowledge")).toBeGreaterThan(
            trace.indexOf("apply_privacy_transformations"),
        );
    });

    it("B2/B3 — classification precedes privacy, and privacy precedes reasoning", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        const trace = decision.step_trace;
        expect(trace.indexOf("classify_information")).toBeLessThan(trace.indexOf("apply_privacy_transformations"));
        expect(trace.indexOf("apply_privacy_transformations")).toBeLessThan(trace.indexOf("execute_reasoning"));
    });

    it("validation precedes trust evaluation, and trust evaluation precedes the package", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        const trace = decision.step_trace;
        expect(trace.indexOf("deterministic_validation")).toBeLessThan(trace.indexOf("trust_evaluation"));
        expect(trace.indexOf("trust_evaluation")).toBeLessThan(trace.indexOf("build_decision_package"));
    });
});

// ---------------------------------------------------------------------------
// S9 — privacy
// ---------------------------------------------------------------------------

describe("S9 privacy — reasoning never sees raw operational truth", () => {
    it("the draft body never reaches the package's evidence or recommendation verbatim", async () => {
        const secret = "555-123-4567";
        const { decision } = await runDecision({ deterministic: suggestion() });
        const serialized = JSON.stringify(decision.package);
        expect(serialized).not.toContain(secret);
    });

    it("every transformation is accounted for in the privacy report", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        expect(decision.package.privacy_report.redaction_steps.length).toBeGreaterThan(0);
        for (const step of decision.package.privacy_report.redaction_steps) {
            expect(step.path).toBeTruthy();
            expect(step.kind).toBeTruthy();
        }
    });

    it("refuses when the privacy policy prohibits a class the request carries", async () => {
        const harness = createRecordingRepository();
        const built = createDecisionContract({
            org_id: ORG,
            decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
            intent: "probe",
            context: { surface: "test" },
            correlation_id: "corr-privacy",
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "system",
            nowIso: NOW,
        });
        const execution = await executeDecisionContract({
            contract: built.contract,
            resolvedInformation: { deterministic_attention_suggestion: { household_income: 42000 } },
            // `household_income` is financial, and the policy prohibits financial.
            semanticMap: { household_income: "financial" },
            repository: harness.repository,
            nowIso: NOW,
            clock: () => 0,
        });
        expect(execution.package.outcome).toBe("refused_privacy");
        expect(execution.package.recommendation).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// S7 · D1–D8 — the refusal matrix
// ---------------------------------------------------------------------------

describe("S7 refusal matrix — every failure mode is a Decision Package", () => {
    it("D1 policy disabled → refused_policy", async () => {
        const { decision, packages } = await runDecision({ deterministic: suggestion(), policy_permits: false });
        expect(decision.package.outcome).toBe("refused_policy");
        expect(packages).toHaveLength(1);
    });

    it("D7 permission denied → refused_permission", async () => {
        const { decision } = await runDecision({ deterministic: suggestion(), permission_permits: false });
        expect(decision.package.outcome).toBe("refused_permission");
    });

    it("D2 unregistered decision class → refused_unsupported_class", async () => {
        const harness = createRecordingRepository();
        const built = createDecisionContract({
            org_id: ORG,
            decision_class_key: "not_a_registered_class",
            intent: "probe",
            context: {},
            correlation_id: "corr-unknown",
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "system",
            nowIso: NOW,
        });
        expect(built.ok).toBe(false);
        const execution = await executeDecisionContract({
            contract: built.contract,
            resolvedInformation: {},
            semanticMap: {},
            repository: harness.repository,
            nowIso: NOW,
            clock: () => 0,
        });
        expect(execution.package.outcome).toBe("refused_unsupported_class");
    });

    it("D3 required information missing → refused_insufficient_information", async () => {
        const { decision } = await runDecision({ deterministic: null });
        expect(decision.package.outcome).toBe("refused_insufficient_information");
    });

    it("D6 reasoning cannot ground a proposal → failed_reasoning", async () => {
        const { decision } = await runDecision({
            deterministic: suggestion({
                source: {
                    resolver: "opportunity_attention",
                    resolver_version: 3,
                    primary_reason_code: null,
                    reason_codes: [],
                },
            }),
        });
        expect(decision.package.outcome).toBe("failed_reasoning");
    });

    it("D8 every refusal explains itself and yields no overlay", async () => {
        for (const scenario of [
            () => runDecision({ deterministic: suggestion(), policy_permits: false }),
            () => runDecision({ deterministic: suggestion(), permission_permits: false }),
            () => runDecision({ deterministic: null }),
        ]) {
            const { decision } = await scenario();
            expect(decision.enrichment).toBeNull();
            expect(decision.package.recommendation).toBeNull();
            expect(decision.package.explanation.trim().length).toBeGreaterThan(0);
        }
    });

    it("every refusal is still persisted as a package, with economics", async () => {
        const { decision, packages, usage } = await runDecision({ deterministic: null });
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        expect(usage[0]!.outcome).toBe(decision.package.outcome);
        expect(usage[0]!.provider_cost_units).toBe(0);
    });

    it("the closed outcome set covers exactly the documented refusals", () => {
        expect([...DECISION_PACKAGE_OUTCOMES]).toEqual([
            "recommended",
            "refused_policy",
            "refused_permission",
            "refused_unsupported_class",
            "refused_insufficient_information",
            "refused_privacy",
            "refused_budget",
            "failed_validation",
            "failed_reasoning",
        ]);
    });
});

// ---------------------------------------------------------------------------
// S8 — determinism preference
// ---------------------------------------------------------------------------

describe("S8 determinism preference (Law 9 / Decision 007)", () => {
    it("selects the deterministic strategy at escalation level 0", () => {
        const cls = resolveDecisionClass(ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY)!;
        const selection = selectStrategy(cls);
        expect(selection.ok).toBe(true);
        if (!selection.ok) return;
        expect(selection.strategy.kind).toBe("deterministic");
        expect(selection.escalation_level).toBe(0);
    });

    it("never escalates on the happy path", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        expect(decision.package.economics.escalation_level).toBe(0);
        expect(decision.package.economics.strategy_kind).toBe("deterministic");
    });
});

// ---------------------------------------------------------------------------
// S10 — validation orchestration
// ---------------------------------------------------------------------------

describe("S10 validation orchestration (Decision 022)", () => {
    it("names the module that owns each rule", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        const results = decision.package.validation?.results ?? [];
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(r.owner).toBeTruthy();
            expect(r.owner.startsWith("lib/trust/")).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// S11 — governance owns trust semantics
// ---------------------------------------------------------------------------

describe("S11 Trust Governance owns Trust Vector and Trust Score semantics", () => {
    it("the package's score is exactly what governance semantics produce", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        expect(scoreTrustVector(decision.package.trust_vector!, TRUST_SEMANTICS_V1)).toBe(
            decision.package.trust_score,
        );
    });

    it("changing a governance weight changes the score with no runtime change", () => {
        // A non-uniform vector: reweighting a uniform one is mathematically a
        // no-op and would prove nothing.
        const vector = {
            grounding: 1,
            privacy: 1,
            evidence: 1,
            validation: 0,
            reliability: 1,
            human_oversight: 1,
        };

        const baseline = scoreTrustVector(vector, TRUST_SEMANTICS_V1);
        const reweighted = scoreTrustVector(vector, {
            ...TRUST_SEMANTICS_V1,
            version: "test-2.0.0",
            weights: { ...TRUST_SEMANTICS_V1.weights, validation: 0.9 },
        });

        expect(reweighted).not.toBe(baseline);
        expect(reweighted).toBeLessThan(baseline);
    });

    it("records which semantics version produced the score", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        expect(decision.package.trust_semantics_version).toBe(TRUST_SEMANTICS_V1.version);
    });
});

// ---------------------------------------------------------------------------
// S13 · H1/H2 — reproducibility
// ---------------------------------------------------------------------------

describe("S13 reproducibility", () => {
    it("H1 — the same contract and clock produce an identical package apart from its identity", async () => {
        const a = await runDecision({ deterministic: suggestion() });
        const b = await runDecision({ deterministic: suggestion() });

        const strip = (p: DecisionPackageV1) => ({ ...p, id: "*", contract_id: "*" });
        expect(strip(a.decision.package)).toEqual(strip(b.decision.package));
    });

    it("H2 — a replay produces a NEW package and never mutates the first", async () => {
        const first = await runDecision({ deterministic: suggestion() });
        const snapshot = JSON.stringify(first.decision.package);
        const replay = await runDecision({ deterministic: suggestion() });

        expect(replay.decision.package.id).not.toBe(first.decision.package.id);
        expect(JSON.stringify(first.decision.package)).toBe(snapshot);
    });
});

// ---------------------------------------------------------------------------
// Mutation boundary + observations
// ---------------------------------------------------------------------------

describe("mutation boundary", () => {
    it("G3 — a Decision Package exposes no executable field", async () => {
        const { decision } = await runDecision({ deterministic: suggestion() });
        const keys = Object.keys(decision.package);
        for (const forbidden of ["execute", "executor", "command", "mutation", "action_to_run"]) {
            expect(keys).not.toContain(forbidden);
        }
    });

    it("writes nothing outside the four Trust tables", async () => {
        const { contracts, packages, observations, usage } = await runDecision({ deterministic: suggestion() });
        // The runtime itself records no observation; presentation does that.
        expect(observations).toHaveLength(0);
        expect(contracts.length + packages.length + usage.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Registry closure + UX preservation
// ---------------------------------------------------------------------------

describe("V1 is not broadened", () => {
    /**
     * Originally "registers exactly one Decision Class" — V1's proof that nothing
     * had adopted the platform. Trust adoption Phase 1.1 registers the second
     * class, which is the phase gate rather than a regression.
     *
     * What V1 actually needed is preserved verbatim: V1's OWN class is still
     * registered, still first, and its governance is unchanged. V1 is not
     * broadened by another capability existing beside it.
     */
    it("V1's own Decision Class is still first and its governance is unchanged", () => {
        expect(listDecisionClassKeys()[0]).toBe(ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY);

        const v1 = resolveDecisionClass(ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY);
        expect(v1).not.toBeNull();
        expect(v1?.risk_tier).toBe("convenience");
        expect(v1?.review_requirement).toBe("operator_review");
        expect(v1?.trust_threshold).toBe(0.5);
        expect(v1?.requires_allowed_feature).toBe("draft_enrichment");
        expect(v1?.strategy_preference).toEqual(["deterministic"]);
        expect(v1?.required_information).toEqual(["deterministic_attention_suggestion"]);
    });
});

describe("existing deterministic UX is preserved byte for byte", () => {
    it("the Trust recommendation equals the legacy stub provider's output for the same redacted input", async () => {
        const policy = {
            schema_version: 1 as const,
            enabled: true as const,
            provider: "stub" as const,
            allowed_features: ["draft_enrichment"] as const,
            pii_mode: "strict" as const,
            logging_mode: "minimal" as const,
            retention_mode: "none" as const,
        };
        const { decision } = await runDecision({ deterministic: suggestion() });
        const trustRecommendation = decision.package.recommendation!;

        // Feed the legacy provider the exact context the runtime prepared, so the
        // comparison is of the two builders, not of two different inputs.
        const legacy = await createStubAiProvider(policy).completeStructured({
            schema_version: 1,
            request_id: "req-1",
            correlation_id: "corr-1",
            feature: "needs_attention_draft_enrichment",
            org_id: ORG,
            payload: {
                primary_reason_code: "no_contact_attempt",
                next_action_key: "send_follow_up",
                template_key: "follow_up_v1",
            },
            requested_at_iso: NOW,
        });

        expect(legacy.outcome).toBe("ok");
        expect({ ...(legacy.data as Record<string, unknown>), generated_at_iso: NOW }).toEqual({
            ...trustRecommendation,
            generated_at_iso: NOW,
        });
    });
});
