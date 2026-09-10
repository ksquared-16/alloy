/**
 * SLICE F — WHERE PROVIDER EVIDENCE BECOMES MONEY, exactly once.
 *
 * Slices D and E built everything up to the boundary and deliberately stopped short of it. This is
 * the crossing, and the only claim worth certifying is that it happens ONCE — under duplicate
 * delivery, under a second event describing the same PaymentIntent, and under two workers racing.
 *
 * Event idempotency and financial idempotency are different guarantees. Slice E proved the first.
 * These cases prove the second, which is anchored on the canonical collection attempt rather than on
 * any delivery, because a different event can always describe the same succeeded charge.
 *
 * Real Stripe test mode, a real connected account, real signed payloads, real Postgres. No key,
 * client secret or card detail is printed.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readChargeBalance, recordAndApplyChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";

function readTrusted(key: string): string | null {
    if (process.env[key]) return process.env[key] as string;
    try {
        const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        const line = readFileSync(p, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
        return line?.slice(key.length + 1).trim() || null;
    } catch {
        return null;
    }
}

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
const secret = readTrusted("STRIPE_SECRET_KEY");
const whsec = readTrusted("STRIPE_WEBHOOK_SECRET");
if (secret && !process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = secret;

const ORG = "00000000-0000-4000-8000-000000000001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const CHILD = "fc500000-0000-4000-8000-0000000c0002";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret && whsec ? describe : describe.skip;

let connectedAccount = "";

function signed(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac("sha256", whsec!).update(`${t}.${body}`).digest("hex")}`;
}

function successEvent(piId: string, amountCents: number, opts: { id?: string; currency?: string } = {}): string {
    return JSON.stringify({
        id: opts.id ?? `evt_f_${Math.random().toString(36).slice(2)}`,
        type: "payment_intent.succeeded",
        created: Math.floor(Date.now() / 1000),
        account: connectedAccount,
        data: {
            object: {
                id: piId,
                object: "payment_intent",
                status: "succeeded",
                amount: amountCents,
                amount_received: amountCents,
                currency: opts.currency ?? "usd",
            },
        },
    });
}

async function post(body: string) {
    return await handleStripeWebhook(supabase!, body, signed(body), whsec!);
}

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client.from("charges").insert({
        org_id: ORG, job_id: null,
        billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
        charge_type: "fee", charge_category: "fee", status: "draft",
        currency_code: "USD", amount_cents: amountCents,
        service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
        description: "slice F posting certification", metadata: {},
        created_by: ACTOR, updated_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await client.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

/** A collection through the real Slice D path, then driven to provider success. */
async function collect(client: SupabaseClient, chargeId: string, amountCents: number, payer?: string) {
    const created = await createCardCollection(client, {
        orgId: ORG, chargeId, requestedAmountCents: amountCents, actorUserId: ACTOR, payerPersonId: payer ?? null,
    });
    if (!created.ok) throw new Error(`collection refused: ${JSON.stringify(created)}`);
    return created;
}

