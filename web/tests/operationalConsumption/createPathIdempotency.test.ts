import { describe, expect, it } from "vitest";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import { setup, att, TODAY, ORG_ID, DATE, AGREEMENT } from "./correctionFixtures";

/**
 * Audit F1 regression — the create-path TOCTOU.
 *
 * The create-vs-recalc decision and the charge write MUST be a function of the
 * obligation's OWN draft charge, decided UNDER LOCK inside the reconcile RPC — never
 * a pre-lock plan hint. These tests reproduce the interleavings that previously
 * orphaned a duplicate draft charge:
 *   - create-path REPLAY (same correction twice);
 *   - two distinct corrections that each FIRST-introduce the same obligation key
 *     (the "concurrent create" convergence);
 *   - a STALE "would-create" plan reconciled against an obligation that already
 *     carries a draft charge (direct RPC — the exact TOCTOU).
 *
 * Invariant asserted throughout: exactly ONE live draft charge per obligation key,
 * every draft charge referenced by exactly one live obligation (no orphan).
 */

const lateCharges = (store: { charges: Record<string, unknown>[] }) =>
    store.charges.filter((c) => c.charge_category === "late_pickup");

/** No draft charge is left dangling (referenced by no live/non-superseded obligation). */
function assertNoOrphanDraftCharges(store: {
    charges: Record<string, unknown>[];
    resolved_obligations: Record<string, unknown>[];
}) {
    const referenced = new Set(
        store.resolved_obligations
            .filter((o) => o.status !== "superseded")
            .map((o) => o.draft_charge_id)
            .filter(Boolean),
    );
    const orphanDrafts = store.charges.filter(
        (c) => c.status === "draft" && !referenced.has(c.id),
    );
    expect(orphanDrafts, `orphaned draft charges: ${JSON.stringify(orphanDrafts)}`).toHaveLength(0);
}

describe("F1 — create-path replay is idempotent (no duplicate/orphaned draft charge)", () => {
    it("a correction that first-introduces a late fee creates ONE charge; replay recalcs, never duplicates", async () => {
        const { store, supabase } = setup();
        // Original: on-time checkout → consumption event, NO late obligation, NO charge.
        await draftConsumption(
            supabase,
            ORG_ID,
            att({ sourceEntityId: "att-0", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "original" }),
            TODAY,
            "user-1",
        );
        expect(lateCharges(store)).toHaveLength(0);

        // Correction: now late → FIRST-introduces the late_pickup obligation (create path).
        const correction = att({ sourceEntityId: "att-1", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-0" });
        await draftConsumption(supabase, ORG_ID, correction, TODAY, "user-1");
        expect(lateCharges(store)).toHaveLength(1);
        const createdChargeId = lateCharges(store)[0].id;

        // Replay the SAME correction fact → recalc the same charge, no second charge.
        await draftConsumption(supabase, ORG_ID, correction, TODAY, "user-1");
        expect(lateCharges(store)).toHaveLength(1);
        expect(lateCharges(store)[0].id).toBe(createdChargeId);
        assertNoOrphanDraftCharges(store);
    });
});

describe("F1 — two distinct corrections first-introducing the same key converge on one charge (concurrent create)", () => {
    it("correction A then correction B (distinct facts, same prior) yield ONE late charge owned by the last event", async () => {
        const { store, supabase } = setup();
        await draftConsumption(
            supabase,
            ORG_ID,
            att({ sourceEntityId: "att-0", attendanceFactType: "check_out", checkOutTime: "16:45", lateThresholdTime: "17:00", entryType: "original" }),
            TODAY,
            "user-1",
        );

        // Two distinct correction facts (different sourceEntityId) both correcting att-0,
        // both first-introducing the same late_pickup obligation key.
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-A", attendanceFactType: "check_out", checkOutTime: "17:18", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-0" }), TODAY, "user-1");
        await draftConsumption(supabase, ORG_ID, att({ sourceEntityId: "att-B", attendanceFactType: "check_out", checkOutTime: "17:25", lateThresholdTime: "17:00", entryType: "correction", correctsFactId: "att-0" }), TODAY, "user-1");

        // Exactly ONE late obligation and ONE late draft charge — converged, no orphan.
        const lateObls = store.resolved_obligations.filter((o) => o.obligation_kind === "late_pickup");
        expect(lateObls).toHaveLength(1);
        expect(lateCharges(store)).toHaveLength(1);
        expect(lateObls[0].draft_charge_id).toBe(lateCharges(store)[0].id);
        assertNoOrphanDraftCharges(store);
    });
});

