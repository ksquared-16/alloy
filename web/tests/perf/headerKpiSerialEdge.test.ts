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

describe("A — the work starts before hydration, in the document", () => {
    it("the composer resolves the header KPIs", () => {
        expect(ANSWER).toContain("resolveWorkUnitHeaderKpis(");
        expect(ANSWER).toContain("headerKpis");
    });

    it("it chains off the presentation branch, which already reads the key config", () => {
        expect(ANSWER).toMatch(/headerKpiPromise[\s\S]{0,80}presentationPromise\s*\n?\s*\.then/);
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

    it("what the join cost is reported, not hidden", () => {
        expect(ANSWER).toContain('markSpan("header_kpi_wait_ms"');
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
        const chain = ANSWER.slice(ANSWER.indexOf("const headerKpiPromise"), ANSWER.indexOf("void headerKpiPromise"));
        expect(chain.length).toBeGreaterThan(0);
        expect(chain).toMatch(/\.catch\(\(\) => \(\{[^}]*status: "unavailable"/);
        expect(chain).not.toMatch(/\.catch\(\(\) => \(\{[^}]*status: "ok"/);
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
        expect(ANSWER).toContain("buildOipWarmScopeKey(");
    });

    it("the hook ignores a seed for a different scope", () => {
        expect(HOOK).toContain("seed.scopeKey === scopeKey");
    });

    it("a seed never overwrites a fresher live answer", () => {
        const fn = WARM.slice(WARM.indexOf("export function seedOipWarmCache"), WARM.indexOf("export function getOipWarmSnapshot"));
        expect(fn).toContain("if (isFresh(existing)) return;");
    });
});
