/**
 * Phase 2.4 — governed provider execution foundation.
 *
 * Proves the seam end to end with a FAKE adapter and zero network egress: no
 * API key, no transport, no external call. What is proven is the boundary —
 * that only a governed Eligible Reasoning Input can be executed, that provider
 * and model identity survive, that failures normalize to a closed vocabulary,
 * and that nothing provider-controlled reaches an immutable Decision Package.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it, vi } from "vitest";

import { NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY } from "@/lib/ai/enrichmentContracts";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import {
    buildEligibleReasoningInput,
    buildInformationPackage,
    type EligibleReasoningInputV1,
    type InformationPackageSpecV1,
} from "@/lib/trust/information/informationPackage";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { ATTENTION_SUGGESTION_MINIMIZATION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";
import {
    PROVIDER_EXECUTION_FAILURES,
    PROVIDER_EXECUTION_LOCATIONS,
    executeGovernedProviderReasoning,
    isRetryableProviderFailure,
    type GovernedProviderExecutionRequestV1,
    type ProviderAdapterResponseV1,
    type ProviderAdapterV1,
} from "@/lib/trust/provider/governedProviderExecution";
import { isProviderCapableStrategyKind } from "@/lib/trust/reasoning/executionCapability";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";

const WEB_ROOT = process.cwd();
const NOW = "2026-08-07T12:00:00.000Z";
const ORG = "org-1";
const CLASS_KEY = "attention_suggestion_enrichment";
const POLICY_KEY = "attention_suggestion_minimization_v1";
const EMAIL = "jane.doe+tour@example.com";

// ---------------------------------------------------------------------------
// Fixtures — a governed input, and a fake adapter with zero transport
// ---------------------------------------------------------------------------

type Src = { body: string };

const SPEC: InformationPackageSpecV1<Src> = {
    key: "provider_execution_fixture",
    version: "1.0.0",
    decision_class_key: CLASS_KEY,
    source_kind: "communication_messages",
    elements: [{
        key: "inbound_message_text",
        information_class: "communications",
        source_field: "communication_messages.body",
        required_text_minimizers: ["email", "phone"],
        select: (s) => s.body,
    }],
};

const MINIMIZING_POLICY = { ...ATTENTION_SUGGESTION_MINIMIZATION_V1, required_text_minimizers: ["email", "phone"] as const };

function eligible(): EligibleReasoningInputV1 {
    const pkg = buildInformationPackage({
        spec: SPEC,
        source: { body: `Email me at ${EMAIL} about Friday` },
        sourceRefs: { message_id: "msg-1", org_id: ORG },
    });
    if (!pkg.ok) throw new Error("fixture package failed");
    const e = buildEligibleReasoningInput({ package: pkg.package, policy: MINIMIZING_POLICY });
    if (!e.ok) throw new Error("fixture eligibility failed");
    return e.input;
}

function request(over: Partial<GovernedProviderExecutionRequestV1> = {}): GovernedProviderExecutionRequestV1 {
    return {
        schema_version: 1,
        decision_class_key: CLASS_KEY,
        correlation_id: "corr-1",
        input: eligible(),
        requested_strategy_kind: "large_reasoning",
        requested_provider_key: "fake_local",
        requested_model_key: "fixture-model",
        deadline_ms: 5_000,
        ...over,
    };
}

/** A valid enrichment payload — what a well-behaved provider would return. */
function validOutput(over: Record<string, unknown> = {}) {
    return {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY,
        generated_at_iso: NOW,
        provider_report: { provider_key: "openai", execution_mode: "live" },
        ...over,
    };
}

/**
 * The fake adapter. No transport, no credential, no clock of its own — it
 * returns whatever the test scripted. This is the whole execution proof: the
 * seam is exercised for real, and nothing leaves the process.
 */
function fakeAdapter(response: ProviderAdapterResponseV1 | (() => never)): ProviderAdapterV1 {
    return {
        adapter_key: "fake",
        async execute() {
            if (typeof response === "function") response();
            return response as ProviderAdapterResponseV1;
        },
    };
}

const OK_IDENTITY = {
    provider_key: "fake_local",
    model_key: "fixture-model",
    model_version: "v7-fixture",
    execution_location: "local" as const,
};

function okResponse(over: Partial<Extract<ProviderAdapterResponseV1, { ok: true }>> = {}): ProviderAdapterResponseV1 {
    return { ok: true, output: validOutput(), provider_identity: OK_IDENTITY, ...over };
}

// ---------------------------------------------------------------------------
// 1. Only governed input may be executed
// ---------------------------------------------------------------------------

