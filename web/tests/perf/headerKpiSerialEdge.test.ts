/**
 * THE HEADER KPI SERIAL EDGE.
 *
 * These three numerals are the Work Unit's completion owner. They were fetched by a client effect
 * that runs on mount, so the request started ~50ms AFTER the document landed and finished ~1.2-1.9s
 * later — while the cards themselves were done at ~4,739ms. The document now resolves them during
 * its own composition.
 *
 * Every gate below corresponds to a way that change could be wrong: by blocking the document, by
 * widening authorization, by inventing a second metric path, by fabricating zero, or by answering
 * one operator's scope with another's values.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const KPI = codeOf(read("lib/runtime/provisioning/workUnitHeaderKpiResolution.ts"));
const ANSWER = codeOf(read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts"));
const HOOK = codeOf(read("lib/presentation/runtime/useOperationalAnswers.ts"));
const SETTLE = codeOf(read("lib/presentation/runtime/useWorkUnitSettlement.ts"));
const WARM = codeOf(read("lib/metrics/oipWorkspaceWarmCache.ts"));
const ROUTE = codeOf(read("app/api/admin/metrics/resolve/route.ts"));
const COMPOSE_ROUTE = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));
/** Raw (comments intact) — the import-graph gate must see real import lines only. */
const ANSWER_RAW = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");
const PRESENT = codeOf(read("lib/runtime/provisioning/operationalPresentation.ts"));
const PROBE = codeOf(read("playwright/support/visibleCompletionProbe.ts"));

describe("A — the work starts before hydration, in the document", () => {
    it("the composer resolves the header KPIs through the route-injected resolver", () => {
        expect(ANSWER).toContain("req.resolveHeaderKpis?.(");
        expect(ANSWER).toContain("headerKpis");
        expect(COMPOSE_ROUTE).toContain("makeWorkUnitHeaderKpiResolver(");
    });

    it("the composer VALUE-imports nothing that reaches next/headers", () => {
        /*
         * THE DEFECT THE PRODUCTION BUILD CAUGHT. The first implementation imported
         * `resolveWorkUnitHeaderKpis` directly. Its analytics gate reaches `next/headers`, and this
         * composer is reachable from a client component, so the build failed with
         * "You're importing a component that needs next/headers". Typecheck and every unit suite
         * were green. The resolution module may only be imported here as a TYPE.
         */
        const importLines = ANSWER_RAW.split("\n").filter((l) => /^\s*import\s/.test(l));
        const kpiImports = importLines.filter((l) => l.includes("workUnitHeaderKpiResolution"));
        expect(kpiImports.length).toBeGreaterThan(0);
        for (const line of kpiImports) {
            expect(line, `must be a type-only import: ${line}`).toMatch(/^\s*import type /);
        }
        expect(importLines.some((l) => l.includes("canReadAnalytics"))).toBe(false);
        expect(importLines.some((l) => l.includes("oipWorkspaceWarmCache"))).toBe(false);
    });

    it("it chains off the HEADER CONFIG read, not the whole presentation branch", () => {
        /*
         * Chaining off `presentationPromise` is what made #1091 miss. That branch also awaits the
         * queue-row layout, the dominant read (~700ms vs ~335ms), so the KPI began ~1,000ms in,
         * landed ~2,400-3,000ms and lost to the join at ~2,300-2,700ms — binding in 1 of 8 samples.
         */
        expect(ANSWER).toMatch(/headerKpiPromise[\s\S]{0,140}headerLayoutRecordsPromise\s*\n?\s*\.then/);
        const chain = ANSWER.slice(ANSWER.indexOf("const headerKpiPromise"), ANSWER.indexOf("void headerKpiPromise"));
        expect(chain, "must not wait for the full presentation branch").not.toContain("presentationPromise");
    });

    it("the header config is read ONCE and shared, not duplicated", () => {
        const reads = ANSWER.split("listWorkUnitHeaderLayoutRecords(").length - 1;
        expect(reads, "exactly one header-config read site").toBe(1);
        // The presentation branch consumes the same promise rather than issuing its own.
        const branch = ANSWER.slice(ANSWER.indexOf("const presentationPromise"), ANSWER.indexOf("return resolveOperationalPresentation"));
        expect(branch).toContain("headerLayoutRecordsPromise");
    });

    it("both consumers derive the key set from the SAME exported function", () => {
        // A second derivation could select a different published variant; the seed's key set would
        // stop matching the client's and the seed would be silently ignored.
        expect(ANSWER).toContain("resolveWorkUnitHeaderConfigFromRecords(");
        expect(ANSWER).toContain("operationalKpiSlotsFromHeaderConfig(");
        expect(PRESENT).toContain("resolveWorkUnitHeaderConfigFromRecords(");
        expect(PRESENT).toContain("operationalKpiSlotsFromHeaderConfig(");
    });

    it("the client stops issuing the request when the document answered", () => {
        const effect = HOOK.slice(HOOK.indexOf("const seeded"), HOOK.indexOf("return () => {"));
        expect(effect).toContain("seedOipWarmCache(scopeKey, seeded)");
        // The fetch must be in the ELSE branch — seeded frames issue NOTHING. Asserting only that
        // an else-branch fetch exists is not enough: it stays true when a second fetch is added
        // inside the seeded branch, which is exactly the duplicate-execution defect.
        const seededBranch = effect.slice(effect.indexOf("if (seeded) {"), effect.indexOf("} else {"));
        expect(seededBranch.length).toBeGreaterThan(0);
        expect(seededBranch, "a seeded frame must issue no request").not.toContain("prefetchOipMetricsWarm");
        expect(seededBranch).not.toContain("fetch(");
        expect(effect).toMatch(/\} else \{[\s\S]*?prefetchOipMetricsWarm/);
    });
});

