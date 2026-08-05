/**
 * Phase 0 Slice 0.7 — non-zero provider cost representability.
 *
 * The database has always accepted a non-zero decimal `provider_cost_units`;
 * Slice 0.6 certified that it round-trips and aggregates. The remaining gate was
 * TypeScript: the package economics type pinned cost to the literal `0`, so a
 * provider-backed strategy had no way to report what it spent.
 *
 * This suite proves the gate is open and still safe:
 *
 *  - zero remains the default and deterministic strategies still record it;
 *  - a measured positive decimal reaches both the package and the usage row;
 *  - negative, NaN, Infinity and non-numeric costs are REFUSED, never clamped;
 *  - the Decision Package stays provider-independent — a unit count, never an
 *    identity, a price or a credential.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.7
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Strategy selection is a module-level registry, so a synthetic provider-style
 * strategy is driven through the REAL runtime by overriding selection for this
 * file only. The closed V1 registry is untouched.
 */
const override = vi.hoisted(() => ({ strategy: null as unknown }));

vi.mock("@/lib/trust/strategy/strategyEngine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/trust/strategy/strategyEngine")>();
    return {
        ...actual,
        selectStrategy: (decisionClass: Parameters<typeof actual.selectStrategy>[0]) =>
            override.strategy
                ? { ok: true as const, strategy: override.strategy as ReasoningStrategyV1, escalation_level: 3 }
                : actual.selectStrategy(decisionClass),
    };
});

