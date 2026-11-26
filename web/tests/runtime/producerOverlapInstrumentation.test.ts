/**
 * THE OVERLAP MUST BE MEASURABLE, NOT INFERRED FROM THE BLOCK THAT SHRANK.
 *
 * `inner_compose_ms` and `card_producers_ms` were a complete description of this route while its
 * three awaits ran in series: they named two ADJACENT blocks. Slice 12F moved the producers to run
 * BESIDE composition, and that silently changed what `card_producers_ms` means — it is now only the
 * residual join, not the producer wall. A deployed sample would show it collapse from ~858ms to
 * near zero, and reading that as "the producers got faster" would be false: nothing about them
 * changed except when they were started.
 *
 * This is the same failure the route's own comments already record twice — `compose_wall_ms` named
 * a "prelude" that straddled the composer, and a restated span list that dropped `financials` to
 * null on every deployed sample while nineteen local gates passed. Both were precise, confident
 * numbers for something other than the thing named.
 *
 * So these gates hold the instrument itself: that the overlap spans exist, that they are EMITTED
 * and not merely recorded, that the producer and participant CALL COUNTS are taken at the real call
 * sites on both paths, and that the join's outcome keeps its branches apart. The counts matter more
 * than the clocks — the acceptance condition for the matching path is exactly one producer
 * invocation, and no duration can tell a reuse apart from a second run that happened to be quick.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** Comments state intent; they must never satisfy a gate. */
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = codeOf(read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"));
const TIMING = codeOf(read("lib/perf/routeTimingDiagnostic.ts"));

/** The listener body — where the speculative run is started. */
const LISTENER = (() => {
    const start = ROUTE.indexOf("onSubjectResolved: (");
    expect(start).toBeGreaterThan(-1);
    return ROUTE.slice(start, ROUTE.indexOf("\n        },", start));
})();

/** The `recordRouteTiming({...})` payload — what actually reaches the document. */
const EMITTED = (() => {
    const start = ROUTE.indexOf("recordRouteTiming({");
    expect(start).toBeGreaterThan(-1);
    const end = ROUTE.indexOf("} catch", start);
    expect(end).toBeGreaterThan(start);
    return ROUTE.slice(start, end);
})();

describe("the overlap spans reach the document", () => {
    it("the span group is EMITTED, not only recorded", () => {
        /*
         * Slice 12E recorded `financials` correctly and the emit dropped it, because the emit
         * restated fields by name. Recording a span proves nothing about the payload.
         */
        expect(EMITTED).toContain("overlap: {");
        expect(EMITTED).toContain("overlap_ms: overlapDiag.overlap_ms");
        expect(EMITTED).toContain("tail_ms: overlapDiag.tail_ms");
        expect(EMITTED).toContain("outcome: overlapDiag.outcome");
    });

    it("the emit still preserves whatever deeper boundaries stashed", () => {
        // The spread is what keeps `producers` and `financials` alive through this write.
        expect(EMITTED).toMatch(/\.\.\.\(already \?\? \{\}\)/);
    });

    it("the type declares the group, so a dropped field is a build error", () => {
        expect(TIMING).toContain("overlap?: {");
        for (const field of [
            "announce_offset_ms",
            "participant_ms",
            "producers_ms",
            "early_total_ms",
            "early_end_offset_ms",
            "compose_end_offset_ms",
            "overlap_ms",
            "tail_ms",
            "producer_invocations",
            "participant_reads",
        ]) {
            expect(TIMING).toContain(field);
        }
    });

    it("the diagnostic is never load-bearing", () => {
        // The whole emit sits inside the existing try/catch; a diagnostic may not cost an answer.
        const guarded = ROUTE.slice(ROUTE.indexOf("if (timing) {", ROUTE.indexOf("cardProducersMs =")));
        expect(guarded).toContain("try {");
        expect(guarded.indexOf("try {")).toBeLessThan(guarded.indexOf("recordRouteTiming({"));
    });
});

describe("the call counts are taken at the real call sites", () => {
    /*
     * These are the acceptance gate for Part 5. `producer_invocations` must be 1 on the matching
     * path; 2 means the early run and the canonical fallback both executed, which is the exact
     * defect the overlap could introduce and which no timing would reveal.
     */
    it("every producer call site increments the producer counter", () => {
        const sites = [...ROUTE.matchAll(/projectFocusPanelCardProducers\(\{/g)].length;
        const counts = [...ROUTE.matchAll(/overlapDiag\.producer_invocations \+= 1/g)].length;
        expect(sites).toBeGreaterThanOrEqual(2);
        expect(counts).toBe(sites);
    });

    it("every participant call site increments the participant counter", () => {
        const sites = [...ROUTE.matchAll(/resolveSoleEnrollmentParticipantForOpportunity\(\{/g)].length;
        const counts = [...ROUTE.matchAll(/overlapDiag\.participant_reads \+= 1/g)].length;
        expect(sites).toBeGreaterThanOrEqual(2);
        expect(counts).toBe(sites);
    });

    it("the speculative run counts its own producer call", () => {
        // If only the canonical site counted, a duplicate execution would report as one.
        expect(LISTENER).toContain("overlapDiag.producer_invocations += 1");
        expect(LISTENER).toContain("overlapDiag.participant_reads += 1");
    });

    it("the counters are not gated on the timing flag", () => {
        /*
         * A count that exists only when the flag is on cannot be compared against a run without it,
         * and the increments are a `+= 1` on a local object — there is nothing to save by hiding
         * them behind a branch.
         */
        const listenerCount = LISTENER.indexOf("overlapDiag.producer_invocations += 1");
        const listenerTimingBranch = LISTENER.indexOf("if (timing) {");
        expect(listenerCount).toBeGreaterThan(-1);
        // The first `if (timing)` in the listener comes AFTER the participant read, so a counter
        // placed before it cannot be inside it.
        expect(LISTENER.indexOf("overlapDiag.participant_reads += 1")).toBeLessThan(
            listenerTimingBranch === -1 ? Number.MAX_SAFE_INTEGER : listenerTimingBranch,
        );
    });
});

describe("the join's outcome keeps its branches apart", () => {
    const OUTCOME = (() => {
        const start = ROUTE.indexOf("overlapDiag.outcome = ");
        expect(start).toBeGreaterThan(-1);
        return ROUTE.slice(start, start + 700);
    })();

    it("all six causes are distinguishable", () => {
        /*
         * Each implies a different repair: a wrong announcement, a child-grain household moving
         * underneath the speculation, a thrown chain, or nothing to speculate on at all. Collapsing
         * them into "not used" would hide which is happening, and only one is worth fixing.
         */
        for (const cause of [
            '"no_announcement"',
            '"early_failed"',
            '"subject_mismatch"',
            '"customer_mismatch"',
            '"used"',
        ]) {
            expect(OUTCOME).toContain(cause);
        }
        expect(ROUTE).toContain('overlapDiag.outcome = "not_operational"');
    });

    it("a failed speculation is not reported as an absent one", () => {
        // Both produce `null`; only the catch can tell them apart.
        expect(ROUTE).toContain("overlapDiag.early_rejected = true");
        expect(OUTCOME).toContain("overlapDiag.early_rejected");
    });

    it("the outcome is decided by the same predicates the behaviour uses", () => {
        // A second, parallel judgement could report `used` on a run the join discarded.
        expect(OUTCOME).toContain("earlySubjectMatches");
        expect(OUTCOME).toContain("earlyRunUsable");
    });
});

describe("the derived spans are arithmetic on measured marks", () => {
    const DERIVE = (() => {
        const start = ROUTE.indexOf("overlapDiag.overlap_ms = Math.max(");
        expect(start).toBeGreaterThan(-1);
        return ROUTE.slice(start, start + 600);
    })();

    it("overlap is bounded by whichever of the two finished first", () => {
        expect(DERIVE).toContain("Math.min(overlapDiag.early_end_offset_ms, composeEnd)");
        expect(DERIVE).toContain("overlapDiag.announce_offset_ms");
    });

    it("neither derived span can go negative", () => {
        // A run that finished before composition has NO tail; it does not have a negative one.
        expect(DERIVE).toContain("overlapDiag.overlap_ms = Math.max(\n                0,");
        expect(DERIVE).toContain("overlapDiag.tail_ms = Math.max(\n                0,");
    });

    it("composition's end comes from the existing authority, not a second clock", () => {
        /*
         * Re-timing composition here would create two numbers that can disagree — the defect the
         * route-timing collector's own header calls out.
         */
        expect(ROUTE).toContain("overlapDiag.compose_end_offset_ms = timing ? Math.round(innerComposeMs) : null");
    });

    it("the announcement offset is measured from compose start", () => {
        // Measured from anywhere else it cannot be compared against `inner_compose_ms`.
        expect(ROUTE).toContain("overlapDiag.announce_offset_ms = timing ? Math.round(tAnnounce - tInner) : null");
    });
});