describe("P24-1 — the seam accepts only a governed Eligible Reasoning Input", () => {
    it("raw resolvedInformation is refused", async () => {
        const raw = { deterministic_attention_suggestion: { draft_body: `Email ${EMAIL}` } };
        const r = await executeGovernedProviderReasoning({
            // Cast is the point: a typed caller cannot even express this.
            request: request({ input: raw as unknown as EligibleReasoningInputV1 }),
            adapter: fakeAdapter(okResponse()),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("adapter_contract_violation");
    });

    it("a raw canonical row is refused, and its content never reaches the result", async () => {
        const row = { id: "m1", body: `Email ${EMAIL}`, from_address: "+15552345678", provider_message_id: "SM-secret" };
        const r = await executeGovernedProviderReasoning({
            request: request({ input: row as unknown as EligibleReasoningInputV1 }),
            adapter: fakeAdapter(okResponse()),
        });
        expect(r.ok).toBe(false);
        const blob = JSON.stringify(r);
        for (const f of ["jane.doe", "SM-secret", "from_address", "+1555"]) {
            expect(blob, `leaked ${f}`).not.toContain(f);
        }
    });

    it("a governed input is accepted", async () => {
        const r = await executeGovernedProviderReasoning({ request: request(), adapter: fakeAdapter(okResponse()) });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.output).toEqual(validOutput());
    });

    it("the adapter is handed no repository, policy or privacy engine", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/provider/governedProviderExecution.ts"), "utf8");
        expect(src).not.toContain("TrustRepository");
        expect(src).not.toContain("transformForReasoning");
        expect(src).not.toContain("resolvePrivacyPolicy");
        expect(src).not.toContain("classifyElements");
    });
});

// ---------------------------------------------------------------------------
// 2. Four dimensions, kept apart
// ---------------------------------------------------------------------------

describe("P24-2 — provider, model, location and reasoning kind are independent", () => {
    it("provider and model identity survive a success", async () => {
        const r = await executeGovernedProviderReasoning({ request: request(), adapter: fakeAdapter(okResponse()) });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.provider_identity.provider_key).toBe("fake_local");
        expect(r.provider_identity.model_key).toBe("fixture-model");
        expect(r.provider_identity.model_version).toBe("v7-fixture");
    });

    it("provider identity survives a FAILURE too — a timeout still says who timed out", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(),
            adapter: fakeAdapter({ ok: false, failure_code: "timeout", provider_identity: OK_IDENTITY }),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.provider_identity.provider_key).toBe("fake_local");
        expect(r.provider_identity.model_key).toBe("fixture-model");
    });

    it("execution location is represented independently of reasoning kind", async () => {
        for (const location of PROVIDER_EXECUTION_LOCATIONS) {
            const r = await executeGovernedProviderReasoning({
                request: request(),
                adapter: fakeAdapter(okResponse({ provider_identity: { ...OK_IDENTITY, execution_location: location } })),
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.provider_identity.execution_location).toBe(location);
        }
    });

    it("a LOCAL model is still model reasoning — location grants no deterministic standing (D-6)", async () => {
        // The request's kind comes from the ladder and is provider-capable
        // regardless of where the weights sit.
        const req = request({ requested_strategy_kind: "large_reasoning" });
        expect(isProviderCapableStrategyKind(req.requested_strategy_kind)).toBe(true);
        const r = await executeGovernedProviderReasoning({
            request: req,
            adapter: fakeAdapter(okResponse({ provider_identity: { ...OK_IDENTITY, execution_location: "local" } })),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.provider_identity.execution_location).toBe("local");
        // Still model reasoning: the kind is untouched by the location.
        expect(isProviderCapableStrategyKind(req.requested_strategy_kind)).toBe(true);
    });

    it("`unknown` is a first-class location, not a missing value", () => {
        expect(PROVIDER_EXECUTION_LOCATIONS).toContain("unknown");
    });
});

// ---------------------------------------------------------------------------
// 3. Failure normalization
// ---------------------------------------------------------------------------

