import { describe, expect, it } from "vitest";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import {
    buildWorkUnitAboveFoldPillSections,
    resolveWorkUnitOtherPillSectionKey,
} from "@/lib/workspace/workUnitQueueDerived";
import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";

describe("workUnitAboveFoldPillSections", () => {
    const ui = getQueueUiConfig(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def);

    const def = ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def;
    const queueLabelByKey = new Map(def.queues.map((q) => [q.key, q.label]));

    const sectionedSummaries = ui.sections.map((s) => ({
        key: s.key,
        label: s.label,
        tone: s.tone ?? ("standard" as const),
        queues: s.queue_keys.map((k) => ({
            key: k,
            label: queueLabelByKey.get(k) ?? k,
            priority: "standard" as const,
            count: 1,
        })),
    }));

    it("collapses v2 domain sections into Work Units + Needs Attention groups (Card 14A)", () => {
        const out = buildWorkUnitAboveFoldPillSections({ ui, sectionedSummaries });
        expect(out?.map((s) => s.key)).toEqual(["pipeline", "needs_attention"]);
        expect(out?.[0]?.label).toBe("Work Units");
        expect(out?.[1]?.label).toBe("Needs Attention");
        expect(out?.[0]?.queues.map((q) => q.key)).toEqual([
            "new_leads",
            "tours",
            "communications_followup",
            "waitlist",
            "enrollment_offers",
            "enrollment_completed",
        ]);
        expect(out?.[0]?.queues.map((q) => q.label)).toEqual([
            "New Leads",
            "Tours",
            "Follow Up",
            "Waitlist",
            "Enrolling",
            "Enrolled",
        ]);
        expect(out?.[1]?.queues.map((q) => q.key)).toEqual(["needs_attention"]);
    });

    it("other pill attaches to collapsed pipeline section", () => {
        expect(resolveWorkUnitOtherPillSectionKey(ui)).toBe("pipeline");
    });

    it("above-fold model exposes count without unit text in chip payload", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            queue_summaries: [
                {
                    key: "new_leads",
                    label: "New Leads",
                    priority: "standard",
                    count: 18,
                    grain: "case",
                    domain: "new_leads",
                },
            ],
            queue_summaries_error: null,
            queue_pill_sections: [
                {
                    key: "pipeline",
                    label: "Pipeline",
                    queues: [
                        {
                            key: "new_leads",
                            label: "New Leads",
                            priority: "standard",
                            count: 18,
                            counts_deferred: false,
                            grain: "case",
                            domain: "new_leads",
                        },
                    ],
                },
            ],
            queue_tab_placeholders: null,
            selected_queue_key: "new_leads",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: "pipeline_total",
            other_pill_section_key: "pipeline",
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: null,
            queue_items_loading: false,
            queue_items_ready: true,
            queue_items_error: null,
        });
        const chip = model.header.sections[0]?.chips[0];
        expect(chip?.count).toBe(18);
        expect(chip?.count_unit).toBe("families");
        expect(chip?.count_aria_label).toContain("families");
        expect(chip?.label).toBe("New Leads");
    });
});
