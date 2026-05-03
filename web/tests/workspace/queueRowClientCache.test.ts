import { describe, expect, it } from "vitest";
import {
    deleteQueueRowCacheKeysForPrefix,
    peekFreshQueueRowCache,
    putQueueRowCache,
    queueRowLogicalCacheKey,
} from "@/lib/workspace/queueRowClientCache";

describe("queueRowClientCache", () => {
    it("logical key encodes unmapped flag", () => {
        expect(queueRowLogicalCacheKey("wu1", "q1", false)).toBe("wu1:q1:all");
        expect(queueRowLogicalCacheKey("wu1", "q1", true)).toBe("wu1:q1:unmapped");
    });

    it("put stores payload under both all and unmapped logical keys", () => {
        const m = new Map<string, { payload: { n: number }; fetchedAt: number }>();
        putQueueRowCache(m, "wu1", "q1", { n: 1 });
        const longTtl = 9_000_000;
        expect(peekFreshQueueRowCache(m, "wu1:q1:all", longTtl)?.payload).toEqual({ n: 1 });
        expect(peekFreshQueueRowCache(m, "wu1:q1:unmapped", longTtl)?.payload).toEqual({ n: 1 });
    });

    it("deleteQueueRowCacheKeysForPrefix removes only matching work unit prefix", () => {
        const m = new Map<string, { payload: object; fetchedAt: number }>();
        putQueueRowCache(m, "wu1", "a", {});
        putQueueRowCache(m, "wu2", "b", {});
        const n = deleteQueueRowCacheKeysForPrefix(m, "wu1");
        expect(n).toBeGreaterThan(0);
        const longTtl = 9_000_000;
        expect(peekFreshQueueRowCache(m, "wu1:a:all", longTtl)).toBeNull();
        expect(peekFreshQueueRowCache(m, "wu2:b:all", longTtl)?.payload).toEqual({});
    });
});