describe("P24-3 — failures normalize to a closed vocabulary", () => {
    it.each(["timeout", "transport_failure", "provider_unavailable", "provider_refused", "malformed_response"] as const)(
        "%s is passed through as a stable code",
        async (failure_code) => {
            const r = await executeGovernedProviderReasoning({
                request: request(),
                adapter: fakeAdapter({ ok: false, failure_code, provider_identity: OK_IDENTITY }),
            });
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.failure_code).toBe(failure_code);
        },
    );

    it("an adapter that THROWS becomes transport_failure, not an exception leak", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(),
            adapter: fakeAdapter(() => { throw new Error(`boom ${EMAIL} sk-live-secret`); }),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("transport_failure");
        // The thrown text is provider/adapter-controlled and must not survive.
        const blob = JSON.stringify(r);
        expect(blob).not.toContain("boom");
        expect(blob).not.toContain("sk-live-secret");
        expect(blob).not.toContain("jane.doe");
    });

    it("an unknown failure code is refused as an adapter contract violation", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(),
            adapter: fakeAdapter({ ok: false, failure_code: "totally_made_up" as never, provider_identity: OK_IDENTITY }),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("adapter_contract_violation");
    });

    it("a non-object output is malformed_response", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(),
            adapter: fakeAdapter(okResponse({ output: "just a string" as never })),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("malformed_response");
    });

    it("a missing or malformed provider identity is refused", async () => {
        for (const identity of [undefined, {}, { provider_key: "" }, { provider_key: "p", execution_location: "moon" }]) {
            const r = await executeGovernedProviderReasoning({
                request: request(),
                adapter: fakeAdapter(okResponse({ provider_identity: identity as never })),
            });
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.failure_code).toBe("adapter_contract_violation");
        }
    });

    it("retryability is classified without implementing retry", () => {
        expect(isRetryableProviderFailure("timeout")).toBe(true);
        expect(isRetryableProviderFailure("transport_failure")).toBe(true);
        expect(isRetryableProviderFailure("provider_unavailable")).toBe(true);
        expect(isRetryableProviderFailure("malformed_response")).toBe(false);
        expect(isRetryableProviderFailure("provider_refused")).toBe(false);
        const src = readFileSync(join(WEB_ROOT, "lib/trust/provider/governedProviderExecution.ts"), "utf8");
        // No retry loop, no fallback routing in this slice.
        expect(src).not.toMatch(/for\s*\(.*attempt/i);
        expect(src).not.toMatch(/fallback/i);
    });

    it("every failure code is covered by the closed vocabulary", () => {
        expect([...PROVIDER_EXECUTION_FAILURES].sort()).toEqual([
            "adapter_contract_violation", "invalid_execution_budget", "malformed_response",
            "provider_refused", "provider_unavailable", "timeout", "transport_failure",
        ]);
    });
});

// ---------------------------------------------------------------------------
// 4. Usage — truthful or absent
// ---------------------------------------------------------------------------

