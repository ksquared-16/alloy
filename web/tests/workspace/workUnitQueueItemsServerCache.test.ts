import { describe, expect, it, beforeEach } from "vitest";

import {
    buildWorkUnitQueueItemsServerCacheKey,
    clearWorkUnitQueueItemsServerCacheForTests,
    readWorkUnitQueueItemsServerCache,
    writeWorkUnitQueueItemsServerCache,
    WORK_UNIT_QUEUE_ITEMS_SERVER_CACHE_TTL_MS,
} from "@/lib/workspace/workUnitQueueItemsServerCache";

describe("workUnitQueueItemsServerCache", () => {
    beforeEach(() => {
        clearWorkUnitQueueItemsServerCacheForTests();
    });

    it("isolates cache keys by org, work unit, site scope, and queue key", () => {
        const base = {
            orgId: "org-1",
            workUnitId: "wu-1",
            queueKey: "new_inquiry",
            attentionBucketKey: null as string | null,
            limit: 8,
            offset: 0,
            rowEnrichment: "queue_list" as const,
            omitTotalCount: true,
            countAccuracy: "exact",
        };
        const keyA = buildWorkUnitQueueItemsServerCacheKey({
            ...base,
            queueScopeKey: "fp1|view:site-a|ok",
        });
        const keyB = buildWorkUnitQueueItemsServerCacheKey({
            ...base,
            queueScopeKey: "fp1|view:site-b|ok",
        });
        const keyC = buildWorkUnitQueueItemsServerCacheKey({
            ...base,
            queueKey: "follow_up",
            queueScopeKey: "fp1|view:site-a|ok",
        });
        expect(keyA).not.toBe(keyB);
        expect(keyA).not.toBe(keyC);

        writeWorkUnitQueueItemsServerCache(keyA, {
            result: { total: 1, items: [{ id: "a" }] } as never,
            rowsPerf: { enrichment_ms: 1 } as never,
        });
        expect(readWorkUnitQueueItemsServerCache(keyB)).toBeNull();
        expect(readWorkUnitQueueItemsServerCache(keyC)).toBeNull();
        expect(readWorkUnitQueueItemsServerCache(keyA)?.result).toEqual({ total: 1, items: [{ id: "a" }] });
    });

    it("expires entries after TTL", () => {
        const key = buildWorkUnitQueueItemsServerCacheKey({
            orgId: "org-1",
            workUnitId: "wu-1",
            queueKey: "new_inquiry",
            queueScopeKey: "fp|view:_all|ok",
            attentionBucketKey: null,
            rowEnrichment: "queue_list",
            omitTotalCount: true,
        });
        writeWorkUnitQueueItemsServerCache(key, {
            result: { total: 0, items: [] } as never,
            rowsPerf: { enrichment_ms: 0 } as never,
        });
        const expiredAt = Date.now() + WORK_UNIT_QUEUE_ITEMS_SERVER_CACHE_TTL_MS + 1;
        expect(readWorkUnitQueueItemsServerCache(key, expiredAt)).toBeNull();
    });
});