/** Teardown asserts, because a silently failed cleanup makes the next case fail for the wrong reason. */
async function clearAll(client: SupabaseClient) {
    const { data: attempts } = await client
        .from("payment_collection_attempts").select("id").eq("org_id", ORG);
    const ids = ((attempts ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (ids.length) {
        await client.from("payment_provider_events").delete().in("collection_attempt_id", ids);
        await client.from("payment_collection_attempts").delete().in("id", ids);
    }
    /*
     * The merchant is SHARED INFRASTRUCTURE, and this suite does not own it.
     *
     * Deleting it asserted success, which stopped being possible the moment another lane's
     * recognised collection attempt pointed at it: those attempts produced money and are not
     * deletable, so the foreign key refuses, the teardown throws, and vitest reports every test in
     * the file as skipped — a green-looking run that certified nothing. Certification hit exactly
     * that after the Thread 8C mounted subject started leaving settled attempts behind.
     *
     * So the removal is attempted and its refusal accepted. What this suite needs is a merchant in a
     * known state, which the upsert below guarantees whether or not the row survived.
     */
    await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
}

describeLive("Slice F — provider-confirmed success becomes canonical money, once", () => {
    beforeAll(async () => {
        const client = supabase!;
        await clearAll(client);
        const res = await fetch("https://api.stripe.com/v1/accounts?limit=1", {
            headers: { Authorization: `Bearer ${secret}` },
        });
        const acct = ((await res.json()) as { data: Array<Record<string, unknown>> }).data[0];
        connectedAccount = String(acct.id);
        await client.from("payment_provider_merchants").upsert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            created_by: ACTOR, updated_by: ACTOR,
        });
    });

    afterAll(async () => { await clearAll(supabase!); });

    it("posts exactly one canonical receipt, reduces outstanding once, and journals once", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 60_000);
        const created = await collect(client, chargeId, 60_000, CHILD);

        // Before provider success there is no money, however far along the collection is.
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(60_000);
        const { data: before } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((before ?? []).length).toBe(0);

        const result = await post(successEvent(created.providerTransactionId, 60_000));
        expect(result.outcome, result.detail).toBe("applied");
        expect(result.detail).toMatch(/posted canonical payment/);

        // ONE receipt, carrying rail, processor, provider identity and the actual payer.
        const { data: receipts } = await client.from("payments")
            .select("id, status, payment_method, processor, processor_transaction_id, payer_entity_type, payer_entity_id, amount_cents")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((receipts ?? []).length, "exactly one canonical receipt").toBe(1);
        const receipt = (receipts ?? [])[0] as Record<string, unknown>;
        expect(receipt.status).toBe("posted");
        expect(receipt.payment_method, "the rail is card").toBe("card");
        expect(receipt.processor, "the executor is stripe").toBe("stripe");
        expect(receipt.amount_cents).toBe(60_000);
        expect(receipt.payer_entity_type, "who actually paid is retained").toBe("person");
        expect(receipt.payer_entity_id).toBe(CHILD);

        // Outstanding moved exactly once, by Thread 8's own arithmetic.
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);

        // Thread 5 consequence, produced by Thread 8 rather than by Stripe code.
        const { data: journal } = await client.from("financial_journal_entries")
            .select("id, entry_type").eq("org_id", ORG).eq("source_id", String(receipt.id));
        expect((journal ?? []).length, "a settlement journals exactly once").toBe(1);

        // And the attempt now names the receipt — provider success and canonical recognition are
        // separately readable.
        const { data: attempt } = await client.from("payment_collection_attempts")
            .select("processor_state, canonical_payment_id").eq("id", created.attemptId).single();
        const a = attempt as { processor_state: string; canonical_payment_id: string | null };
        expect(a.processor_state).toBe("succeeded");
        expect(a.canonical_payment_id).toBe(receipt.id);
    });

    it("does not post a second receipt for a duplicate event, or for a DIFFERENT event describing the same charge", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 45_000);
        const created = await collect(client, chargeId, 45_000);

        const firstBody = successEvent(created.providerTransactionId, 45_000, { id: "evt_f_dup_1" });
        expect((await post(firstBody)).outcome).toBe("applied");

        // Same event again — Slice E's event idempotency.
        expect((await post(firstBody)).outcome).toBe("duplicate");

        // A DIFFERENT event id describing the SAME succeeded PaymentIntent. Event dedupe cannot stop
        // this one; only financial idempotency anchored on the attempt can.
        const secondBody = successEvent(created.providerTransactionId, 45_000, { id: "evt_f_dup_2" });
        const second = await post(secondBody);
        // Correctly a duplicate: the attempt is already succeeded AND already carries its receipt,
        // so there is nothing left to recognise. The guarantee under test is the receipt count
        // below, not which label the handler used to decline — a second event must not become a
        // second payment however it is classified.
        expect(second.outcome).toBe("duplicate");

        const { data: receipts } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((receipts ?? []).length, "still exactly one receipt").toBe(1);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);
    });

    it("recovers an attempt the provider succeeded but Financials never recognised", async () => {
        /*
         * DEFECT 5, LOCKED.
         *
         * The trap: an attempt already marked `succeeded` by the provider while no canonical receipt
         * exists — recognition threw, or the process died between the two. If the handler treats
         * "already succeeded" as "already done" it short-circuits before canonical posting, and the
         * money is stuck outside Thread 8 with no way back in that does not charge the family twice.
         *
         * The recovery has to be the ordinary path: the same event, replayed, posts the receipt.
         * Constructed by advancing the attempt WITHOUT letting recognition run, which is the state
         * a failed posting leaves behind.
         */
        const client = supabase!;
        const chargeId = await postCharge(client, 52_000);
        const created = await collect(client, chargeId, 52_000, CHILD);

        await client
            .from("payment_collection_attempts")
            .update({ processor_state: "succeeded", processor_state_at: new Date().toISOString() })
            .eq("id", created.attemptId);

        // The trap, as the database holds it: provider done, Financials unaware.
        const { data: trapped } = await client.from("payment_collection_attempts")
            .select("processor_state, canonical_payment_id").eq("id", created.attemptId).single();
        expect((trapped as { processor_state: string }).processor_state).toBe("succeeded");
        expect(
            (trapped as { canonical_payment_id: string | null }).canonical_payment_id,
            "the attempt must be unrecognised for this to be the case under test",
        ).toBeNull();
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(52_000);

        // The same provider truth, replayed. It must RECOGNISE rather than decline as done.
        const recovered = await post(successEvent(created.providerTransactionId, 52_000, { id: "evt_f_recover_1" }));
        expect(recovered.outcome, recovered.detail).toBe("applied");
        expect(recovered.detail).toMatch(/posted canonical payment/);

        // Exactly one receipt, and the money is finally inside Thread 8.
        const { data: receipts } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((receipts ?? []).length, "recovery posts exactly one receipt").toBe(1);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);

        // …and the family was never asked for the money a second time: one attempt, one provider
        // transaction, no new collection created by the recovery.
        const { data: attempts } = await client.from("payment_collection_attempts").select("id")
            .eq("org_id", ORG).eq("provider_transaction_id", created.providerTransactionId);
        expect((attempts ?? []).length, "recovery must not create a second collection").toBe(1);

        // Replaying again is now an ordinary duplicate.
        const again = await post(successEvent(created.providerTransactionId, 52_000, { id: "evt_f_recover_2" }));
        expect(again.outcome).toBe("duplicate");
        const { data: after } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((after ?? []).length, "still exactly one receipt").toBe(1);
    });

    it("creates one receipt, one application and one balance move under concurrent success processing", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 33_000);
        const created = await collect(client, chargeId, 33_000);

        // Two DIFFERENT events for the same success, in flight together — the worst case, because
        // event dedupe does not apply and both reach the posting boundary.
        const [a, b] = await Promise.all([
            post(successEvent(created.providerTransactionId, 33_000, { id: `evt_f_conc_a_${Date.now()}` })),
            post(successEvent(created.providerTransactionId, 33_000, { id: `evt_f_conc_b_${Date.now()}` })),
        ]);
        expect([a.outcome, b.outcome].every((o) => o === "applied" || o === "stale" || o === "duplicate")).toBe(true);

        const { data: receipts } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((receipts ?? []).length, "one receipt survived the race").toBe(1);

        const { data: allocations } = await client.from("payment_allocations")
            .select("id").eq("charge_id", chargeId).eq("status", "active");
        expect((allocations ?? []).length, "one active application").toBe(1);

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "balance moved once").toBe(0);

        const { data: journal } = await client.from("financial_journal_entries")
            .select("id").eq("org_id", ORG).eq("source_id", String(((receipts ?? [])[0] as { id: string }).id));
        expect((journal ?? []).length, "one journal consequence").toBe(1);
    });

    it("refuses to post when the provider's amount or currency disagrees with what Alloy authorised", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 50_000);
        const created = await collect(client, chargeId, 50_000);

        // The provider says it took more than we authorised. Neither number wins; the disagreement
        // is the finding, and no money is recognised.
        const wrongAmount = await post(successEvent(created.providerTransactionId, 99_999, { id: `evt_f_amt_${Date.now()}` }));
        expect(wrongAmount.detail).toMatch(/amount_mismatch/);

        const wrongCurrency = await post(successEvent(created.providerTransactionId, 50_000, { id: `evt_f_cur_${Date.now()}`, currency: "eur" }));
        expect(wrongCurrency.detail).toMatch(/currency_mismatch/);

        const { data: receipts } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId);
        expect((receipts ?? []).length, "a disagreement posts nothing").toBe(0);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(50_000);

        // The provider's success is not discarded: the attempt is succeeded with no canonical
        // payment, which reads as "money arrived, not yet recognised" — a retry, not a loss.
        const { data: attempt } = await client.from("payment_collection_attempts")
            .select("processor_state, canonical_payment_id").eq("id", created.attemptId).single();
        const a = attempt as { processor_state: string; canonical_payment_id: string | null };
        expect(a.processor_state).toBe("succeeded");
        expect(a.canonical_payment_id).toBeNull();
    });

    it("posts a partial collection correctly and reflects it in collectible-now", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 80_000);
        const created = await collect(client, chargeId, 30_000);

        expect((await post(successEvent(created.providerTransactionId, 30_000))).outcome).toBe("applied");

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "exact residual").toBe(50_000);

        // Collectible-now follows from canonical truth; nothing Stripe-shaped computed it.
        const collectible = await resolveFamilyCollectible(client, { orgId: ORG, chargeId });
        expect(collectible.outstandingCents).toBe(50_000);
        expect(collectible.currentlyCollectibleCents).toBe(50_000);
    });

    it("creates no money for a failed collection, and a stale event cannot undo a posted one", async () => {
        const client = supabase!;

        // Failed collection.
        const failCharge = await postCharge(client, 20_000);
        const failed = await collect(client, failCharge, 20_000);
        const failBody = JSON.stringify({
            id: `evt_f_failed_${Date.now()}`, type: "payment_intent.payment_failed",
            created: Math.floor(Date.now() / 1000), account: connectedAccount,
            data: { object: { id: failed.providerTransactionId, object: "payment_intent", status: "requires_payment_method" } },
        });
        expect((await post(failBody)).outcome).toBe("applied");
        const { data: failReceipts } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", failed.providerTransactionId);
        expect((failReceipts ?? []).length, "a failed collection is not money").toBe(0);
        expect((await readChargeBalance(client, ORG, failCharge)).outstandingCents).toBe(20_000);

        // Stale processing arriving after a posted success.
        const okCharge = await postCharge(client, 25_000);
        const ok = await collect(client, okCharge, 25_000);
        expect((await post(successEvent(ok.providerTransactionId, 25_000))).outcome).toBe("applied");
        expect((await readChargeBalance(client, ORG, okCharge)).outstandingCents).toBe(0);

        const staleBody = JSON.stringify({
            id: `evt_f_stale_${Date.now()}`, type: "payment_intent.processing",
            created: Math.floor(Date.now() / 1000), account: connectedAccount,
            data: { object: { id: ok.providerTransactionId, object: "payment_intent", status: "processing" } },
        });
        expect((await post(staleBody)).outcome).toBe("stale");

        // Nothing regressed and no balance was restored — only an explicit refund may do that.
        expect((await readChargeBalance(client, ORG, okCharge)).outstandingCents).toBe(0);
        const { data: stillOne } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", ok.providerTransactionId);
        expect((stillOne ?? []).length).toBe(1);
    });

    it("leaves the manual rails entirely alone", async () => {
        const client = supabase!;
        for (const rail of ["cash", "check", "money_order"] as const) {
            const chargeId = await postCharge(client, 11_000);
            const paid = await recordAndApplyChildcarePayment(client, {
                orgId: ORG, chargeId, amountCents: 11_000, paymentMethod: rail,
                idempotencyKey: `sliceF-${rail}-${Date.now()}`, actorUserId: ACTOR,
            });
            expect(paid.payment.status).toBe("posted");
            const { data: row } = await client.from("payments")
                .select("processor, processor_transaction_id").eq("id", paid.payment.id).single();
            const r = row as { processor: string | null; processor_transaction_id: string | null };
            expect(r.processor, `${rail} has no executor`).toBeNull();
            expect(r.processor_transaction_id).toBeNull();
            const { data: attempts } = await client.from("payment_collection_attempts")
                .select("id").eq("charge_id", chargeId);
            expect((attempts ?? []).length, `${rail} never enters the collection-attempt model`).toBe(0);
            expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);
        }
    });
});