describe("B — overlap, not relocation: the document is never blocked behind the KPI", () => {
    it("the join is a bounded race, not an unconditional await", () => {
        const join = ANSWER.slice(ANSWER.indexOf("const headerKpis = await"), ANSWER.indexOf("markSpan(\"header_kpi_wait_ms\""));
        expect(join).toContain("Promise.race");
        expect(join).toContain("WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS");
        expect(join).not.toMatch(/await headerKpiPromise\s*;/);
    });

    it("the grace is small enough that it cannot become the document's cost", () => {
        const ms = Number(/WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS = (\d+)/.exec(KPI)?.[1]);
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThanOrEqual(250);
    });

    it("execution elapsed and join wait are DIFFERENT measurements", () => {
        /*
         * THE DEFECT THIS REPLACES. `header_kpi_wait_ms` was stamped at KPI execution start, so it
         * reported 812-1,152ms and read like the join cost. It was elapsed-time-to-join. Conflating
         * them hid the fact that mattered: the resolve started too late, the join was never
         * expensive.
         */
        expect(ANSWER).toContain('markSpan("header_kpi_execution_elapsed_ms"');
        expect(ANSWER).toContain('markSpan("header_kpi_join_wait_ms"');
        expect(ANSWER, "the conflated metric is gone").not.toContain('markSpan("header_kpi_wait_ms"');
    });

    it("the join wait is measured FROM THE JOIN, not from execution start", () => {
        const join = ANSWER.slice(ANSWER.indexOf("const tKpiJoinStart"), ANSWER.indexOf('markSpan("header_kpi_join_wait_ms"') + 60);
        expect(join).toMatch(/const tKpiJoinStart = now\(\);[\s\S]*Promise\.race/);
        expect(join).toContain('markSpan("header_kpi_join_wait_ms", tKpiJoinStart)');
        // Stamping from tHeaderKpi here would reintroduce the exact conflation above.
        expect(join).not.toContain('markSpan("header_kpi_join_wait_ms", tHeaderKpi)');
    });

    it("the race timer is cleared, so a pending timer cannot outlive the response", () => {
        const join = ANSWER.slice(ANSWER.indexOf("const headerKpis = await"), ANSWER.indexOf("markSpan(\"header_kpi_wait_ms\""));
        expect(join).toContain("clearTimeout(timer)");
    });
});

describe("C — authorization is re-decided here, never transported", () => {
    it("the analytics gate runs in the composer path", () => {
        expect(KPI).toContain("requireAnalyticsReadAccess()");
        // Refused access is its own state, not an error and not zero.
        expect(KPI).toMatch(/if \(!auth\.ok\) return \{ status: "forbidden" \}/);
    });

    it("scope comes from the request's own access bundle", () => {
        expect(KPI).toContain("scopeDimensionsFromAccess(auth.access)");
    });

    it("no permission verdict is persisted or carried in the seed", () => {
        for (const banned of ["canView", "allowedLocationIds", "permissionKeys", "role:"]) {
            expect(KPI, `seed must not carry ${banned}`).not.toContain(banned);
        }
    });
});

