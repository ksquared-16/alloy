import { describe, expect, it } from "vitest";

import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import {
    putQueueRowCache,
    queueRowLogicalCacheKey,
    touchQueueRowCacheOnHit,
} from "@/lib/workspace/queueRowClientCache";

const FP = "scope:test";

describe("workUnitQueuePillSwitchCache", () => {
    it("preloaded NA bucket pill resolves distinct cache keys per bucket", () => {
        const pillA = "__attention_bucket:follow_up_due";
        const pillB = "__attention_bucket:stale_quote";
        const resolvedA = resolveWorkUnitFetchQueueKeyFromPill(pillA, "");
        const resolvedB = resolveWorkUnitFetchQueueKeyFromPill(pillB, "");
        expect(resolvedA).toEqual({
            queueKey: "needs_attention",
            attentionBucketOverride: "follow_up_due",
        });
        expect(resolvedB).toEqual({
            queueKey: "needs_attention",
            attentionBucketOverride: "stale_quote",
        });

        const keyA = queueRowLogicalCacheKey(
            FP,
            "wu-1",
            resolvedA.queueKey,
            false,
            resolvedA.attentionBucketOverride
        );
        const keyB = queueRowLogicalCacheKey(
            FP,
            "wu-1",
            resolvedB.queueKey,
            false,
            resolvedB.attentionBucketOverride
        );
        expect(keyA).not.toBe(keyB);
    });

    it("switching to a preloaded pill reads cached rows without sharing another bucket", () => {
        const map = new Map<string, { payload: { total: number; items: unknown[] }; fetchedAt: number }>();
        const payloadA = { total: 2, items: [{ id: "a1" }] };
        const payloadB = { total: 1, items: [{ id: "b1" }] };
        putQueueRowCache(map, FP, "wu-1", "needs_attention", payloadA, "follow_up_due");
        putQueueRowCache(map, FP, "wu-1", "needs_attention", payloadB, "stale_quote");

        const hitA = touchQueueRowCacheOnHit(
            map,
            queueRowLogicalCacheKey(FP, "wu-1", "needs_attention", false, "follow_up_due")
        );
        const hitB = touchQueueRowCacheOnHit(
            map,
            queueRowLogicalCacheKey(FP, "wu-1", "needs_attention", false, "stale_quote")
        );
        expect(hitA?.payload).toEqual(payloadA);
        expect(hitB?.payload).toEqual(payloadB);
    });
});
