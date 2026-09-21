/**
 * AUTOPAY THROUGH THE REAL RUNTIME — the seam, against a real Postgres.
 *
 * The handler's own suite proves what it decides. This proves that the GENERIC scheduler actually
 * reaches it: a real `scheduled_work` row, real materialization, a real atomic claim, real dispatch
 * through the registry, and a real outcome written back. Every one of those is a claim about what
 * the database does, and a mock would only restate the code's assumptions back to it.
 *
 * ── WHY THE DUPLICATE-WAKE CASE IS THE IMPORTANT ONE ──
 *
 * Delivery is at-least-once. The scheduler may wake twice for the same moment — a retry, an
 * overlapping tick, a worker that lost its lease and came back. If that produced two collections,
 * a family would be charged twice for one obligation, and no amount of care inside the handler
 * would prevent it. The convergence lives in the `(scheduled_work_id, due_at)` unique index, and
 * this asserts it holds for Autopay specifically rather than in the abstract.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { enrollAutopay, revokeAutopay } from "@/lib/financials/payments/autopayArrangement";
import { AUTOPAY_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";
import {
    __resetScheduledWorkRegistryForTests,
    registerScheduledWorkHandler,
} from "@/lib/scheduledWork/scheduledWorkRegistry";
import { runScheduledWorkWake } from "@/lib/scheduledWork/scheduledWorkRuntime";
import { evaluateAutopayOccurrence } from "@/lib/financials/payments/autopayHandler";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;

const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

/*
 * UNIQUE PER RUN. `uq_payment_methods_provider_method_ref` is a real unique index, so a fixed
 * reference means a crashed run leaves a row that makes every later run fail at setup — which reads
 * as a product defect and is not one. This suite establishes its own preconditions and restores
 * what it borrows, per the cert-environment doctrine.
 */
const RUN = Math.random().toString(36).slice(2, 10);
const TAG = `qa_autopay_w5_${RUN}`;
let orgId = "";
let customerId = "";
let methodId = "";
let arrangementId = "";
const payerId = "00000000-0000-4000-8000-00000000a5ce";

/** What the handler was asked, recorded, so the assertions are about DISPATCH not about economics. */
const dispatched: Array<Record<string, unknown>> = [];

beforeAll(async () => {
    if (!LIVE) return;

    const { data: cust } = await db
        .from("customers").select("id, org_id").limit(1).maybeSingle();
    customerId = (cust as { id: string }).id;
    orgId = (cust as { org_id: string }).org_id;

    /*
     * BORROWED STATE, RESTORED BEFORE USE. At most one live arrangement may exist per account, so
     * an arrangement left by an earlier crashed run would make `enrollAutopay` refuse
     * `already_enrolled` — a correct refusal that would read here as a broken enrollment.
     */
    const { data: stale } = await db
        .from("payment_autopay_arrangements")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .in("status", ["active", "paused"]);
    for (const row of ((stale ?? []) as Array<{ id: string }>)) {
        await db.from("scheduled_work").delete().eq("domain_ref->>arrangement_id", row.id);
        await db.from("payment_autopay_arrangements").delete().eq("id", row.id);
    }

    /* An instrument to authorize. Provider refs are synthetic: nothing here calls a provider. */
    const { data: m } = await db
        .from("payment_methods")
        .insert({
            org_id: orgId, customer_id: customerId, payer_entity_type: "person", payer_entity_id: payerId,
            rail: "card", processor: "stripe",
            provider_customer_ref: `cus_${TAG}`, provider_method_ref: `pm_${TAG}`,
            usability_state: "usable",
        })
        .select("id").maybeSingle();
    methodId = (m as { id: string }).id;

    /*
     * The registry is replaced with a RECORDING handler that delegates to the real one. The point
     * under test is that the runtime reaches Payments' registered code with the right context —
     * not what that code then decides, which its own suite covers exhaustively.
     */
    __resetScheduledWorkRegistryForTests();
    registerScheduledWorkHandler(AUTOPAY_HANDLER_KEY, async (ctx) => {
        dispatched.push({ ...ctx.domainRef, occurrenceId: ctx.occurrenceId, attempt: ctx.attemptNumber });
        return evaluateAutopayOccurrence(ctx, { supabase: db });
    });
});

