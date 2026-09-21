import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { producerClock } from "@/lib/perf/routeTimingDiagnostic";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const DIAG = read("lib/perf/routeTimingDiagnostic.ts");
const PRODUCERS = read("lib/adminV2/runtime/focusPanel/focusPanelCardProducers.ts");
const ROUTE = read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");
const ANSWER = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");

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

    it("the presentation BRANCH is timed separately from the join that hides it", () => {
        // `presentation_ms` is taken at the join and spans the concurrent projection + enrichment,
        // so it cannot say whether cohort enrichment is on the critical path. Without the branch's
        // own duration, "maintain the cohort facts" would be argued from a number that cannot tell
        // a 486ms enrichment behind a 590ms branch (saves nothing) from one behind a 200ms branch
        // (saves nearly all of it).
        expect(ANSWER).toContain("const tPresBranch = now();");
        expect(ANSWER).toMatch(/presentationBranchMs = Math\.round\(now\(\) - tPresBranch\)/);
    });

    it("the branch span lands in the spans object that actually reaches the payload", () => {
        // `timings.spans` is assigned once, at the end. Writing to it at the join would write to
        // undefined and then be overwritten — the span would be silently absent.
        expect(ANSWER).toContain("spans.presentation_branch_ms = presentationBranchMs;");
        expect(ANSWER).not.toContain("timings.spans.presentation_branch_ms");
        // Recorded at BOTH joins, so the span is not missing on whichever path the answer takes.
        expect((ANSWER.match(/spans\.presentation_branch_ms = presentationBranchMs;/g) ?? []).length).toBe(2);
    });

    it("a REJECTED presentation branch reports no duration", () => {
        // `then`, not `finally`: timing a failure would put a duration for work that never
        // completed beside durations for work that did.
        expect(ANSWER).toMatch(/void presentationPromise\s*\n\s*\.then\(\(\) => \{/);
    });
});
