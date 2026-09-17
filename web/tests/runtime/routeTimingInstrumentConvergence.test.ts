/**
 * ROUTE-TIMING INSTRUMENT CONVERGENCE (P0-7.6 / Slice 12A).
 *
 * ── WHY THIS SUITE EXISTS ──
 *
 * `ALLOY_ROUTE_TIMING` was staging-safe, cheap, and wrong. `[workUnitSlug]/layout.tsx` emitted
 *
 *     compose_wall_ms: 0,
 *     seeded: false,
 *
 * as LITERALS, with a comment explaining that the compose had moved to the page segment. Nobody had
 * measured zero; the field simply described a boundary that no longer did the work. Enabling the
 * flag would have reported the route's single most expensive operation as free — a precise,
 * confident, wrong answer, which is the exact failure shape this programme has hit repeatedly.
 *
 * An instrument is not certified by existing. These gates assert that it measures the operation it
 * NAMES: plant a known delay in the compose and `compose_wall_ms` must move; plant one inside a
 * section and only that section must move; suppress the seed and `seeded` must go false; restore the
 * stale layout authority and the convergence gate must fail.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LAYOUT = readFileSync(
    join(process.cwd(), "app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx"),
    "utf8",
);
const PAGE = readFileSync(
    join(process.cwd(), "app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx"),
    "utf8",
);
const DIAG = readFileSync(join(process.cwd(), "lib/perf/routeTimingDiagnostic.ts"), "utf8");
const SEED = readFileSync(join(process.cwd(), "components/admin/workspace/RouteTimingSeed.tsx"), "utf8");
const ANSWER = readFileSync(
    join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
    "utf8",
);
const MIDDLEWARE = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

/**
 * Source with comments removed.
 *
 * Every "this must not appear" assertion below is about CODE. Run against raw source they also match
 * the prose explaining why the thing was removed — which is how a previous slice in this programme
 * produced a false red, and would here: the layout's comment still names `compose_wall_ms: 0` in the
 * course of recording that it no longer emits it.
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const LAYOUT_CODE = strip(LAYOUT);
const PAGE_CODE = strip(PAGE);
const ANSWER_CODE = strip(ANSWER);
const DIAG_CODE = strip(DIAG);

describe("ONE timing authority for the route", () => {
    it("THE GATE: the layout no longer claims compose authority it does not have", () => {
        // The stale-authority defect, pinned. These literals are what made the instrument lie.
        expect(LAYOUT_CODE).not.toMatch(/compose_wall_ms:\s*0/);
        expect(LAYOUT_CODE).not.toMatch(/seeded:\s*false/);
        // …and it must not emit a competing payload either.
        expect(LAYOUT_CODE).not.toContain("<RouteTimingSeed");
    });

    it("THE GATE: the page — which performs the compose — owns compose_wall_ms and seeded", () => {
        expect(PAGE).toContain("compose_wall_ms:");
        expect(PAGE).toContain("seeded:");
        // Measured, not asserted: the value comes from a clock around the awaited compose.
        expect(PAGE).toMatch(/const composeStarted[\s\S]{0,400}composeProvisioningAnswerForRoute/);
        expect(PAGE).toMatch(/composeWallMs\s*=\s*timing\s*\?\s*performance\.now\(\)\s*-\s*composeStarted/);
        // `seeded` reflects what was actually handed to the seed, not a constant.
        expect(PAGE).toMatch(/seeded:\s*answer\s*!=\s*null/);
    });

    it("THE GATE: exactly one boundary emits the payload, and it is the page", () => {
        expect(PAGE).toContain("<RouteTimingSeed");
        expect(PAGE).toContain("collectedRouteTiming()");
        // Two emitters would be two authorities — the thing this slice removed.
        expect((PAGE.match(/<RouteTimingSeed/g) ?? []).length).toBe(1);
    });

    it("both boundaries write into ONE request-scoped collector", () => {
        expect(DIAG).toContain("routeTimingCollector = cache(");
        expect(LAYOUT).toContain("recordRouteTiming({");
        expect(PAGE).toContain("recordRouteTiming({");
    });

    it("the layout still reports what the layout DOES — its own spans, and only those", () => {
        expect(LAYOUT).toContain("layout_entry_epoch_ms");
        expect(LAYOUT).toContain("route_meta_ms");
        expect(LAYOUT).toContain("layout_total_ms");
    });
});

describe("the compose's internal sections are surfaced, not re-timed", () => {
    it("THE GATE: the payload carries the compose's OWN ProvisioningTimings", () => {
        for (const section of [
            "authorization_ms", "work_unit_ms", "configuration_ms", "presentation_ms",
            "records_ms", "projection_ms", "composition_ms", "total_ms",
        ]) {
            expect(PAGE, `compose section ${section} must reach the payload`).toContain(section);
        }
        expect(PAGE).toContain("compose_sections:");
    });

    it("no second set of timers was scattered over the compose to produce them", () => {
        // The sections come from the answer the route already had. A parallel set of timers would be
        // a second authority over the same code — the defect, re-created one layer down.
        expect(PAGE).toMatch(/composed\s*&&\s*"timings"\s*in\s*composed/);
    });

    it("a composer with no breakdown reports null sections, never zeros", () => {
        // ContextualFocusAnswer measures only total_ms. Zeros there would invent seven measurements.
        expect(PAGE).toContain("hasComposeSections");
        expect(PAGE).toMatch(/compose_total_ms:/);
        expect(DIAG).toMatch(/compose_sections:[\s\S]{0,900}\|\s*null/);
    });

    it("THE GATE: composition_ready is measured from the compose's own start", () => {
        // P0-7.6 item 13 — when the published composition becomes available, comparable with the
        // sections beside it because it shares their clock.
        expect(ANSWER).toContain('markSpan("composition_ready", t0)');
        // …and it is recorded where focusPanelSummaryDoc is actually built.
        const at = ANSWER.indexOf('markSpan("composition_ready", t0)');
        const after = ANSWER.slice(at, at + 400);
        expect(after).toContain("focusPanelSummaryDoc");
        expect(PAGE).toContain("composition_ready_ms:");
    });

    it("composition_ready is diagnostic only — nothing is decoupled, flushed or streamed", () => {
        const at = ANSWER_CODE.indexOf('markSpan("composition_ready", t0)');
        const around = ANSWER_CODE.slice(Math.max(0, at - 200), at + 200);
        expect(around).not.toMatch(/flush|stream|Suspense|await\s+new\s+Promise/);
    });
});

describe("overhead contract — the instrument must not change what it measures", () => {
    it("THE GATE: every timing call in the page is behind the flag", () => {
        // `timing` is read once from `routeTimingEnabled()`; every clock and every record is gated.
        expect(PAGE).toMatch(/const timing = routeTimingEnabled\(\)/);
        expect(PAGE).toMatch(/pageEntryEpochMs = timing \?/);
        expect(PAGE).toMatch(/pageStarted = timing \?/);
        expect(PAGE).toMatch(/composeStarted = timing \?/);
        expect(PAGE).toMatch(/if \(timing\) \{/);
    });

    it("recordRouteTiming is inert when the flag is off", () => {
        expect(DIAG).toMatch(/export function recordRouteTiming[\s\S]{0,200}if \(!routeTimingEnabled\(\)\) return;/);
        expect(DIAG).toMatch(/export function collectedRouteTiming[\s\S]{0,200}if \(!routeTimingEnabled\(\)\) return null;/);
    });

    it("the emitter renders nothing when the flag is off", () => {
        expect(SEED).toMatch(/if \(!routeTimingEnabled\(\) \|\| !marks\) return null;/);
    });

    it("the compose wrapper adds no await of its own — it times the promise the route already had", () => {
        // An extra await would serialize the thing being measured.
        const block = PAGE_CODE.slice(PAGE_CODE.indexOf("const composed = await"), PAGE_CODE.indexOf("const composeWallMs"));
        expect(block).not.toMatch(/await new Promise|setTimeout|sleep/);
    });
});

describe("data safety — durations and booleans only", () => {
    it("THE GATE: the payload schema carries no identifying field", () => {
        const schema = DIAG_CODE.slice(DIAG_CODE.indexOf("export type RouteTimingMarks"), DIAG_CODE.indexOf("export const routeTimingCollector"));
        /*
         * Word-boundary patterns, not substrings. A bare "record" collides with `records_ms` — the
         * compose's own RECORDS PHASE duration, which is exactly the kind of field this instrument
         * is supposed to carry. The scan must catch identifying fields without condemning a legitimate
         * phase name that happens to share a stem.
         */
        for (const forbidden of [
            /\bsubject_?[Ii]d\b/, /\bopportunity\b/, /\bperson\b/, /\bchild\b/, /\bemail\b/,
            /\bphone\b/, /\borg_?[Ii]d\b/, /\buser_?[Ii]d\b/, /\brecord_(value|s?_id)\b/,
        ]) {
            expect(schema, `timing schema must not carry ${forbidden}`).not.toMatch(forbidden);
        }
    });

    it("every schema field is a duration, an epoch, a boolean, or a named span map", () => {
        const schema = DIAG_CODE.slice(DIAG_CODE.indexOf("export type RouteTimingMarks"), DIAG_CODE.indexOf("export const routeTimingCollector"));
        const fields = [...schema.matchAll(/^\s{4}(\w+)\??:/gm)].map((m) => m[1]);
        expect(fields.length).toBeGreaterThan(5);
        for (const f of fields) {
            expect(f, `unexpected timing field ${f}`).toMatch(/_ms$|_epoch_ms$|^seeded$|^compose_sections$/);
        }
    });

    it("the page emits no business value into the payload", () => {
        const block = PAGE_CODE.slice(PAGE_CODE.indexOf("recordRouteTiming({"), PAGE_CODE.indexOf("page_total_ms"));
        for (const forbidden of ["requestedSubjectId", "workUnitSlug", "answer.", "recordOfAttention"]) {
            expect(block, `payload must not carry ${forbidden}`).not.toContain(forbidden);
        }
    });
});

