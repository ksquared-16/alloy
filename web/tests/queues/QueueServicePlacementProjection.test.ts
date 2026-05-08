import { describe, expect, it } from "vitest";
import type { QueueConfig } from "@/lib/config/queueDefinitionSchema";
import { __testing } from "@/lib/queues/QueueService";

const waitlistedLane: QueueConfig = {
    key: "waitlisted",
    label: "Waitlisted",
    filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
} as QueueConfig;

describe("QueueService — placement projection hookup", () => {
    it("disabled placement metadata preserves row references and omits diagnostics", () => {
        const rows = [{ id: "a", created_at: "2026-01-01T00:00:00.000Z", metadata: {} }];
        const out = __testing.attachPlacementToEnrichedOpportunityItems({
            enrichedRows: rows,
            workUnitId: "wu",
            queueKey: "waitlisted",
            queueConfig: waitlistedLane,
            departmentMetadata: null,
            workUnitMetadata: null,
            nowMs: 1,
        });
        expect(out.diagnostics).toBeNull();
        expect(out.rows).toBe(rows);
    });

    it("queue_keys_enabled gates evaluation for non-listed lanes", () => {
        const rows = [{ id: "a", created_at: "2026-01-01T00:00:00.000Z", metadata: {} }];
        const out = __testing.attachPlacementToEnrichedOpportunityItems({
            enrichedRows: rows,
            workUnitId: "wu",
            queueKey: "all",
            queueConfig: { key: "all", label: "All", filters: [] } as QueueConfig,
            departmentMetadata: null,
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: "childcare_enrollment_waitlist_v1",
                    queue_keys_enabled: ["waitlisted"],
                },
            },
            nowMs: 1,
        });
        expect(out.diagnostics).toBeNull();
        expect(out.rows).toBe(rows);
        expect(out.rows[0]._placement_priority).toBeUndefined();
    });

    it("opportunityQueueStatusKeysAllowed collects status filter values", () => {
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "status" as const, operator: "in" as const, values: ["waitlisted", " ready_to_enroll "] }],
        } as QueueConfig;
        expect(__testing.opportunityQueueStatusKeysAllowed(q)?.sort()).toEqual(["ready_to_enroll", "waitlisted"]);
    });
});