describe("D — one metric path, one serialisation", () => {
    it("the same engine entry point is used, not a fast variant", () => {
        expect(KPI).toContain("resolveMetrics(");
        for (const banned of ["fastNeedsAttention", "quickMetrics", "lightweightMetrics"]) {
            expect(KPI).not.toContain(banned);
        }
    });

    it("the route and the composer share ONE wire serialisation", () => {
        expect(ROUTE).toContain("metricResolveApiItemsFromResolved(");
        expect(KPI).toContain("metricResolveApiItemsFromResolved(");
        // The route must no longer carry its own inline mapping.
        expect(ROUTE).not.toContain("metric_key: m.key");
    });

    it("the metrics route survives as the refresh/fallback path", () => {
        expect(HOOK).toContain("prefetchOipMetricsWarm(");
    });
});

describe("E — truthful states: absent is not zero", () => {
    it("a failed or late resolution is unavailable, never a fabricated value", () => {
        // Anchored to the composer's failure path. The module only DECLARES the union member;
        // asserting against that type line passes whatever the runtime actually returns.
        // The composer degrades to null (client fetches as before); the resolver never invents a value.
        const chain = ANSWER.slice(ANSWER.indexOf("const headerKpiPromise"), ANSWER.indexOf("void headerKpiPromise"));
        expect(chain.length).toBeGreaterThan(0);
        expect(chain).toMatch(/\.catch\(\(\) => null\)/);
        const factory = KPI.slice(KPI.indexOf("export function makeWorkUnitHeaderKpiResolver"));
        expect(factory).toMatch(/catch \{\s*return null;/);
        expect(factory).not.toMatch(/status: "ok", values: \{\}/);
        expect(KPI).not.toMatch(/value:\s*0/);
    });

    it("an unseeded frame falls back to the existing fetch rather than rendering empty", () => {
        const effect = HOOK.slice(HOOK.indexOf("const seeded"), HOOK.indexOf("return () => {"));
        expect(effect).toContain("prefetchOipMetricsWarm");
    });

    it("only an ok seed is used — forbidden and unavailable fall through", () => {
        expect(SETTLE).toMatch(/s\.status !== "ok"/);
    });
});

describe("F — a seed may only answer the scope it was resolved for", () => {
    it("the seed carries its scope key", () => {
        expect(KPI).toContain("scopeKey");
        expect(KPI).toContain("buildOipWarmScopeKey(");
    });

    it("the hook ignores a seed for a different scope", () => {
        expect(HOOK).toContain("seed.scopeKey === scopeKey");
    });

    it("a seed never overwrites a fresher live answer", () => {
        const fn = WARM.slice(WARM.indexOf("export function seedOipWarmCache"), WARM.indexOf("export function getOipWarmSnapshot"));
        expect(fn).toContain("if (isFresh(existing)) return;");
    });
});


describe("G — the WU-07 identity capture can actually distinguish two nodes", () => {
    /** Scoped to the late-record literal, so a mention elsewhere in the probe cannot satisfy these. */
    const LATE_RECORD = (() => {
        const start = PROBE.indexOf("(LATE.__p076late as unknown[]).push({");
        return PROBE.slice(start, PROBE.indexOf("});", start) + 3);
    })();

    it("each late record carries element, parent and batch identity", () => {
        expect(LATE_RECORD.length).toBeGreaterThan(0);
        for (const field of ["batchId", "parentId", "addedIds", "removedIds"]) {
            expect(LATE_RECORD, `late records must carry ${field}`).toMatch(new RegExp(`\\b${field}\\s*[,:]`));
        }
    });

    it("it captures the surface and subject the node belongs to", () => {
        for (const field of ["sectionId", "fpBoundary", "subjectId", "componentId", "generation"]) {
            expect(LATE_RECORD, `late records must carry ${field}`).toMatch(new RegExp(`\\b${field}\\s*[,:]`));
        }
    });

    it("node identity is stable per node, not per record", () => {
        // A per-record counter would give two ids to one header and prove nothing.
        expect(PROBE).toContain("const nodeIds = new WeakMap<Node, number>()");
        expect(PROBE).toMatch(/if \(id === undefined\) \{ id = \+\+nodeIdSeq; nodeIds\.set\(n, id\); \}/);
    });

    it("the capture is observation only — it writes nothing to the DOM", () => {
        const helper = PROBE.slice(PROBE.indexOf("const nodeIds ="), PROBE.indexOf("const identicalRerenderParents"));
        for (const banned of ["setAttribute", "classList", "appendChild", "innerHTML"]) {
            expect(helper, `identity capture must not ${banned}`).not.toContain(banned);
        }
    });
});
