/**
 * Phase 0 Slice 0.1 — asynchronous reasoning and validation seam.
 *
 * The seam widens two return types and awaits them at their canonical
 * invocation boundaries. Nothing else changes, and this suite exists to prove
 * that claim rather than assert it:
 *
 *   - the registered synchronous strategy still returns synchronously and
 *     produces a byte-identical package;
 *   - an asynchronous strategy travels the SAME runtime path, in the same
 *     canonical order, producing the same package;
 *   - synchronous and asynchronous validation call-outs share ONE orchestration;
 *   - a rejected strategy and a rejected validator preserve exactly the
 *     failure contract their synchronous equivalents have today;
 *   - ordering and package behaviour remain deterministic.
 *
 * Scope discipline: no timeout, no retry, no cancellation, no provider. The
 * seam permits a strategy to await work it owns and nothing more.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.1
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Strategy selection is a module-level registry, so the only way to drive a
 * synthetic strategy through the REAL runtime is to override selection for this
 * file. `vi.mock` is file-scoped, so the closed V1 registry — and the assertion
 * in `trustRuntimeSlice1.test.ts` that exactly one class is registered — are
 * untouched.
 *
 * When `override.strategy` is null the genuine selection runs, so the
 * "unchanged" assertions below exercise production selection, not a stub.
 */
const override = vi.hoisted(() => ({ strategy: null as unknown }));

vi.mock("@/lib/trust/strategy/strategyEngine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/trust/strategy/strategyEngine")>();
    return {
        ...actual,
        selectStrategy: (decisionClass: Parameters<typeof actual.selectStrategy>[0]) =>
            override.strategy
                ? {
                      ok: true as const,
                      strategy: override.strategy as ReasoningStrategyV1,
                      escalation_level: 0,
                  }
                : actual.selectStrategy(decisionClass),
    };
});