describe("P24-4 — usage facts are retained, never fabricated", () => {
    it("reported usage survives", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(),
            adapter: fakeAdapter(okResponse({ usage: { input_units: 120, output_units: 34, provider_cost_units: 0.0042 } })),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.usage).toEqual({ input_units: 120, output_units: 34, provider_cost_units: 0.0042 });
    });

    it("absent usage stays ABSENT — never zero-filled", async () => {
        const r = await executeGovernedProviderReasoning({ request: request(), adapter: fakeAdapter(okResponse()) });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.usage).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(r, "usage")).toBe(false);
    });

    it("an empty usage block is the same as none reported", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(), adapter: fakeAdapter(okResponse({ usage: {} })),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.usage).toBeUndefined();
    });

    it.each([
        ["negative units", { input_units: -1 }],
        ["NaN units", { output_units: Number.NaN }],
        ["infinite cost", { provider_cost_units: Number.POSITIVE_INFINITY }],
        ["non-numeric units", { input_units: "many" as never }],
    ])("unusable usage (%s) is refused, never silently dropped", async (_label, usage) => {
        const r = await executeGovernedProviderReasoning({
            request: request(), adapter: fakeAdapter(okResponse({ usage })),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("adapter_contract_violation");
    });

    it("usage on a failure is retained — a call that failed still spent something", async () => {
        const r = await executeGovernedProviderReasoning({
            request: request(),
            adapter: fakeAdapter({ ok: false, failure_code: "timeout", provider_identity: OK_IDENTITY, usage: { input_units: 99 } }),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.usage).toEqual({ input_units: 99 });
    });

    it("latency is measured from an injected clock, not a wall clock inside Trust", async () => {
        let t = 0;
        const r = await executeGovernedProviderReasoning({
            request: request(), adapter: fakeAdapter(okResponse()), clock: () => (t += 25),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.latency_ms).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// 5. End to end — normalized output through REAL Trust validation
// ---------------------------------------------------------------------------

const override = vi.hoisted(() => ({ strategy: null as unknown }));

vi.mock("@/lib/trust/strategy/strategyEngine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/trust/strategy/strategyEngine")>();
    return {
        ...actual,
        selectStrategy: (dc: Parameters<typeof actual.selectStrategy>[0]) =>
            override.strategy
                ? { ok: true as const, strategy: override.strategy as never, escalation_level: 4 }
                : actual.selectStrategy(dc),
    };
});

function makeRepo() {
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract() {},
        async advanceContractLifecycle() {},
        async insertPackage(p) { packages.push(p); },
        async insertObservation() {},
        async insertReasoningUsage(u) { usage.push(u); },
    };
    return { repository, packages, usage };
}

/**
 * A provider-backed strategy that runs the seam and hands the normalized output
 * to Trust as its proposal. The whole canonical path, with a fake adapter:
 *
 *   eligible input → governed request → adapter → normalized result
 *     → Trust validation → immutable Decision Package
 */
function providerStrategy(response: ProviderAdapterResponseV1, input: EligibleReasoningInputV1) {
    return {
        key: "fixture_provider_strategy",
        kind: "large_reasoning" as const,
        version: "1.0.0",
        decision_class_key: CLASS_KEY,
        async reason() {
            const result = await executeGovernedProviderReasoning({
                request: request({ input }),
                adapter: fakeAdapter(response),
            });
            if (!result.ok) {
                // A provider failure becomes a governed Trust refusal carrying a
                // closed code — never provider text, never an exception.
                return { ok: false as const, refusal_code: "REASONING_UNABLE" as const, detail: `provider_failure:${result.failure_code}` };
            }
            return {
                ok: true as const,
                ...(result.usage?.provider_cost_units !== undefined ? { cost_units: result.usage.provider_cost_units } : {}),
                proposal: {
                    recommendation: result.output,
                    confidence: null,
                    evidence: [],
                    explanation: "Provider-backed proposal.",
                    remaining_uncertainty: [],
                },
            };
        },
    };
}

async function runEndToEnd(response: ProviderAdapterResponseV1, correlation: string) {
    const input = eligible();
    override.strategy = providerStrategy(response, input);
    try {
        const harness = makeRepo();
        const contract = createDecisionContract({
            org_id: ORG,
            decision_class_key: CLASS_KEY,
            intent: "provider execution certification",
            context: { surface: "certification" },
            correlation_id: correlation,
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "system",
            nowIso: NOW,
        }).contract as DecisionContractV1;
        const execution = await executeDecisionContract({
            contract,
            resolvedInformation: { deterministic_attention_suggestion: { primary_reason_code: "x" } },
            semanticMap: { primary_reason_code: "operational" as InformationClass },
            repository: harness.repository,
            nowIso: NOW,
            clock: () => 0,
            eligibleReasoningInput: input,
        });
        return { ...harness, execution };
    } finally {
        override.strategy = null;
    }
}

describe("P24-5 — normalized output passes through REAL Trust validation", () => {
    it("a valid bounded result becomes a recommended Decision Package", async () => {
        const { execution } = await runEndToEnd(okResponse(), "e2e-ok");
        expect(execution.package.outcome).toBe("recommended");
        expect(execution.step_trace).toContain("execute_reasoning");
    });

    it("an unsupported ENUM value fails validation", async () => {
        // `provider_report.provider_key` is a closed enum in the registered schema.
        const bad = okResponse({ output: validOutput({ provider_report: { provider_key: "acme_ai", execution_mode: "live" } }) });
        const { execution } = await runEndToEnd(bad, "e2e-enum");
        expect(execution.package.outcome).toBe("failed_validation");
        expect(execution.package.recommendation).toBeNull();
    });

    it("a MISSING required field fails validation", async () => {
        const { agent_key: _omitted, ...withoutAgentKey } = validOutput();
        const { execution } = await runEndToEnd(okResponse({ output: withoutAgentKey }), "e2e-missing");
        expect(execution.package.outcome).toBe("failed_validation");
    });

    it("NEGATIVE CONTROL: smuggled extra provider fields are rejected, not absorbed", async () => {
        // The registered schema is `.strict()`, so a provider cannot invent
        // Decision Package content by adding keys to its own output.
        const smuggled = okResponse({
            output: validOutput({
                proposed_command: { command_key: "create_person" },
                trust_score: 1,
                provider_key: "openai",
            }),
        });
        const { execution } = await runEndToEnd(smuggled, "e2e-smuggle");
        expect(execution.package.outcome).toBe("failed_validation");
        const blob = JSON.stringify(execution.package);
        for (const f of ["proposed_command", "create_person"]) {
            expect(blob, `leaked ${f}`).not.toContain(f);
        }
    });

    it("a provider FAILURE becomes a governed Trust outcome carrying only a closed code", async () => {
        const { execution } = await runEndToEnd(
            { ok: false, failure_code: "timeout", provider_identity: OK_IDENTITY },
            "e2e-timeout",
        );
        expect(execution.package.outcome).toBe("failed_reasoning");
        expect(execution.package.explanation).toContain("provider_failure:timeout");
        expect(JSON.stringify(execution.package)).not.toContain("jane.doe");
    });

    it("reported provider cost reaches the package and the usage row", async () => {
        const { execution, usage } = await runEndToEnd(
            okResponse({ usage: { input_units: 10, output_units: 5, provider_cost_units: 0.25 } }),
            "e2e-cost",
        );
        expect(execution.package.outcome).toBe("recommended");
        expect(execution.package.economics.provider_cost_units).toBe(0.25);
        expect(usage[0]?.provider_cost_units).toBe(0.25);
    });

    it("privacy evidence from the governed input is preserved in the package", async () => {
        const { execution } = await runEndToEnd(okResponse(), "e2e-privacy");
        const report = execution.package.privacy_report;
        expect(report.text_minimizations).toContainEqual({
            detector_key: "email", redaction_kind: "email", replaced_count: 1,
        });
        expect(JSON.stringify(report)).not.toContain("jane.doe");
    });

    it("no provider or model identity reaches the Decision Package (ADR-2)", async () => {
        const { execution } = await runEndToEnd(okResponse(), "e2e-adr2");
        const blob = JSON.stringify(execution.package);
        expect(blob).not.toContain("fake_local");
        expect(blob).not.toContain("fixture-model");
        expect(blob).not.toContain("v7-fixture");
    });
});

// ---------------------------------------------------------------------------
// 6. No transport, no credential, nothing wired
// ---------------------------------------------------------------------------

describe("P24-6 — the seam introduces no transport and no credential", () => {
    const SRC = "lib/trust/provider/governedProviderExecution.ts";

    it("performs no network call and reads no credential", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        for (const p of [
            /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /@anthropic-ai/, /\bopenai\b/i, /axios/,
            /from\s+"node:https?"/, /process\.env/, /API_KEY/, /Authorization/,
        ]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });

    /**
     * Phase 2.4 asserted the route STILL reached the ungoverned envelope, as
     * proof that building the seam had not silently rerouted live traffic
     * (D-5). Phase 2.8 Gate C is the slice that deliberately reroutes it, so
     * this assertion inverts. That inversion is the phase gate, not a
     * regression — and inverting it is why the control was written as a
     * positive in the first place.
     *
     * What the control actually protects is unchanged and still asserted: this
     * module stays transport-free and capability-free. It never knew about the
     * route, and the route no longer knows about the bypass.
     */
    it("the ungoverned branch is no longer reachable from the route (Gate C), and this module still knows nothing of it", () => {
        const route = readFileSync(join(WEB_ROOT, "app/api/admin/ai/enrich-attention-suggestion/route.ts"), "utf8");
        expect(route).not.toContain("enrichAttentionSuggestionStubEnvelope");
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).not.toContain("enrichAttentionSuggestion");
        expect(src).not.toContain("lib/ai/");
    });

    it("no Communications capability is registered or referenced", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).not.toMatch(/lib\/communications/);
        const registry = readFileSync(join(WEB_ROOT, "lib/trust/registry/trustRegistry.ts"), "utf8");
        expect(registry).not.toContain("communications_inbound");
        expect(registry).not.toContain("governedProviderExecution");
    });

    it("the module owns only execution-control side effects", () => {
        // Phase 2.6 note: this control previously asserted NO `setTimeout`,
        // which encoded D-19 being open. A timer is now the deadline mechanism
        // — an execution-control primitive, not reasoning input — so the
        // assertion is what still matters: no randomness, no identity
        // generation, no I/O, and a clock only as the injectable default.
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).not.toMatch(/Math\.random/);
        expect(src).not.toMatch(/randomUUID/);
        expect(src).not.toMatch(/readFileSync|writeFile/);
        expect(src.split("Date.now").length - 1).toBe(1);
        // The timer must always be cleared — a leaked timer is a resource leak
        // on every fast success.
        expect(src).toContain("clearTimeout(timer)");
    });

    it("the test proof needs no API key and no network", () => {
        // The fake adapter is a closure returning a scripted object. Asserted
        // here so the claim is structural rather than a promise in prose.
        const self = readFileSync(join(WEB_ROOT, "tests/trust/governedProviderExecution.test.ts"), "utf8");
        expect(self).not.toMatch(/\bfetch\s*\(/);
        expect(self).not.toMatch(/process\.env\.[A-Z_]*KEY/);
    });
});
