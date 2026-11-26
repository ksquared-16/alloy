/**
 * WALL VERSUS SUM — the distinction this programme has already mis-read once.
 *
 * `children_orientation_ms` was a `reduce(+)` over nested, partly overlapping legs. It measured
 * 979ms against the 870ms wall of the phase that CONTAINS it, so read as a wall it invented ~109ms
 * of work that never happened, and added to a sibling phase it would invent far more. Two slices
 * of this programme reported "expensive families" built on exactly that arithmetic.
 *
 * The fix is a naming contract rather than a comment: a phase whose value is nested-inclusive ends
 * `_sum_ms`, and nothing ending `_sum_ms` may be treated as wall time. This gate keeps the contract
 * honest, because the next person to add a `reduce` over sub-phases will not have read the comment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SHARED = readFileSync(
    join(process.cwd(), "lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts"),
    "utf8",
);

describe("nested-inclusive phases are named as sums", () => {
    it("the children orientation total is published as a sum, not as a wall", () => {
        expect(SHARED).toContain("children_orientation_sum_ms");
        expect(SHARED).not.toMatch(/phases_ms\.children_orientation_ms\s*=/);
    });

    it("every phase assigned from a reduce over sub-phases ends _sum_ms", () => {
        // Any `phases_ms.<name> = ...reduce(` must declare itself a sum.
        const assignments = [...SHARED.matchAll(/phases_ms\.([A-Za-z0-9_]+)\s*=\s*([^;]+);/g)];
        const reduced = assignments.filter(([, , rhs]) => rhs.includes(".reduce("));
        expect(reduced.length).toBeGreaterThan(0);
        for (const [, name] of reduced) {
            expect(name.endsWith("_sum_ms"), `${name} totals sub-phases and must end _sum_ms`).toBe(true);
        }
    });

    it("the real wall for that work is still published", () => {
        // visible_shell_children_ms is the wall; the sum is diagnostic beside it, never instead.
        const record = readFileSync(join(process.cwd(), "lib/admin/opportunityEntityRecord.ts"), "utf8");
        expect(record).toContain("shell_children_ms");
    });
});
