import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { att, ORG_ID, setup, TODAY } from "./correctionFixtures";

/**
 * D12a (DP-1) — the reconciliation writes are all-or-nothing. A failure injected
 * inside the RPC transaction (after supersede/retire) must leave ZERO partial
 * state: no correction event, no reparent, no supersede, no charge void, prior
 * event still resolved, prior obligation still drafted.
 */
describe("D12a atomicity — injected mid-transaction failure rolls everything back", () => {
    it("persists no partial state on a forced failure after step 3+", async () => {
        const { store, supabase } = setup({
            reconcileFault: (phase) => {
                if (phase === "after_retire") throw new Error("reconcile_consumption:injected_fault");
            },
        });
        // Original late pickup → obligation + draft charge.
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY, "user-1");
        const priorObl = store.resolved_obligations[0];
        const charge = store.charges[0];
        const eventsBefore = store.consumption_events.length;

        // Correction that WOULD supersede — but the RPC faults mid-transaction.
        await expect(
            draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-1" }), TODAY, "user-1"),
        ).rejects.toBeInstanceOf(OperationalEnrollmentServiceError);

        // ZERO partial state.
        expect(store.consumption_events.length).toBe(eventsBefore); // no correction event
        expect(store.consumption_events.find((e) => e.source_entity_id === "att-2")).toBeUndefined();
        const priorEvent = store.consumption_events.find((e) => e.source_entity_id === "att-1")!;
        expect(priorEvent.status).toBe("resolved"); // NOT superseded
        const obl = store.resolved_obligations.find((o) => o.id === priorObl.id)!;
        expect(obl.status).toBe("drafted"); // NOT superseded
        expect(obl.superseded_by_event_id ?? null).toBeNull();
        expect(obl.review_status).not.toBe("stale");
        const c = store.charges.find((x) => x.id === charge.id)!;
        expect(c.status).toBe("draft"); // NOT void
        expect(c.voided_at ?? null).toBeNull();
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);
    });

    it("succeeds when NO fault is injected (control)", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-1" }), TODAY, "user-1");
        expect(store.resolved_obligations[0].status).toBe("superseded");
        expect(store.charges[0].status).toBe("void");
    });
});
