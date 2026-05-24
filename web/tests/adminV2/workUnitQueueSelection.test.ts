import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    buildWorkUnitQueueSelectionHref,
    isExplicitWorkUnitQueueSelection,
    resolveAuthoritativeWorkUnitQueueKey,
    workUnitActivePillKeyFromSelection,
    workUnitQueueSelectionFromLocation,
    workUnitQueueSelectionFromPillKey,
    workUnitQueueSelectionToSearchParams,
} from "@/lib/adminV2/workUnitQueueSelection";
import {
    buildOpportunityDrawerQueueNavigatorFromDisplayItems,
    opportunityDrawerNavigatorMatchesWorkUnitSelection,
} from "@/lib/admin/opportunityDrawerQueueNavigator";

describe("WorkUnitQueueSelection", () => {
    it("parses dept pipeline queue from location", () => {
        const sel = workUnitQueueSelectionFromLocation("wu-1", {
            queue: "enrolled",
            unmapped: false,
            attentionBucket: "",
            statusKeys: "",
            attentionReason: "",
            attentionReasonCode: "",
            activitySignalKey: "",
        });
        expect(sel).toMatchObject({
            workUnitId: "wu-1",
            queueKey: "enrolled",
            source: "dept_queue",
        });
        expect(isExplicitWorkUnitQueueSelection(sel)).toBe(true);
    });

    it("parses needs-attention bucket from location (attention_bucket or bucket alias)", () => {
        const sel = workUnitQueueSelectionFromLocation("wu-1", {
            queue: "needs_attention",
            unmapped: false,
            attentionBucket: "follow_up_due",
            statusKeys: "",
            attentionReason: "",
            attentionReasonCode: "",
            activitySignalKey: "",
        });
        expect(sel?.source).toBe("dept_needs_attention");
        expect(sel?.attentionBucketKey).toBe("follow_up_due");
        expect(workUnitActivePillKeyFromSelection(sel!)).toBe("__attention_bucket:follow_up_due");
    });

    it("explicit URL queue beats priority summaries missing that lane", () => {
        const wu = { queue_definition: CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 };
        const summaries = [{ key: "contact_attempted" }, { key: "new_inquiry" }];
        expect(resolveAuthoritativeWorkUnitQueueKey(wu, summaries, "enrolled")).toBe("enrolled");
        expect(resolveAuthoritativeWorkUnitQueueKey(wu, summaries, "tour_scheduled")).toBe("tour_scheduled");
    });

    it("builds dept→WU href with queue and attention_bucket", () => {
        const href = buildWorkUnitQueueSelectionHref(
            "/adminV2/workspace",
            "dept-1",
            {
                workUnitId: "wu-1",
                queueKey: "needs_attention",
                source: "dept_needs_attention",
                attentionBucketKey: "follow_up_due",
            }
        );
        expect(href).toContain("queue=needs_attention");
        expect(href).toContain("attention_bucket=follow_up_due");
    });

    it("encodes selection in search params", () => {
        const qs = workUnitQueueSelectionToSearchParams({
            queueKey: "tour_scheduled",
            attentionBucketKey: "",
        });
        expect(qs.get("queue")).toBe("tour_scheduled");
    });
});

describe("drawer navigator filtered view", () => {
    const selection = workUnitQueueSelectionFromPillKey("wu-1", "enrolled");

    it("navigator carries selection and loaded_record_ids_in_order", () => {
        const nav = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: "wu-1",
            department_id: "dept-1",
            queue_key: "enrolled",
            selection,
            displayItems: [
                { id: "r1", title: "1", quickActions: [] },
                { id: "r2", title: "2", quickActions: [] },
            ],
            generation: 1,
        })!;
        expect(nav.selection.queueKey).toBe("enrolled");
        expect(nav.loaded_record_ids_in_order).toEqual(["r1", "r2"]);
    });

    it("rejects navigator when loaded rows do not match selection", () => {
        expect(
            opportunityDrawerNavigatorMatchesWorkUnitSelection({
                selection,
                selected_pill_key: "enrolled",
                loaded_queue_key: "contact_attempted",
                attention_bucket_key: "",
            })
        ).toBe(false);
    });
});
