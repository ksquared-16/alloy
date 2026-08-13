import { describe, expect, it } from "vitest";

import { tourLaneOpsFromActiveBookingOpportunityIds } from "@/lib/queues/tourLaneBookingMembership";
import { assertLifecycleStageOpportunityQueryHasStatusFilters } from "@/lib/lifecycle/lifecycleStageQueueFilters";

describe("Tours Work View booking membership", () => {
    it("replaces stage_key=tour with opportunity id IN from active bookings", () => {
        const ops = tourLaneOpsFromActiveBookingOpportunityIds(
            [
                { kind: "eq", column: "stage_key", value: "tour" },
                { kind: "eq", column: "org_id", value: "org-1" },
            ],
            ["opp-kurzman", "opp-other"],
        );
        expect(ops[0]).toEqual({
            kind: "in",
            column: "id",
            values: ["opp-kurzman", "opp-other"],
        });
        expect(ops.some((op) => op.kind === "eq" && op.column === "stage_key")).toBe(false);
        expect(ops.some((op) => op.kind === "eq" && op.column === "org_id")).toBe(true);
    });

    it("uses a sentinel id when no active bookings (never unfiltered)", () => {
        const ops = tourLaneOpsFromActiveBookingOpportunityIds(
            [{ kind: "eq", column: "stage_key", value: "tour" }],
            [],
        );
        expect(ops[0]?.kind).toBe("in");
        expect((ops[0] as { values: string[] }).values).toHaveLength(1);
    });

    it("satisfies lifecycle queue filter guard via id IN", () => {
        const ops = tourLaneOpsFromActiveBookingOpportunityIds(
            [{ kind: "eq", column: "stage_key", value: "tour" }],
            ["opp-1"],
        );
        expect(() =>
            assertLifecycleStageOpportunityQueryHasStatusFilters({
                workUnitKey: "lifecycle_tour",
                opportunityScopeMode: "lifecycle_visibility",
                ops,
                workUnitMetadata: { stage_key: "tour" },
            }),
        ).not.toThrow();
    });
});
