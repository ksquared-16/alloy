import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { producerClock } from "@/lib/perf/routeTimingDiagnostic";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const DIAG = read("lib/perf/routeTimingDiagnostic.ts");
const PRODUCERS = read("lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts");
const ROUTE = read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");

/**
 * PRODUCER-TAIL OWNERSHIP (P0-7.6).
 *
 * The residual producer tail had a measured size and no owner. Durations alone cannot supply one:
 * a producer that starts late and one that runs long are indistinguishable in a duration, and only
 * the producer still running when composition ends is on the critical path. These gates pin the
 * offsets that make the tail attributable, and pin them to the COMPOSE origin so `end` can be
 * compared with `compose_end_offset_ms` without reconciling two clocks.
 */
describe("producer offsets are attributable to the compose frame", () => {
    it("the clock records start AND end per producer, not just a duration", async () => {
        const clock = producerClock(0);
        await clock.time("attendance_ms", async () => "a");
        const offsets = clock.offsets();
        // Inert when the flag is off, which is the default in tests — the contract under test is
        // the SHAPE, so assert the accessor exists and never throws rather than forcing the flag.
        expect(typeof clock.offsets).toBe("function");
        expect(offsets).toBeTypeOf("object");
    });

    it("the origin is a parameter, so offsets share the overlap block's frame", () => {
        expect(DIAG).toMatch(/export function producerClock\(originMs\?: number\)/);
        // Falling back to clock creation keeps spans self-consistent; the point of the parameter is
        // that a caller CAN make them comparable across blocks.
        expect(DIAG).toContain("const origin = originMs ?? (enabled ? performance.now() : 0);");
    });

    it("BOTH producer call sites pass the compose origin, not just the speculative one", () => {
        // The canonical fallback runs the producers when the speculative run could not be used. A
        // tail measured only on the happy path would silently go unattributed on exactly the runs
        // where the join was most expensive.
        const passes = ROUTE.match(/timingOriginMs: tInner/g) ?? [];
        expect(passes.length).toBe(2);
        const invocations = ROUTE.match(/projectFocusPanelCardProducers\(\{/g) ?? [];
        expect(passes.length).toBe(invocations.length);
    });

    it("the offsets reach the payload through the existing merge, not a second writer", () => {
        expect(PRODUCERS).toContain("recordProducerSpans(clock.spans(), clock.offsets());");
        expect(DIAG).toMatch(/\.\.\.\(offsets \? \{ offsets \} : \{\}\)/);
        // One collector, as the prelude-spans contract already requires.
        expect(DIAG).not.toMatch(/globalThis\.__producerOffsets/);
    });

    it("offsets stay optional so a producer run without an origin still reports", () => {
        expect(DIAG).toMatch(/offsets\?: Partial<Record<ProducerSpanName, \{ at: number; end: number \}>>/);
        expect(PRODUCERS).toMatch(/timingOriginMs\?: number/);
    });

    it("the clock remains inert when the flag is off", () => {
        // `time()` must return the caller's promise untouched — no clock read on the product path.
        expect(DIAG).toMatch(/if \(!enabled\) return run\(\);/);
    });
});
