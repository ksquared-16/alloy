/**
 * Compile gate — the record surface's modules must type-check.
 *
 * Vitest compiles imported modules; this catches missing imports (e.g. queue navigator) that unit
 * tests on shadow helpers alone would miss.
 *
 * It used to gate `OpportunityDrawerVmRuntime` and `OpportunityDrawerOverviewBody`, which were the
 * modal record product and its legacy body. Both are deleted, so the gate now covers the module that
 * actually renders a record: the INLINE Focus Panel region. The error boundary stays — the layout
 * runtime overview body still uses it.
 */

import { describe, expect, it } from "vitest";
import { InlineOpportunityFocusPanel } from "@/components/presentation/workUnit/InlineOpportunityFocusPanel";
import OpportunityDrawerLayoutRuntimeBodyErrorBoundary from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyErrorBoundary";
import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";

describe("record surface compile gate", () => {
    it("exports the one record surface component", () => {
        expect(typeof InlineOpportunityFocusPanel).toBe("function");
    });

    it("the layout-runtime body error boundary still compiles", () => {
        // Asserted in its own test: pulling the inline panel into the same module graph makes this
        // import resolve late, and a gate that reports `undefined` for a module that is genuinely
        // fine is a gate that will be deleted rather than trusted.
        expect(typeof OpportunityDrawerLayoutRuntimeBodyErrorBoundary).toBe("function");
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
