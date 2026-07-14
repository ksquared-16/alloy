/**
 * Batched Work View totals client — ONE browser request for N targets (Trust Closure §2 request
 * count 1/5/20 → 1), correct key mapping, and known/unknown handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    fetchQueueViewTotalsBatched,
    clearQueueViewTotalsBatchedDedupeForTests,
} from "@/lib/presentation/runtime/fetchQueueViewTotalsBatched";

beforeEach(() => clearQueueViewTotalsBatchedDedupeForTests());

function mockFetchReturning(totals: Array<{ workUnitId: string; workViewId: string; count: number | null; known: boolean }>) {
    return vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
            new Response(JSON.stringify({ generatedAt: "t", totals }), { status: 200 }),
    );
}

function targets(n: number) {
    return Array.from({ length: n }, (_, i) => ({ workUnitId: "wu-1", queueKey: "all", workViewId: `v${i}` }));
}

describe("fetchQueueViewTotalsBatched — one request for many targets", () => {
    it.each([1, 5, 20])("issues exactly ONE request for %i targets", async (n) => {
        const fetchImpl = mockFetchReturning(targets(n).map((t) => ({ workUnitId: t.workUnitId, workViewId: t.workViewId, count: 3, known: true })));
        await fetchQueueViewTotalsBatched({ targets: targets(n), selectedSiteId: null, fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("POSTs the targets to the grouped endpoint", async () => {
        const fetchImpl = mockFetchReturning([]);
        await fetchQueueViewTotalsBatched({ targets: targets(3), selectedSiteId: "site-a", fetchImpl });
        const call = fetchImpl.mock.calls[0]!;
        const url = call[0];
        const init = call[1]!;
        expect(url).toBe("/api/admin/queue-view-totals");
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body as string);
        expect(body.targets).toHaveLength(3);
        expect(body.selectedSiteId).toBe("site-a");
    });

    it("maps counts by workUnitId::workViewId and drops unknown counts to null (no wrong badge)", async () => {
        const fetchImpl = mockFetchReturning([
            { workUnitId: "wu-1", workViewId: "v0", count: 7, known: true },
            { workUnitId: "wu-1", workViewId: "v1", count: 99, known: false }, // unknown → null
        ]);
        const map = await fetchQueueViewTotalsBatched({ targets: targets(2), selectedSiteId: null, fetchImpl });
        expect(map.get("wu-1::v0")).toBe(7);
        expect(map.get("wu-1::v1")).toBeNull();
    });

    it("coalesces concurrent identical requests into ONE POST (dedup across consumers)", async () => {
        const fetchImpl = mockFetchReturning([]);
        // Runtime + sidebar + workspace surface asking for the SAME targets at once → one request.
        await Promise.all([
            fetchQueueViewTotalsBatched({ targets: targets(5), selectedSiteId: null, fetchImpl }),
            fetchQueueViewTotalsBatched({ targets: targets(5), selectedSiteId: null, fetchImpl }),
            fetchQueueViewTotalsBatched({ targets: targets(5), selectedSiteId: null, fetchImpl }),
        ]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("reuses a recent identical response instead of re-POSTing within the TTL window", async () => {
        const fetchImpl = mockFetchReturning([]);
        await fetchQueueViewTotalsBatched({ targets: targets(3), selectedSiteId: null, fetchImpl });
        await fetchQueueViewTotalsBatched({ targets: targets(3), selectedSiteId: null, fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("throws on HTTP failure so the caller can fall back to the per-view path", async () => {
        const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
        await expect(
            fetchQueueViewTotalsBatched({ targets: targets(2), selectedSiteId: null, fetchImpl }),
        ).rejects.toThrow();
    });
});
