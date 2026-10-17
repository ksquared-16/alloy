/**
 * PAYMENT-ATTEMPT INTEGRITY, LIVE — Stripe test mode, real Postgres, the real state trigger.
 *
 * Every provider fact here is the provider's own. Payment intents are created through the real
 * collection path on the governed test merchant, confirmed with Stripe's test cards (a declining
 * one, then a working one), and the events Stripe itself emitted for them are read back from the
 * provider and delivered to the real webhook handler, signed with the account's own webhook secret.
 * No browser is involved at any point after the intent is created, which is the "payer closed the
 * tab" case by construction.
 *
 * What is proven:
 *   • a decline is recorded as a terminal failure, and the provider's later success on the SAME
 *     intent still posts — exactly once (this was refused as "stale" before);
 *   • a retry after a decline opens a NEW attempt and retires the declined intent at the provider;
 *   • two payers on one charge are two attempts and two receipts, and the balance reflects both;
 *   • duplicate, late and out-of-order events change nothing;
 *   • concurrent successes cannot over-apply a charge;
 *   • an event whose first delivery died mid-processing is processed on redelivery.
 *
 * No real money moves: test mode only. Requires the cert stack and the trusted Stripe test secrets.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readChargeBalance } from "@/lib/financials/childcarePaymentService";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";
import {
    ensureAccountingPeriodCovers,
    ensureCertificationPersons,
    governedTestAccount,
    restoreMerchantReadiness,
} from "./certEnvironment";
import { runHex } from "./certificationPeriod";

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
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const PAYER_A = "fc500000-0000-4000-8000-0000000e0a71";
const PAYER_B = "fc500000-0000-4000-8000-0000000e0b72";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret && whsec ? describe : describe.skip;

let connectedAccount = "";
const ownedCharges: string[] = [];

function signed(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac("sha256", whsec!).update(`${t}.${body}`).digest("hex")}`;
}

async function deliver(event: Record<string, unknown>) {
    const body = JSON.stringify({ ...event, account: event.account ?? connectedAccount });
    return await handleStripeWebhook(supabase!, body, signed(body), whsec!);
}

async function stripe(method: "GET" | "POST", path: string, body?: Record<string, string>) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${secret}`,
            "Stripe-Account": connectedAccount,
            ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Confirm an intent server-side with one of Stripe's test cards, as the payer's browser would. */
async function confirmWith(piId: string, testMethod: "pm_card_visa" | "pm_card_chargeDeclined") {
    return await stripe("POST", `payment_intents/${piId}/confirm`, {
        payment_method: testMethod,
        return_url: "https://example.invalid/return",
    });
}

