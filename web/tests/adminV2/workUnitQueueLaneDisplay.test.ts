import { describe, expect, it } from "vitest";

import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import { resolveWorkUnitQueueRowsRefreshing } from "@/lib/workspace/workUnitQueueLaneDisplay";

describe("workUnitQueueLaneDisplay", () => {
    it("rows refresh shimmer only when lane already settled", () => {
        expect(
            resolveWorkUnitQueueRowsRefreshing({
                lane_reveal_settled: false,
                queue_items_loading: true,
                bootstrap_loading: false,
            })
        ).toBe(false);
        expect(
            resolveWorkUnitQueueRowsRefreshing({
                lane_reveal_settled: true,
                queue_items_loading: true,
                bootstrap_loading: false,
            })
        ).toBe(true);
    });

    it("ready lane with loading uses ready state not skeleton", () => {
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
            queue_lane_reveal_state: "ready_with_rows",
            queue_items_error: null,
        });
        expect(model.queue_lane.state).toBe("ready");
    });
});
