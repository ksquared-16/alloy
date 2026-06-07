/**
 * C1a compile gate — production opportunity VM drawer module must type-check.
 *
 * Vitest compiles imported modules; this catches missing imports (e.g. queue
 * navigator) that unit tests on shadow helpers alone would miss.
 */

import { describe, expect, it } from "vitest";
import OpportunityDrawerVmRuntime from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime";
import OpportunityDrawerOverviewBody from "@/components/admin/vmDrawer/OpportunityDrawerOverviewBody";
import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";

describe("opportunityDrawerVmRuntime compile gate", () => {
    it("exports the production VM runtime drawer component", () => {
        expect(typeof OpportunityDrawerVmRuntime).toBe("function");
        expect(typeof OpportunityDrawerOverviewBody).toBe("function");
    });

    it("resolveOpportunityQueueNavigatorPosition is linked (queuePosition useMemo dependency)", () => {
        const pos = resolveOpportunityQueueNavigatorPosition("opp-a", {
            work_unit_id: "wu-1",
            department_id: "dept-1",
            queue_key: "qualified",
            selection: { workUnitId: "wu-1", queueKey: "qualified", source: "work_unit_pill" },
            records: [{ id: "opp-a" }, { id: "opp-b" }],
            loaded_record_ids_in_order: ["opp-a", "opp-b"],
            total_count: 2,
            generation: 1,
        });
        expect(pos).toMatchObject({ index: 0, position: 1, total: 2 });
    });
});
