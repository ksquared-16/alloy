/**
 * Phase 2.5 — provider / model / locality telemetry persistence.
 *
 * Phase 2.4 could KNOW which provider answered, which model, whether inference
 * ran locally and what it reported spending. None of it survived the request.
 * These assertions prove those facts now reach the canonical usage record — and,
 * just as importantly, that a deterministic execution still writes a row that
 * asserts nothing about a provider.
 *
 * Database enforcement is certified separately against real Postgres by
 * `certification/trust-provider-telemetry/run.sh` (14 assertions).
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
    executeGovernedProviderReasoning,
    type ProviderAdapterResponseV1,
    type ProviderAdapterV1,
} from "@/lib/trust/provider/governedProviderExecution";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";

const WEB_ROOT = process.cwd();
const NOW = "2026-08-07T12:00:00.000Z";
const ORG = "org-1";
const CLASS_KEY = "attention_suggestion_enrichment";

// ---------------------------------------------------------------------------

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

const SUGGESTION = {
    primary_reason_code: "no_contact_attempt",
    next_action_key: "send_follow_up",
    template_key: "tpl_1",
    channel: "email",
    reasoning_summary: "No contact attempt recorded.",
    draft_body: "Hello, following up.",
} as const;

const SEMANTIC_MAP: Record<string, InformationClass> = {
    primary_reason_code: "operational",
    next_action_key: "operational",
    template_key: "operational",
    channel: "communications",
    reasoning_summary: "operational",
    draft_body: "communications",
};

type Src = { body: string };
const SPEC: InformationPackageSpecV1<Src> = {
    key: "telemetry_fixture",
    version: "1.0.0",
    decision_class_key: CLASS_KEY,
    source_kind: "communication_messages",
    elements: [{
        key: "inbound_message_text",
        information_class: "communications",
        source_field: "communication_messages.body",
        select: (s) => s.body,
    }],
};

function eligible(): EligibleReasoningInputV1 {
    const pkg = buildInformationPackage({ spec: SPEC, source: { body: "hello" }, sourceRefs: { org_id: ORG } });
    if (!pkg.ok) throw new Error("fixture package failed");
    const e = buildEligibleReasoningInput({ package: pkg.package, policy: ATTENTION_SUGGESTION_MINIMIZATION_V1 });
    if (!e.ok) throw new Error("fixture eligibility failed");
    return e.input;
}

function validOutput() {
    return {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY,
        generated_at_iso: NOW,
        provider_report: { provider_key: "openai", execution_mode: "live" },
    };
}

function fakeAdapter(response: ProviderAdapterResponseV1): ProviderAdapterV1 {
    return { adapter_key: "fake", async execute() { return response; } };
}

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

/**
 * A provider-backed strategy that FORWARDS what the seam normalized.
 *
 * It assembles nothing: identity and usage come straight from
 * `executeGovernedProviderReasoning`. That is the ownership rule — the adapter
 * reports, Trust persists, and nothing in between invents a value.
 */
