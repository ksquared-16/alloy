/**
 * HELD DEPOSITS, AGAINST THE REAL DATABASE.
 *
 * The deterministic suite proves the decisions. This proves the guarantees only the database can
 * make, and they are the ones money depends on:
 *
 *   * a hold cannot exceed the unapplied money on its receipt
 *   * a hold cannot be disposed of beyond what it held
 *   * the lot is IMMUTABLE — no in-place decrement, however convenient
 *   * dispositions are APPEND-ONLY — no update, no delete
 *   * two writers arriving together cannot spend the same cent twice
 *
 * A fake store that "implements" a trigger is the test agreeing with itself. These run the triggers.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPaymentHold, disposeHold, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) =>
            file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const supabase: SupabaseClient | null = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;

const ORG = "9c000000-0000-4000-8000-00000000e009";
const OTHER_ORG = "9c000000-0000-4000-8000-00000000e00a";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

let paymentId = "";

async function seedPayment(amountCents: number, over: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await supabase!.from("payments").insert({
        org_id: ORG, direction: "inbound", status: "posted",
        amount_cents: amountCents, currency: "USD", payment_method: "cash",
        received_at: new Date().toISOString(), created_by: ACTOR, updated_by: ACTOR, ...over,
    }).select("id").single();
    if (error) throw new Error(`could not seed a payment: ${error.message}`);
    return String((data as { id: string }).id);
}

describe.runIf(Boolean(supabase))("held deposits — live, against the database's own guarantees", () => {
    beforeAll(async () => {
        for (const id of [ORG, OTHER_ORG]) {
            await supabase!.from("orgs").upsert(
                { id, name: `Payments W4 cert ${id.slice(-4)}`, slug: `payments-w4-${id.slice(-4)}`, status: "active" },
                { onConflict: "id" },
            );
        }
    }, 60_000);

    beforeEach(async () => {
        /* Each case starts clean: a hold left by an earlier case is indistinguishable from this one's. */
        await supabase!.from("payment_hold_dispositions").delete().eq("org_id", ORG);
        await supabase!.from("payment_holds").delete().eq("org_id", ORG);
        await supabase!.from("payments").delete().eq("org_id", ORG);
        paymentId = await seedPayment(50_000);
    });

    afterAll(async () => {
        if (!supabase) return;
        await supabase.from("payment_hold_dispositions").delete().eq("org_id", ORG);
        await supabase.from("payment_holds").delete().eq("org_id", ORG);
        await supabase.from("payments").delete().in("org_id", [ORG, OTHER_ORG]);
    });

    // ── THE TWO INVARIANTS ───────────────────────────────────────────────────────────────────────

    it("the DATABASE refuses a hold larger than the unapplied money", async () => {
        const { error } = await supabase!.from("payment_holds").insert({
            org_id: ORG, payment_id: paymentId, amount_cents: 60_000, refundable: true,
        });
        expect(error, "a service check is not what stops this").toBeTruthy();
        expect(error!.message).toMatch(/would exceed the unapplied money/i);
    });

    it("the DATABASE refuses a second hold that would over-hold the same receipt", async () => {
        const first = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 40_000, refundable: true });
        expect(first.ok).toBe(true);
        const { error } = await supabase!.from("payment_holds").insert({
            org_id: ORG, payment_id: paymentId, amount_cents: 20_000, refundable: true,
        });
        expect(error).toBeTruthy();
        expect(error!.message).toMatch(/already held/i);
    });

    it("the DATABASE refuses disposing of more than a hold held", async () => {
        const made = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true });
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        const { error } = await supabase!.from("payment_hold_dispositions").insert({
            org_id: ORG, hold_id: made.hold.id, kind: "released", amount_cents: 40_000,
        });
        expect(error).toBeTruthy();
        expect(error!.message).toMatch(/would exceed hold/i);
    });

    // ── THE AMENDMENT, ENFORCED ──────────────────────────────────────────────────────────────────

    /**
     * THE LOT IS IMMUTABLE. This is the shortcut the amendment exists to forbid: decrementing the
     * hold instead of appending a disposition, which silently destroys what was originally held.
     */
    it("refuses to decrement a hold in place", async () => {
        const made = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true });
        expect(made.ok).toBe(true);
        if (!made.ok) return;

        const { error } = await supabase!.from("payment_holds")
            .update({ amount_cents: 10_000 }).eq("id", made.hold.id);
        expect(error, "the convenient wrong answer is refused").toBeTruthy();
        expect(error!.message).toMatch(/economic lot/i);
    });

    it("refuses to rewrite the terms money was taken under", async () => {
        const made = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: false });
        expect(made.ok).toBe(true);
        if (!made.ok) return;

        const { error } = await supabase!.from("payment_holds")
            .update({ refundable: true }).eq("id", made.hold.id);
        expect(error, "a later policy change cannot rewrite an existing snapshot").toBeTruthy();
    });

    it.each([["update"], ["delete"]])("refuses to %s a disposition", async (op) => {
        const made = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true });
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        const disposed = await disposeHold(supabase!, { orgId: ORG, holdId: made.hold.id, kind: "released", amountCents: 10_000 });
        expect(disposed.ok).toBe(true);
        if (!disposed.ok) return;
        const dispId = disposed.hold.dispositions[0]!.id;

        const { error } = op === "update"
            ? await supabase!.from("payment_hold_dispositions").update({ amount_cents: 1 }).eq("id", dispId)
            : await supabase!.from("payment_hold_dispositions").delete().eq("id", dispId);

        expect(error, "the history of a hold is append-only").toBeTruthy();
        expect(error!.message).toMatch(/append-only/i);
    });

    // ── CONCURRENCY ──────────────────────────────────────────────────────────────────────────────

    /**
     * TWO WRITERS, ONE RECEIPT. Both read the same unapplied remainder and both believe they may
     * hold it. Only the row lock decides; a read-then-write service check would let both through.
     */
    it("two simultaneous holds cannot over-hold the same money", async () => {
        const results = await Promise.all([
            createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true }),
            createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true }),
        ]);
        const succeeded = results.filter((r) => r.ok).length;
        expect(succeeded, "exactly one may win 30k + 30k against a 50k receipt").toBe(1);

        const holds = await readHoldsForPayments(supabase!, { orgId: ORG, paymentIds: [paymentId] });
        const totalHeld = holds.reduce((a, h) => a + h.remainingCents, 0);
        expect(totalHeld).toBeLessThanOrEqual(50_000);
    }, 60_000);

    it("two simultaneous releases cannot release the same money twice", async () => {
        const made = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true });
        expect(made.ok).toBe(true);
        if (!made.ok) return;

        const results = await Promise.all([
            disposeHold(supabase!, { orgId: ORG, holdId: made.hold.id, kind: "released", amountCents: 20_000 }),
            disposeHold(supabase!, { orgId: ORG, holdId: made.hold.id, kind: "released", amountCents: 20_000 }),
        ]);
        expect(results.filter((r) => r.ok).length, "20k + 20k cannot come out of a 30k hold").toBe(1);

        const [hold] = await readHoldsForPayments(supabase!, { orgId: ORG, paymentIds: [paymentId] });
        expect(hold!.remainingCents).toBe(10_000);
        expect(hold!.originalAmountCents, "and the original is still 30k").toBe(30_000);
    }, 60_000);

    // ── THE HISTORY SURVIVES ─────────────────────────────────────────────────────────────────────

    it("a partial release keeps the original amount and the exact remainder", async () => {
        const made = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 50_000, refundable: true, reason: "Enrollment deposit", actorUserId: ACTOR,
        });
        expect(made.ok).toBe(true);
        if (!made.ok) return;

        await disposeHold(supabase!, { orgId: ORG, holdId: made.hold.id, kind: "released", amountCents: 20_000, reason: "Partial release", actorUserId: ACTOR });
        const [hold] = await readHoldsForPayments(supabase!, { orgId: ORG, paymentIds: [paymentId] });

        expect(hold!.originalAmountCents).toBe(50_000);
        expect(hold!.releasedCents).toBe(20_000);
        expect(hold!.remainingCents).toBe(30_000);
        expect(hold!.reason).toBe("Enrollment deposit");
        expect(hold!.dispositions).toHaveLength(1);
        expect(hold!.dispositions[0]!.reason).toBe("Partial release");
    });

    /* A release names nothing; an application names its allocation. The constraint says so. */
    it("refuses an applied disposition that names no allocation", async () => {
        const made = await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true });
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        const { error } = await supabase!.from("payment_hold_dispositions").insert({
            org_id: ORG, hold_id: made.hold.id, kind: "applied", amount_cents: 10_000,
        });
        expect(error, "an application with no allocation is a claim with no counterpart").toBeTruthy();
    });

    it("holding money changes no payment row and creates no allocation", async () => {
        const { data: before } = await supabase!.from("payments").select("amount_cents, status").eq("id", paymentId).single();
        await createPaymentHold(supabase!, { orgId: ORG, paymentId, amountCents: 30_000, refundable: true });
        const { data: after } = await supabase!.from("payments").select("amount_cents, status").eq("id", paymentId).single();

        expect(after).toEqual(before);
        const { data: allocs } = await supabase!.from("payment_allocations").select("id").eq("payment_id", paymentId);
        expect(allocs, "a hold is a restriction, not an application").toHaveLength(0);
    });

    it("cannot hold a payment belonging to another organization", async () => {
        const foreign = await seedPayment(10_000, { org_id: OTHER_ORG });
        const out = await createPaymentHold(supabase!, { orgId: ORG, paymentId: foreign, amountCents: 1_000, refundable: true });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("payment_not_found");
        await supabase!.from("payments").delete().eq("id", foreign);
    });
});