import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { DecisionContractLifecycleState, DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type {
    ReasoningUsageInput,
    TrustObservationInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";
import type { ReasoningOutcome, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import { attentionSuggestionEnrichmentDeterministicStrategy } from "@/lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic";
import { TRUST_RUNTIME_STEPS, executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import {
    orchestrateValidation,
    runValidationPolicy,
    type ValidationPolicyV1,
} from "@/lib/trust/validation/validationOrchestrator";

const NOW = "2026-08-04T12:00:00.000Z";
const ORG = "11111111-1111-1111-1111-111111111111";

function createRepository() {
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

/** The reasoning context the registered class declares, resolved by a capability. */
const RESOLVED_INFORMATION = {
    deterministic_attention_suggestion: {
        primary_reason_code: "no_contact_attempt",
        next_action_key: "send_follow_up",
        template_key: "follow_up_v1",
        channel: "sms",
        reasoning_summary: "No contact attempt recorded since the inquiry arrived.",
        draft_body: "Hi Dana, checking in about Ellis — call me at 555-123-4567.",
    },
} as const;

const SEMANTIC_MAP = {
    primary_reason_code: "operational",
    next_action_key: "operational",
    template_key: "operational",
    channel: "communications",
    reasoning_summary: "operational",
    draft_body: "communications",
} as const;

async function runContract(correlation: string) {
    const harness = createRepository();
    const built = createDecisionContract({
        org_id: ORG,
        decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
        intent: "Slice 0.1 seam certification.",
        context: { surface: "certification" },
        correlation_id: correlation,
        initiating_actor: { actor_type: "system", actor_id: null },
        channel: "system",
        nowIso: NOW,
    });
    const execution = await executeDecisionContract({
        contract: built.contract,
        resolvedInformation: RESOLVED_INFORMATION,
        semanticMap: SEMANTIC_MAP,
        repository: harness.repository,
        nowIso: NOW,
        clock: () => 0,
    });
    return { ...harness, execution };
}

/** Identity differs by construction; everything else must not. */
const stripIdentity = (p: DecisionPackageV1) => ({ ...p, id: "*", contract_id: "*" });

/** Wraps the registered strategy so ONLY its synchrony differs. */
function asyncMirrorOf(strategy: ReasoningStrategyV1): ReasoningStrategyV1 {
    return {
        ...strategy,
        async reason(input) {
            await new Promise((resolve) => setTimeout(resolve, 1));
            return strategy.reason(input);
        },
    };
}

function throwingStrategy(message: string, mode: "sync" | "async"): ReasoningStrategyV1 {
    return {
        ...attentionSuggestionEnrichmentDeterministicStrategy,
        reason(): ReasoningOutcome | Promise<ReasoningOutcome> {
            if (mode === "sync") throw new Error(message);
            return Promise.reject(new Error(message));
        },
    };
}

beforeEach(() => {
    override.strategy = null;
});

// ---------------------------------------------------------------------------
// 1 — the existing synchronous strategy is unchanged
// ---------------------------------------------------------------------------

describe("the registered synchronous strategy is unchanged", () => {
    it("still returns synchronously — the widening did not make it async", () => {
        const outcome = attentionSuggestionEnrichmentDeterministicStrategy.reason({
            context: {
                transformed: { next_action_key: "send_follow_up", primary_reason_code: "no_contact_attempt" },
                knowledge: [],
                redaction_steps: [],
                classes_present: [],
                pii_mode: "strict",
            },
            nowIso: NOW,
        });

        expect(outcome).not.toBeInstanceOf(Promise);
        expect((outcome as ReasoningOutcome).ok).toBe(true);
    });

    it("produces a recommended package through the genuine selection path", async () => {
        const { execution, contracts, packages, usage } = await runContract("seam-sync");

        expect(execution.package.outcome).toBe("recommended");
        expect(execution.package.economics.strategy_kind).toBe("deterministic");
        expect(execution.package.economics.escalation_level).toBe(0);
        expect(execution.package.economics.provider_cost_units).toBe(0);
        expect(execution.package.confidence).toBe(1);
        expect(execution.package.validation?.passed).toBe(true);
        expect(execution.step_trace).toEqual([...TRUST_RUNTIME_STEPS]);
        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 2 — an asynchronous strategy travels the same path
// ---------------------------------------------------------------------------

describe("an asynchronous strategy executes through the same runtime", () => {
    it("produces a package identical to the synchronous one apart from identity", async () => {
        const sync = await runContract("seam-compare-sync");

        override.strategy = asyncMirrorOf(attentionSuggestionEnrichmentDeterministicStrategy);
        const async = await runContract("seam-compare-async");

        // The ONLY difference between the two strategies is that one awaits.
        // If the seam changed anything else, these packages would differ.
        expect(stripIdentity(async.execution.package)).toEqual(stripIdentity(sync.execution.package));
    });

    it("executes exactly the canonical step sequence, in order", async () => {
        override.strategy = asyncMirrorOf(attentionSuggestionEnrichmentDeterministicStrategy);
        const { execution } = await runContract("seam-async-order");

        expect(execution.step_trace).toEqual([...TRUST_RUNTIME_STEPS]);
        expect(execution.step_trace.indexOf("execute_reasoning")).toBeLessThan(
            execution.step_trace.indexOf("deterministic_validation"),
        );
    });

    it("persists exactly one contract, one package and one usage row", async () => {
        override.strategy = asyncMirrorOf(attentionSuggestionEnrichmentDeterministicStrategy);
        const { contracts, packages, usage, observations } = await runContract("seam-async-persist");

        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        expect(observations).toHaveLength(0);
    });

    it("an asynchronous refusal is still a Decision Package, not an error", async () => {
        override.strategy = {
            ...attentionSuggestionEnrichmentDeterministicStrategy,
            async reason(): Promise<ReasoningOutcome> {
                await new Promise((resolve) => setTimeout(resolve, 1));
                return { ok: false, refusal_code: "REASONING_UNABLE", detail: "async refusal" };
            },
        };
        const { execution, packages } = await runContract("seam-async-refusal");

        expect(execution.package.outcome).toBe("failed_reasoning");
        expect(execution.package.recommendation).toBeNull();
        expect(packages).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 3 — one orchestration for both call-out kinds
// ---------------------------------------------------------------------------

describe("synchronous and asynchronous validation call-outs share one orchestration", () => {
    const mixedPolicy: ValidationPolicyV1 = {
        key: "seam_mixed_v1",
        version: "1.0.0",
        callOuts: [
            {
                owner: "certification/sync-owner",
                validator_key: "sync_validator",
                invoke: () => ({ passed: true, detail: "sync ok" }),
            },
            {
                owner: "certification/async-owner",
                validator_key: "async_validator",
                invoke: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 1));
                    return { passed: true, detail: "async ok" };
                },
            },
        ],
    };

    it("reports both kinds in one report, in declared order", async () => {
        const report = await runValidationPolicy(mixedPolicy, {});

        expect(report.passed).toBe(true);
        expect(report.results.map((r) => r.validator_key)).toEqual(["sync_validator", "async_validator"]);
        expect(report.results.map((r) => r.detail)).toEqual(["sync ok", "async ok"]);
    });

    it("declared order wins over completion order", async () => {
        // The FIRST call-out resolves last. Under a completion race it would be
        // reported second; under declared-order orchestration it must be first.
        const racingPolicy: ValidationPolicyV1 = {
            key: "seam_racing_v1",
            version: "1.0.0",
            callOuts: [
                {
                    owner: "certification/slow",
                    validator_key: "slow_validator",
                    invoke: async () => {
                        await new Promise((resolve) => setTimeout(resolve, 25));
                        return { passed: true, detail: "slow" };
                    },
                },
                {
                    owner: "certification/fast",
                    validator_key: "fast_validator",
                    invoke: async () => ({ passed: true, detail: "fast" }),
                },
            ],
        };

        const report = await runValidationPolicy(racingPolicy, {});
        expect(report.results.map((r) => r.validator_key)).toEqual(["slow_validator", "fast_validator"]);
    });

    it("an asynchronous call-out that fails yields failed_validation, exactly as a synchronous one does", async () => {
        const report = await runValidationPolicy(
            {
                key: "seam_async_fail_v1",
                version: "1.0.0",
                callOuts: [
                    {
                        owner: "certification/async-owner",
                        validator_key: "async_failing_validator",
                        invoke: async () => ({ passed: false, detail: "async refused" }),
                    },
                ],
            },
            {},
        );

        expect(report.passed).toBe(false);
        expect(report.results[0]!.detail).toBe("async refused");
    });

    it("orchestrateValidation resolves the registered policy through that same core", async () => {
        const result = await orchestrateValidation({
            policy_key: "attention_suggestion_enrichment_v1",
            recommendation: {},
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.policy_key).toBe("attention_suggestion_enrichment_v1");
        expect(result.report.results.length).toBeGreaterThan(0);
    });

    it("an unknown policy still refuses without throwing", async () => {
        const result = await orchestrateValidation({ policy_key: "not_a_policy", recommendation: {} });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusal_code).toBe("VALIDATION_POLICY_UNKNOWN");
    });

    it("no caller may assume an immediate result — orchestration returns a promise", () => {
        const pending = orchestrateValidation({ policy_key: "not_a_policy", recommendation: {} });
        expect(pending).toBeInstanceOf(Promise);
        return pending;
    });
});

// ---------------------------------------------------------------------------
// 4 / 5 — rejection preserves the existing failure contract
// ---------------------------------------------------------------------------

describe("rejection preserves the synchronous failure contract", () => {
    it("a rejected strategy behaves exactly as a throwing strategy does today", async () => {
        override.strategy = throwingStrategy("strategy exploded", "sync");
        const syncError = await runContract("seam-throw-sync").then(
            () => null,
            (e: unknown) => e as Error,
        );

        override.strategy = throwingStrategy("strategy exploded", "async");
        const asyncError = await runContract("seam-throw-async").then(
            () => null,
            (e: unknown) => e as Error,
        );

        expect(syncError).toBeInstanceOf(Error);
        expect(asyncError).toBeInstanceOf(Error);
        expect(asyncError!.message).toBe(syncError!.message);
        expect(asyncError!.message).toBe("strategy exploded");
    });

    it("a rejected validator behaves exactly as a throwing validator does today", async () => {
        const policy = (mode: "sync" | "async"): ValidationPolicyV1 => ({
            key: `seam_reject_${mode}_v1`,
            version: "1.0.0",
            callOuts: [
                {
                    owner: "certification/broken",
                    validator_key: "broken_validator",
                    invoke: () => {
                        if (mode === "sync") throw new Error("validator exploded");
                        return Promise.reject(new Error("validator exploded"));
                    },
                },
            ],
        });

        const syncError = await runValidationPolicy(policy("sync"), {}).then(
            () => null,
            (e: unknown) => e as Error,
        );
        const asyncError = await runValidationPolicy(policy("async"), {}).then(
            () => null,
            (e: unknown) => e as Error,
        );

        expect(syncError).toBeInstanceOf(Error);
        expect(asyncError).toBeInstanceOf(Error);
        expect(asyncError!.message).toBe(syncError!.message);
        expect(asyncError!.message).toBe("validator exploded");
    });

    it("a rejecting call-out leaves no later call-out in flight", async () => {
        // Sequential orchestration means the second call-out is never started,
        // so a rejection can never strand an unobserved promise.
        let laterInvoked = false;
        const policy: ValidationPolicyV1 = {
            key: "seam_reject_sequencing_v1",
            version: "1.0.0",
            callOuts: [
                {
                    owner: "certification/broken",
                    validator_key: "broken_validator",
                    invoke: () => Promise.reject(new Error("first exploded")),
                },
                {
                    owner: "certification/later",
                    validator_key: "later_validator",
                    invoke: () => {
                        laterInvoked = true;
                        return { passed: true, detail: "should never run" };
                    },
                },
            ],
        };

        await expect(runValidationPolicy(policy, {})).rejects.toThrow("first exploded");
        expect(laterInvoked).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 6 — determinism
// ---------------------------------------------------------------------------

describe("ordering and package behaviour remain deterministic", () => {
    it("two asynchronous executions produce identical packages apart from identity", async () => {
        override.strategy = asyncMirrorOf(attentionSuggestionEnrichmentDeterministicStrategy);
        const a = await runContract("seam-determinism-a");
        const b = await runContract("seam-determinism-b");

        expect(stripIdentity(a.execution.package)).toEqual(stripIdentity(b.execution.package));
        expect(a.execution.package.id).not.toBe(b.execution.package.id);
    });

    it("a replay never mutates the earlier package", async () => {
        override.strategy = asyncMirrorOf(attentionSuggestionEnrichmentDeterministicStrategy);
        const first = await runContract("seam-replay-first");
        const snapshot = JSON.stringify(first.execution.package);

        await runContract("seam-replay-second");
        expect(JSON.stringify(first.execution.package)).toBe(snapshot);
    });

    it("interleaved executions do not contaminate one another", async () => {
        override.strategy = asyncMirrorOf(attentionSuggestionEnrichmentDeterministicStrategy);
        const [a, b, c] = await Promise.all([
            runContract("seam-parallel-a"),
            runContract("seam-parallel-b"),
            runContract("seam-parallel-c"),
        ]);

        for (const run of [a, b, c]) {
            expect(run.execution.package.outcome).toBe("recommended");
            expect(run.execution.step_trace).toEqual([...TRUST_RUNTIME_STEPS]);
            expect(run.packages).toHaveLength(1);
        }
        expect(new Set([a, b, c].map((r) => r.execution.package.id)).size).toBe(3);
    });
});