describe("F1 — a STALE would-create plan reconciled against an obligation that already has a draft charge recalcs (direct RPC)", () => {
    it("the RPC decides create-vs-recalc from the obligation's own draft_charge_id, not the plan", async () => {
        const { store, supabase } = setup();
        const orgId = ORG_ID;
        // Seed: a prior event + an obligation that ALREADY carries a draft charge for key K
        // (as if a concurrent correction had already created it between plan and execute).
        store.consumption_events.push({
            id: "cev-prior", org_id: orgId, source_family: "attendance", event_key: "attendance.late_pickup",
            source_entity_type: "child_attendance_events", source_entity_id: "att-0", occurs_on: DATE,
            status: "resolved", idempotency_key: "cev:orig:att-0", context: {},
        });
        store.charges.push({
            id: "chg-existing", org_id: orgId, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
            charge_type: "fee", charge_category: "late_pickup", status: "draft", currency_code: "USD",
            amount_cents: 2500, occurs_on: DATE, billable_on: DATE, service_date: DATE, metadata: {},
        });
        store.resolved_obligations.push({
            id: "obl-K", org_id: orgId, consumption_event_id: "cev-prior", amount_cents: 2500, status: "drafted",
            resolution_key: "tpl:late_pickup:2026-06-18:agr-1", obligation_kind: "late_pickup",
            draft_charge_id: "chg-existing", review_status: "pending",
        });

        const chargesBefore = store.charges.length;

        // A STALE plan that "would create" (priced charge fields, NO op hint) for the SAME key K,
        // with a corrected amount. Correct behavior: recalc chg-existing, do NOT create a second charge.
        const plan = {
            correction_event: {
                idempotency_key: "cev:corr:att-1:fact:att-1", event_key: "attendance.late_pickup", source_family: "attendance",
                source_entity_type: "child_attendance_events", source_entity_id: "att-1", occurs_on: DATE, status: "resolved", context: {},
            },
            prior_fact_id: "att-0",
            new_obligations: [{
                resolution_key: "tpl:late_pickup:2026-06-18:agr-1", obligation_kind: "late_pickup", amount_cents: 1800,
                currency_code: "USD", status: "drafted", review_status_stale: true,
                charge: {
                    billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT, charge_type: "fee",
                    charge_category: "late_pickup", currency_code: "USD", amount_cents: 1800,
                    occurs_on: DATE, billable_on: DATE, service_date: DATE, metadata: {},
                },
            }],
            retire_charge_ids: [],
        };

        const { data, error } = await supabase.rpc("reconcile_consumption_correction", {
            p_org_id: orgId, p_actor_user_id: "user-1", p_plan: plan,
        });
        expect(error).toBeNull();
        expect((data as { ok: boolean }).ok).toBe(true);

        // No new charge created; the existing draft recalced in place; obligation reparented.
        expect(store.charges).toHaveLength(chargesBefore);
        expect(store.charges.find((c) => c.id === "chg-existing")).toMatchObject({ status: "draft", amount_cents: 1800 });
        expect((data as { created_charge_ids: string[] }).created_charge_ids ?? []).toHaveLength(0);
        const obl = store.resolved_obligations.find((o) => o.id === "obl-K");
        expect(obl?.consumption_event_id).toBe((data as { consumption_event_id: string }).consumption_event_id);
        expect(obl?.draft_charge_id).toBe("chg-existing");
        assertNoOrphanDraftCharges(store);
    });
});