function providerStrategy(response: ProviderAdapterResponseV1, input: EligibleReasoningInputV1) {
    return {
        key: "telemetry_provider_strategy",
        kind: "large_reasoning" as const,
        version: "1.0.0",
        decision_class_key: CLASS_KEY,
        async reason() {
            const result = await executeGovernedProviderReasoning({
                request: {
                    schema_version: 1,
                    decision_class_key: CLASS_KEY,
                    correlation_id: "corr-1",
                    input,
                    requested_strategy_kind: "large_reasoning",
                    requested_provider_key: "requested_provider",
                    deadline_ms: 5_000,
                },
                adapter: fakeAdapter(response),
            });
            const provider_execution = {
                identity: result.provider_identity,
                ...(result.usage ? { usage: result.usage } : {}),
            };
            if (!result.ok) {
                return { ok: false as const, refusal_code: "REASONING_UNABLE" as const, detail: `provider_failure:${result.failure_code}`, provider_execution };
            }
            return {
                ok: true as const,
                ...(result.usage?.provider_cost_units !== undefined ? { cost_units: result.usage.provider_cost_units } : {}),
                provider_execution,
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

async function runProvider(response: ProviderAdapterResponseV1, correlation: string) {
    const input = eligible();
    override.strategy = providerStrategy(response, input);
    try {
        return await run({ eligibleReasoningInput: input }, correlation);
    } finally {
        override.strategy = null;
    }
}

async function run(over: Partial<Parameters<typeof executeDecisionContract>[0]> = {}, correlation = "c1") {
    const harness = makeRepo();
    const execution = await executeDecisionContract({
        contract: createDecisionContract({
            org_id: ORG,
            decision_class_key: CLASS_KEY,
            intent: "telemetry certification",
            context: { surface: "certification" },
            correlation_id: correlation,
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "system",
            nowIso: NOW,
        }).contract as DecisionContractV1,
        resolvedInformation: { deterministic_attention_suggestion: SUGGESTION },
        semanticMap: SEMANTIC_MAP,
        repository: harness.repository,
        nowIso: NOW,
        clock: () => 0,
        ...over,
    });
    return { ...harness, execution };
}

const REMOTE = {
    provider_key: "openai_compatible",
    model_key: "gpt-x",
    model_version: "v9",
    execution_location: "remote" as const,
};

// ---------------------------------------------------------------------------
// 1. Deterministic rows assert nothing
// ---------------------------------------------------------------------------

describe("P25-1 — deterministic execution writes no provider identity", () => {
    it("a deterministic decision still writes a valid usage row", async () => {
        const { execution, usage } = await run({}, "det-1");
        expect(execution.package.outcome).toBe("recommended");
        expect(usage).toHaveLength(1);
        expect(usage[0]!.strategy_kind).toBe("deterministic");
    });

    it("every provider field is ABSENT, not null-filled and not zero-filled", async () => {
        const { usage } = await run({}, "det-2");
        const row = usage[0]!;
        for (const key of [
            "provider_key", "model_key", "model_version", "execution_location",
            "input_units", "output_units", "provider_reported_cost_units",
        ] as const) {
            expect(row[key], key).toBeUndefined();
        }
        // The strategy-measured cost keeps its old always-present semantics.
        expect(row.provider_cost_units).toBe(0);
    });

    it("no fake identity is manufactured for a deterministic row", async () => {
        const { usage } = await run({}, "det-3");
        expect(JSON.stringify(usage[0])).not.toContain("provider_key");
        expect(JSON.stringify(usage[0])).not.toContain("unknown");
    });
});

// ---------------------------------------------------------------------------
// 2. Provider execution persists identity
// ---------------------------------------------------------------------------

describe("P25-2 — provider, model and locality persist independently", () => {
    it("a remote provider execution persists all four dimensions", async () => {
        const { usage } = await runProvider(
            { ok: true, output: validOutput(), provider_identity: REMOTE },
            "prov-1",
        );
        const row = usage[0]!;
        expect(row.provider_key).toBe("openai_compatible");
        expect(row.model_key).toBe("gpt-x");
        expect(row.model_version).toBe("v9");
        expect(row.execution_location).toBe("remote");
        // Reasoning kind is NOT duplicated — it stays in strategy_kind.
        expect(row.strategy_kind).toBe("large_reasoning");
    });

    it("model identity is null when the provider did not say, while provider persists", async () => {
        const { usage } = await runProvider(
            { ok: true, output: validOutput(), provider_identity: { provider_key: "p", execution_location: "remote" } },
            "prov-2",
        );
        expect(usage[0]!.provider_key).toBe("p");
        expect(usage[0]!.model_key).toBeNull();
        expect(usage[0]!.model_version).toBeNull();
    });

    it("a LOCAL model persists as model reasoning + local execution", async () => {
        const { usage } = await runProvider(
            {
                ok: true,
                output: validOutput(),
                provider_identity: { provider_key: "ollama_local", model_key: "llama-x", execution_location: "local" },
            },
            "prov-3",
        );
        expect(usage[0]!.execution_location).toBe("local");
        // Locality does NOT make it deterministic — the kind is untouched.
        expect(usage[0]!.strategy_kind).toBe("large_reasoning");
    });

    it("`unknown` locality persists as unknown, never inferred from the provider name", async () => {
        const { usage } = await runProvider(
            {
                ok: true,
                output: validOutput(),
                provider_identity: { provider_key: "localhost_sounding_name", execution_location: "unknown" },
            },
            "prov-4",
        );
        expect(usage[0]!.execution_location).toBe("unknown");
    });

    it("identity persists on a provider FAILURE too", async () => {
        const { execution, usage } = await runProvider(
            { ok: false, failure_code: "timeout", provider_identity: REMOTE },
            "prov-5",
        );
        expect(execution.package.outcome).toBe("failed_reasoning");
        expect(usage[0]!.provider_key).toBe("openai_compatible");
        expect(usage[0]!.execution_location).toBe("remote");
    });
});

// ---------------------------------------------------------------------------
// 3. Usage — present persists, absent stays absent
// ---------------------------------------------------------------------------

describe("P25-3 — usage is recorded when reported and left absent when not", () => {
    it("reported usage persists", async () => {
        const { usage } = await runProvider(
            {
                ok: true,
                output: validOutput(),
                provider_identity: REMOTE,
                usage: { input_units: 120, output_units: 34, provider_cost_units: 0.0042 },
            },
            "usage-1",
        );
        expect(usage[0]!.input_units).toBe(120);
        expect(usage[0]!.output_units).toBe(34);
        expect(usage[0]!.provider_reported_cost_units).toBe(0.0042);
    });

    it("absent usage is NULL, never zero — a provider that said nothing measured nothing", async () => {
        const { usage } = await runProvider(
            { ok: true, output: validOutput(), provider_identity: REMOTE },
            "usage-2",
        );
        expect(usage[0]!.input_units).toBeNull();
        expect(usage[0]!.output_units).toBeNull();
        expect(usage[0]!.provider_reported_cost_units).toBeNull();
        // …while the strategy-measured cost is still a real 0.
        expect(usage[0]!.provider_cost_units).toBe(0);
    });

    it("provider-reported cost is distinct from strategy-measured cost", async () => {
        const { usage } = await runProvider(
            {
                ok: true,
                output: validOutput(),
                provider_identity: REMOTE,
                usage: { provider_cost_units: 0.25 },
            },
            "usage-3",
        );
        const row = usage[0]!;
        // Same number here because the fixture strategy forwards it, but they are
        // separate columns with separate meanings — one is NOT NULL DEFAULT 0,
        // the other is nullable precisely so "unreported" stays expressible.
        expect(row.provider_reported_cost_units).toBe(0.25);
        expect(row.provider_cost_units).toBe(0.25);
    });

    it("a provider that reports usage but fails still records what it spent", async () => {
        const { usage } = await runProvider(
            { ok: false, failure_code: "timeout", provider_identity: REMOTE, usage: { input_units: 99 } },
            "usage-4",
        );
        expect(usage[0]!.input_units).toBe(99);
        expect(usage[0]!.output_units).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 4. Linkage, ownership and read path
// ---------------------------------------------------------------------------

describe("P25-4 — linkage intact, no duplicate ledger, adapter writes nothing", () => {
    it("the usage row still links its contract and org", async () => {
        const { execution, usage } = await runProvider(
            { ok: true, output: validOutput(), provider_identity: REMOTE },
            "link-1",
        );
        expect(usage[0]!.contract_id).toBe(execution.package.contract_id);
        expect(usage[0]!.org_id).toBe(ORG);
        expect(usage[0]!.decision_class_key).toBe(CLASS_KEY);
    });

    it("exactly ONE usage row per execution — no parallel provider ledger", async () => {
        const { usage } = await runProvider(
            { ok: true, output: validOutput(), provider_identity: REMOTE },
            "link-2",
        );
        expect(usage).toHaveLength(1);
        const repo = readFileSync(join(WEB_ROOT, "lib/trust/persistence/trustDecisionRepository.ts"), "utf8");
        // One usage table, still.
        expect(repo.split('from("trust_reasoning_usage")').length - 1).toBe(1);
        expect(repo).not.toMatch(/provider_usage|provider_ledger|trust_provider_/);
    });

    it("the adapter never writes telemetry — only the repository does", () => {
        const seam = readFileSync(join(WEB_ROOT, "lib/trust/provider/governedProviderExecution.ts"), "utf8");
        expect(seam).not.toContain("insertReasoningUsage");
        expect(seam).not.toContain("TrustRepository");
        expect(seam).not.toContain("supabase");
    });

    it("normalization is not duplicated — the runtime forwards, it does not re-derive", () => {
        const runtime = readFileSync(join(WEB_ROOT, "lib/trust/runtime/trustRuntime.ts"), "utf8");
        expect(runtime).toContain("providerExecution = reasoning.provider_execution ?? null;");
        // No second parsing of provider facts anywhere in the runtime.
        expect(runtime).not.toContain("normalizeUsage");
        expect(runtime).not.toContain("isValidIdentity");
    });

    it("no provider or model identity leaks into the Decision Package (ADR-2)", async () => {
        const { execution } = await runProvider(
            { ok: true, output: validOutput(), provider_identity: REMOTE },
            "link-3",
        );
        const blob = JSON.stringify(execution.package);
        expect(blob).not.toContain("openai_compatible");
        expect(blob).not.toContain("gpt-x");
        expect(blob).not.toContain("v9");
    });

    it("the migration is additive and preserves the table's guarantees", () => {
        const sql = readFileSync(
            join(WEB_ROOT, "..", "supabase/migrations/20260807210000_trust_provider_telemetry.sql"),
            "utf8",
        );
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS");
        // Nothing destructive, nothing weakened.
        expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|ALTER COLUMN .* SET NOT NULL|DISABLE ROW LEVEL SECURITY/);
        expect(sql).not.toMatch(/DROP TRIGGER (?!IF EXISTS trg_)/);
        expect(sql).not.toMatch(/DROP INDEX/);
        // No backfill of guessed history (D-22).
        expect(sql).not.toMatch(/UPDATE public\.trust_reasoning_usage/);
    });
});

// ---------------------------------------------------------------------------
// 5. Nothing else moved
// ---------------------------------------------------------------------------

describe("P25-5 — no provider activated, OI still reads, Processing untouched", () => {
    it("no real provider, credential or transport was introduced", () => {
        for (const rel of [
            "lib/trust/runtime/trustRuntime.ts",
            "lib/trust/persistence/trustDecisionRepository.ts",
            "lib/trust/provider/governedProviderExecution.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, rel), "utf8");
            for (const p of [/\bfetch\s*\(/, /@anthropic-ai/, /axios/, /process\.env/, /API_KEY/]) {
                expect(src, `${rel} matched ${p}`).not.toMatch(p);
            }
        }
    });

    it("the OI usage query still selects successfully alongside the new columns", () => {
        const resolver = readFileSync(join(WEB_ROOT, "lib/metrics/resolvers/trustMetrics.ts"), "utf8");
        // A narrow explicit column list, so added columns cannot disturb it.
        expect(resolver).toContain("escalation_level, latency_ms, provider_cost_units, decision_class_key");
    });

    it("OI metric descriptions no longer claim the schema cannot record provider identity", () => {
        const registry = readFileSync(join(WEB_ROOT, "lib/metrics/registry.ts"), "utf8");
        expect(registry).not.toContain("the schema records no provider identity");
        expect(registry).not.toContain("NOT distinguishable from deterministic in the current schema");
    });

    it("no Communications module is touched", () => {
        for (const rel of [
            "lib/trust/runtime/trustRuntime.ts",
            "lib/trust/persistence/trustDecisionRepository.ts",
        ]) {
            expect(readFileSync(join(WEB_ROOT, rel), "utf8")).not.toMatch(/lib\/communications/);
        }
    });

    it("Phase 2.6 CLOSED D-19 — the seam now enforces its own deadline", () => {
        // This control asserted the ABSENCE of a timeout wall while D-19 was an
        // open activation gate. Phase 2.6 closed it, so the assertion is
        // inverted rather than deleted: the guarantee is now that the wall
        // exists, and telemetry semantics below are unchanged by it.
        const seam = readFileSync(join(WEB_ROOT, "lib/trust/provider/governedProviderExecution.ts"), "utf8");
        expect(seam).toMatch(/Promise\.race/);
        expect(seam).toMatch(/AbortController/);
        expect(seam).toContain("clearTimeout(timer)");
    });
});
