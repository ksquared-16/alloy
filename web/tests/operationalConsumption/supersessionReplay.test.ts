import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import { att, ORG_ID, setup, TODAY } from "./correctionFixtures";

/**
 * D12a — replaying the SAME correction/reversal fact is idempotent (DP-3): one
 * correction event (fact-anchored key), superseded once, retired once, no dups.
 */
describe("D12a replay — idempotent supersession", () => {
    it("re-delivering the same correction fact does NOT duplicate events/obligations or double-void", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY, "user-1");
        const chargeId = store.charges[0].id;

        const correction = att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-1" });
        await draftConsumption(supabase, ORG_ID, correction, TODAY, "user-1");
        const eventsAfterFirst = store.consumption_events.length;
        const voidedAt = store.charges.find((c) => c.id === chargeId)!.voided_at;

        // Replay the identical correction fact.
        await draftConsumption(supabase, ORG_ID, correction, TODAY, "user-1");

        // Exactly one correction event for att-2 (fact-anchored idempotency key).
        expect(store.consumption_events.filter((e) => e.source_entity_id === "att-2")).toHaveLength(1);
        expect(store.consumption_events.length).toBe(eventsAfterFirst);
        // Prior obligation superseded exactly once; no duplicate obligation rows.
        const superseded = store.resolved_obligations.filter((o) => o.status === "superseded");
        expect(superseded).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        // Charge stays void; not re-voided with a new timestamp (0-row update on replay).
        const charge = store.charges.find((c) => c.id === chargeId)!;
        expect(charge.status).toBe("void");
        expect(charge.voided_at).toBe(voidedAt);
        expect(store.charges).toHaveLength(1);
    });

    it("regression — replaying the same ORIGINAL fact stays idempotent", async () => {
        const { store, supabase } = setup();
        const fact = att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" });
        await draftConsumption(supabase, ORG_ID, fact, TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, { ...fact, sourceEntityId: "att-1b" }, TODAY, "user-1");
        expect(store.consumption_events).toHaveLength(1);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.charges).toHaveLength(1);
    });
});
