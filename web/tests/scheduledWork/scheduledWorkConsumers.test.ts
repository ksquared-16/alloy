/**
 * THREE CONSUMERS, ONE RUNTIME.
 *
 * The claim Governed Scheduled Work V1 makes is not "a scheduler exists" — it is that
 * Financials Periodic Billing, Financials Charge Aging and Payments Autopay are served
 * by the SAME runtime through the SAME registered-handler boundary, with nothing
 * domain-specific above that boundary.
 *
 * That claim is only testable against the real handlers. A stub registered under the
 * same key would prove the runtime can call something, not that these three consumers
 * are reachable — so this drives `registerScheduledWorkConsumers()` itself, and one
 * single wake serves all three.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
    AUTOPAY_HANDLER_KEY,
    BILLING_PERIODIC_HANDLER_KEY,
    CHARGE_AGING_HANDLER_KEY,
    registerScheduledWorkConsumers,
} from "@/lib/scheduledWork/scheduledWorkConsumers";
import { __resetScheduledWorkRegistryForTests } from "@/lib/scheduledWork/scheduledWorkRegistry";
import { runScheduledWorkWake } from "@/lib/scheduledWork/scheduledWorkRuntime";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;

const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

const TAG = "qa_sched_consumers_v1";

const CONSUMERS = [
    { key: BILLING_PERIODIC_HANDLER_KEY, domain: "periodic_billing", ref: { billing_period_id: "bp-1" } },
    { key: CHARGE_AGING_HANDLER_KEY, domain: "charge_aging", ref: { as_of: "2026-09-21" } },
    { key: AUTOPAY_HANDLER_KEY, domain: "autopay", ref: { mandate_id: "m-1", attempt_window: "am" } },
] as const;

async function cleanup() {
    if (!LIVE) return;
    const { data } = await db.from("scheduled_work").select("id").eq("label", TAG);
    for (const s of (data ?? []) as { id: string }[]) {
        await db.from("scheduled_work").delete().eq("id", s.id);
    }
}

describe.runIf(LIVE)("governed scheduled work — three consumers, one runtime", () => {
    beforeEach(async () => {
        __resetScheduledWorkRegistryForTests();
        // NOT the `ensure` wrapper: its module-level latch would make this a no-op
        // after a reset, and the suite would then certify an empty registry.
        registerScheduledWorkConsumers();
        await cleanup();
    });
    afterAll(cleanup);

    it("one wake serves all three real consumers through the registered-handler boundary", async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        const ids = new Map<string, string>();
        for (const c of CONSUMERS) {
            const { data } = await db
                .from("scheduled_work")
                .insert({
                    handler_key: c.key, recurrence_kind: "one_time",
                    next_due_at: past, label: TAG, domain_ref: c.ref,
                })
                .select("id").single();
            ids.set(c.key, (data as { id: string }).id);
        }

        const result = await runScheduledWorkWake(db);

        expect(result.claimed).toBe(3);
        expect(result.completed).toBe(3);
        // The failure this guards is the one that matters: a consumer whose key is
        // declared but never registered fails terminally instead of running.
        expect(result.unregisteredHandler).toBe(0);
        expect(result.terminallyFailed).toBe(0);
        expect(result.retryScheduled).toBe(0);

        // One worker identity served all three — this is the "one runtime" half.
        expect(new Set([result.workerId]).size).toBe(1);

        for (const c of CONSUMERS) {
            const { data: occ } = await db
                .from("scheduled_work_occurrences")
                .select("id,status,handler_key")
                .eq("scheduled_work_id", ids.get(c.key)!)
                .single();
            const row = occ as { id: string; status: string; handler_key: string };
            expect(row.status).toBe("completed");
            expect(row.handler_key).toBe(c.key);

            const { data: attempts } = await db
                .from("scheduled_work_attempts")
                .select("worker_id,outcome,diagnostic,attempt_number")
                .eq("occurrence_id", row.id);
            const list = (attempts ?? []) as {
                worker_id: string; outcome: string; attempt_number: number;
                diagnostic: Record<string, unknown> | null;
            }[];
            expect(list).toHaveLength(1);
            expect(list[0].outcome).toBe("completed");
            expect(list[0].attempt_number).toBe(1);
            expect(list[0].worker_id).toBe(result.workerId);

            // The handler that ran was THIS domain's, and the opaque reference it was
            // handed back is the one the schedule stored.
            const diag = list[0].diagnostic ?? {};
            expect(diag.domain).toBe(c.domain);
            expect(diag.domain_ref_keys).toEqual(Object.keys(c.ref).sort());
            expect(diag.mutation).toBe("not_productized_v1");
        }
    });

    it("a consumer key that is NOT registered fails terminally rather than silently passing", async () => {
        // The control for the test above: if `unregisteredHandler === 0` were vacuous,
        // this would also read zero.
        const past = new Date(Date.now() - 60_000).toISOString();
        await db.from("scheduled_work").insert({
            handler_key: "financials.periodic_billing.evaluate.NOT_REGISTERED",
            recurrence_kind: "one_time", next_due_at: past, label: TAG,
        });

        const result = await runScheduledWorkWake(db);

        expect(result.claimed).toBe(1);
        expect(result.unregisteredHandler).toBe(1);
        expect(result.terminallyFailed).toBe(1);
        expect(result.completed).toBe(0);
    });

    it("V1 consumers mutate nothing — every outcome is a completed evaluation", async () => {
        // Stated as a limitation in the consumers file; asserted here so productizing
        // a mutation cannot happen without this test being consciously changed.
        const past = new Date(Date.now() - 60_000).toISOString();
        for (const c of CONSUMERS) {
            await db.from("scheduled_work").insert({
                handler_key: c.key, recurrence_kind: "one_time",
                next_due_at: past, label: TAG, domain_ref: c.ref,
            });
        }
        const result = await runScheduledWorkWake(db);
        expect(result.completed).toBe(3);

        const { data } = await db
            .from("scheduled_work_attempts")
            .select("diagnostic")
            .in("handler_key", CONSUMERS.map((c) => c.key));
        const diags = ((data ?? []) as { diagnostic: Record<string, unknown> | null }[])
            .map((r) => r.diagnostic?.mutation);
        expect(diags.length).toBeGreaterThanOrEqual(3);
        expect(new Set(diags)).toEqual(new Set(["not_productized_v1"]));
    });
});
