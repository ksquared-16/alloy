import { describe, expect, it } from "vitest";
import {
    deleteQueueRowCacheKeysForWorkUnit,
    peekFreshQueueRowCache,
    putQueueRowCache,
    queueRowLogicalCacheKey,
} from "@/lib/workspace/queueRowClientCache";

const FP = "dept:all;site:all";

describe("queueRowClientCache", () => {
    it("logical key encodes scope fingerprint and unmapped flag", () => {
        expect(queueRowLogicalCacheKey(FP, "wu1", "q1", false)).toBe(`${FP}:wu1:q1:all`);
        expect(queueRowLogicalCacheKey(FP, "wu1", "q1", true)).toBe(`${FP}:wu1:q1:unmapped`);
        expect(queueRowLogicalCacheKey(FP, "wu1", "needs_attention", false, "follow_up_overdue")).toBe(
            `${FP}:wu1:needs_attention:all:attn:follow_up_overdue`,
        );
    });

    it("put stores payload under both all and unmapped logical keys", () => {
        const m = new Map<string, { payload: { n: number }; fetchedAt: number }>();
        putQueueRowCache(m, FP, "wu1", "q1", { n: 1 });
        const longTtl = 9_000_000;
        expect(peekFreshQueueRowCache(m, `${FP}:wu1:q1:all`, longTtl)?.payload).toEqual({ n: 1 });
        expect(peekFreshQueueRowCache(m, `${FP}:wu1:q1:unmapped`, longTtl)?.payload).toEqual({ n: 1 });
    });

    it("deleteQueueRowCacheKeysForWorkUnit removes only matching scope + work unit prefix", () => {
        const m = new Map<string, { payload: object; fetchedAt: number }>();
        putQueueRowCache(m, FP, "wu1", "a", {});
        putQueueRowCache(m, FP, "wu2", "b", {});
        const otherFp = "dept:r:x;site:all";
        putQueueRowCache(m, otherFp, "wu1", "c", {});
        const n = deleteQueueRowCacheKeysForWorkUnit(m, FP, "wu1");
        expect(n).toBeGreaterThan(0);
        const longTtl = 9_000_000;
        expect(peekFreshQueueRowCache(m, `${FP}:wu1:a:all`, longTtl)).toBeNull();
        expect(peekFreshQueueRowCache(m, `${FP}:wu2:b:all`, longTtl)?.payload).toEqual({});
        expect(peekFreshQueueRowCache(m, `${otherFp}:wu1:c:all`, longTtl)?.payload).toEqual({});
    });
});
