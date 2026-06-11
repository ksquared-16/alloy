import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    peekCachedQueueItemsForPill,
    touchCachedQueueItemsForPill,
} from "@/lib/workspace/workUnitQueueLaneDisplay";
import { putQueueRowCache } from "@/lib/workspace/queueRowClientCache";

const PAGE = join(
    process.cwd(),
    "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);

const FP = "scope:pill-truth";

describe("workUnitQueuePillSwitchTruth", () => {
    it("cache-hit pill switch sync-applies rows before fetch and uses quiet reveal refresh", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("setQueueItems(cachedLane)");
        expect(src).toContain("markKpiPillCache(\"hit\"");
        expect(src).toContain("...(cachedLane ? { quietStaleRefresh: true } : {})");
        expect(src).toMatch(/setSelectedQueueKeyTraced\("handleQueueTabChange"/);
        const cachedLaneIdx = src.indexOf("setQueueItems(cachedLane)");
        const pillKeyIdx = src.indexOf('setSelectedQueueKeyTraced("handleQueueTabChange"');
        expect(cachedLaneIdx).toBeGreaterThan(-1);
        expect(pillKeyIdx).toBeGreaterThan(-1);
        expect(cachedLaneIdx).toBeLessThan(pillKeyIdx);
    });

    it("cache-miss pill switch clears stale rows and marks pending before key change", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("setQueuePillPendingKey(nextKey)");
        expect(src).toContain("setQueueItems(null)");
        expect(src).toContain("queuePayloadMatchesActiveLane");
        expect(src).toContain("markKpiPillCache(\"miss\"");
        expect(src).toContain("shouldSuppressQueueLoadingOnPillSwitch");
        expect(src).toContain('qs.set("row_mode", "reveal")');
        expect(src).toContain("backgroundListRefresh: true");
        const missBlock = src.slice(src.indexOf('markKpiPillCache("miss"'));
        expect(missBlock).not.toContain("lifecyclePillSwitchRetainRowsRef.current = true");
    });

    it("user-initiated fetch does not block row apply on row-actions hydration", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("!options?.userInitiated");
        expect(src).toMatch(/if \(options\?\.userInitiated\) \{\s*\n\s*void hydrateWorkUnitQueueRowActions\(\)/);
    });

    it("KPI prefetch uses reveal mode with slim row limit", () => {
        const src = readFileSync(PAGE, "utf8");
        expect(src).toContain("options?.prefetchOnly");
        expect(src).toContain("WORK_UNIT_QUEUE_REVEAL_FETCH_ROWS");
        expect(src).toMatch(
            /options\?\.quietStaleRefresh \|\|[\s\S]*options\?\.initialLaneReveal/
        );
        expect(src).toContain("workUnit.queue_definition == null");
    });

    it("touchCachedQueueItemsForPill returns distinct lane payloads for cache-hit swap", () => {
        const map = new Map<string, { payload: { total: number; items: unknown[] }; fetchedAt: number }>();
        const waitlist = { total: 3, items: [{ id: "w1" }] };
        const lead = { total: 5, items: [{ id: "l1" }] };
        putQueueRowCache(map, FP, "wu-1", "waitlist", waitlist);
        putQueueRowCache(map, FP, "wu-1", "lifecycle_lead", lead);

        const hitWaitlist = touchCachedQueueItemsForPill({
            cache: map,
            viewScopeFingerprint: FP,
            workUnitId: "wu-1",
            pillKey: "waitlist",
            attentionBucketKey: "",
            unmappedOnly: false,
        });
        const hitLead = touchCachedQueueItemsForPill({
            cache: map,
            viewScopeFingerprint: FP,
            workUnitId: "wu-1",
            pillKey: "lifecycle_lead",
            attentionBucketKey: "",
            unmappedOnly: false,
        });
        expect(hitWaitlist).toEqual(waitlist);
        expect(hitLead).toEqual(lead);
        expect(peekCachedQueueItemsForPill({
            cache: map,
            viewScopeFingerprint: FP,
            workUnitId: "wu-1",
            pillKey: "lifecycle_lead",
            attentionBucketKey: "",
            unmappedOnly: false,
        })).toEqual(lead);
    });
});
