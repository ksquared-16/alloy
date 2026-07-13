import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import { att, ORG_ID, setup, TODAY } from "./correctionFixtures";

/**
 * D12a — a reversal fact yields ZERO positive directives; it only supersedes the
 * prior obligation and retires its draft charge. No new obligation.
 */
describe("D12a reversal — supersede + void, no new obligation", () => {
    it("retires the prior late-pickup obligation & draft charge; prior event superseded", async () => {
        const { store, supabase } = setup();
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00" }), TODAY, "user-1");
        const priorOblId = store.resolved_obligations[0].id;
        const chargeId = store.charges[0].id;

        const r = await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-2", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00", entryType: "reversal", correctsFactId: "att-1" }), TODAY, "user-1");

        const priorObl = store.resolved_obligations.find((o) => o.id === priorOblId)!;
        expect(priorObl.status).toBe("superseded");
        expect(priorObl.superseded_by_event_id).toBeTruthy();
        expect(priorObl.review_status).toBe("stale");

        const charge = store.charges.find((c) => c.id === chargeId)!;
        expect(charge.status).toBe("void");
        expect(charge.voided_at).toBeTruthy();
        expect((charge.metadata as { retirement?: unknown }).retirement).toBeTruthy();
        expect(store.charges).toHaveLength(1); // preserved, not deleted

        // Reversal event exists with corrects_event_id; carries NO obligation.
        const revEvent = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        expect(revEvent.corrects_event_id).toBeTruthy();
        expect(revEvent.status).toBe("no_obligation");
        expect(store.resolved_obligations.filter((o) => o.consumption_event_id === revEvent.id)).toHaveLength(0);

        const priorEvent = store.consumption_events.find((e) => e.source_entity_id === "att-1")!;
        expect(priorEvent.status).toBe("superseded");

        expect(r.superseded?.obligationIds).toContain(priorOblId);
        expect(r.superseded?.voidedDraftChargeIds).toContain(chargeId);
        expect(r.resolution.obligations).toHaveLength(0);
    });
});
