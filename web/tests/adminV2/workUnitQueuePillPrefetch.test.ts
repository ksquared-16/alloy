import { describe, expect, it } from "vitest";

import {
    filterPrefetchableWorkUnitQueuePillKeys,
    isPrefetchableWorkUnitQueuePillKey,
    workUnitLanePrefetchTargets,
    workUnitQueuePillPrefetchTargets,
} from "@/lib/adminV2/workUnitQueuePillPrefetch";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { buildLifecycleWaitlistStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { lifecycleWorkUnitNavChipKey } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

const enrollmentRaw = {
    version: 2,
    entity_type: "opportunity",
    queues: [
        { key: "new_inquiry", label: "New inquiry", priority: 1 },
        { key: "follow_up", label: "Follow up", priority: 2 },
        { key: "all_records", label: "All records", priority: 99 },
    ],
};
const waitlistRaw = buildLifecycleWaitlistStageQueueDefinition({
    stageKey: "waitlist",
    label: "Waitlist",
    statusKeys: ["waitlisted"],
});
const waitlistPrimaryKey = loadQueueDefinitionBundle(waitlistRaw).normalized.queues[0]!.key;

describe("workUnitQueuePillPrefetch", () => {
    it("workUnitQueuePillPrefetchTargets warms neighbors including NA buckets", () => {
        const visible = [
            "enrolled",
            "__attention_bucket:follow_up_due",
            "tour_scheduled",
            "__attention_bucket:stale_quote",
        ];
        expect(workUnitQueuePillPrefetchTargets(visible, "enrolled", 3)).toEqual([
            "__attention_bucket:follow_up_due",
            "tour_scheduled",
            "__attention_bucket:stale_quote",
        ]);
    });

    it("rejects lifecycle work-unit nav chip keys", () => {
        const nav = lifecycleWorkUnitNavChipKey("wu-sibling");
        expect(isPrefetchableWorkUnitQueuePillKey(nav, { queue_definition: enrollmentRaw })).toBe(
            false
        );
    });

    it("rejects stage-primary keys not in queue_definition", () => {
        expect(
            isPrefetchableWorkUnitQueuePillKey("lifecycle_tour", { queue_definition: enrollmentRaw })
        ).toBe(false);
        expect(
            isPrefetchableWorkUnitQueuePillKey("lifecycle_qualification", {
                queue_definition: enrollmentRaw,
            })
        ).toBe(false);
    });

    it("allows executable queue keys from definition", () => {
        expect(
            isPrefetchableWorkUnitQueuePillKey("new_inquiry", { queue_definition: enrollmentRaw })
        ).toBe(true);
    });

    it("filterPrefetchableWorkUnitQueuePillKeys drops invalid lanes", () => {
        const visible = [
            "new_inquiry",
            lifecycleWorkUnitNavChipKey("wu-2"),
            "lifecycle_tour",
            "follow_up",
        ];
        expect(filterPrefetchableWorkUnitQueuePillKeys(visible, { queue_definition: enrollmentRaw })).toEqual(
            ["new_inquiry", "follow_up"]
        );
    });

    it("workUnitLanePrefetchTargets includes sibling primary lanes when valid", () => {
        const targets = workUnitLanePrefetchTargets({
            visiblePillKeys: ["new_inquiry", "follow_up"],
            selectedPillKey: "new_inquiry",
            workUnit: { id: "wu-1", queue_definition: enrollmentRaw },
            lifecycleSiblings: [
                {
                    id: "wu-2",
                    queue_definition: waitlistRaw,
                    metadata: { lifecycle_stage_key: "waitlist" },
                },
            ],
            includeLifecycleSiblings: true,
            cap: 4,
        });
        expect(targets.some((t) => t.workUnitId === "wu-1" && t.pillKey === "follow_up")).toBe(true);
        expect(targets.some((t) => t.workUnitId === "wu-2" && t.pillKey === waitlistPrimaryKey)).toBe(
            true
        );
        expect(targets.some((t) => t.pillKey.startsWith("lifecycle_wu_nav:"))).toBe(false);
    });
});