import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { DecisionContractLifecycleState, DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import {
    COST_UNITS_REJECTION_REASONS,
    isValidProviderCostUnits,
    parseProviderCostUnits,
    ZERO_COST_UNITS,
} from "@/lib/trust/economics/providerCostUnits";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type {
    ReasoningUsageInput,
    TrustObservationInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";
import type { ReasoningOutcome, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import { attentionSuggestionEnrichmentDeterministicStrategy } from "@/lib/trust/reasoning/strategies/attentionSuggestionEnrichmentDeterministic";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import { computeCostUnits } from "@/lib/metrics/resolvers/trustMetrics";

const WEB_ROOT = join(__dirname, "..", "..");
const NOW = "2026-08-04T12:00:00.000Z";
const ORG = "11111111-1111-1111-1111-111111111111";

function createRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const observations: TrustObservationInput[] = [];
    const usage: ReasoningUsageInput[] = [];
    const lifecycle: DecisionContractLifecycleState[] = [];

    const repository: TrustRepository = {
        async insertContract(c) {
            contracts.push(c);
        },
        async advanceContractLifecycle({ lifecycle_state }) {
            lifecycle.push(lifecycle_state);
        },
        async insertPackage(p) {
            packages.push(p);
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

const RESOLVED_INFORMATION = {
    deterministic_attention_suggestion: {
        primary_reason_code: "no_contact_attempt",
        next_action_key: "send_follow_up",
        template_key: "follow_up_v1",
        channel: "sms",
        reasoning_summary: "No contact attempt recorded.",
        draft_body: "Hi Dana, checking in about Ellis.",
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

async function runDecision(correlation: string) {
    const harness = createRepository();
    const built = createDecisionContract({
        org_id: ORG,
        decision_class_key: ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY,
        intent: "Slice 0.7 cost certification.",
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

/** A provider-style strategy: same proposal, but it reports a measured cost. */
function costingStrategy(cost: unknown, ok = true): ReasoningStrategyV1 {
    return {
        ...attentionSuggestionEnrichmentDeterministicStrategy,
        key: "synthetic_provider_backed",
        kind: "large_reasoning",
        async reason(input): Promise<ReasoningOutcome> {
            await new Promise((resolve) => setTimeout(resolve, 1));
            if (!ok) {
                return {
                    ok: false,
                    refusal_code: "REASONING_UNABLE",
                    detail: "synthetic decline",
                    cost_units: cost as number,
                };
            }
            const base = attentionSuggestionEnrichmentDeterministicStrategy.reason(input) as ReasoningOutcome;
            return { ...base, cost_units: cost as number } as ReasoningOutcome;
        },
    };
}

beforeEach(() => {
    override.strategy = null;
});

// ---------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------

describe("provider cost units validation", () => {
    it("accepts zero, small decimals and ordinary positives", () => {
        for (const value of [0, 0.000125, 0.5, 1, 3.750125, 12345.6789]) {
            const parsed = parseProviderCostUnits(value);
            expect(parsed.ok).toBe(true);
            if (parsed.ok) expect(parsed.value).toBe(value);
        }
    });

    it("treats omission as zero, preserving the pre-existing default", () => {
        for (const absent of [undefined, null]) {
            const parsed = parseProviderCostUnits(absent);
            expect(parsed.ok).toBe(true);
            if (parsed.ok) expect(parsed.value).toBe(ZERO_COST_UNITS);
        }
    });

    it("rejects negative values — reasoning cannot refund", () => {
        for (const value of [-1, -0.0001, -Number.MIN_VALUE]) {
            const parsed = parseProviderCostUnits(value);
            expect(parsed.ok).toBe(false);
            if (!parsed.ok) expect(parsed.reason).toBe("negative");
        }
    });

    it("rejects NaN and both infinities", () => {
        expect(parseProviderCostUnits(Number.NaN)).toMatchObject({ ok: false, reason: "not_a_number" });
        expect(parseProviderCostUnits(Number.POSITIVE_INFINITY)).toMatchObject({ ok: false, reason: "not_finite" });
        expect(parseProviderCostUnits(Number.NEGATIVE_INFINITY)).toMatchObject({ ok: false, reason: "not_finite" });
    });

    it("rejects non-numeric values, including anything price-shaped", () => {
        for (const value of ["1.25", { amount: 1.25, currency: "USD" }, [1.25], true, () => 1.25]) {
            const parsed = parseProviderCostUnits(value);
            expect(parsed.ok).toBe(false);
            if (!parsed.ok) expect(parsed.reason).toBe("not_a_number");
        }
    });

    it("never silently clamps an invalid value to zero", () => {
        for (const invalid of [-5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
            const parsed = parseProviderCostUnits(invalid);
            expect(parsed.ok).toBe(false);
            // A rejection carries no value at all — there is nothing to mistake
            // for a legitimate zero.
            expect(parsed).not.toHaveProperty("value");
        }
    });

    it("every declared rejection reason is reachable", () => {
        const seen = new Set<string>();
        for (const value of ["x", Number.NaN, Number.POSITIVE_INFINITY, -1]) {
            const parsed = parseProviderCostUnits(value);
            if (!parsed.ok) seen.add(parsed.reason);
        }
        expect([...seen].sort()).toEqual([...COST_UNITS_REJECTION_REASONS].sort());
    });

    it("isValidProviderCostUnits agrees with the parser", () => {
        expect(isValidProviderCostUnits(0.25)).toBe(true);
        expect(isValidProviderCostUnits(-1)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Runtime behaviour
// ---------------------------------------------------------------------------

describe("runtime cost behaviour", () => {
    it("deterministic execution still records exactly zero, on both package and usage", async () => {
        const { execution, usage } = await runDecision("cost-zero");
        expect(execution.package.outcome).toBe("recommended");
        expect(execution.package.economics.provider_cost_units).toBe(0);
        expect(usage[0]!.provider_cost_units).toBe(0);
    });

    it("a provider-style strategy's measured cost reaches the package and the usage row", async () => {
        override.strategy = costingStrategy(0.000125);
        const { execution, usage } = await runDecision("cost-positive");

        expect(execution.package.outcome).toBe("recommended");
        expect(execution.package.economics.provider_cost_units).toBe(0.000125);
        // Package and usage carry the SAME measured cost — one number, two records.
        expect(usage[0]!.provider_cost_units).toBe(0.000125);
    });

    it("cost survives an ordinary decimal without drift", async () => {
        override.strategy = costingStrategy(3.750125);
        const { execution } = await runDecision("cost-decimal");
        expect(execution.package.economics.provider_cost_units).toBe(3.750125);
    });

    it("a strategy that reports no cost still records zero", async () => {
        override.strategy = costingStrategy(undefined);
        const { execution, usage } = await runDecision("cost-omitted");
        expect(execution.package.economics.provider_cost_units).toBe(0);
        expect(usage[0]!.provider_cost_units).toBe(0);
    });

    it("a declining strategy may still report what it spent", async () => {
        override.strategy = costingStrategy(0.25, false);
        const { execution, usage } = await runDecision("cost-on-refusal");

        expect(execution.package.outcome).toBe("failed_reasoning");
        expect(execution.package.explanation).toContain("synthetic decline");
        // A provider call that failed still cost something.
        expect(execution.package.economics.provider_cost_units).toBe(0.25);
        expect(usage[0]!.provider_cost_units).toBe(0.25);
    });

    it("an invalid cost fails closed — refused, never persisted, never clamped", async () => {
        for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1.25"]) {
            override.strategy = costingStrategy(invalid);
            const { execution, packages, usage } = await runDecision(`cost-invalid-${String(invalid)}`);

            expect(execution.package.outcome).toBe("failed_reasoning");
            expect(execution.package.explanation).toContain("unusable provider cost");
            // Exactly one package, and the persisted cost is zero — the invalid
            // number never reached the database.
            expect(packages).toHaveLength(1);
            expect(packages[0]!.economics.provider_cost_units).toBe(0);
            expect(usage[0]!.provider_cost_units).toBe(0);
            expect(Number.isFinite(usage[0]!.provider_cost_units)).toBe(true);
        }
    });

    it("an invalid cost on a declining strategy keeps the strategy's own reason", async () => {
        override.strategy = costingStrategy(Number.NaN, false);
        const { execution } = await runDecision("cost-invalid-and-declined");
        expect(execution.package.explanation).toContain("unusable provider cost");
        expect(execution.package.explanation).toContain("synthetic decline");
    });

    it("serialization preserves the numeric value exactly", async () => {
        override.strategy = costingStrategy(0.000125);
        const { execution } = await runDecision("cost-serialize");
        const round = JSON.parse(JSON.stringify(execution.package)) as DecisionPackageV1;
        expect(round.economics.provider_cost_units).toBe(0.000125);
        expect(typeof round.economics.provider_cost_units).toBe("number");
    });

    it("prior behaviour is unchanged when cost is zero", async () => {
        const a = await runDecision("cost-baseline-a");
        override.strategy = costingStrategy(0);
        const b = await runDecision("cost-baseline-b");
        // Both record zero; the widening changed no value on the existing path.
        expect(a.execution.package.economics.provider_cost_units).toBe(0);
        expect(b.execution.package.economics.provider_cost_units).toBe(0);
        expect(a.execution.package.outcome).toBe("recommended");
    });
});

// ---------------------------------------------------------------------------
// Ownership boundary and OI consumption
// ---------------------------------------------------------------------------

describe("cost ownership boundary", () => {
    it("the PLATFORM's package contract remains provider-independent", async () => {
        override.strategy = costingStrategy(1.5);
        const { execution } = await runDecision("cost-adr2");

        // Economics carries a unit COUNT and the strategy's own identity — never
        // a provider's, and never a price.
        expect(Object.keys(execution.package.economics).sort()).toEqual(
            ["cache_utilized", "escalation_level", "latency_ms", "provider_cost_units", "strategy_key", "strategy_kind"].sort(),
        );
        expect(typeof execution.package.economics.provider_cost_units).toBe("number");

        // Every platform-owned field of the package, excluding the opaque
        // capability payload, is free of provider identity and pricing.
        const { recommendation: _capabilityPayload, ...platformOwned } = execution.package;
        const serialized = JSON.stringify(platformOwned).toLowerCase();
        for (const forbidden of ["provider_key", "provider_name", "model_id", "model_name", "openai", "anthropic", "api_key", "currency", "usd", "price"]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it("PRE-EXISTING: a capability's own payload can still embed a provider label", async () => {
        override.strategy = costingStrategy(1.5);
        const { execution } = await runDecision("cost-adr2-payload");

        // `AttentionSuggestionAiEnrichmentV1.provider_report` predates this
        // program and lives on staging: it is the capability's operator-facing
        // output schema, carried inside the opaque `recommendation` jsonb the
        // platform never interprets.
        //
        // Recorded, not fixed. ADR-2 governs the PLATFORM contract, and the
        // platform cannot enforce what a capability puts in its own payload —
        // that is a capability-owned schema change, out of scope for a cost
        // representability slice.
        const payload = JSON.stringify(execution.package.recommendation);
        expect(payload).toContain("provider_report");
        // It reports the execution mode, never a credential or a real vendor.
        expect(payload).toContain("stub");
        expect(payload).not.toContain("api_key");
        expect(payload).not.toContain("sk-");
    });

    it("the package economics type carries no provider or pricing field", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/package/decisionPackageTypes.ts"), "utf8");
        for (const forbidden of ["provider_key", "provider_name", "model_id", "currency", "amount", "price", "invoice"]) {
            expect(`package types declare ${src.includes(`readonly ${forbidden}`) ? forbidden : "no provider or pricing field"}`).toBe(
                "package types declare no provider or pricing field",
            );
        }
    });

    it("no money library or pricing machinery was introduced", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/economics/providerCostUnits.ts"), "utf8");
        // The validator is pure: it imports nothing at all, so it cannot have
        // pulled in a decimal or currency framework.
        expect(src).not.toMatch(/^import\s/m);

        const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        for (const money of ["dinero.js", "decimal.js", "big.js", "bignumber.js", "currency.js", "money"]) {
            expect(deps).not.toContain(money);
        }
    });

    it("the OI Trust cost metric consumes the persisted value with no new adapter", () => {
        // Slice 0.6's aggregator, unchanged, reading what Slice 0.7 now persists.
        const aggregated = computeCostUnits([
            { escalation_level: 3, latency_ms: 1, provider_cost_units: 0.000125, decision_class_key: "c" },
            { escalation_level: 3, latency_ms: 1, provider_cost_units: "1.25", decision_class_key: "c" },
            { escalation_level: 0, latency_ms: 1, provider_cost_units: 2.5, decision_class_key: "c" },
        ]);
        expect(aggregated.total).toBe(3.750125);
        expect(aggregated.nonZeroRows).toBe(3);
    });

    it("the database needs no migration — the column is already numeric", () => {
        const migration = readFileSync(
            join(WEB_ROOT, "..", "supabase", "migrations", "20260802090000_trust_runtime_v1_foundation.sql"),
            "utf8",
        );
        expect(migration).toContain("provider_cost_units numeric NOT NULL DEFAULT 0");
    });
});
