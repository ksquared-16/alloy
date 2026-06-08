import { describe, expect, it } from "vitest";

import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { loadQueueDefinitionBundle, resolveQueueKeyFromDefinition } from "@/lib/config/queueDefinitionV2Runtime";
import { __testing } from "@/lib/queues/QueueService";
import { isQueueLaneParityDebugEnabled } from "@/lib/queues/queueLaneParityDebug";
import {
    clearLaneScopedWorkUnitRecordFilters,
    resolveWorkUnitLaneStatusFilterValues,
    sanitizeWorkUnitRecordFiltersForLane,
} from "@/lib/workspace/workUnitQueueRecordFilterLaneScope";
import { EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER } from "@/lib/workspace/workUnitQueueRecordFilterTypes";
import { applyWorkUnitQueueRecordFilters } from "@/lib/workspace/applyWorkUnitQueueRecordFilters";

describe("workUnitQueueRecordFilterLaneScope", () => {
    const wu = { queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 };

    it("resolves tour_scheduled status filter for tours lane and alias", () => {
        expect(resolveWorkUnitLaneStatusFilterValues(wu, "tours")).toEqual(["tour_scheduled"]);
        expect(resolveWorkUnitLaneStatusFilterValues(wu, "tour_scheduled")).toEqual(["tour_scheduled"]);
        expect(resolveWorkUnitLaneStatusFilterValues(wu, "new_leads")).toEqual(
            expect.arrayContaining(["new_inquiry", "new"])
        );
    });

    it("clears lane-local filters on pill switch", () => {
        const cleared = clearLaneScopedWorkUnitRecordFilters({
            ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
            statusKey: "new_inquiry",
            attentionReasonCode: "follow_up_due",
        });
        expect(cleared.statusKey).toBe("");
        expect(cleared.attentionReasonCode).toBe("");
    });

    it("drops stale status filter when incompatible with active lane", () => {
        const sanitized = sanitizeWorkUnitRecordFiltersForLane(
            { ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER, statusKey: "new_inquiry" },
            ["tour_scheduled"]
        );
        expect(sanitized.statusKey).toBe("");
    });

    it("search finds tour_scheduled row after stale status filter is sanitized", () => {
        const rows = [
            {
                id: "opp-1",
                status_key: "tour_scheduled",
                name: "Rivera Family",
                _customer_name: "Rivera Family",
            },
        ];
        const filtered = applyWorkUnitQueueRecordFilters(
            rows,
            sanitizeWorkUnitRecordFiltersForLane(
                { ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER, statusKey: "new_inquiry", search: "rivera" },
                ["tour_scheduled"]
            )
        );
        expect(filtered.items).toHaveLength(1);
        expect(filtered.items[0]?.id).toBe("opp-1");
    });
});

describe("tours queue count/row filter parity", () => {
    it("tour_scheduled alias and tours canonical share the same executable status filter", () => {
        const bundle = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);
        for (const requested of ["tours", "tour_scheduled"] as const) {
            const resolution = resolveQueueKeyFromDefinition(requested, bundle.normalized.queues);
            const q = bundle.def.queues.find((row) => row.key === resolution.resolvedKey);
            expect(q?.key).toBe("tours");
            const plan = __testing.buildOpportunityPlan(q!, new Date("2026-05-27T12:00:00.000Z"));
            expect(plan.ops).toEqual([
                { kind: "in", column: "status_key", values: ["tour_scheduled"] },
            ]);
        }
    });

    it("queue lane parity debug is opt-in", () => {
        expect(isQueueLaneParityDebugEnabled()).toBe(false);
    });
});
