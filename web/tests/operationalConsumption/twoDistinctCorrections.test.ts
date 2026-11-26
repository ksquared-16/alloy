import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import { att, ORG_ID, setup, TODAY } from "./correctionFixtures";

/**
 * D12a (DP-3/DP-4) — two DISTINCT correction facts of the same prior fact create
 * two DISTINCT correction events (distinct fact-anchored keys); each is idempotent
 * on replay; the surviving obligation converges to a single row owned by the
 * last-committed correction event (unique (org, resolution_key) + row locks).
 */
describe("D12a — two distinct corrections of the same prior fact", () => {
    it("creates distinct events, converges the obligation to one row, idempotent on replay", async () => {
        const { store, supabase } = setup();
        // Original hourly care (3h → $45).
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-1", attendanceFactType: "hourly_care", hours: 3 }), TODAY, "user-1");
        const oblId = store.resolved_obligations[0].id;

        // Correction A (att-2, 2h) and Correction B (att-3, 1h), both correcting att-1.
        const corrA = att({ sourceEntityId: "att-2", attendanceFactType: "hourly_care", hours: 2, entryType: "correction", correctsFactId: "att-1" });
        const corrB = att({ sourceEntityId: "att-3", attendanceFactType: "hourly_care", hours: 1, entryType: "correction", correctsFactId: "att-1" });
        await draftConsumption(supabase, ORG_ID, corrA, TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, corrB, TODAY, "user-1");

        const eventA = store.consumption_events.find((e) => e.source_entity_id === "att-2")!;
        const eventB = store.consumption_events.find((e) => e.source_entity_id === "att-3")!;
        // Distinct events, distinct fact-anchored idempotency keys.
        expect(eventA.id).not.toBe(eventB.id);
        expect(String(eventA.idempotency_key)).toContain(":fact:att-2");
        expect(String(eventB.idempotency_key)).toContain(":fact:att-3");
        // Single obligation row, converged, owned by the LAST-committed event (B).
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.resolved_obligations[0].id).toBe(oblId);
        expect(store.resolved_obligations[0].consumption_event_id).toBe(eventB.id);
        expect(store.resolved_obligations[0].amount_cents).toBe(1500); // 1h × $15

        const eventCount = store.consumption_events.length;
        // Replay A then B — no new events, still one obligation.
        await draftConsumption(supabase, ORG_ID, corrA, TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, corrB, TODAY, "user-1");
        expect(store.consumption_events.length).toBe(eventCount);
        expect(store.resolved_obligations).toHaveLength(1);
        expect(store.resolved_obligations[0].consumption_event_id).toBe(eventB.id);
        expect(store.charges).toHaveLength(1); // one draft charge throughout
    });
});
