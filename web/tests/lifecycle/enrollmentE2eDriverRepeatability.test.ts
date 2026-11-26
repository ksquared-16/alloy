/**
 * THE CERTIFICATION SUITE MUST BE REPEATABLE.
 *
 * The defect this pins, in full, because the failure was convincing:
 *
 *   run 1 — D_confirmation proves prior truth is offered for confirmation, then E_collection walks
 *           the journey forward by confirming.
 *   run 2 — D_confirmation finds the journey already past those steps and reports that the product
 *           no longer offers confirmation.
 *
 * The product was correct on both runs. The suite had consumed its own precondition. A certification
 * artifact that manufactures a false product failure on its second invocation is worse than no
 * artifact at all, because the single thing it exists to settle is the first thing it gets wrong.
 *
 * The fix is that bootstrap OWNS the starting state: it resets, proves the namespace is empty,
 * rebuilds through canonical product paths and verifies twice, at the top of every invocation.
 *
 * These assertions hold the mechanism in place. The empirical proof is recorded in the commit: with
 * bootstrap inheriting state, run 2 failed at D_confirmation; with bootstrap owning state, runs 1
 * and 2 returned identical verdicts, 8 passed / 0 failed.
 */

import { describe, expect, it } from "vitest";

import { REAL_ENROLLMENT_V1_PHASES } from "@/lib/certification/enrollmentE2ePhases";
import { runEnrollmentCertification } from "@/lib/certification/enrollmentE2eDriver";

const phaseSource = () =>
    import("node:fs/promises").then((fs) =>
        fs.readFile(new URL("../../lib/certification/enrollmentE2ePhases.ts", import.meta.url), "utf8"),
    );

describe("bootstrap owns the starting state", () => {
    it("is the first phase, so nothing can mutate ahead of it", () => {
        expect(REAL_ENROLLMENT_V1_PHASES[0]?.key).toBe("A_bootstrap");
    });

    it("CALLS the reset, not merely imports it", async () => {
        /*
         * The first version of this assertion checked only that the name appeared in the phase body,
         * which the destructured import satisfies on its own. Deleting the actual call left the test
         * green — a pin that cannot catch its own defect, which is the exact failure this file was
         * written to stop. It now matches the invocation.
         */
        const src = await phaseSource();
        const body = src.slice(src.indexOf("const bootstrap: Phase"), src.indexOf("const entryState: Phase"));
        expect(body).toMatch(/await\s+removeEnrollmentCertificationFixture\(\s*ctx\.supabase/);
        expect(body).toMatch(/await\s+ensureEnrollmentCertification\(\s*ctx\.supabase/);
    });

    it("proves the namespace is EMPTY before rebuilding into it", async () => {
        /*
         * Rebuilding over residue is how a "fresh" fixture quietly inherits the previous run. The
         * reset must be checked, not assumed to have worked.
         */
        const src = await phaseSource();
        const body = src.slice(src.indexOf("const bootstrap: Phase"), src.indexOf("const entryState: Phase"));
        expect(body).toContain("refusing to rebuild over residue");
    });

    it("verifies twice and refuses unstable ids", async () => {
        const src = await phaseSource();
        const body = src.slice(src.indexOf("const bootstrap: Phase"), src.indexOf("const entryState: Phase"));
        expect(body).toContain("idsStable");
        expect(body).toContain("fixture is not idempotent");
    });
});

describe("mutation order is declared, not incidental", () => {
    const keyOf = (k: string) => REAL_ENROLLMENT_V1_PHASES.findIndex((p) => p.key === k);

    it("confirmation runs before the walk that consumes it", () => {
        // The precise ordering whose violation produced the false failure.
        expect(keyOf("D_confirmation")).toBeGreaterThan(-1);
        expect(keyOf("E_collection")).toBeGreaterThan(keyOf("D_confirmation"));
    });

    it("every mutating participant phase declares its predecessor", () => {
        const byKey = new Map(REAL_ENROLLMENT_V1_PHASES.map((p) => [p.key, p]));
        expect(byKey.get("D_confirmation")?.dependsOn).toContain("C_participant_entry");
        expect(byKey.get("E_collection")?.dependsOn).toContain("D_confirmation");
    });
});

describe("the harness refuses to call an unrun phase a pass", () => {
    it("a suite with unimplemented phases is not ok", async () => {
        const result = await runEnrollmentCertification(
            { supabase: {} as never, orgId: "org", actorUserId: null, facts: {} },
            [
                { key: "x", title: "x", async run() { return { status: "passed", detail: "" }; } },
                { key: "y", title: "y", async run() { return { status: "not_implemented", detail: "" }; } },
            ],
        );
        expect(result.ok).toBe(false);
    });

    it("a phase whose dependency failed is SKIPPED and names the blocker, not silently passed", async () => {
        const result = await runEnrollmentCertification(
            { supabase: {} as never, orgId: "org", actorUserId: null, facts: {} },
            [
                { key: "a", title: "a", async run() { return { status: "failed", detail: "boom" }; } },
                { key: "b", title: "b", dependsOn: ["a"], async run() { return { status: "passed", detail: "" }; } },
            ],
        );
        const b = result.phases.find((p) => p.key === "b");
        expect(b?.status).toBe("skipped");
        expect(b?.detail).toContain("a");
        expect(result.firstFailure?.key).toBe("a");
    });

    it("a thrown phase becomes a failure and does not erase earlier evidence", async () => {
        const result = await runEnrollmentCertification(
            { supabase: {} as never, orgId: "org", actorUserId: null, facts: {} },
            [
                { key: "a", title: "a", async run() { return { status: "passed", detail: "kept" }; } },
                { key: "b", title: "b", async run() { throw new Error("late failure"); } },
            ],
        );
        expect(result.phases.find((p) => p.key === "a")?.status).toBe("passed");
        expect(result.phases.find((p) => p.key === "b")?.detail).toContain("late failure");
    });
});
