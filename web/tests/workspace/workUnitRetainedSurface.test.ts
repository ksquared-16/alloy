import { beforeEach, describe, expect, it } from "vitest";

import {
    clearWorkUnitViewModelSessionCacheForTests,
    putWorkUnitLaneCacheEntry,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import { restoreWarmWorkUnitLaneRows } from "@/lib/workspace/workUnitRetainedSurface";

describe("workUnitRetainedSurface", () => {
    beforeEach(() => {
        clearWorkUnitViewModelSessionCacheForTests();
    });

    it("restores lane rows from session lane cache when client cache is empty", () => {
        const cache = new Map();
        const payload = {
            items: [{ id: "row-1" }],
            queue: { key: "pipeline_total" },
            total: 1,
        };
        putWorkUnitLaneCacheEntry(
            {
                queuePayload: payload,
                generation: "wu-1:pipeline_total",
                lane: {
                    selectedQueueKey: "pipeline_total",
                    attentionBucketKey: null,
                    laneUnmappedOnly: false,
                    recordFilterFingerprint: "_",
                },
            },
            {
                orgId: "org-1",
                departmentId: "dept-1",
                workUnitId: "wu-1",
                scopeFingerprint: "scope-1",
            }
        );

        const restored = restoreWarmWorkUnitLaneRows({
            cache,
            viewScopeFingerprint: "scope-1",
            workUnitId: "wu-1",
            pillKey: "pipeline_total",
            attentionBucketKey: "",
            unmappedOnly: false,
            laneContext: {
                orgId: "org-1",
                departmentId: "dept-1",
                workUnitId: "wu-1",
                scopeFingerprint: "scope-1",
            },
        });

        expect(restored?.items).toHaveLength(1);
        expect(cache.size).toBeGreaterThan(0);
    });
});
