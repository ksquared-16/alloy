/** @vitest-environment node */

/**
 * Projection ownership — the Work-Unit "Lead Count" metric must count the CANONICAL work-unit lead
 * membership (= queue rows), not the department-wide windowed rollup, when rendered in a work-unit
 * context. Department/workspace scope keeps the rollup only when no workUnitId is present.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricResolveContext } from "@/lib/metrics/types";

vi.mock("@/lib/metrics/scopeFilter", () => ({
    resolveMetricScopeFilter: vi.fn().mockResolvedValue({ impossible: false }),
    applyOpportunityScopeToQuery: (q: unknown) => q,
    applyTourBookingLocationScope: (q: unknown) => q,
}));

const countMock = vi.fn();
vi.mock("@/lib/queues/workUnitLeadMembership", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/queues/workUnitLeadMembership")>();
    return { ...actual, countWorkUnitLeadMembership: (...a: unknown[]) => countMock(...a) };
});

import { resolveEnrollmentLeadCount } from "@/lib/metrics/resolvers/eventWindowMetrics";

type Chain = {
    select: () => Chain;
    eq: () => Chain;
    gte: () => Chain;
    lte: () => Chain;
    then: (onF: (v: unknown) => unknown) => Promise<unknown>;
};
function supabaseWithDeptRows(rows: unknown[]): SupabaseClient {
    const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (onF) => Promise.resolve({ data: rows, error: null }).then(onF),
    };
    return { from: () => chain } as unknown as SupabaseClient;
}
function ctx(over: Partial<MetricResolveContext>): MetricResolveContext {
    return {
        supabase: supabaseWithDeptRows([{}, {}, {}]), // 3 dept-wide rows for the rollup path
        orgId: "org-1",
        scope: {} as MetricResolveContext["scope"],
        window: "rolling_30d",
        ...over,
    } as MetricResolveContext;
}

describe("resolveEnrollmentLeadCount — Work-Unit vs department scope", () => {
    beforeEach(() => countMock.mockReset());

    it("WORK-UNIT context → counts the canonical WU membership (= queue), not the dept rollup", async () => {
        countMock.mockResolvedValue(2);
        const res = await resolveEnrollmentLeadCount(ctx({ workUnitId: "wu-1" }));
        expect(countMock).toHaveBeenCalledWith(expect.anything(), { orgId: "org-1", workUnitId: "wu-1" });
        expect(res.value).toBe(2); // the shared membership count, NOT the 3 dept-wide rows
    });

    it("DEPARTMENT/workspace context (no workUnitId) → windowed dept rollup, NOT the WU membership", async () => {
        const res = await resolveEnrollmentLeadCount(ctx({ workUnitId: null }));
        expect(countMock).not.toHaveBeenCalled();
        expect(res.value).toBe(3); // dept query's row count
    });
});