afterAll(async () => {
    if (!LIVE) return;
    if (arrangementId) {
        await db.from("scheduled_work").delete().eq("handler_key", AUTOPAY_HANDLER_KEY)
            .eq("domain_ref->>arrangement_id", arrangementId);
        await db.from("payment_autopay_arrangements").delete().eq("id", arrangementId);
    }
    if (methodId) await db.from("payment_methods").delete().eq("id", methodId);
    __resetScheduledWorkRegistryForTests();
});

describe.runIf(LIVE)("the generic clock reaches Payments", () => {
    it("enrolling registers a real schedule the runtime can find", async () => {
        const out = await enrollAutopay(db, {
            orgId, customerId, payerEntityId: payerId, paymentMethodId: methodId,
            authorizedBy: payerId,
            /* Yesterday, so the schedule is already due and this wake has work to do. */
            effectiveFrom: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        });
        expect(out.ok, out.ok === false ? out.message : "").toBe(true);
        arrangementId = out.ok ? out.value.id : "";

        const { data } = await db
            .from("scheduled_work")
            .select("id, handler_key, recurrence_kind, is_active, next_due_at")
            .eq("domain_ref->>arrangement_id", arrangementId)
            .maybeSingle();
        expect(data, "a consent with no schedule silently never collects").toBeTruthy();
        expect((data as Record<string, unknown>).handler_key).toBe(AUTOPAY_HANDLER_KEY);
        expect((data as Record<string, unknown>).is_active).toBe(true);
    });

    it("a real wake claims the occurrence and dispatches to the Payments handler", async () => {
        const before = dispatched.length;
        const result = await runScheduledWorkWake(db, {});

        const mine = dispatched.slice(before).filter((d) => d.arrangement_id === arrangementId);
        expect(mine, "the runtime must reach the registered Payments handler").toHaveLength(1);
        expect(mine[0]!.attempt).toBe(1);

        /* The occurrence is COMPLETED even when nothing is due — a domain no-op is a healthy run. */
        const occ = result.occurrences.find((o) => o.handlerKey === AUTOPAY_HANDLER_KEY);
        expect(occ?.outcome).toBe("completed");
    });

    /*
     * THE DUPLICATE WAKE. Materializing converges on `(scheduled_work_id, due_at)`, so a second
     * wake finds today's occurrence already completed and does not run it again.
     *
     * The first version of this case FAILED, and the code was wrong rather than the test: the
     * schedule started at a backdated `effective_from`, so each wake materialised a further past
     * day and dispatched for it. `firstWakeAt` now clamps the start to today, which is what makes
     * "a second wake does nothing" true instead of merely intended.
     */
    it("a second wake on the same day cannot collect twice", async () => {
        const before = dispatched.length;
        await runScheduledWorkWake(db, {});
        const again = dispatched.slice(before).filter((d) => d.arrangement_id === arrangementId);
        expect(again, "one occurrence, one execution").toHaveLength(0);

        const { data } = await db
            .from("scheduled_work_occurrences")
            .select("id, status, attempt_count")
            .eq("handler_key", AUTOPAY_HANDLER_KEY)
            .eq("domain_ref->>arrangement_id", arrangementId);
        const rows = (data ?? []) as Array<{ status: string; attempt_count: number }>;
        expect(rows.filter((r) => r.attempt_count > 1), "no occurrence was executed twice").toHaveLength(0);
    });

    it("revoking stops the clock for that arrangement", async () => {
        const out = await revokeAutopay(db, { orgId, arrangementId });
        expect(out.ok).toBe(true);

        const { data } = await db
            .from("scheduled_work").select("is_active, next_due_at")
            .eq("domain_ref->>arrangement_id", arrangementId).maybeSingle();
        expect((data as Record<string, unknown>).is_active).toBe(false);
        expect((data as Record<string, unknown>).next_due_at).toBeNull();
    });
});
