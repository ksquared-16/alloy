import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const resolveSpy = vi.fn();

vi.mock("@/lib/admin/actions/resolveActionsForContext", () => ({
    resolveActionsForContext: (...args: unknown[]) => {
        resolveSpy(...args);
        return Promise.resolve({ record_header: [], header: [] });
    },
}));

import { resolveOpportunityDrawerFirstPaintDependencies } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies";

const baseParams = () =>
    ({
        supabase: {} as never,
        gate: { orgId: "org-1" } as never,
        opportunityId: "opp-1",
        departmentId: "dept-1",
        workUnitId: "wu-1",
        statusKey: "new",
        record: { metadata: {} },
        dependencies: ["header_actions"] as never,
        queueDefinition: null,
        statusDefs: [],
        wuMetadata: null,
        departmentMetadata: null,
        readiness: null,
    }) as never;

/**
 * OX J5 — ONE resolveActionsForContext PER SELECTED DRAWER LIFECYCLE.
 *
 * The carrier resolves the canonical action authority at its own dependency boundary, ~1,700ms
 * before the first-paint block would. That is only sound if the first-paint consumer AWAITS that
 * same resolution rather than issuing its own — otherwise the drawer pays for two identical
 * eligibility resolutions and the system has two answers to one question.
 *
 * An earlier attempt at this slice produced exactly that regression: the early producer was added
 * before the parameter was threaded, so both ran. It was reverted rather than shipped. This test is
 * the guard that makes the mistake impossible to repeat silently.
 */
describe("single action resolver per drawer lifecycle", () => {
    beforeEach(() => resolveSpy.mockClear());

    it("CONSUMES the threaded resolution and does NOT resolve again", async () => {
        const early = Promise.resolve({ record_header: [{ id: "a" }], header: [] } as never);
        const out = await resolveOpportunityDrawerFirstPaintDependencies(
            Object.assign({}, baseParams() as object, { earlyHeaderActions: early }) as never,
        );
        expect(resolveSpy, "the threaded promise must be awaited, not duplicated").not.toHaveBeenCalled();
        // And the threaded answer is the one that reaches the payload.
        expect((out.data as Record<string, unknown>).header_actions).toEqual({
            record_header: [{ id: "a" }],
            header: [],
        });
    });

    it("SAME INPUTS OR NOTHING — the early resolve is skipped when the department is not yet known", () => {
        /*
         * The first-paint resolver receives the fully-derived departmentId, whose last fallback is
         * `record._work_unit_department_id` — a field that exists only after the visible payload is
         * built. Resolving early with a null department where the later path would have found one
         * changes the action set, so the early attempt is gated on the department already being
         * known from the request context or the work-unit row.
         */
        const SHARED = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "../../../lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts"),
            "utf8",
        );
        expect(SHARED).toContain("const earlyDepartmentId = ctxDept || trimOrNull(earlyWu?.department_id) || null;");
        expect(SHARED).toContain("earlyDepartmentId ?");
        // A swallowed rejection would become an authoritative empty action set.
        expect(SHARED).not.toMatch(/resolveActionsForContext\([\s\S]{0,1200}?\}\)\.catch\(/);
    });

    it("falls back to its own resolution when nothing was threaded", async () => {
        // The fallback must survive: a caller that has not started the resolution still works.
        await resolveOpportunityDrawerFirstPaintDependencies(baseParams());
        expect(resolveSpy).toHaveBeenCalledTimes(1);
    });
});