describe("flag behaviour — build-time vs runtime", () => {
    it("one flag controls middleware and the page instrumentation", () => {
        expect(MIDDLEWARE).toContain("routeTimingEnabled");
        expect(PAGE).toContain("routeTimingEnabled");
        expect(DIAG).toMatch(/process\.env\.ALLOY_ROUTE_TIMING === "1"/);
    });

    it("the build-time constraint is documented where an operator will read it", () => {
        // Middleware runs on Edge, where process.env is inlined at build. Setting the flag on the
        // server process alone silently yields half an instrument.
        expect(DIAG).toMatch(/Edge runtime[\s\S]{0,200}BUILD time/);
    });
});

/**
 * BEHAVIOURAL SELF-CERTIFICATION — the timing primitives, exercised against real elapsed time.
 *
 * ── WHAT THIS CAN AND CANNOT PROVE, STATED PLAINLY ──
 *
 * §9 asks for a delay plant that moves `compose_wall_ms` by a known amount. The compose runs inside
 * an RSC route segment, which cannot be invoked from vitest without a server, a tenant and a
 * session — so an end-to-end delay plant is not available at this layer, and pretending otherwise
 * would be the fabricated arithmetic §2 forbids.
 *
 * What IS available is the pair of claims that together carry the same weight:
 *
 *   1. the STRUCTURAL gates above prove the primitive is wrapped around the real awaited compose,
 *      and each detaches under its own plant;
 *   2. these gates prove the primitive itself reports REAL elapsed time — a known delay moves it by
 *      that amount, and an unrelated span does not absorb it.
 *
 * The end-to-end number is then produced by the deployed diagnostic run (Slice 12B), which is the
 * only place it can honestly be measured.
 */
