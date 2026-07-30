import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    getOpportunityStageWorkInflight,
    getOpportunityStageWorkWarm,
    invalidateOpportunityStageWorkCache,
    opportunityStageWorkCacheKey,
    prefetchOpportunityStageWork,
    resetOpportunityStageWorkCacheForTests,
    seedOpportunityStageWork,
} from "@/lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource";

const SLICE = { stage_work_runtime: { stage_key: "s" }, published_stage_inputs: null, work_intent_runtime: null };

function mockFetch() {
    const calls: string[] = [];
    const fn = vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => SLICE } as unknown as Response;
    });
    (globalThis as { fetch?: unknown }).fetch = fn;
    return { calls, fn };
}

const A = { orgScope: "org-1", opportunityId: "opp-A", departmentId: "dept-1", stageKey: "qualification" };
const B = { orgScope: "org-1", opportunityId: "opp-B", departmentId: "dept-1", stageKey: "qualification" };

beforeEach(() => resetOpportunityStageWorkCacheForTests());
afterEach(() => vi.restoreAllMocks());

describe("opportunityStageWorkResource — canonical ownership", () => {
    it("cache key is null without a stage, stable otherwise, and record-scoped", () => {
        expect(opportunityStageWorkCacheKey({ ...A, stageKey: null })).toBeNull();
        expect(opportunityStageWorkCacheKey({ ...A, opportunityId: "" })).toBeNull();
        expect(opportunityStageWorkCacheKey(A)).toBe(opportunityStageWorkCacheKey({ ...A }));
        expect(opportunityStageWorkCacheKey(A)).not.toBe(opportunityStageWorkCacheKey(B));
    });

    it("§3 two concurrent consumers share ONE in-flight request (dedup)", async () => {
        const { calls } = mockFetch();
        const p1 = prefetchOpportunityStageWork(A);
        const p2 = getOpportunityStageWorkInflight(A) ?? prefetchOpportunityStageWork(A);
        expect(getOpportunityStageWorkInflight(A)).not.toBeNull();
        await Promise.all([p1, p2]);
        expect(calls).toHaveLength(1);
    });

    it("§3 hover then click reuses the warm entry — no second request", async () => {
        const { calls } = mockFetch();
        await prefetchOpportunityStageWork(A); // hover
        expect(getOpportunityStageWorkWarm(A)).toEqual(SLICE);
        const onClick = getOpportunityStageWorkWarm(A) ?? (await prefetchOpportunityStageWork(A));
        expect(onClick).toEqual(SLICE);
        expect(calls).toHaveLength(1);
    });

    it("§3 click without prior hover issues exactly one request", async () => {
        const { calls } = mockFetch();
        await prefetchOpportunityStageWork(A);
        expect(calls).toHaveLength(1);
    });

    it("§3 rapid A → B → A: A resolves from cache, one request per distinct record", async () => {
        const { calls } = mockFetch();
        await prefetchOpportunityStageWork(A);
        await prefetchOpportunityStageWork(B);
        const aAgain = getOpportunityStageWorkWarm(A);
        expect(aAgain).toEqual(SLICE); // cached return, synchronous
        expect(calls).toHaveLength(2); // A and B only
    });

    it("§4.8 a response for record A never lands on record B (record-scoped keys)", async () => {
        mockFetch();
        await prefetchOpportunityStageWork(A);
        expect(getOpportunityStageWorkWarm(A)).toEqual(SLICE);
        expect(getOpportunityStageWorkWarm(B)).toBeNull();
    });

    it("§3 a failed prefetch does not poison the cache; a later click retries", async () => {
        let attempt = 0;
        (globalThis as { fetch?: unknown }).fetch = vi.fn(async () => {
            attempt += 1;
            if (attempt === 1) throw new Error("network");
            return { ok: true, json: async () => SLICE } as unknown as Response;
        });
        const first = await prefetchOpportunityStageWork(A);
        expect(first).toBeNull();
        expect(getOpportunityStageWorkWarm(A)).toBeNull();
        const second = await prefetchOpportunityStageWork(A);
        expect(second).toEqual(SLICE);
        expect(attempt).toBe(2);
    });

    it("org switch flushes the cache (partition)", async () => {
        mockFetch();
        await prefetchOpportunityStageWork(A);
        expect(getOpportunityStageWorkWarm(A)).toEqual(SLICE);
        invalidateOpportunityStageWorkCache({ orgScope: "org-1" });
        expect(getOpportunityStageWorkWarm(A)).toBeNull();
    });

    it("mutation invalidation drops only the affected record", async () => {
        mockFetch();
        await prefetchOpportunityStageWork(A);
        await prefetchOpportunityStageWork(B);
        invalidateOpportunityStageWorkCache({ opportunityId: "opp-A" });
        expect(getOpportunityStageWorkWarm(A)).toBeNull();
        expect(getOpportunityStageWorkWarm(B)).toEqual(SLICE);
    });

    it("CP-2 seed reuse: provisioning seed satisfies warm resolve without a network fetch", async () => {
        const { calls } = mockFetch();
        const seeded = seedOpportunityStageWork(A, SLICE as never);
        expect(seeded).toBe(true);
        expect(getOpportunityStageWorkWarm(A)).toEqual(SLICE);
        const again = await prefetchOpportunityStageWork(A);
        expect(again).toEqual(SLICE);
        expect(calls).toHaveLength(0);
    });

    it("CP-2 seed does not clobber a still-fresh fetched entry", async () => {
        const { calls } = mockFetch();
        await prefetchOpportunityStageWork(A);
        expect(calls).toHaveLength(1);
        const seeded = seedOpportunityStageWork(A, {
            stage_work_runtime: { stage_key: "other" },
            published_stage_inputs: null,
            work_intent_runtime: null,
        } as never);
        expect(seeded).toBe(false);
        expect(getOpportunityStageWorkWarm(A)).toEqual(SLICE);
    });
});
