/**
 * Phase 0 Slice 0.6 — Trust execution measurement.
 *
 * Certifies that governed reasoning is measurable through the EXISTING
 * Operational Intelligence platform, with no parallel analytics path and no
 * provider data in a Decision Package.
 *
 * The three claims this suite exists to defend:
 *
 *  1. **Requested is not completed, accepted is not executed, and a governed
 *     refusal is not a failure.** Each pair is measured from a different source
 *     and asserted distinct.
 *  2. **Provider economics come from the usage record only (ADR-2).** No
 *     resolver opens a package recommendation, and the Decision Package
 *     contracts stay provider-independent.
 *  3. **Site scope is unsupported, loudly.** No Trust table carries site
 *     linkage, so a narrowed scope returns null with a reason rather than the
 *     org-wide number wearing a site label.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.6
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PACK_TO_BUSINESS_PROCESS } from "@/lib/analytics/calculations/types";
import { findOperationalCalculation, listOperationalCalculations } from "@/lib/analytics/calculations/registry";
import { resolveSingleMetric } from "@/lib/metrics/metricEngine";
import { listAvailableMetricPacks, getMetricPack, validateMetricPackRegistry } from "@/lib/metrics/packs";
import { findUnknownMetricKeys, getMetricDefinition, isKnownOipMetricKey, listMetricDefinitions, parseOipMetricKeys } from "@/lib/metrics/registry";
import {
    computeCommittedExecutions,
    computeCostUnits,
    computeDeterministicResolution,
    computeLatencyP50Ms,
    computeOutcomeMix,
    countByDecisionClass,
    GOVERNED_REFUSAL_OUTCOMES,
    rateOf,
    REASONING_FAILURE_OUTCOMES,
    TRUST_METRIC_ROW_CAP,
    trustScopeIsUnsupported,
} from "@/lib/metrics/resolvers/trustMetrics";
import type { MetricResolveContext, OipMetricKey } from "@/lib/metrics/types";

const WEB_ROOT = join(__dirname, "..", "..");
const ORG_A = "org-a";
const ORG_B = "org-b";
const NOW = new Date("2026-08-04T12:00:00.000Z");

export const TRUST_METRIC_KEYS: readonly OipMetricKey[] = [
    "trust.governed_decisions_created",
    "trust.governed_decisions_completed",
    "trust.recommendation_rate",
    "trust.governed_refusal_rate",
    "trust.reasoning_failure_rate",
    "trust.deterministic_resolution_rate",
    "trust.escalated_decision_count",
    "trust.reasoning_latency_p50",
    "trust.provider_cost_units",
    "trust.executions_committed_count",
];

// ---------------------------------------------------------------------------
// A fake PostgREST that enforces org scoping and window bounds, so a resolver
// that forgets either is caught rather than quietly answering.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Tables = Partial<Record<string, Row[]>>;

type Recorded = { table: string; filters: Record<string, unknown>; limit: number | null; head: boolean };

function fakeSupabase(tables: Tables, recorded: Recorded[] = []) {
    function builder(table: string, head: boolean) {
        const filters: Record<string, unknown> = {};
        const gte: Record<string, string> = {};
        const lte: Record<string, string> = {};
        let limit: number | null = null;

        const rows = () => {
            let out = [...(tables[table] ?? [])];
            for (const [col, val] of Object.entries(filters)) out = out.filter((r) => r[col] === val);
            for (const [col, val] of Object.entries(gte)) out = out.filter((r) => String(r[col]) >= val);
            for (const [col, val] of Object.entries(lte)) out = out.filter((r) => String(r[col]) <= val);
            if (limit !== null) out = out.slice(0, limit);
            return out;
        };

        const api = {
            eq(col: string, val: unknown) {
                filters[col] = val;
                return api;
            },
            gte(col: string, val: string) {
                gte[col] = val;
                return api;
            },
            lte(col: string, val: string) {
                lte[col] = val;
                return api;
            },
            limit(n: number) {
                limit = n;
                return api;
            },
            then(resolve: (v: unknown) => unknown) {
                recorded.push({ table, filters: { ...filters }, limit, head });
                const data = rows();
                return Promise.resolve(
                    head ? { count: data.length, error: null } : { data, error: null },
                ).then(resolve);
            },
        };
        return api;
    }

    return {
        from(table: string) {
            return {
                select(_cols: string, opts?: { head?: boolean }) {
                    return builder(table, opts?.head === true);
                },
            };
        },
    } as unknown as MetricResolveContext["supabase"];
}

function ctxFor(
    tables: Tables,
    over: Partial<MetricResolveContext> = {},
    recorded: Recorded[] = [],
): MetricResolveContext {
    return {
        supabase: fakeSupabase(tables, recorded),
        orgId: ORG_A,
        scope: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] },
        window: "rolling_30d",
        mode: "live",
        now: NOW,
        ...over,
    } as MetricResolveContext;
}

const inWindow = "2026-08-01T00:00:00.000Z";
const beforeWindow = "2026-06-01T00:00:00.000Z";

const pkg = (outcome: string, org = ORG_A, created = inWindow) => ({
    org_id: org,
    outcome,
    created_at: created,
});
const usage = (
    over: Partial<{ escalation_level: number; latency_ms: number; provider_cost_units: number | string; decision_class_key: string; org_id: string; recorded_at: string }> = {},
) => ({
    org_id: ORG_A,
    escalation_level: 0,
    latency_ms: 1000,
    provider_cost_units: 0,
    decision_class_key: "cls",
    recorded_at: inWindow,
    ...over,
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("registration", () => {
    it("registers every Trust metric key exactly once, in the registry and the pack", () => {
        for (const key of TRUST_METRIC_KEYS) {
            expect(isKnownOipMetricKey(key)).toBe(true);
            expect(getMetricDefinition(key).pack).toBe("trust");
        }
        const registered = listMetricDefinitions().filter((d) => d.pack === "trust").map((d) => d.key);
        expect(registered.sort()).toEqual([...TRUST_METRIC_KEYS].sort());
        expect(new Set(registered).size).toBe(TRUST_METRIC_KEYS.length);

        const pack = getMetricPack("trust");
        expect(pack).toBeDefined();
        expect([...(pack!.metricKeys ?? [])].sort()).toEqual([...TRUST_METRIC_KEYS].sort());
        expect(validateMetricPackRegistry()).toEqual([]);
    });

    it("the Trust pack is available and ordered", () => {
        const available = listAvailableMetricPacks().map((p) => p.key);
        expect(available).toContain("trust");
    });

    it("every Trust metric has an analytics calculation — no registry is bypassed", () => {
        for (const key of TRUST_METRIC_KEYS) {
            const calc = findOperationalCalculation(key);
            expect(calc).not.toBeNull();
            // Org grain only: no Trust table carries site or department linkage.
            expect(calc!.grains).toEqual(["org"]);
            expect(calc!.accessScope).toBe("org");
            expect(calc!.businessProcess).toBe("operational_health");
        }
        const trustCalcs = listOperationalCalculations().filter((c) => c.key.startsWith("trust."));
        expect(trustCalcs).toHaveLength(TRUST_METRIC_KEYS.length);
    });

    it("Trust is a metric pack, not a fabricated Business Process", () => {
        expect(PACK_TO_BUSINESS_PROCESS.trust).toBe("operational_health");
        // Nothing named `trust` may appear in the business-process vocabulary.
        expect(Object.values(PACK_TO_BUSINESS_PROCESS)).not.toContain("trust");
    });

    it("unknown Trust keys fail through existing API behaviour", () => {
        expect(isKnownOipMetricKey("trust.not_a_metric")).toBe(false);
        expect(parseOipMetricKeys("trust.not_a_metric")).toEqual([]);
        expect(findUnknownMetricKeys("trust.recommendation_rate,trust.bogus")).toEqual(["trust.bogus"]);
    });

    it("every Trust metric declares its source table and org-only scope", () => {
        for (const key of TRUST_METRIC_KEYS) {
            const def = getMetricDefinition(key);
            expect(def.sources.length).toBeGreaterThan(0);
            for (const source of def.sources) expect(source.startsWith("trust_")).toBe(true);
            expect(def.orgScopeOnly).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

describe("metric correctness", () => {
    it("outcome mix separates recommendations, governed refusals and failures", () => {
        const mix = computeOutcomeMix([
            { outcome: "recommended" },
            { outcome: "recommended" },
            { outcome: "refused_policy" },
            { outcome: "refused_privacy" },
            { outcome: "failed_validation" },
        ]);
        expect(mix).toMatchObject({ total: 5, recommended: 2, governedRefusals: 2, reasoningFailures: 1 });
    });

    it("governed refusal outcomes and reasoning failure outcomes are disjoint", () => {
        for (const refusal of GOVERNED_REFUSAL_OUTCOMES) {
            expect(REASONING_FAILURE_OUTCOMES).not.toContain(refusal);
        }
        // A provider being unavailable is an availability event, not a refusal.
        expect(GOVERNED_REFUSAL_OUTCOMES).not.toContain("provider_unavailable");
    });

    it("rates define their denominator and return null on an empty cohort", () => {
        expect(rateOf(1, 4)).toBe(0.25);
        expect(rateOf(0, 4)).toBe(0);
        expect(rateOf(0, 0)).toBeNull();
    });

    it("deterministic resolution counts escalation level zero only", () => {
        const d = computeDeterministicResolution([
            { escalation_level: 0, latency_ms: 1, provider_cost_units: 0, decision_class_key: "a" },
            { escalation_level: 0, latency_ms: 1, provider_cost_units: 0, decision_class_key: "a" },
            { escalation_level: 3, latency_ms: 1, provider_cost_units: 0, decision_class_key: "b" },
        ]);
        expect(d).toMatchObject({ total: 3, deterministic: 2, escalated: 1 });
        expect(d.byEscalationLevel).toEqual({ "0": 2, "3": 1 });
    });

    it("median latency handles odd and even samples, and empty", () => {
        const rows = (values: number[]) =>
            values.map((v) => ({ escalation_level: 0, latency_ms: v, provider_cost_units: 0, decision_class_key: "c" }));
        expect(computeLatencyP50Ms(rows([10, 30, 20]))).toBe(20);
        expect(computeLatencyP50Ms(rows([10, 20, 30, 40]))).toBe(25);
        expect(computeLatencyP50Ms([])).toBeNull();
    });

    it("cost aggregation preserves non-zero decimals, from string or number", () => {
        const cost = computeCostUnits([
            { escalation_level: 0, latency_ms: 0, provider_cost_units: "0.125", decision_class_key: "c" },
            { escalation_level: 0, latency_ms: 0, provider_cost_units: 0.375, decision_class_key: "c" },
            { escalation_level: 0, latency_ms: 0, provider_cost_units: 0, decision_class_key: "c" },
        ]);
        expect(cost.total).toBe(0.5);
        expect(cost.nonZeroRows).toBe(2);
    });

    it("duplicate execution observations do not inflate the count", () => {
        const executions = computeCommittedExecutions([
            { package_id: "p1" },
            { package_id: "p1" },
            { package_id: "p2" },
        ]);
        expect(executions.distinctPackages).toBe(2);
        expect(executions.observationRows).toBe(3);
    });

    it("counts by decision class without losing unknowns", () => {
        expect(
            countByDecisionClass([
                { escalation_level: 0, latency_ms: 0, provider_cost_units: 0, decision_class_key: "a" },
                { escalation_level: 0, latency_ms: 0, provider_cost_units: 0, decision_class_key: null },
            ]),
        ).toEqual({ a: 1, unknown: 1 });
    });
});

// ---------------------------------------------------------------------------
// Resolver behaviour through the Metric Engine
// ---------------------------------------------------------------------------

describe("resolution through the Metric Engine", () => {
    const packages = [
        pkg("recommended"),
        pkg("recommended"),
        pkg("refused_policy"),
        pkg("failed_reasoning"),
        pkg("recommended", ORG_B),
        pkg("recommended", ORG_A, beforeWindow),
    ];

    it("requested is measured from contracts, completed from packages", async () => {
        const tables: Tables = {
            trust_decision_contracts: [
                { org_id: ORG_A, created_at: inWindow },
                { org_id: ORG_A, created_at: inWindow },
                { org_id: ORG_A, created_at: inWindow },
                { org_id: ORG_B, created_at: inWindow },
            ],
            trust_decision_packages: packages,
        };
        const created = await resolveSingleMetric(ctxFor(tables), "trust.governed_decisions_created");
        const completed = await resolveSingleMetric(ctxFor(tables), "trust.governed_decisions_completed");

        expect(created.value).toBe(3);
        // 4 org-A packages in window; requested and completed genuinely differ.
        expect(completed.value).toBe(4);
        expect(created.value).not.toBe(completed.value);
    });

    it("org A cannot read org B, and out-of-window rows are excluded", async () => {
        const tables: Tables = { trust_decision_packages: packages };
        const a = await resolveSingleMetric(ctxFor(tables), "trust.governed_decisions_completed");
        const b = await resolveSingleMetric(ctxFor(tables, { orgId: ORG_B }), "trust.governed_decisions_completed");
        expect(a.value).toBe(4);
        expect(b.value).toBe(1);
    });

    it("every Trust query is org-scoped and bounded", async () => {
        const recorded: Recorded[] = [];
        const tables: Tables = {
            trust_decision_contracts: [],
            trust_decision_packages: [],
            trust_reasoning_usage: [],
            trust_decision_observations: [],
        };
        for (const key of TRUST_METRIC_KEYS) {
            await resolveSingleMetric(ctxFor(tables, {}, recorded), key);
        }
        expect(recorded.length).toBeGreaterThan(0);
        for (const call of recorded) {
            expect(call.table.startsWith("trust_")).toBe(true);
            expect(call.filters.org_id).toBe(ORG_A);
            // Head-count queries need no row cap; row reads must have one.
            if (!call.head) expect(call.limit).toBe(TRUST_METRIC_ROW_CAP);
        }
    });

    it("rates report numerator and denominator, and null on an empty org", async () => {
        const tables: Tables = { trust_decision_packages: packages };
        const rate = await resolveSingleMetric(ctxFor(tables), "trust.recommendation_rate");
        expect(rate.value).toBe(0.5);
        expect(rate.meta).toMatchObject({ numerator: 2, denominator: 4 });

        const empty = await resolveSingleMetric(ctxFor({ trust_decision_packages: [] }), "trust.recommendation_rate");
        expect(empty.value).toBeNull();
        expect(empty.formattedValue).toBe("—");
    });

    it("governed refusals and reasoning failures are measured separately", async () => {
        const tables: Tables = { trust_decision_packages: packages };
        const refusal = await resolveSingleMetric(ctxFor(tables), "trust.governed_refusal_rate");
        const failure = await resolveSingleMetric(ctxFor(tables), "trust.reasoning_failure_rate");
        expect(refusal.value).toBe(0.25);
        expect(failure.value).toBe(0.25);
        expect(refusal.meta?.excludes_reasoning_failures).toEqual(REASONING_FAILURE_OUTCOMES);
    });

    it("accepted is not executed — only an executed observation counts", async () => {
        const tables: Tables = {
            trust_decision_observations: [
                { org_id: ORG_A, package_id: "p1", observation_kind: "accepted", observed_at: inWindow },
                { org_id: ORG_A, package_id: "p1", observation_kind: "executed", observed_at: inWindow },
                { org_id: ORG_A, package_id: "p1", observation_kind: "executed", observed_at: inWindow },
                { org_id: ORG_A, package_id: "p2", observation_kind: "accepted", observed_at: inWindow },
                { org_id: ORG_B, package_id: "p3", observation_kind: "executed", observed_at: inWindow },
            ],
        };
        const executed = await resolveSingleMetric(ctxFor(tables), "trust.executions_committed_count");
        // p1 only: p2 was accepted but never executed, p3 is another org, and the
        // duplicate executed row for p1 does not double-count.
        expect(executed.value).toBe(1);
        expect(executed.meta).toMatchObject({ observation_rows: 2, deduplicated_by: "package_id" });
    });

    it("cost is read from the usage record and keeps its decimals", async () => {
        const tables: Tables = {
            trust_reasoning_usage: [
                usage({ provider_cost_units: "1.25" }),
                usage({ provider_cost_units: 2.5 }),
                usage({ provider_cost_units: 0, org_id: ORG_B }),
            ],
        };
        const cost = await resolveSingleMetric(ctxFor(tables), "trust.provider_cost_units");
        expect(cost.value).toBe(3.75);
        expect(cost.meta?.source_record).toBe("trust_reasoning_usage");
        expect(cost.sources).toEqual(["trust_reasoning_usage"]);
    });

    it("latency is reported in the platform duration unit", async () => {
        const tables: Tables = {
            trust_reasoning_usage: [usage({ latency_ms: 3_600_000 }), usage({ latency_ms: 3_600_000 })],
        };
        const latency = await resolveSingleMetric(ctxFor(tables), "trust.reasoning_latency_p50");
        expect(latency.value).toBe(1);
        expect(latency.meta?.p50_ms).toBe(3_600_000);
    });

    it("deterministic and escalated are classified only from persisted escalation level", async () => {
        const tables: Tables = {
            trust_reasoning_usage: [usage(), usage(), usage({ escalation_level: 4 })],
        };
        const rate = await resolveSingleMetric(ctxFor(tables), "trust.deterministic_resolution_rate");
        const escalated = await resolveSingleMetric(ctxFor(tables), "trust.escalated_decision_count");
        expect(rate.value).toBeCloseTo(2 / 3, 10);
        expect(escalated.value).toBe(1);
        expect(rate.meta?.local_model_indistinguishable).toBe(true);
    });

    it("every resolved Trust metric carries source metadata", async () => {
        const tables: Tables = {
            trust_decision_contracts: [],
            trust_decision_packages: [],
            trust_reasoning_usage: [],
            trust_decision_observations: [],
        };
        for (const key of TRUST_METRIC_KEYS) {
            const m = await resolveSingleMetric(ctxFor(tables), key);
            expect(m.sources.length).toBeGreaterThan(0);
            expect(m.window).toBe("rolling_30d");
            expect(m.windowStartIso).toBeTruthy();
            expect(m.computedAtIso).toBeTruthy();
            expect(m.resolveMode).toBe("live");
        }
    });

    it("supports every platform window", async () => {
        const tables: Tables = { trust_decision_packages: [pkg("recommended")] };
        for (const window of ["rolling_24h", "rolling_7d", "rolling_30d"] as const) {
            const m = await resolveSingleMetric(
                ctxFor(tables, { window }),
                "trust.governed_decisions_completed",
            );
            expect(m.window).toBe(window);
        }
    });
});

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

describe("scoping", () => {
    it("site and work-unit scope are reported unsupported, never answered org-wide", async () => {
        const tables: Tables = { trust_decision_packages: [pkg("recommended"), pkg("recommended")] };
        const orgWide = await resolveSingleMetric(ctxFor(tables), "trust.governed_decisions_completed");
        expect(orgWide.value).toBe(2);

        for (const narrowed of [{ siteLocationId: "site-1" }, { workUnitId: "wu-1" }]) {
            const m = await resolveSingleMetric(ctxFor(tables, narrowed), "trust.governed_decisions_completed");
            // The org-wide number must NOT be returned under a narrower scope.
            expect(m.value).toBeNull();
            expect(m.meta).toMatchObject({ scope_unsupported: true, org_scope_only: true });
            expect(String(m.meta?.reason)).toContain("no site, location or work-unit linkage");
        }
    });

    it("the unsupported-scope predicate is explicit", () => {
        expect(trustScopeIsUnsupported(ctxFor({}, { siteLocationId: "s" }))).toBe(true);
        expect(trustScopeIsUnsupported(ctxFor({}, { workUnitId: "w" }))).toBe(true);
        expect(trustScopeIsUnsupported(ctxFor({}))).toBe(false);
        expect(trustScopeIsUnsupported(ctxFor({}, { siteLocationId: "   " }))).toBe(false);
    });

    it("an empty org returns explicit zero and null semantics, not a thrown error", async () => {
        const tables: Tables = {
            trust_decision_contracts: [],
            trust_decision_packages: [],
            trust_reasoning_usage: [],
            trust_decision_observations: [],
        };
        const counts = ["trust.governed_decisions_created", "trust.governed_decisions_completed", "trust.escalated_decision_count", "trust.executions_committed_count", "trust.provider_cost_units"] as const;
        for (const key of counts) {
            expect((await resolveSingleMetric(ctxFor(tables), key)).value).toBe(0);
        }
        const rates = ["trust.recommendation_rate", "trust.governed_refusal_rate", "trust.reasoning_failure_rate", "trust.deterministic_resolution_rate", "trust.reasoning_latency_p50"] as const;
        for (const key of rates) {
            expect((await resolveSingleMetric(ctxFor(tables), key)).value).toBeNull();
        }
    });
});

// ---------------------------------------------------------------------------
// ADR-2 and boundary
// ---------------------------------------------------------------------------

describe("ADR-2 — provider identity never comes from a Decision Package", () => {
    const resolverSrc = readFileSync(join(WEB_ROOT, "lib/metrics/resolvers/trustMetrics.ts"), "utf8");

    it("provider economics are read from the usage record only", () => {
        expect(resolverSrc).toContain("trust_reasoning_usage");
        expect(getMetricDefinition("trust.provider_cost_units").sources).toEqual(["trust_reasoning_usage"]);
    });

    it("no resolver reads recommendation, evidence or provider fields from a package", () => {
        for (const forbidden of ["recommendation", "evidence", "provider_key", "provider_name", "model", "strategy_key"]) {
            expect(`resolver reads ${resolverSrc.includes(`"${forbidden}"`) ? forbidden : "nothing forbidden"}`).toBe(
                "resolver reads nothing forbidden",
            );
        }
        // The package select list is outcome only.
        expect(resolverSrc).toContain('.select("outcome")');
    });

    it("the Decision Package contracts stay provider-independent", () => {
        const pkgTypes = readFileSync(join(WEB_ROOT, "lib/trust/package/decisionPackageTypes.ts"), "utf8");
        for (const forbidden of ["provider_key", "provider_name", "model_id", "model_name", "openai", "anthropic"]) {
            expect(`package types contain ${pkgTypes.includes(forbidden) ? forbidden : "no provider identity"}`).toBe(
                "package types contain no provider identity",
            );
        }
        const migration = readFileSync(
            join(WEB_ROOT, "..", "supabase", "migrations", "20260802090000_trust_runtime_v1_foundation.sql"),
            "utf8",
        );
        // `provider_cost_units` is a COST, not an identity; no identity column exists.
        expect(migration).toContain("provider_cost_units");
        for (const forbidden of ["provider_key text", "provider_name text", "model_id text"]) {
            expect(migration.includes(forbidden)).toBe(false);
        }
    });

    it("no metric output can carry a credential", async () => {
        const tables: Tables = { trust_reasoning_usage: [usage({ provider_cost_units: 1 })] };
        const m = await resolveSingleMetric(ctxFor(tables), "trust.provider_cost_units");
        const serialized = JSON.stringify(m);
        for (const forbidden of ["sk-", "api_key", "token", "secret", "OPENAI"]) {
            expect(serialized).not.toContain(forbidden);
        }
    });
});

describe("boundary", () => {
    const resolverSrc = readFileSync(join(WEB_ROOT, "lib/metrics/resolvers/trustMetrics.ts"), "utf8");

    it("the resolver reads only Trust tables — never a BOS proposal table", () => {
        const tables = [...resolverSrc.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]!);
        expect(tables.length).toBeGreaterThan(0);
        for (const table of tables) expect(table.startsWith("trust_")).toBe(true);
        for (const forbidden of ["task_assist_proposals", "config_layout_assist_proposals", "bos"]) {
            expect(resolverSrc).not.toContain(forbidden);
        }
    });

    it("there is no Trust-specific analytics engine or raw SQL", () => {
        for (const forbidden of ["rpc(", "SELECT ", "select *", "createClient("]) {
            expect(`resolver contains ${resolverSrc.includes(forbidden) ? forbidden : "no engine or raw SQL"}`).toBe(
                "resolver contains no engine or raw SQL",
            );
        }
    });

    it("the Metric Engine is the only resolution path", async () => {
        // Resolution goes through resolveSingleMetric; the resolver module
        // exports no independent "fetch and render" entry point.
        const engineSrc = readFileSync(join(WEB_ROOT, "lib/metrics/metricEngine.ts"), "utf8");
        for (const key of TRUST_METRIC_KEYS) expect(engineSrc).toContain(`case "${key}"`);
        const m = await resolveSingleMetric(ctxFor({ trust_decision_packages: [] }), "trust.recommendation_rate");
        expect(m.key).toBe("trust.recommendation_rate");
    });

    it("no Trust KPI target was invented", () => {
        const kpiSrc = readFileSync(join(WEB_ROOT, "lib/metrics/kpiRegistry.ts"), "utf8");
        // A refusal rate is not inherently "higher is bad"; no threshold is
        // defensible from current doctrine, so none is declared.
        expect(kpiSrc).not.toContain("trust.");
    });

    it("Trust metrics are excluded from site-scoped snapshots", () => {
        const writerSrc = readFileSync(join(WEB_ROOT, "lib/metrics/snapshots/writeOrgMetricSnapshots.ts"), "utf8");
        expect(writerSrc).toContain("orgScopeOnly");
        expect(writerSrc).toContain("keysForTarget");
        for (const key of TRUST_METRIC_KEYS) expect(getMetricDefinition(key).orgScopeOnly).toBe(true);
    });
});
