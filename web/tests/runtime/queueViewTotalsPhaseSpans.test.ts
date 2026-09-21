/**
 * THE COMPLETION OWNER MUST BE DECOMPOSABLE.
 *
 * `/api/admin/queue-view-totals` emitted exactly one number — `total` — and that number is now
 * FIRST_ORDER_VISIBLE_COMPLETE: measured deployed at f5451e05b it costs ~1,934ms and WU-03's final
 * authoritative mutation lands 11.0-12.2ms after it responds, on 11 of 11 samples.
 *
 * One total cannot say which phase owns it, and the candidates inside this route need OPPOSITE
 * repairs:
 *
 *   - `loadWorkUnitProcessPopulation` — a read the document composer has ALREADY performed;
 *   - `attachEffectiveEnrollmentStagesToOpportunityRows` and `attachActiveTourFactsToOpportunityRows`
 *     — database enrichments that the composer gets for free from maintained facts, synchronously;
 *   - `countChildGrainMembersForLens` — a full membership projection PER configured child lens,
 *     which fans out with configuration rather than with data.
 *
 * Choosing a repair from a single 1,934ms number would be the same error as naming a "prelude"
 * that straddled the composer. These gates hold the decomposition in place, and hold the two
 * properties that make it readable: the per-group phases must ACCUMULATE, because they run inside
 * a concurrency-limited map and a plain assignment would report only the last group; and the
 * cardinalities must be emitted, because a duration cannot be turned into a per-view marginal cost
 * without knowing how many views were evaluated.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    buildQueueRowsServerTimingHeader,
    type QueueServerTimingMetrics,
} from "@/lib/perf/queueRowsServerTiming";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments state intent; only code may satisfy a gate. */
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE_ONLY = codeOf(read("app/api/admin/queue-view-totals/route.ts"));
const EVALUATOR = codeOf(read("lib/queues/evaluateWorkViewTotalsForGroup.ts"));
/*
 * RE-ANCHORED for the document seed.
 *
 * Group evaluation moved into the canonical evaluator so the seed and the endpoint share one
 * predicate; the route kept only what it alone owns — the gate, the scope prep, and its OWN
 * prerequisite acquisition. Every phase must still be measured and still reach the header, so the
 * gates read the pair. Where a gate is about the ROUTE specifically (the emission, the acquisition
 * clock, the concurrency limit) it reads ROUTE_ONLY, so moving something out of the route cannot
 * silently satisfy it.
 */
const ROUTE = ROUTE_ONLY + EVALUATOR;
const CONTRACT = codeOf(read("lib/perf/queueRowsServerTiming.ts"));

const PHASES = [
    "qvt_gate",
    "qvt_scope",
    "qvt_access",
    "qvt_child_counts",
    "qvt_population",
    "qvt_epp",
    "qvt_tours",
    "qvt_aggregate",
] as const;

