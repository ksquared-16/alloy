import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import { att, ORG_ID, setup, TODAY } from "./correctionFixtures";

/**
 * D12a (DP-4) — correction chains resolve against the IMMEDIATE prior; the live
 * obligation follows the chain head; earlier events are superseded. History is
 * reconstructable via corrects_event_id (E2 → E1 → E0).
 */
describe("D12a chains", () => {
    it("original → correction → correction: links E2→E1→E0, obligation owned by E2, E0/E1 superseded", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-0", attendanceFactType: "hourly_care", hours: 3 }), TODAY, "user-1");
        const oblId = store.resolved_obligations[0].id;
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "hourly_care", hours: 2, entryType: "correction", correctsFactId: "att-0" }), TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "hourly_care", hours: 1, entryType: "correction", correctsFactId: "att-1" }), TODAY, "user-1");

        const e0 = store.consumption_events.find((e) => e.source_entity_id === "att-0")!;
        const e1 = store.consumption_events.find((e) => e.source_entity_id === "att-1")!;
        const e2 = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        expect(e1.corrects_event_id).toBe(e0.id);
        expect(e2.corrects_event_id).toBe(e1.id);
        // Live obligation owned by the head (E2), converged to one row.
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.resolved_obligations[0].id).toBe(oblId);
        expect(store.resolved_obligations[0].consumption_event_id).toBe(e2.id);
        expect(store.resolved_obligations[0].amount_cents).toBe(1500);
        // Earlier events superseded; head is not.
        expect(e0.status).toBe("superseded");
        expect(e1.status).toBe("superseded");
        expect(e2.status).not.toBe("superseded");
    });

    it("original → correction → reversal: the reversal retires the currently-surviving obligation", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-0", attendanceFactType: "hourly_care", hours: 3 }), TODAY, "user-1");
        const oblId = store.resolved_obligations[0].id;
        const chargeId = store.charges[0].id;
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "hourly_care", hours: 2, entryType: "correction", correctsFactId: "att-0" }), TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "hourly_care", hours: 2, entryType: "reversal", correctsFactId: "att-1" }), TODAY, "user-1");

        const obl = store.resolved_obligations.find((o) => o.id === oblId)!;
        expect(obl.status).toBe("superseded");
        const charge = store.charges.find((c) => c.id === chargeId)!;
        expect(charge.status).toBe("void");
        const e2 = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        expect(e2.status).toBe("no_obligation");
        expect(store.resolved_obligations.filter((o) => o.consumption_event_id === e2.id)).toHaveLength(0);
    });

    it("same-key correction then fee-eliminating correction: first reparents, second supersedes + voids", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-0", attendanceFactType: "hourly_care", hours: 3 }), TODAY, "user-1");
        const oblId = store.resolved_obligations[0].id;
        const chargeId = store.charges[0].id;

        // First correction reparents (still hourly, changed amount).
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "hourly_care", hours: 2, entryType: "correction", correctsFactId: "att-0" }), TODAY, "user-1");
        const e1 = store.consumption_events.find((e) => e.source_entity_id === "att-1")!;
        expect(store.resolved_obligations.find((o) => o.id === oblId)!.consumption_event_id).toBe(e1.id);
        expect(store.charges.find((c) => c.id === chargeId)!.status).toBe("draft");

        // Second correction eliminates the fee (absence, not vacation-eligible → no directive).
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "absence", vacationEligible: false, entryType: "correction", correctsFactId: "att-1" }), TODAY, "user-1");
        expect(store.resolved_obligations.find((o) => o.id === oblId)!.status).toBe("superseded");
        expect(store.charges.find((c) => c.id === chargeId)!.status).toBe("void");
    });
});