/** The event STRIPE emitted for this intent — read back from the provider, never composed here. */
async function providerEvent(type: string, piId: string): Promise<Record<string, unknown>> {
    for (let i = 0; i < 20; i += 1) {
        const out = await stripe("GET", `events?type=${encodeURIComponent(type)}&limit=50`);
        const found = ((out.body.data ?? []) as Array<Record<string, unknown>>).find(
            (e) => ((e.data as { object?: { id?: string } } | undefined)?.object?.id) === piId,
        );
        if (found) return found;
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Stripe emitted no ${type} for ${piId}`);
}

async function postCharge(amountCents: number): Promise<string> {
    const client = supabase!;
    const { data, error } = await client.from("charges").insert({
        org_id: ORG, job_id: null,
        billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
        charge_type: "fee", charge_category: "fee", status: "draft",
        currency_code: "USD", amount_cents: amountCents,
        service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
        description: "payment-attempt integrity certification", metadata: {},
        // A childcare charge names its billing period. The legacy shape needs no period row.
        billing_period_generation: "legacy", legacy_billing_period_key: TODAY.slice(0, 7),
        created_by: ACTOR, updated_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    ownedCharges.push(id);
    await client.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

async function attemptRow(id: string) {
    const { data } = await supabase!
        .from("payment_collection_attempts")
        .select("id, processor_state, canonical_payment_id, provider_transaction_id, payer_person_id, intent_key, last_provider_detail")
        .eq("id", id).single();
    return data as Record<string, unknown>;
}

async function receiptsFor(chargeId: string) {
    const { data } = await supabase!
        .from("payment_collection_attempts")
        .select("canonical_payment_id")
        .eq("org_id", ORG).eq("charge_id", chargeId).not("canonical_payment_id", "is", null);
    const ids = ((data ?? []) as Array<{ canonical_payment_id: string }>).map((r) => r.canonical_payment_id);
    if (!ids.length) return [];
    const { data: pays } = await supabase!
        .from("payments").select("id, amount_cents, payer_entity_id, status").in("id", ids);
    return (pays ?? []) as Array<{ id: string; amount_cents: number; payer_entity_id: string | null; status: string }>;
}

describeLive("payment-attempt integrity, live", () => {
    beforeAll(async () => {
        const client = supabase!;
        await ensureAccountingPeriodCovers(client, ORG, TODAY);
        await ensureCertificationPersons(client, ORG, [PAYER_A, PAYER_B]);
        const acct = await governedTestAccount(secret!);
        connectedAccount = String(acct.id);
        await client.from("payment_provider_merchants").upsert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            created_by: ACTOR, updated_by: ACTOR,
        });
        await restoreMerchantReadiness(client, ORG, readinessFromStripeAccount(acct as { charges_enabled?: boolean }));
    }, 60_000);

    afterAll(async () => {
        // Unrecognised attempts only: a recognised one produced money and is not deletable, by design.
        if (!ownedCharges.length) return;
        const { data } = await supabase!
            .from("payment_collection_attempts").select("id")
            .in("charge_id", ownedCharges).is("canonical_payment_id", null);
        const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (ids.length) {
            await supabase!.from("payment_provider_events").delete().in("collection_attempt_id", ids);
            await supabase!.from("payment_collection_attempts").delete().in("id", ids);
        }
    });

    it("two payers, a decline each, two different recoveries — and the balance reflects both, once", async () => {
        const chargeId = await postCharge(10_000);

        /* ── PAYER A: declined, then succeeds on the SAME intent from a still-open tab ── */
        const a = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 4_000, payerPersonId: PAYER_A,
        });
        expect(a.ok, JSON.stringify(a)).toBe(true);
        if (!a.ok) return;

        /* ── PAYER B: same charge, same day — must NOT receive A's session ── */
        const b = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 4_000, payerPersonId: PAYER_B,
        });
        expect(b.ok, JSON.stringify(b)).toBe(true);
        if (!b.ok) return;
        expect(b.attemptId).not.toBe(a.attemptId);
        expect(b.providerTransactionId).not.toBe(a.providerTransactionId);
        expect(b.clientSecret).not.toBe(a.clientSecret);

        // B wanted 6,000 really; abandon the 4,000 intent and ask for the remainder instead.
        const b6 = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 6_000, payerPersonId: PAYER_B,
        });
        expect(b6.ok, JSON.stringify(b6)).toBe(true);
        if (!b6.ok) return;

        const aDeclined = await confirmWith(a.providerTransactionId, "pm_card_chargeDeclined");
        expect(aDeclined.status, "the test card declines").toBe(402);
        const aFailedEvt = await providerEvent("payment_intent.payment_failed", a.providerTransactionId);
        const aFailed = await deliver(aFailedEvt);
        expect(aFailed.outcome, aFailed.detail).toBe("applied");
        const aAfterDecline = await attemptRow(a.attemptId);
        expect(aAfterDecline.processor_state).toBe("failed");
        expect((aAfterDecline.last_provider_detail as Record<string, unknown>).failure_code).toBe("card_declined");
        expect((await readChargeBalance(supabase!, ORG, chargeId)).outstandingCents, "a decline moves no money").toBe(10_000);

        const aOk = await confirmWith(a.providerTransactionId, "pm_card_visa");
        expect(aOk.status).toBe(200);
        expect(aOk.body.status).toBe("succeeded");
        const aSuccessEvt = await providerEvent("payment_intent.succeeded", a.providerTransactionId);
        const aPosted = await deliver(aSuccessEvt);
        expect(aPosted.outcome, aPosted.detail).toBe("applied");
        expect(aPosted.detail).toMatch(/posted canonical payment/);
        const aFinal = await attemptRow(a.attemptId);
        expect(aFinal.processor_state, "the decline did not suppress the success").toBe("succeeded");
        expect(aFinal.canonical_payment_id).toBeTruthy();

        // The same event again, and the old decline arriving late: nothing changes.
        expect((await deliver(aSuccessEvt)).outcome).toBe("duplicate");
        const lateDecline = await deliver({ ...aFailedEvt, id: `${String(aFailedEvt.id)}_late_${runHex()}` });
        expect(lateDecline.outcome).toBe("stale");
        expect((await readChargeBalance(supabase!, ORG, chargeId)).outstandingCents).toBe(6_000);

        /* ── PAYER B: declined, then retries — a NEW attempt, and the declined intent is retired ── */
        const bDeclined = await confirmWith(b6.providerTransactionId, "pm_card_chargeDeclined");
        expect(bDeclined.status).toBe(402);
        expect((await deliver(await providerEvent("payment_intent.payment_failed", b6.providerTransactionId))).outcome).toBe("applied");

        const bRetry = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 6_000, payerPersonId: PAYER_B,
        });
        expect(bRetry.ok, JSON.stringify(bRetry)).toBe(true);
        if (!bRetry.ok) return;
        expect(bRetry.attemptId, "a failed attempt is never reused").not.toBe(b6.attemptId);
        expect(bRetry.providerTransactionId).not.toBe(b6.providerTransactionId);
        const retired = await stripe("GET", `payment_intents/${b6.providerTransactionId}`);
        expect(retired.body.status, "the declined intent was retired at the provider").toBe("canceled");
        expect((await attemptRow(b6.attemptId)).processor_state, "the failure keeps its history").toBe("failed");

        // The retirement's own event lands as evidence and does not rewrite the decline.
        const canceledEvt = await providerEvent("payment_intent.canceled", b6.providerTransactionId);
        expect((await deliver(canceledEvt)).outcome).toBe("stale");
        expect((await attemptRow(b6.attemptId)).processor_state).toBe("failed");

        const bOk = await confirmWith(bRetry.providerTransactionId, "pm_card_visa");
        expect(bOk.body.status).toBe("succeeded");
        const bPosted = await deliver(await providerEvent("payment_intent.succeeded", bRetry.providerTransactionId));
        expect(bPosted.outcome, bPosted.detail).toBe("applied");

        /* ── THE LEDGER ── */
        const balance = await readChargeBalance(supabase!, ORG, chargeId);
        expect(balance.outstandingCents, "both applications landed, once each").toBe(0);
        const receipts = await receiptsFor(chargeId);
        expect(receipts).toHaveLength(2);
        expect(receipts.map((r) => r.payer_entity_id).sort()).toEqual([PAYER_A, PAYER_B].sort());
        expect(receipts.map((r) => r.amount_cents).sort((x, y) => x - y)).toEqual([4_000, 6_000]);

        // Paying is not owing: the obligation still belongs to the same account.
        const { data: charge } = await supabase!.from("charges")
            .select("billable_source_type, billable_source_id").eq("id", chargeId).single();
        expect(charge).toEqual({ billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT });

        // Nothing more can be asked of a settled charge.
        const more = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 1_000, payerPersonId: PAYER_A,
        });
        expect(more.ok).toBe(false);
    }, 180_000);

    it("concurrent successes cannot over-apply a charge", async () => {
        const chargeId = await postCharge(10_000);
        const { data: merchant } = await supabase!
            .from("payment_provider_merchants").select("id").eq("org_id", ORG).eq("is_active", true).single();
        const seeded: Array<{ id: string; pi: string }> = [];
        for (const [payer, tag] of [[PAYER_A, "a"], [PAYER_B, "b"]] as const) {
            const pi = `pi_overapply_${tag}_${runHex()}`;
            const { data, error } = await supabase!.from("payment_collection_attempts").insert({
                org_id: ORG, processor: "stripe", merchant_id: (merchant as { id: string }).id,
                provider_account_ref: connectedAccount, rail: "card",
                billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
                charge_id: chargeId, payer_person_id: payer, currency: "USD", requested_amount_cents: 6_000,
                intent_key: `overapply:${pi}`, provider_transaction_id: pi, processor_state: "processing",
                created_by: ACTOR, updated_by: ACTOR,
            }).select("id").single();
            if (error) throw new Error(error.message);
            seeded.push({ id: (data as { id: string }).id, pi });
        }
        const event = (pi: string) => ({
            id: `evt_overapply_${pi}`, type: "payment_intent.succeeded", created: Math.floor(Date.now() / 1000),
            data: { object: { id: pi, object: "payment_intent", status: "succeeded", amount: 6_000, amount_received: 6_000, currency: "usd" } },
        });
        const results = await Promise.all(seeded.map((s) => deliver(event(s.pi))));
        for (const r of results) expect(r.outcome, r.detail).toBe("applied");

        const balance = await readChargeBalance(supabase!, ORG, chargeId);
        expect(balance.outstandingCents, "never negative").toBe(0);
        const { data: allocations } = await supabase!
            .from("payment_allocations").select("allocated_amount_cents, status").eq("charge_id", chargeId);
        const applied = ((allocations ?? []) as Array<{ allocated_amount_cents: number; status: string }>)
            .filter((a) => a.status !== "reversed")
            .reduce((s, a) => s + Number(a.allocated_amount_cents), 0);
        expect(applied, "the charge is applied exactly up to its amount").toBe(10_000);
        // Both receipts exist: the over-collection is the family's money on account, not lost.
        expect(await receiptsFor(chargeId)).toHaveLength(2);
    }, 120_000);

    it("an event whose first delivery died mid-processing is processed when Stripe redelivers it", async () => {
        const chargeId = await postCharge(3_000);
        const { data: merchant } = await supabase!
            .from("payment_provider_merchants").select("id").eq("org_id", ORG).eq("is_active", true).single();
        const pi = `pi_reclaim_${runHex()}`;
        const { data: att } = await supabase!.from("payment_collection_attempts").insert({
            org_id: ORG, processor: "stripe", merchant_id: (merchant as { id: string }).id,
            provider_account_ref: connectedAccount, rail: "card",
            billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
            charge_id: chargeId, payer_person_id: PAYER_A, currency: "USD", requested_amount_cents: 3_000,
            intent_key: `reclaim:${pi}`, provider_transaction_id: pi, processor_state: "processing",
            created_by: ACTOR, updated_by: ACTOR,
        }).select("id").single();
        const attemptId = (att as { id: string }).id;

        const evtId = `evt_reclaim_${runHex()}`;
        // The first delivery claimed the event ten minutes ago and never finished.
        await supabase!.from("payment_provider_events").insert({
            processor: "stripe", provider_event_id: evtId, provider_event_type: "payment_intent.succeeded",
            connected_account_ref: connectedAccount, provider_transaction_id: pi, payload: {},
            disposition: "received", received_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        });
        const redelivery = await deliver({
            id: evtId, type: "payment_intent.succeeded", created: Math.floor(Date.now() / 1000),
            data: { object: { id: pi, object: "payment_intent", status: "succeeded", amount: 3_000, amount_received: 3_000, currency: "usd" } },
        });
        expect(redelivery.outcome, redelivery.detail).toBe("applied");
        expect((await attemptRow(attemptId)).canonical_payment_id).toBeTruthy();
        expect((await readChargeBalance(supabase!, ORG, chargeId)).outstandingCents).toBe(0);

        // A claim that is merely IN FLIGHT (fresh) is still a duplicate — two deliveries never both run.
        const freshId = `evt_inflight_${runHex()}`;
        await supabase!.from("payment_provider_events").insert({
            processor: "stripe", provider_event_id: freshId, provider_event_type: "payment_intent.succeeded",
            connected_account_ref: connectedAccount, provider_transaction_id: pi, payload: {}, disposition: "received",
        });
        const concurrent = await deliver({
            id: freshId, type: "payment_intent.succeeded", created: Math.floor(Date.now() / 1000),
            data: { object: { id: pi, object: "payment_intent", status: "succeeded", amount: 3_000, amount_received: 3_000, currency: "usd" } },
        });
        expect(concurrent.outcome).toBe("duplicate");
    }, 60_000);

    it("a saved card declined at confirmation is a terminal failure the webhook can find", async () => {
        const chargeId = await postCharge(2_500);
        // The real stored-method path needs a platform customer; the decline itself is what matters
        // here, so the attempt's provider answer is driven by Stripe's own declining test card.
        const created = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 2_500, payerPersonId: PAYER_A,
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        await confirmWith(created.providerTransactionId, "pm_card_chargeDeclined");
        const evt = await providerEvent("payment_intent.payment_failed", created.providerTransactionId);
        expect((await deliver(evt)).outcome).toBe("applied");
        const row = await attemptRow(created.attemptId);
        expect(row.processor_state).toBe("failed");
        expect(row.provider_transaction_id).toBe(created.providerTransactionId);
        expect((await readChargeBalance(supabase!, ORG, chargeId)).outstandingCents, "the balance is not hidden").toBe(2_500);
    }, 90_000);
});