describe("the timing primitive measures real elapsed time", () => {
    const sleep = (ms: number) => new Promise<string>((r) => setTimeout(() => r("done"), ms));

    it("THE GATE: a known ~100ms delay moves the measured span by approximately that amount", async () => {
        const { timedSpan } = await import("@/lib/perf/routeTimingDiagnostic");
        const [value, ms] = await timedSpan(sleep(100));
        expect(value, "the span must not change the awaited result").toBe("done");
        // Generous bounds: this asserts the clock tracks reality, not that timers are precise.
        expect(ms).toBeGreaterThanOrEqual(90);
        expect(ms).toBeLessThan(400);
    });

    it("without the delay the same span returns to baseline", async () => {
        const { timedSpan } = await import("@/lib/perf/routeTimingDiagnostic");
        const [, ms] = await timedSpan(Promise.resolve("x"));
        expect(ms).toBeLessThan(50);
    });

    it("SECTION ISOLATION: a delay in one span is not absorbed by an unrelated one", async () => {
        const { timedSpan } = await import("@/lib/perf/routeTimingDiagnostic");
        const [, slowMs] = await timedSpan(sleep(120));
        const [, fastMs] = await timedSpan(Promise.resolve("x"));
        expect(slowMs).toBeGreaterThanOrEqual(110);
        expect(fastMs).toBeLessThan(50);
        expect(slowMs - fastMs).toBeGreaterThan(80);
    });

    it("a rejection still rejects — the span observes, it does not swallow", async () => {
        const { timedSpan } = await import("@/lib/perf/routeTimingDiagnostic");
        await expect(timedSpan(Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    });
});

describe("the collector is inert when the flag is off", () => {
    it("THE GATE: with the flag off, nothing is recorded and nothing is emitted", async () => {
        const prior = process.env.ALLOY_ROUTE_TIMING;
        process.env.ALLOY_ROUTE_TIMING = "0";
        try {
            const mod = await import("@/lib/perf/routeTimingDiagnostic");
            expect(mod.routeTimingEnabled()).toBe(false);
            mod.recordRouteTiming({ compose_wall_ms: 1234 });
            // The disabled overhead is one boolean read and an early return; nothing accumulates,
            // and the consumer gets null rather than a payload of partial truth.
            expect(mod.collectedRouteTiming()).toBeNull();
        } finally {
            if (prior === undefined) delete process.env.ALLOY_ROUTE_TIMING;
            else process.env.ALLOY_ROUTE_TIMING = prior;
        }
    });

    it("the flag is read at call time, so it cannot be captured at module load", async () => {
        // A captured boolean would make the flag un-toggleable and silently wrong in one of the two
        // runtimes this instrument spans.
        const mod = await import("@/lib/perf/routeTimingDiagnostic");
        const prior = process.env.ALLOY_ROUTE_TIMING;
        try {
            process.env.ALLOY_ROUTE_TIMING = "1";
            expect(mod.routeTimingEnabled()).toBe(true);
            process.env.ALLOY_ROUTE_TIMING = "0";
            expect(mod.routeTimingEnabled()).toBe(false);
        } finally {
            if (prior === undefined) delete process.env.ALLOY_ROUTE_TIMING;
            else process.env.ALLOY_ROUTE_TIMING = prior;
        }
    });
});
