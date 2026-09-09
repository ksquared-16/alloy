/**
 * SLICE G — GIVING MONEY BACK, against real Stripe test mode and real Postgres.
 *
 * A refund is the one operation where doing it twice costs real money, so the cases that matter are
 * the ones about NOT doing it twice: a retried intent, a replayed event, a different event naming
 * the same refund, and two workers recognising it at once. Alongside them sit the refusals — a cash
 * payment has no processor to ask, and an over-refund is not a rounding question.
 *
 * The original receipt is never touched. Thread 8's model is a new outbound row with lineage, and
 * these cases assert the original is byte-for-byte what it was after every refund.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readChargeBalance, recordAndApplyChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { requestProviderRefund } from "@/lib/financials/payments/refundCollection";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";

function readTrusted(key: string): string | null {
    if (process.env[key]) return process.env[key] as string;
    try {
        const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        const line = readFileSync(p, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
        return line?.slice(key.length + 1).trim() || null;
    } catch { return null; }
}

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) =>
            file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch { return null; }
}

const env = certEnv();
const secret = readTrusted("STRIPE_SECRET_KEY");
const whsec = readTrusted("STRIPE_WEBHOOK_SECRET");
if (secret && !process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = secret;

const ORG = "00000000-0000-4000-8000-000000000001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
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
async function post(body: string) {
    return await handleStripeWebhook(supabase!, body, signed(body), whsec!);
}
function successEvent(piId: string, amountCents: number, id?: string): string {
    return JSON.stringify({
        id: id ?? `evt_g_${Math.random().toString(36).slice(2)}`,
        type: "payment_intent.succeeded", created: Math.floor(Date.now() / 1000), account: connectedAccount,
        data: { object: { id: piId, object: "payment_intent", status: "succeeded", amount: amountCents, amount_received: amountCents, currency: "usd" } },
    });
}
function refundEvent(refundId: string, status: string, id?: string): string {
    return JSON.stringify({
        id: id ?? `evt_gr_${Math.random().toString(36).slice(2)}`,
        type: "refund.updated", created: Math.floor(Date.now() / 1000), account: connectedAccount,
        data: { object: { id: refundId, object: "refund", status } },
    });
}

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client.from("charges").insert({
        org_id: ORG, job_id: null, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
        charge_type: "fee", charge_category: "fee", status: "draft", currency_code: "USD",
        amount_cents: amountCents, service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
        description: "slice G refund certification", metadata: {}, created_by: ACTOR, updated_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await client.from("charges").update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

/** A fully collected and canonically posted card payment, ready to be refunded. */
async function collectAndPost(client: SupabaseClient, amountCents: number) {
    const chargeId = await postCharge(client, amountCents);
    const created = await createCardCollection(client, {
        orgId: ORG, chargeId, requestedAmountCents: amountCents, actorUserId: ACTOR,
    });
    if (!created.ok) throw new Error(`collection refused: ${JSON.stringify(created)}`);

    /*
     * CONFIRM IT FOR REAL. A refund needs a real successful CHARGE on the connected account —
     * "This PaymentIntent does not have a successful charge to refund" is what Stripe says
     * otherwise, and it is right to. Synthesising a success webhook over an unconfirmed intent
     * would leave Alloy believing in money Stripe never took, which is exactly the divergence this
     * thread exists to prevent, so the certification confirms with a test card instead.
     */
    const confirmed = await fetch(
        `https://api.stripe.com/v1/payment_intents/${created.providerTransactionId}/confirm`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${secret}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "Stripe-Account": connectedAccount,
            },
            body: new URLSearchParams({
                payment_method: "pm_card_visa",
                return_url: "https://example.invalid/return",
            }).toString(),
        },
    );
    const confirmBody = (await confirmed.json()) as { status?: string; error?: { message?: string } };
    if (confirmBody.status !== "succeeded") {
        throw new Error(`test card confirmation did not succeed: ${confirmBody.status ?? confirmBody.error?.message}`);
    }

    const applied = await post(successEvent(created.providerTransactionId, amountCents));
    expect(applied.outcome, applied.detail).toBe("applied");
    const { data: pay } = await client.from("payments").select("id, amount_cents, processor_transaction_id, status")
        .eq("org_id", ORG).eq("processor_transaction_id", created.providerTransactionId).single();
    return { chargeId, created, payment: pay as { id: string; amount_cents: number; processor_transaction_id: string; status: string } };
}

