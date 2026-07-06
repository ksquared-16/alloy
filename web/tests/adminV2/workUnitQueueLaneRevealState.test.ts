import { describe, expect, it } from "vitest";

import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import { workUnitAboveFoldQueueRowsLoading } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { workUnitPageContentReady } from "@/lib/adminV2/workUnitPageRevealPolicy";
import {
    resolveWorkUnitQueueLaneRevealState,
    workUnitQueueLaneRevealSettled,
} from "@/lib/workspace/workUnitQueueLaneRevealState";

describe("workUnitQueueLaneRevealState", () => {
    it("hidden_until_settled while loading without matching cache", () => {
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "tours",
            active_queue_key: "tours",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "scope:a",
            cache: new Map(),
            queue_items: null,
            queue_items_loading: true,
            queue_items_error: null,
        });
        expect(state).toBe("hidden_until_settled");
        expect(workUnitQueueLaneRevealSettled(state)).toBe(false);
    });

    it("ready_empty when settled with zero rows", () => {
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "waitlist",
            active_queue_key: "waitlist",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "scope:a",
            cache: new Map(),
            queue_items: { items: [], queue: { key: "waitlist" } },
            queue_items_loading: false,
            queue_items_error: null,
        });
        expect(state).toBe("ready_empty");
        expect(workUnitQueueLaneRevealSettled(state)).toBe(true);
    });

    it("above-fold queue lane uses held — never row skeleton loading", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            reserve_actions_rail: false,
            queue_summaries: [{ key: "tours", label: "Tours", priority: "standard", count: 1 }],
            queue_summaries_error: null,
            queue_pill_sections: null,
            queue_tab_placeholders: null,
            selected_queue_key: "tours",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: null,
            queue_items_loading: true,
            queue_lane_reveal_state: "hidden_until_settled",
            queue_items_error: null,
        });
        expect(model.queue_lane.state).toBe("held");
        expect(workUnitAboveFoldQueueRowsLoading(model)).toBe(false);
    });

    it("page content stays gated until critical bundle is ready", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            })
        ).toBe(false);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
            })
        ).toBe(true);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: true,
            })
        ).toBe(true);
    });
});
