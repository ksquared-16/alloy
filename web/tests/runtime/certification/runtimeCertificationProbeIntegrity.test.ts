/**
 * THE HARNESS THAT GATES EVERYTHING HAD NO TESTS.
 *
 * `scripts/runtime-certification/runtimeCertification.mjs` decides whether runtime behaviour is
 * still healthy, and nothing tested it. That is how this shipped: `--subset waitlist` was routed
 * here by TRIGGER_MATRIX, `runCertification` had no waitlist branch, so the run opened no page,
 * measured nothing, found zero failures and printed PASS with exit 0.
 *
 * Every probe-integrity check was written as `if (results.<key>)`, which cannot see a subset that
 * produced NO results object. The gate was blind to precisely the case it existed to catch — and
 * its own comment says a harness that passes on an unmeasured run "is worse than no harness".
 *
 * These tests assert the property directly, with no browser, so the gate itself is certified.
 */
import { describe, expect, it } from "vitest";
import {
    evaluate,
    SUBSETS,
    SUBSET_OWNERSHIP,
    INVARIANTS_ASSERTED_HERE,
    INVARIANTS_DELEGATED,
    TRIGGER_MATRIX,
} from "../../../../scripts/runtime-certification/runtimeCertification.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE = JSON.parse(
    readFileSync(join(process.cwd(), "..", "scripts/runtime-certification/baseline.json"), "utf8"),
);

/** A fully measured, healthy work-unit run — the positive control for every failing case below. */
function healthyWorkUnit() {
    return {
        subsets: ["work-unit"],
        workUnit: {
            apiTotal: 45,
            p50: { ttfb: 300, shell: 500, rows: 700, firstUsefulCard: 900 },
            cardReads: {
                financials: { total: 1, maxPerSubject: 1 },
                attendance: { total: 1, maxPerSubject: 1 },
                health: { total: 1, maxPerSubject: 1 },
            },
            remounts: [],
            duplicates: { redundant: [] },
        },
    };
}

describe("probe integrity — an unmeasured run is never a pass", () => {
    it("PASSES a genuinely measured healthy run (the control that keeps the gate honest)", () => {
        const v = evaluate(healthyWorkUnit());
        expect(v.failures).toEqual([]);
        expect(v.pass).toBe(true);
    });

    it("FAILS a requested harness subset that produced no measurements", () => {
        // This is the shape that used to print PASS: subset asked for, nothing came back.
        const v = evaluate({ subsets: ["work-unit"] });
        expect(v.pass).toBe(false);
        expect(v.failures.join(" ")).toContain('subset "work-unit" was requested but produced no measurements');
    });

    it("FAILS --subset waitlist rather than certifying it, and names the runner that owns it", () => {
        const v = evaluate({ subsets: ["waitlist"] });
        expect(v.pass).toBe(false);
        expect(v.delegated).toHaveLength(1);
        expect(v.delegated[0].subset).toBe("waitlist");
        expect(v.failures.join(" ")).toContain("waitlist-manual-position-truth.cert.spec.ts");
    });

    it("FAILS an unknown subset instead of silently certifying nothing", () => {
        const v = evaluate({ subsets: ["nonsense"] });
        expect(v.pass).toBe(false);
        expect(v.failures.join(" ")).toContain('unknown subset "nonsense"');
    });

    it("a delegated subset never counts as measurement by this harness", () => {
        // waitlist alone cannot carry a pass, even though it is a legitimate declared subset.
        const v = evaluate({ subsets: ["waitlist"] });
        expect(v.failures.join(" ")).toContain("this harness measured nothing");
    });
});

describe("the gate still catches real regressions", () => {
    it("fails a second authoritative financials read for one subject intent", () => {
        const r = healthyWorkUnit();
        r.workUnit.cardReads.financials.maxPerSubject = 2;
        const v = evaluate(r);
        expect(v.pass).toBe(false);
        expect(v.failures.join(" ")).toContain("financials read 2x");
    });

    it("fails a document load on an in-app transition", () => {
        const v = evaluate({
            subsets: ["workspace"],
            workspace: { transitions: [{ name: "Workspace -> Work Unit", docLoads: 1, shellSameNode: true }] },
        });
        expect(v.pass).toBe(false);
        expect(v.failures.join(" ")).toContain("caused 1 document load");
    });

    it("fails a lost workspace shell node", () => {
        const v = evaluate({
            subsets: ["workspace"],
            workspace: { transitions: [{ name: "Workspace -> Work Unit", docLoads: 0, shellSameNode: false }] },
        });
        expect(v.pass).toBe(false);
        expect(v.failures.join(" ")).toContain("did not preserve the workspace shell node");
    });
});

describe("baseline / harness drift", () => {
    /**
     * A baseline entry that reads like a law but is consulted by nothing is worse than no entry:
     * it is quoted as evidence. Three were inert before this guard existed.
     */
    it("every declared hard invariant is either asserted here or delegated to a named runner", () => {
        const declared = Object.keys(BASELINE.hard_invariants).filter((k) => !k.startsWith("_"));
        expect(declared.length).toBeGreaterThan(0); // the guard is pointless if it scans nothing
        const orphans = declared.filter(
            (k) => !INVARIANTS_ASSERTED_HERE.has(k) && !INVARIANTS_DELEGATED[k],
        );
        expect(orphans, `declared but nothing asserts them: ${orphans.join(", ")}`).toEqual([]);
    });

    it("every subset the trigger matrix can route to is a subset the harness knows how to account for", () => {
        const routed = new Set(TRIGGER_MATRIX.flatMap((r) => r.run));
        expect(routed.size).toBeGreaterThan(0);
        for (const s of routed) {
            expect(SUBSETS, `TRIGGER_MATRIX routes to unknown subset "${s}"`).toContain(s);
            expect(SUBSET_OWNERSHIP[s], `subset "${s}" has no declared owner`).toBeTruthy();
        }
    });

    it("every declared subset says who measures it", () => {
        for (const s of SUBSETS) {
            const own = SUBSET_OWNERSHIP[s];
            expect(own, `subset "${s}" has no ownership entry`).toBeTruthy();
            // A subset not measured here must name the runner that does — otherwise it certifies nothing.
            if (!own.measuredHere) expect(typeof own.certifiedBy).toBe("string");
        }
    });
});