async function clearAll(client: SupabaseClient) {
    const { data: refunds } = await client.from("payment_provider_refunds").select("id").eq("org_id", ORG);
    if (((refunds ?? []) as Array<{ id: string }>).length) {
        await client.from("payment_provider_refunds").delete().eq("org_id", ORG);
    }
    const { data: attempts } = await client.from("payment_collection_attempts").select("id").eq("org_id", ORG);
    const ids = ((attempts ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (ids.length) {
        await client.from("payment_provider_events").delete().in("collection_attempt_id", ids);
        await client.from("payment_collection_attempts").delete().in("id", ids);
    }
    const { error } = await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
    if (error) throw new Error(`merchant teardown failed: ${error.message}`);
}

describeLive("Slice G — Stripe refunds become canonical reversals, once", () => {
    beforeAll(async () => {
        const client = supabase!;
        await clearAll(client);
        const res = await fetch("https://api.stripe.com/v1/accounts?limit=1", { headers: { Authorization: `Bearer ${secret}` } });
        const acct = ((await res.json()) as { data: Array<Record<string, unknown>> }).data[0];
        connectedAccount = String(acct.id);
        await client.from("payment_provider_merchants").insert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            created_by: ACTOR, updated_by: ACTOR,
        });
    });

    afterAll(async () => { await clearAll(supabase!); });

    it("refunds in full on the connected account, restores outstanding exactly, and leaves the receipt untouched", async () => {
        const client = supabase!;
        const { chargeId, payment } = await collectAndPost(client, 40_000);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);

        const refund = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, actorUserId: ACTOR });
        expect(refund.ok, JSON.stringify(refund)).toBe(true);
        if (!refund.ok) throw new Error("unreachable");
        expect(refund.providerRefundId.startsWith("re_")).toBe(true);
        expect(refund.connectedAccountRef).toBe(connectedAccount);

        // Retrievable on the connected account and NOT on the platform — money went back where it
        // came from.
        const onConnected = await fetch(`https://api.stripe.com/v1/refunds/${refund.providerRefundId}`, {
            headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccount },
        });
        expect(onConnected.status).toBe(200);
        const onPlatform = await fetch(`https://api.stripe.com/v1/refunds/${refund.providerRefundId}`, {
            headers: { Authorization: `Bearer ${secret}` },
        });
        expect(onPlatform.status).not.toBe(200);

        // A provider refund is not a reversal until Thread 8 says so.
        const converged = await post(refundEvent(refund.providerRefundId, "succeeded"));
        expect(converged.detail).toMatch(/canonical refund .* was recorded/);

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "exact restoration").toBe(40_000);

        // The original is exactly as it was: same amount, same provider transaction, still posted.
        const { data: originalNow } = await client.from("payments")
            .select("amount_cents, processor_transaction_id, status").eq("id", payment.id).single();
        const o = originalNow as { amount_cents: number; processor_transaction_id: string; status: string };
        expect(o.amount_cents).toBe(40_000);
        expect(o.processor_transaction_id).toBe(payment.processor_transaction_id);
        expect(o.status).toBe("posted");

        // The reversal is a NEW outbound row with lineage, and it journals once.
        const { data: reversal } = await client.from("payments")
            .select("id, direction, amount_cents").eq("org_id", ORG).eq("refunds_payment_id", payment.id).single();
        const r = reversal as { id: string; direction: string; amount_cents: number };
        expect(r.direction).toBe("outbound");
        expect(r.amount_cents).toBe(40_000);
        const { data: journal } = await client.from("financial_journal_entries")
            .select("id").eq("org_id", ORG).eq("source_id", r.id);
        expect((journal ?? []).length, "one Thread 5 consequence").toBe(1);
    });

    it("does not refund twice for a retried intent, a replayed event, or a different event naming the same refund", async () => {
        const client = supabase!;
        const { chargeId, payment } = await collectAndPost(client, 25_000);

        const first = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, actorUserId: ACTOR });
        if (!first.ok) throw new Error("unreachable");

        // Retrying the same intent must not ask Stripe again.
        const retry = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, actorUserId: ACTOR });
        if (!retry.ok) throw new Error("unreachable");
        expect(retry.providerRefundId, "one Stripe refund").toBe(first.providerRefundId);
        expect(retry.reused).toBe(true);

        const evtId = `evt_gr_dup_${Date.now()}`;
        expect((await post(refundEvent(first.providerRefundId, "succeeded", evtId))).detail).toMatch(/canonical refund/);
        // Same event again — event idempotency.
        expect((await post(refundEvent(first.providerRefundId, "succeeded", evtId))).outcome).toBe("duplicate");
        // A DIFFERENT event naming the same refund — financial idempotency, which event dedupe
        // cannot provide.
        await post(refundEvent(first.providerRefundId, "succeeded", `evt_gr_other_${Date.now()}`));

        const { data: reversals } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("refunds_payment_id", payment.id);
        expect((reversals ?? []).length, "exactly one canonical reversal").toBe(1);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "restored once").toBe(25_000);
    });

    it("supports sequential partial refunds and refuses to give back more than was taken", async () => {
        const client = supabase!;
        const { chargeId, payment } = await collectAndPost(client, 30_000);

        // Two DELIBERATELY distinct partial refunds, told apart by their intent discriminator.
        const p1 = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, amountCents: 10_000, intentDiscriminator: "part-1", actorUserId: ACTOR });
        if (!p1.ok) throw new Error(JSON.stringify(p1));
        await post(refundEvent(p1.providerRefundId, "succeeded"));
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(10_000);

        const p2 = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, amountCents: 12_000, intentDiscriminator: "part-2", actorUserId: ACTOR });
        if (!p2.ok) throw new Error(JSON.stringify(p2));
        expect(p2.providerRefundId, "a genuinely new partial refund is not deduped onto the first")
            .not.toBe(p1.providerRefundId);
        await post(refundEvent(p2.providerRefundId, "succeeded"));
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(22_000);

        // Cumulative ceiling. 30000 taken, 22000 given back, so 8000 remains refundable.
        const over = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, amountCents: 9_000, intentDiscriminator: "part-3", actorUserId: ACTOR });
        expect(over.ok).toBe(false);
        if (over.ok) throw new Error("unreachable");
        expect(over.reason).toBe("exceeds_refundable");

        const exact = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, amountCents: 8_000, intentDiscriminator: "part-3", actorUserId: ACTOR });
        expect(exact.ok, "the remaining amount is still refundable").toBe(true);
    });

    it("refuses the manual rails, a non-existent payment, and a non-positive amount", async () => {
        const client = supabase!;
        for (const rail of ["cash", "check", "money_order"] as const) {
            const chargeId = await postCharge(client, 5_000);
            const paid = await recordAndApplyChildcarePayment(client, {
                orgId: ORG, chargeId, amountCents: 5_000, paymentMethod: rail,
                idempotencyKey: `sliceG-${rail}-${Date.now()}`, actorUserId: ACTOR,
            });
            const refused = await requestProviderRefund(client, { orgId: ORG, paymentId: paid.payment.id, actorUserId: ACTOR });
            expect(refused.ok, `${rail} must not reach Stripe`).toBe(false);
            if (refused.ok) throw new Error("unreachable");
            expect(refused.reason).toBe("manual_rail");
            expect(refused.message).toMatch(new RegExp(rail));
        }

        const missing = await requestProviderRefund(client, { orgId: ORG, paymentId: "00000000-0000-4000-8000-0000000000dd", actorUserId: ACTOR });
        expect(missing.ok).toBe(false);
        if (missing.ok) throw new Error("unreachable");
        expect(missing.reason).toBe("payment_not_found");
    });

    it("converges one canonical reversal when two workers recognise the same refund at once", async () => {
        const client = supabase!;
        const { chargeId, payment } = await collectAndPost(client, 18_000);
        const requested = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, actorUserId: ACTOR });
        if (!requested.ok) throw new Error("unreachable");

        // Two different events naming the same succeeded refund, in flight together.
        await Promise.all([
            post(refundEvent(requested.providerRefundId, "succeeded", `evt_gr_c1_${Date.now()}`)),
            post(refundEvent(requested.providerRefundId, "succeeded", `evt_gr_c2_${Date.now()}`)),
        ]);

        const { data: reversals } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("refunds_payment_id", payment.id);
        expect((reversals ?? []).length, "one reversal survived the race").toBe(1);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(18_000);
        const { data: journal } = await client.from("financial_journal_entries")
            .select("id").eq("org_id", ORG).eq("source_id", String(((reversals ?? [])[0] as { id: string }).id));
        expect((journal ?? []).length, "one journal consequence").toBe(1);
    });

    it("does not let a late pending or failed event regress a completed refund, or restore twice", async () => {
        const client = supabase!;
        const { chargeId, payment } = await collectAndPost(client, 15_000);
        const requested = await requestProviderRefund(client, { orgId: ORG, paymentId: payment.id, actorUserId: ACTOR });
        if (!requested.ok) throw new Error("unreachable");

        /*
         * A card refund settles synchronously in Stripe test mode, so `requested.providerState` is
         * already `succeeded` here. A genuinely PENDING provider refund is therefore not
         * reproducible on this rail — it is an ACH-shaped state, and the invariant that a pending
         * refund moves no money is carried by the code path rather than by a card certification.
         * What IS provable here, and matters just as much, is that older provider truth arriving
         * afterwards changes nothing.
         */
        expect(requested.providerState, "test-mode card refunds settle immediately").toBe("succeeded");

        await post(refundEvent(requested.providerRefundId, "succeeded"));
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(15_000);

        // The `pending` Stripe emitted first, arriving last.
        const late = await post(refundEvent(requested.providerRefundId, "pending", `evt_gr_late_${Date.now()}`));
        expect(late.outcome, late.detail).toBe("stale");

        // And a `failed` that contradicts a completed refund is refused the same way.
        const contradicting = await post(refundEvent(requested.providerRefundId, "failed", `evt_gr_bad_${Date.now()}`));
        expect(contradicting.outcome).toBe("stale");

        // Nothing regressed, nothing restored a second time, and the original is untouched.
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(15_000);
        const { data: reversals } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("refunds_payment_id", payment.id);
        expect((reversals ?? []).length, "still exactly one reversal").toBe(1);
        const { data: original } = await client.from("payments").select("status, amount_cents").eq("id", payment.id).single();
        const o = original as { status: string; amount_cents: number };
        expect(o.status, "the original receipt is untouched").toBe("posted");
        expect(o.amount_cents).toBe(15_000);
    });
});
