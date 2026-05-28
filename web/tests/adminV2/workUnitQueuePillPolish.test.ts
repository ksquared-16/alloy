import { describe, expect, it } from "vitest";

import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
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

    it("waitlist candidate grain chip keeps unit in aria only, not pill badge copy", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [
                {
                    key: "waitlist",
                    label: "Waitlist",
                    priority: "standard",
                    count: 18,
                    grain: "candidate",
                    domain: "waitlist",
                },
            ],
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
            queue_items_loading: false,
            queue_items_ready: true,
            queue_items_error: null,
        });
        const chip = model.header.sections[0]?.chips[0];
        expect(chip?.count_unit).toBe("children");
        expect(chip?.count_aria_label).toContain("waitlist");
    });

    it("suppresses Other pill and active queue description when config flags set", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [
                {
                    key: "new_leads",
                    label: "New Leads",
                    description: "New families — first touch not yet completed.",
                    priority: "standard",
                    count: 18,
                },
            ],
            queue_summaries_error: null,
            queue_pill_sections: [
                {
                    key: "pipeline",
                    label: "Work Units",
                    queues: [{ key: "new_leads", label: "New Leads", priority: "standard", count: 18 }],
                },
            ],
            queue_tab_placeholders: null,
            selected_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: "pipeline_total",
            other_pill_section_key: "pipeline",
            unmapped_pill_count: 5,
            enrollment_right_rail_resolved: null,
            queue_items_loading: false,
            queue_items_ready: true,
            queue_items_error: null,
            suppress_other_pill: true,
            suppress_active_queue_description: true,
        });
        expect(model.header.show_other_pill).toBe(false);
        expect(model.header.other_pill).toBeNull();
        expect(model.header.active_queue_description).toBeNull();
    });

    it("v2 alias pill renders selected when URL uses tour_scheduled", () => {
        const wu = RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2;
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [
                {
                    key: "tours",
                    label: "Tours",
                    priority: "standard",
                    count: 2,
                },
            ],
            queue_summaries_error: null,
            queue_pill_sections: null,
            queue_tab_placeholders: null,
            selected_queue_key: "tour_scheduled",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: null,
            queue_items_loading: false,
            queue_items_ready: true,
            queue_items_error: null,
            queue_definition: wu,
        });
        expect(model.header.sections[0]?.chips[0]?.selected).toBe(true);
    });
});
