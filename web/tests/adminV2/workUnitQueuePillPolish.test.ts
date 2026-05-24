import { describe, expect, it } from "vitest";

import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import {
    mergeWorkUnitQueueSummaryCounts,
    workUnitActivePillKeyFromSelection,
    workUnitQueuePillKeySelected,
    workUnitQueueSelectionFromLocation,
} from "@/lib/adminV2/workUnitQueueSelection";

describe("workUnitQueuePillPolish", () => {
    it("needs-attention URL selection uses synthetic pill active key", () => {
        const selection = workUnitQueueSelectionFromLocation("wu-1", {
            queue: "needs_attention",
            unmapped: false,
            attentionBucket: "follow_up_due",
            statusKeys: "",
            attentionReason: "",
            attentionReasonCode: "",
            activitySignalKey: "",
        })!;
        const pillKey = workUnitActivePillKeyFromSelection(selection);
        expect(pillKey).toBe("__attention_bucket:follow_up_due");
        expect(
            workUnitQueuePillKeySelected(pillKey, "__attention_bucket:follow_up_due", "follow_up_due")
        ).toBe(true);
        expect(workUnitQueuePillKeySelected(pillKey, "__attention_bucket:other", "follow_up_due")).toBe(
            false
        );
    });

    it("all needs-attention without bucket selects __all__ pill", () => {
        const pillKey = workUnitActivePillKeyFromSelection({
            workUnitId: "wu-1",
            queueKey: "needs_attention",
            source: "dept_queue",
        });
        expect(pillKey).toBe("needs_attention");
        expect(
            workUnitQueuePillKeySelected(pillKey, "__attention_bucket:__all__", "")
        ).toBe(true);
    });

    it("deferred summary merge preserves order and clears counts_deferred", () => {
        const merged = mergeWorkUnitQueueSummaryCounts(
            [
                {
                    key: "contact_attempted",
                    label: "Contact",
                    priority: "standard",
                    count: 1,
                    counts_deferred: false,
                },
                {
                    key: "enrolled",
                    label: "Enrolled",
                    priority: "standard",
                    count: 0,
                    counts_deferred: true,
                },
            ],
            [
                {
                    key: "enrolled",
                    label: "Enrolled",
                    priority: "standard",
                    count: 12,
                    counts_deferred: false,
                },
            ]
        );
        expect(merged.map((q) => q.key)).toEqual(["contact_attempted", "enrolled"]);
        expect(merged[1]?.count).toBe(12);
        expect(merged[1]?.counts_deferred).toBe(false);
    });

    it("above-fold model styles NA bucket selected from dept URL like WU click", () => {
        const pillKey = "__attention_bucket:stale_quote";
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [
                {
                    key: "__attention_bucket:stale_quote",
                    label: "Stale quote",
                    priority: "attention",
                    count: 3,
                },
            ],
            queue_summaries_error: null,
            queue_pill_sections: [
                {
                    key: "attention",
                    label: "Needs attention",
                    queues: [
                        {
                            key: "__attention_bucket:stale_quote",
                            label: "Stale quote",
                            priority: "attention",
                            count: 3,
                            counts_deferred: false,
                        },
                    ],
                },
            ],
            queue_tab_placeholders: null,
            selected_queue_key: pillKey,
            attention_bucket_key: "stale_quote",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: null,
            queue_items_loading: false,
            queue_items_ready: true,
            queue_items_error: null,
        });
        const chip = model.header.sections[0]?.chips[0];
        expect(chip?.selected).toBe(true);
        expect(chip?.priority).toBe("attention");
        expect(chip?.count).toBe(3);
    });

    it("counts_deferred renders skeleton count state in above-fold model", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [
                {
                    key: "enrolled",
                    label: "Enrolled",
                    priority: "standard",
                    count: 0,
                    counts_deferred: true as const,
                },
            ],
            queue_summaries_error: null,
            queue_pill_sections: null,
            queue_tab_placeholders: null,
            selected_queue_key: "contact_attempted",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: null,
            queue_items_loading: false,
            queue_items_ready: false,
            queue_items_error: null,
        });
        expect(model.header.sections[0]?.chips[0]?.count).toBe("skeleton");
    });
});
