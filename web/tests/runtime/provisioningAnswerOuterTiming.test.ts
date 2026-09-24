import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const ROUTE = read("app/api/admin/work-units/[id]/provisioning-answer/route.ts");
const DIAG = read("lib/perf/routeTimingDiagnostic.ts");

/**
 * OX SLICE 8 — THE ONE REQUEST J5 WAITS ON MUST BE OBSERVABLE FROM THE OUTSIDE.
 *
 * `ProvisioningTimings` rides every answer, but it starts its clock inside the composer. The outer
 * awaits — route identity and the settlement wait `card_producers_ms` covers — were recorded into
 * the route-timing collector and emitted on the ROUTE DOCUMENT, which this seam never produces.
 * Measured on deployed f302b98b, the observed round trip exceeded the inner `total_ms` by ~1.7s with
 * no observer on any of it, which is exactly the shape that got a straddling gap named a "prelude"
 * in Slice 12B. These pin the emission so the next slice's before/after cannot be argued instead of
 * measured.
 */
describe("provisioning answer outer timing", () => {
    it("the HTTP seam emits the collected outer spans", () => {
        expect(ROUTE).toContain("collectedRouteTiming");
        expect(ROUTE).toContain("__route_timing: timing");
    });

    it("the diagnostic is inert unless the flag is on — the product payload is unchanged", () => {
        // `collectedRouteTiming` returns null when the flag is off, and the route must branch on it
        // rather than always spreading an empty object into the contract.
        expect(ROUTE).toContain("const body = timing ? { ...result.answer, __route_timing: timing } : result.answer;");
        expect(DIAG).toContain("if (!routeTimingEnabled()) return null;");
    });

    it("it rides a RESERVED key, never merged into the answer's own shape", () => {
        // A diagnostic that merged into the answer could collide with a business field, and the
        // answer is a contract the client maps 1:1.
        expect(ROUTE).not.toMatch(/\.\.\.timing[,\s}]/);
        expect(ROUTE).toContain("__route_timing");
    });

    it("MEASURED: the seam must not read the collector — a route handler has no cache() scope", () => {
        /*
         * The first deployed build carrying this emission returned `__route_timing` ABSENT on every
         * sample. `recordRouteTiming` writes into a collector scoped by React `cache()`, which the
         * RSC boundaries share and a route handler does not provide, so the seam read an empty
         * collector and emitted nothing while every local gate passed. The spans are therefore
         * RETURNED by the composer, and this pins that the route prefers the returned value.
         */
        expect(ROUTE).toContain("result.timingSpans");
        const COMPOSE = read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");
        expect(COMPOSE).toContain("timingSpans: outerSpans");
        // The RSC route still consumes the collector, so the recording must not have been removed.
        expect(COMPOSE).toContain("recordRouteTiming({ route_compose_spans: outerSpans as never });");
    });

    it("the settlement wait is what card_producers_ms measures", () => {
        // The number this exists to expose. If the span were ever narrowed to the producers alone,
        // the outer gap would stop being attributable and this slice's evidence would silently rot.
        const COMPOSE = read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");
        const start = COMPOSE.indexOf("const runSettlement");
        expect(COMPOSE.slice(start, start + 200)).toContain("const tProducers = mark();");
        expect(COMPOSE).toContain("cardProducersMs = timing ? performance.now() - tProducers : 0;");
    });
});
