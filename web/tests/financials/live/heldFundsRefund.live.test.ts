/**
 * REFUNDING HELD MONEY, AGAINST THE REAL DATABASE.
 *
 * The deterministic suite proves the ordering and the shape of the code. These prove the two things
 * only the database can settle:
 *
 *   * the `refunded` disposition and the canonical refund both exist and the disposition NAMES the
 *     refund — which `..._refunded_names_payment_chk` will not otherwise permit; and
 *   * a replayed recognition cannot dispose the same money twice, because
 *     `uq_payment_hold_dispositions_one_per_refund` refuses it rather than the bounds trigger
 *     turning a duplicate webhook into a spurious recognition failure.
 *
 * ── WHY THE MANUAL RAIL ──
 *
 * The card rail's disposition is written at RECOGNITION, and recognition needs a connected Stripe
 * merchant that this certification org does not always carry. The manual rail exercises the same
 * invariant — held straight to refunded, no release, disposition names the refund — through the same
 * action, with the executor that has no provider to wait for. The card rail's recognition path is
 * covered deterministically, and the index that protects its replay is proved here directly.
 *
 * ── AND WHY A CONTROLLED ACCOUNT ──
 *
 * The shared certification household carries thousands of accumulated receipts, which puts
 * `readAccountPrepaidPosition` past PostgREST's unpaged row cap. A `customer`-grain source is its
 * own household, so a fresh uuid is a complete isolated account whose position reads only what
 * these cases created.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    PAYMENT_REFUND_ACTION_KEY,
    financialPaymentActions,
} from "@/lib/adminV2/actions/definitions/financialPaymentActions";
import { recordChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { createPaymentHold, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { resolveAuthorizedActor } from "./certEnvironment";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) => file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch { return null; }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const HOUSEHOLD = `fc6c0000-0000-4000-8000-${String(Date.now()).slice(-12)}`;
const invocation = { entityType: "person", entityId: ACTOR } as never;
const action = (key: string) => financialPaymentActions.find((a) => a.actionKey === key)!;

const writtenPayments: string[] = [];
let ctx = { orgId: ORG, userId: ACTOR } as never;

async function receipt(supabase: SupabaseClient, amountCents: number): Promise<string> {
    const out = await recordChildcarePayment(supabase, {
        orgId: ORG,
        billableSourceType: "customer",
        billableSourceId: HOUSEHOLD,
        customerId: HOUSEHOLD,
        amountCents,
        paymentMethod: "check",
        status: "posted",
        actorUserId: ACTOR,
    });
    writtenPayments.push(out.payment.id);
    return out.payment.id;
}

async function dispositions(supabase: SupabaseClient, holdId: string) {
    const { data } = await supabase
        .from("payment_hold_dispositions")
        .select("id, kind, amount_cents, refund_payment_id, allocation_id, disposed_by")
        .eq("org_id", ORG).eq("hold_id", holdId);
    return (data ?? []) as Array<Record<string, unknown>>;
}

describe.skipIf(!env)("refunding held money — live", () => {
    const supabase = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;

    beforeAll(async () => {
        if (!supabase) return;
        const { error } = await supabase.from("customers").upsert(
            { id: HOUSEHOLD, org_id: ORG, name: "W6-B held refund certification" },
            { onConflict: "id" },
        );
        if (error) throw new Error(`could not seed the controlled account: ${error.message}`);
        ctx = { orgId: ORG, userId: await resolveAuthorizedActor(supabase, ORG) } as never;
    });

    afterAll(async () => {
        if (!supabase) return;
        for (const id of writtenPayments) {
            const { data: holds } = await supabase.from("payment_holds").select("id").eq("payment_id", id);
            for (const h of (holds ?? []) as Array<{ id: string }>) {
                await supabase.from("payment_hold_dispositions").delete().eq("hold_id", h.id);
            }
            await supabase.from("payment_allocations").delete().eq("payment_id", id);
            for (const h of (holds ?? []) as Array<{ id: string }>) {
                await supabase.from("payment_holds").delete().eq("id", h.id);
            }
        }
        await supabase.from("ledger_transactions").delete().in("payment_id", writtenPayments);
        /* Refunds name the receipt they reverse, so they go before it. */
        await supabase.from("payments").delete().in("refunds_payment_id", writtenPayments);
        for (const id of writtenPayments) await supabase.from("payments").delete().eq("id", id);
        await supabase.from("customers").delete().eq("id", HOUSEHOLD);
    });

    /**
     * THE REFUSAL IS BEFORE EXECUTION, and on the real record.
     *
     * A non-refundable lot must not produce a canonical refund at all — not one that is created and
     * then compensated. The receipt is checked afterwards to prove nothing left.
     */
    it("refuses a non-refundable lot and refunds nothing", async () => {
        const paymentId = await receipt(supabase!, 30_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 30_000, refundable: false,
            reason: "Registration fee", actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const out = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: supabase!, ctx, invocation,
            payload: { payment_id: paymentId, amount_cents: 10_000, hold_id: held.hold.id },
        } as never);

        expect(out.ok, "a non-refundable deposit cannot be refunded").toBe(false);
        expect(JSON.stringify(out)).toMatch(/non-refundable/i);

        /* Nothing was executed: no outbound row, and the lot is untouched. */
        const { data: outbound } = await supabase!
            .from("payments").select("id").eq("org_id", ORG).eq("refunds_payment_id", paymentId);
        expect((outbound ?? []).length, "no refund may exist").toBe(0);
        expect(await dispositions(supabase!, held.hold.id)).toHaveLength(0);
    });

    it("writes the canonical refund and a refunded disposition that names it", async () => {
        const paymentId = await receipt(supabase!, 50_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 50_000, refundable: true,
            reason: "Security deposit", actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const out = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: supabase!, ctx, invocation,
            payload: { payment_id: paymentId, amount_cents: 20_000, hold_id: held.hold.id, reason: "Agreement ended" },
        } as never);
        expect(out.ok, JSON.stringify(out)).toBe(true);

        const detail = (out as { result?: { detail?: Record<string, unknown> } }).result?.detail ?? {};
        expect(detail.hold_discharged, JSON.stringify(detail)).toBe(true);
        const refundPaymentId = String(detail.refund_payment_id);

        const disps = await dispositions(supabase!, held.hold.id);
        expect(disps).toHaveLength(1);
        expect(disps[0].kind).toBe("refunded");
        expect(Number(disps[0].amount_cents)).toBe(20_000);
        /* The constraint the whole design turns on. */
        expect(disps[0].refund_payment_id).toBe(refundPaymentId);
        expect(disps[0].allocation_id, "a refund names no allocation").toBeNull();

        /* HELD WENT STRAIGHT TO REFUNDED. A released row would mean it was spendable in between. */
        expect(disps.filter((d) => d.kind === "released"), "no release step").toHaveLength(0);

        const after = (await readHoldsForPayments(supabase!, { orgId: ORG, paymentIds: [paymentId] }))
            .find((h) => h.id === held.hold.id);
        expect(after?.originalAmountCents, "the lot is never decremented in place").toBe(50_000);
        expect(after?.refundedCents).toBe(20_000);
        expect(after?.remainingCents).toBe(30_000);
        expect(after?.releasedCents).toBe(0);
    });

    /**
     * A REPLAYED RECOGNITION IS A NO-OP.
     *
     * The inline path and the webhook both recognise the same provider refund. Without the partial
     * unique index the second disposes the same money again, the bounds trigger refuses, and a
     * refund that actually succeeded is recorded as a recognition failure.
     */
    it("refuses a second refunded disposition for the same refund payment", async () => {
        const paymentId = await receipt(supabase!, 40_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 40_000, refundable: true, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const out = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: supabase!, ctx, invocation,
            payload: { payment_id: paymentId, amount_cents: 10_000, hold_id: held.hold.id },
        } as never);
        expect(out.ok, JSON.stringify(out)).toBe(true);
        const refundPaymentId = String(
            (out as { result?: { detail?: Record<string, unknown> } }).result?.detail?.refund_payment_id,
        );

        const replay = await supabase!.from("payment_hold_dispositions").insert({
            org_id: ORG, hold_id: held.hold.id, kind: "refunded",
            amount_cents: 10_000, refund_payment_id: refundPaymentId, reason: "replayed event",
        });
        expect(replay.error?.message ?? "", "the replay must be refused by the index")
            .toMatch(/uq_payment_hold_dispositions_one_per_refund|duplicate key/i);

        expect(await dispositions(supabase!, held.hold.id)).toHaveLength(1);
    });

    it("refuses more than the lot still holds", async () => {
        const paymentId = await receipt(supabase!, 60_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 10_000, refundable: true, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const out = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: supabase!, ctx, invocation,
            /* Within the RECEIPT's refundable balance, beyond the LOT's. */
            payload: { payment_id: paymentId, amount_cents: 20_000, hold_id: held.hold.id },
        } as never);
        expect(out.ok, "the lot bounds the refund, not the receipt").toBe(false);
        expect(await dispositions(supabase!, held.hold.id)).toHaveLength(0);
    });

    /**
     * NO AVAILABLE-PREPAID INTERMEDIATE, measured through the authority that owns the equation.
     *
     * Refunding held money must move the HELD figure and never raise the available one. A
     * release-then-refund implementation would show the money as available in between.
     */
    it("never raises available prepaid on the way out", async () => {
        const paymentId = await receipt(supabase!, 25_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 25_000, refundable: true, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const positionFor = async () => {
            const { outcome } = await readAccountPrepaidPosition(supabase!, {
                orgId: ORG, householdId: HOUSEHOLD, authorized: true,
            });
            expect(outcome.state, "an absent capability is not a zero position").toBe("ok");
            if (outcome.state !== "ok") throw new Error(outcome.state);
            return { available: outcome.position.availableCents, held: outcome.position.heldCents };
        };
        const before = await positionFor();

        const out = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: supabase!, ctx, invocation,
            payload: { payment_id: paymentId, amount_cents: 25_000, hold_id: held.hold.id },
        } as never);
        expect(out.ok, JSON.stringify(out)).toBe(true);

        const after = await positionFor();
        expect(before.held - after.held, "the held figure falls by what was refunded").toBe(25_000);
        /*
         * The whole receipt was held, so nothing was available before and nothing may be after: the
         * money went back to the payer, not onto the account.
         */
        expect(after.available).toBe(before.available);
    });
});
