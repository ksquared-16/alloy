import { describe, expect, it } from "vitest";

import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import {
    peekCachedQueueItemsForPill,
    resolveWorkUnitQueueLaneItemsReady,
    resolveWorkUnitQueueTabSwitchRefreshing,
    touchCachedQueueItemsForPill,
} from "@/lib/workspace/workUnitQueueLaneDisplay";
import { putQueueRowCache } from "@/lib/workspace/queueRowClientCache";

const FP = "scope:test;view:site-a";

describe("workUnitQueueLaneDisplay", () => {
    it("lane items ready when queue settled empty, cache-backed, or errored", () => {
        expect(
            resolveWorkUnitQueueLaneItemsReady({
                queue_items: { items: [] },
                queue_items_loading: false,
                queue_items_error: null,
                cache_has_lane_payload: false,
            })
        ).toBe(true);

        expect(
            resolveWorkUnitQueueLaneItemsReady({
                queue_items: null,
                queue_items_loading: true,
                queue_items_error: null,
                cache_has_lane_payload: true,
            })
        ).toBe(true);

        expect(
            resolveWorkUnitQueueLaneItemsReady({
                queue_items: null,
                queue_items_loading: true,
                queue_items_error: null,
                cache_has_lane_payload: false,
            })
        ).toBe(false);

        expect(
            resolveWorkUnitQueueLaneItemsReady({
                queue_items: null,
                queue_items_loading: false,
                queue_items_error: "failed",
                cache_has_lane_payload: false,
            })
        ).toBe(true);
    });

    it("above-fold queue lane stays ready while rows refresh when items_ready", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [{ key: "waitlist", label: "Waitlist", priority: "standard", count: 3 }],
            queue_summaries_error: null,
            queue_pill_sections: null,
            queue_tab_placeholders: null,
            selected_queue_key: "waitlist",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: null,
            queue_items_loading: true,
            queue_items_ready: true,
            queue_items_error: null,
        });
        expect(model.queue_lane.state).toBe("ready");
    });

    it("tab switch refreshing uses cache without requiring row buffer", () => {
        expect(
            resolveWorkUnitQueueTabSwitchRefreshing({
                queue_items_loading: true,
                bootstrap_loading: false,
                has_work_unit: true,
                selected_queue_key: "tours",
                queue_items_error: null,
                has_buffered_rows: false,
                queue_items: null,
                queue_lane_mismatch: false,
                cache_has_lane_payload: true,
            })
        ).toBe(true);
    });

    it("waitlist pill cache uses view scope fingerprint (site-scoped)", () => {
        const map = new Map();
        const payload = { total: 2, items: [{ id: "w1" }], queue: { key: "waitlist" } };
        putQueueRowCache(map, FP, "wu-1", "waitlist", payload);

        expect(
            peekCachedQueueItemsForPill({
                cache: map,
                viewScopeFingerprint: FP,
                workUnitId: "wu-1",
                pillKey: "waitlist",
                attentionBucketKey: "",
                unmappedOnly: false,
            })
        ).toEqual(payload);

        expect(
            peekCachedQueueItemsForPill({
                cache: map,
                viewScopeFingerprint: "scope:test",
                workUnitId: "wu-1",
                pillKey: "waitlist",
                attentionBucketKey: "",
                unmappedOnly: false,
            })
        ).toBeNull();

        expect(
            touchCachedQueueItemsForPill({
                cache: map,
                viewScopeFingerprint: FP,
                workUnitId: "wu-1",
                pillKey: "waitlist",
                attentionBucketKey: "",
                unmappedOnly: false,
            })
        ).toEqual(payload);
    });
});
