import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    buildWorkUnitQueueSelectionHref,
    findQueueSummaryForSelection,
    isExplicitWorkUnitQueueSelection,
    resolveAuthoritativeWorkUnitQueueKey,
    resolveWorkUnitFetchQueueKeyFromPill,
    resolveWorkUnitQueueCanonicalKey,
    resolveWorkUnitQueueKey,
    workUnitActivePillKeyFromSelection,
    workUnitQueuePillKeySelected,
    workUnitQueuePillKeysEquivalent,
    workUnitQueueSelectionFetchQueueKey,
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

    it("resolves v2 alias URL queue to canonical lane key for bootstrap parity", () => {
        const wu = { queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 };
        const summaries = [{ key: "tours" }, { key: "new_leads" }];
        expect(resolveAuthoritativeWorkUnitQueueKey(wu, summaries, "tour_scheduled")).toBe("tours");
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

    it("resolves v2 alias keys as defined on work unit", () => {
        const wu = {
            queue_definition: {
                version: 2,
                entity_type: "opportunity",
                queues: [
                    {
                        key: "waitlist",
                        label: "Waitlist",
                        grain: "candidate",
                        aliases: ["waitlisted"],
                        filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
                    },
                    {
                        key: "enrollment_offers",
                        label: "Offers",
                        grain: "child",
                        aliases: ["ready_to_enroll"],
                        filters: [{ type: "status", operator: "in", values: ["enrolling"] }],
                    },
                ],
            },
        };
        expect(resolveWorkUnitQueueKey(wu, "waitlisted")).toMatchObject({
            resolvedKey: "waitlist",
            matchedBy: "alias",
        });
        expect(resolveWorkUnitQueueKey(wu, "ready_to_enroll")).toMatchObject({
            resolvedKey: "enrollment_offers",
            matchedBy: "alias",
        });
        expect(resolveAuthoritativeWorkUnitQueueKey(wu, [{ key: "waitlist" }], "waitlisted")).toBe("waitlist");
    });

    it("resolves tour_scheduled alias to tours for fetch and summary lookup", () => {
        const wu = { queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 };
        expect(resolveWorkUnitQueueCanonicalKey(wu, "tour_scheduled")).toBe("tours");
        expect(
            resolveWorkUnitFetchQueueKeyFromPill("tour_scheduled", "", wu)
        ).toEqual({ queueKey: "tours" });
        const summaries = [{ key: "tours", count: 3 }];
        expect(findQueueSummaryForSelection(summaries, wu, "tour_scheduled")).toEqual(summaries[0]);
    });

    it("treats alias and canonical pill keys as equivalent", () => {
        const wu = { queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 };
        expect(workUnitQueuePillKeysEquivalent(wu, "tour_scheduled", "tours")).toBe(true);
        expect(workUnitQueuePillKeySelected("tour_scheduled", "tours", "", wu)).toBe(true);
        expect(
            workUnitQueueSelectionFetchQueueKey(
                { queueKey: "tour_scheduled" },
                wu
            )
        ).toBe("tours");
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
