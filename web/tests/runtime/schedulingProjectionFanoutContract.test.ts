import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `loadSchedulingProjectionForChild` runs ONCE PER INQUIRY CHILD. On the certification tenant that is
 * seventeen invocations for one card, and per-child timing shows what the aggregate hides:
 *
 *   children 17 · leg wall 239-316 ms · CUMULATIVE database work 3,116-3,903 ms
 *
 * The leg's wall time is the slowest child; the fan-out is compressed by concurrency, not absent. So
 * anything on a child's own critical path is paid seventeen times over, and two independent reads
 * awaited in sequence cost seventeen extra round trips.
 *
 * The pattern ids and the assignment-type ids both come from `assignmentRows`, which is already in
 * hand when both are requested — neither read informs the other. Measured after making them
 * concurrent: the scheduling leg's median fell from 451 ms to 347 ms.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = strip(
    readFileSync(join(__dirname, "..", "..", "lib/scheduling/projection/buildSchedulingProjection.ts"), "utf8"),
);

describe("per-child scheduling projection", () => {
    it("requests patterns and assignment types concurrently", () => {
        expect(src).toMatch(/await Promise\.all\(\[\s*loadPatterns\(/);
    });

    it("no longer awaits them one after the other", () => {
        // The pre-fix shape: `const patterns = await loadPatterns(...)` followed by
        // `const assignmentTypes = await loadAssignmentTypes(...)`.
        expect(src).not.toMatch(/const patterns = await loadPatterns\(/);
        expect(src).not.toMatch(/const assignmentTypes = await loadAssignmentTypes\(/);
    });

    /**
     * Both still read the SAME ids from the SAME already-loaded rows — concurrency must not become
     * an excuse to widen either query. `loadPatterns` takes every assignment's pattern id;
     * `loadAssignmentTypes` takes the non-null assignment-type ids.
     */
    it("still derives both id sets from the assignment rows already in hand", () => {
        expect(src).toMatch(/loadPatterns\(supabase, orgId, assignmentRows\.map\(\(a\) => a\.schedule_pattern_id\)\)/);
        expect(src).toMatch(/assignmentRows\.map\(\(a\) => a\.operational_assignment_type_id\)\.filter\(/);
    });

    /** Both reads remain organisation-scoped: concurrency changes ordering, never access. */
    it("both reference reads stay filtered on org_id", () => {
        const patterns = src.slice(src.indexOf("async function loadPatterns"));
        expect(patterns.slice(0, 900)).toMatch(/\.eq\("org_id", orgId\)/);
        const types = src.slice(src.indexOf("async function loadAssignmentTypes"));
        expect(types.slice(0, 900)).toMatch(/\.eq\("org_id", orgId\)/);
    });

    it("POSITIVE CONTROL — the comment stripper does not hide a real sequential await", () => {
        expect(strip("/* const patterns = await loadPatterns(x) */\nfoo();")).not.toMatch(/const patterns = await loadPatterns\(/);
        expect(strip("/* note */\nconst patterns = await loadPatterns(x);")).toMatch(/const patterns = await loadPatterns\(/);
    });
});