describe("every phase of the completion owner is measured", () => {
    it("all eight phases are measured across the route and its evaluator", () => {
        for (const phase of ["qvt_gate", "qvt_scope", "qvt_access"]) {
            expect(ROUTE_ONLY, `route must measure ${phase}`).toContain(`span.${phase}`);
        }
        for (const phase of ["child_counts", "population", "epp", "tours", "aggregate"]) {
            expect(EVALUATOR, `evaluator must measure ${phase}`).toContain(`spans.${phase}`);
        }
    });

    it("the header carries them, so recording is not mistaken for emitting", () => {
        // A span recorded and not emitted is the `financials: null` defect: nineteen local gates
        // green while every deployed sample carried nothing.
        const header = buildQueueRowsServerTimingHeader({
            metrics: Object.fromEntries(PHASES.map((p, i) => [p, i + 1])) as QueueServerTimingMetrics,
        });
        for (const phase of PHASES) expect(header).toContain(`${phase};dur=`);
    });

    it("the emit spreads the accumulator rather than restating field names", () => {
        // Restating by name is exactly how `financials` was dropped one level deeper.
        // BOTH accumulators spread: the route's own span and the evaluator's.
        expect(ROUTE_ONLY).toMatch(/metrics:\s*\{\s*\.\.\.span,/);
        expect(ROUTE_ONLY).toMatch(/counts:\s*\{\s*\.\.\.counts,/);
    });

    it("the contract type declares every phase and every count", () => {
        /*
         * A planted removal of `qvt_population?: number` left this suite GREEN — it was caught only
         * by `tsc`, because the emit spreads an object and the suite does not typecheck. The header
         * builder is the contract; a phase missing from it cannot be emitted at all, so the type is
         * asserted here rather than left to a gate that does not run in this suite.
         */
        for (const phase of PHASES) {
            expect(CONTRACT, `contract must declare ${phase}`).toMatch(
                new RegExp(`${phase}\\?: number;`),
            );
            expect(CONTRACT, `${phase} must be ordered for emission`).toContain(`"${phase}"`);
        }
        for (const c of ["groups", "views", "child_views", "lane_views", "unknown_views"]) {
            expect(CONTRACT, `contract must declare count ${c}`).toMatch(new RegExp(`${c}\\?: number;`));
        }
    });

    it("total survives — the new spans are reported alongside, not instead", () => {
        expect(ROUTE).toContain("total: Date.now() - t0");
    });
});

describe("phases inside the concurrent group map accumulate", () => {
    /*
     * `mapWithConcurrencyLimit(..., 4, ...)` runs groups concurrently. A plain `=` would report
     * whichever group finished last and silently discard the rest — a number that looks like a
     * measurement and is one group's worth of a multi-group request.
     */
    it("the route's own per-group phase accumulates", () => {
        // Access acquisition stayed in the route; it runs per group and must sum, not overwrite.
        expect(ROUTE_ONLY).toContain("span.qvt_access +=");
        expect(ROUTE_ONLY).not.toMatch(/span\.qvt_access\s*=\s*Date/);
    });

    it("every evaluator phase accumulates into the shared span object", () => {
        for (const phase of ["child_counts", "population", "epp", "tours", "aggregate"]) {
            expect(EVALUATOR, `${phase} must accumulate`).toContain(`spans.${phase} +=`);
            expect(EVALUATOR, `${phase} must not be overwritten per group`).not.toMatch(
                new RegExp(`spans\\.${phase}\\s*=\\s*Date`),
            );
        }
    });

    it("the two request-level phases are assigned once, not accumulated", () => {
        // Gate and scope run ONCE before the map. Accumulating them would imply a fan-out that
        // does not exist and would make the two kinds of phase unreadable side by side.
        expect(ROUTE).toMatch(/span\.qvt_gate = Date\.now\(\) - tGate/);
        expect(ROUTE).toMatch(/span\.qvt_scope = Date\.now\(\) - tScope/);
    });
});

describe("the cardinalities separate fixed setup from per-view cost", () => {
    it("groups are counted by the route, view grains by the evaluator", () => {
        // Only the evaluator knows how each configured view resolved; only the route knows the lanes.
        expect(ROUTE_ONLY).toContain("counts.groups");
        for (const c of ["views", "child_views", "lane_views", "unknown_views"]) {
            expect(EVALUATOR, `evaluator must count ${c}`).toContain(`spans.${c}`);
        }
    });

    it("a count of zero is emitted, because zero is a measurement", () => {
        /*
         * "No child lenses were configured" and "nobody recorded how many child lenses there were"
         * are different facts, and only one of them means the child path is free. Dropping zero
         * would make them identical in the payload.
         */
        const header = buildQueueRowsServerTimingHeader({
            metrics: { total: 5 },
            counts: { groups: 1, views: 7, child_views: 0, lane_views: 7, unknown_views: 0 },
        });
        expect(header).toContain('child_views;desc="0"');
        expect(header).toContain('unknown_views;desc="0"');
        expect(header).toContain('lane_views;desc="7"');
    });

    it("an absent count is omitted rather than reported as zero", () => {
        const header = buildQueueRowsServerTimingHeader({ metrics: { total: 5 }, counts: {} });
        expect(header).not.toContain("child_views");
        expect(header).toContain("total;dur=5");
    });

    it("the grain split is counted where the split is decided", () => {
        // Counting anywhere else could disagree with the branch that actually ran.
        const at = EVALUATOR.indexOf("spans.child_views += childViews.length");
        expect(at).toBeGreaterThan(-1);
        expect(EVALUATOR.indexOf("const childViews")).toBeLessThan(at);
        expect(EVALUATOR).toContain("spans.unknown_views += unknownViews.length");
    });
});

describe("the instrument does not change the route", () => {
    it("no phase clock introduces an await", () => {
        // Every clock is Date.now() around work that was already there.
        for (const m of ROUTE.matchAll(/const t[A-Z]\w* = ([^\n;]+);/g)) {
            expect(m[1]).toBe("Date.now()");
        }
    });

    it("no sleep, delay or artificial serialization was introduced", () => {
        expect(ROUTE).not.toMatch(/setTimeout|await new Promise|sleep\(/);
    });

    it("the concurrency limit and per-view failure isolation are untouched", () => {
        expect(ROUTE_ONLY).toContain("mapWithConcurrencyLimit([...groups.values()], 4,");
        // One lens failing must still yield UNKNOWN for itself, never a number from another lens.
        expect(ROUTE).toContain("count: null, known: false");
    });

    it("no identifier reaches the header", () => {
        const emit = ROUTE_ONLY.slice(ROUTE_ONLY.indexOf("buildQueueRowsServerTimingHeader({"));
        for (const forbidden of ["orgId", "workUnitId", "workViewId", "userId", "selectedSiteId"]) {
            expect(emit, `header must not carry ${forbidden}`).not.toContain(forbidden);
        }
    });
});
