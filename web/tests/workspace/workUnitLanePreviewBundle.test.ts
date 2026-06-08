import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS,
    WORK_UNIT_LANE_PREVIEW_MAX_LANES,
    WORK_UNIT_LANE_PREVIEW_ROW_LIMIT,
} from "@/lib/workspace/workUnitLanePreviewBundle";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

describe("workUnitLanePreviewBundle", () => {
    it("exports bounded preview caps", () => {
        expect(WORK_UNIT_LANE_PREVIEW_MAX_LANES).toBe(6);
        expect(WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS).toBe(4);
        expect(WORK_UNIT_LANE_PREVIEW_ROW_LIMIT).toBe(20);
    });

    it("exposes lane-previews admin route", () => {
        const route = read("app/api/admin/work-units/[id]/lane-previews/route.ts");
        expect(route).toContain("loadWorkUnitLanePreviewBundle");
        expect(route).toContain("buildQueueSummariesSharedBootstrap");
        expect(route).toContain("queue_key");
        expect(route).toContain("attention_bucket");
    });

    it("loader reuses single attention pass for bucket previews", () => {
        const loader = read("lib/workspace/workUnitLanePreviewBundle.ts");
        expect(loader).toContain("loadAttentionPackOnce");
        expect(loader).toContain("preloadedAttentionPack");
        expect(loader).toMatch(/for \(const queueKey of lanes\)/);
        expect(loader).toMatch(/for \(const bucketKey of buckets\)/);
    });
});

describe("work-unit page lane preview cache (Card 4)", () => {
    const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");

    it("seeds primary lane into client cache from bootstrap", () => {
        expect(page).toContain("putQueueRowCache");
        expect(page).toContain("primaryLaneRowsSettledOnceRef.current = true");
        expect(page).toMatch(/wuDeferredQueueKeysRef\.current = Array\.isArray\(b\.queue\?\.deferred_queue_keys\)/);
    });

    it("warms deferred lanes via lane-previews bundle after primary paint", () => {
        expect(page).toContain("warmWorkUnitLanePreviewCache");
        expect(page).toContain("lane-previews");
        expect(page).toContain("seedWorkUnitLanePreviewBundleIntoCache");
        expect(page).toContain("wuLanePreviewBundleDoneRef");
        expect(page).not.toContain("queueAdjacentPrefetchTokenRef");
    });

    it("pill tab/bucket handlers do not force-bypass cache", () => {
        expect(page).not.toMatch(
            /handleAttentionBucketSelect[\s\S]{0,400}force:\s*true/,
        );
        expect(page).not.toMatch(
            /skipNextQueueFetchEffectRef[\s\S]{0,200}force:\s*true/,
        );
        expect(page).toMatch(/void fetchQueueItems\(workUnitId, nextKey/);
    });

    it("drawer open still uses entity path not preview rows", () => {
        expect(page).toContain("openWorkUnitQueueRecord");
        expect(page).not.toMatch(/openWorkUnitQueueRecord[\s\S]{0,120}queueRowsBufferRef/);
    });
});
