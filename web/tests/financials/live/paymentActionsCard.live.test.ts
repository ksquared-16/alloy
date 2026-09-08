/**
 * SLICE H — THE PRODUCT ACTIONS, against real Stripe test mode and real Postgres.
 *
 * Thread 8B's capabilities were real before this slice and unreachable from the product. These cases
 * certify them through the actions an operator actually invokes, which is where one gap mattered
 * enormously: `payment.refund` called Thread 8 directly, so refunding a CARD payment would have put
 * the family's balance back up while the money stayed in the provider's Stripe account. A refund
 * that refunds nobody is the one outcome a refund must never produce.
 *
 * Actions are exercised through the same validate → eligibility → execute contract the runtime uses,
 * so a blocker here is the blocker the surface will render.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    PAYMENT_COLLECT_CARD_ACTION_KEY,
    PAYMENT_REFUND_ACTION_KEY,
    PAYMENT_RECORD_ACTION_KEY,
    financialPaymentActions,
} from "@/lib/adminV2/actions/definitions/financialPaymentActions";
import { readChargeBalance } from "@/lib/financials/childcarePaymentService";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";

function readTrusted(key: string): string | null {
    if (process.env[key]) return process.env[key] as string;
    try {
        const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        return readFileSync(p, "utf8").split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() || null;
    } catch { return null; }
}
function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) => file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
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
const ctx = { orgId: ORG, userId: ACTOR } as never;
const invocation = { entityType: "child", entityId: "fc500000-0000-4000-8000-0000000c0002" } as never;
const action = (key: string) => financialPaymentActions.find((a) => a.actionKey === key)!;

function signed(body: string) {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac("sha256", whsec!).update(`${t}.${body}`).digest("hex")}`;
}
async function postEvent(piId: string, amountCents: number) {
    const body = JSON.stringify({
        id: `evt_h_${Math.random().toString(36).slice(2)}`, type: "payment_intent.succeeded",
        created: Math.floor(Date.now() / 1000), account: connectedAccount,
        data: { object: { id: piId, object: "payment_intent", status: "succeeded", amount: amountCents, amount_received: amountCents, currency: "usd" } },
    });
    return await handleStripeWebhook(supabase!, body, signed(body), whsec!);
}

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client.from("charges").insert({
        org_id: ORG, job_id: null, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
        charge_type: "fee", charge_category: "fee", status: "draft", currency_code: "USD",
        amount_cents: amountCents, service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
        description: "slice H action certification", metadata: {}, created_by: ACTOR, updated_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await client.from("charges").update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

/** Collect by card through the ACTION, confirm the card for real, and let the webhook post it. */
async function collectByCardAndSettle(client: SupabaseClient, chargeId: string, amountCents?: number) {
    const executed = await action(PAYMENT_COLLECT_CARD_ACTION_KEY).execute({
        supabase: client, ctx, invocation,
        payload: { charge_id: chargeId, ...(amountCents ? { amount_cents: amountCents } : {}) },
    } as never);
    if (!executed.ok) throw new Error(`collect action failed: ${JSON.stringify(executed)}`);
    const detail = (executed.result as { detail: Record<string, unknown> }).detail;
    const pi = String(detail.provider_transaction_id);

    const confirmed = await fetch(`https://api.stripe.com/v1/payment_intents/${pi}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Account": connectedAccount },
        body: new URLSearchParams({ payment_method: "pm_card_visa", return_url: "https://example.invalid/r" }).toString(),
    });
    const body = (await confirmed.json()) as { status?: string };
    expect(body.status, "the test card settles").toBe("succeeded");

    await postEvent(pi, Number(detail.amount_cents));
    const { data: pay } = await client.from("payments").select("id, amount_cents, payment_method, processor")
        .eq("org_id", ORG).eq("processor_transaction_id", pi).single();
    return { detail, payment: pay as { id: string; amount_cents: number; payment_method: string; processor: string } };
}

async function clearAll(client: SupabaseClient) {
    await client.from("payment_provider_refunds").delete().eq("org_id", ORG);
    const { data: attempts } = await client.from("payment_collection_attempts").select("id").eq("org_id", ORG);
    const ids = ((attempts ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (ids.length) {
        await client.from("payment_provider_events").delete().in("collection_attempt_id", ids);
        await client.from("payment_collection_attempts").delete().in("id", ids);
    }
    const { error } = await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
    if (error) throw new Error(`merchant teardown failed: ${error.message}`);
}

describeLive("Slice H — the Financials payment actions, live", () => {
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

    it("registers a rail-first collect action that never leaks processor vocabulary into operator copy", () => {
        const collect = action(PAYMENT_COLLECT_CARD_ACTION_KEY);
        expect(collect, "the action is registered").toBeTruthy();
        const operatorCopy = `${collect.defaultLabel} ${collect.description}`;
        for (const internal of ["PaymentIntent", "Stripe-Account", "collection attempt", "processor transaction"]) {
            expect(operatorCopy, `operator copy must not mention ${internal}`).not.toMatch(new RegExp(internal, "i"));
        }
        // Rail-first: the label names what the operator is doing, not who executes it.
        expect(collect.defaultLabel).toMatch(/card/i);
        // And the manual path is still its own action, unchanged.
        expect(action(PAYMENT_RECORD_ACTION_KEY).defaultLabel).toMatch(/record/i);
    });

    it("blocks the card action with a readiness explanation, never a generic failure or a fallback", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 20_000);
        await client.from("payment_provider_merchants").update({ readiness: "onboarding_incomplete" }).eq("org_id", ORG);

        const eligibility = await action(PAYMENT_COLLECT_CARD_ACTION_KEY).resolveEligibility!({
            supabase: client, ctx, payload: { charge_id: chargeId }, invocation,
        } as never);
        expect(eligibility.eligible).toBe(false);
        const blocker = eligibility.blockers[0];
        expect(blocker.code, "the readiness state is carried, not flattened").toBe("merchant_onboarding_incomplete");
        expect(blocker.message).toMatch(/onboarding/i);
        expect(blocker.message, "never a generic failure").not.toMatch(/payment failed/i);
        expect(JSON.stringify(eligibility), "no platform account is named").not.toMatch(/acct_/);

        // Executing anyway — hidden UI is not authorization — still refuses.
        const executed = await action(PAYMENT_COLLECT_CARD_ACTION_KEY).execute({
            supabase: client, ctx, invocation, payload: { charge_id: chargeId },
        } as never);
        expect(executed.ok, "direct invocation is refused server-side").toBe(false);

        await client.from("payment_provider_merchants").update({ readiness: "ready" }).eq("org_id", ORG);
    });

    it("collects by card, recognises canonically, and leaves the balance untouched until it does", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 50_000);

        const executed = await action(PAYMENT_COLLECT_CARD_ACTION_KEY).execute({
            supabase: client, ctx, invocation, payload: { charge_id: chargeId },
        } as never);
        expect(executed.ok, JSON.stringify(executed)).toBe(true);
        const detail = (executed.result as { detail: Record<string, unknown> }).detail;
        expect(detail.recognized, "a request is not a receipt").toBe(false);
        expect(String(detail.client_secret).length, "the browser gets a tokenized handle").toBeGreaterThan(0);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "no balance movement yet").toBe(50_000);

        // Settle for real and let the provider event drive canonical recognition.
        const confirmed = await fetch(`https://api.stripe.com/v1/payment_intents/${detail.provider_transaction_id}/confirm`, {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Account": connectedAccount },
            body: new URLSearchParams({ payment_method: "pm_card_visa", return_url: "https://example.invalid/r" }).toString(),
        });
        expect(((await confirmed.json()) as { status?: string }).status).toBe("succeeded");
        await postEvent(String(detail.provider_transaction_id), 50_000);

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);
        const { data: pay } = await client.from("payments").select("payment_method, processor")
            .eq("org_id", ORG).eq("processor_transaction_id", String(detail.provider_transaction_id)).single();
        expect((pay as { payment_method: string }).payment_method, "the rail is card").toBe("card");
    });

    it("refunds a CARD payment through the provider, so the money actually goes back", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);
        const { payment } = await collectByCardAndSettle(client, chargeId);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);

        const refunded = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: client, ctx, invocation, payload: { payment_id: payment.id },
        } as never);
        expect(refunded.ok, JSON.stringify(refunded)).toBe(true);
        const detail = (refunded.result as { detail: Record<string, unknown> }).detail;

        /*
         * THE GAP THIS SLICE CLOSED. Before the routing fix this action reversed canonically and
         * asked Stripe for nothing: the family owed the money again and nobody had refunded them.
         * A real `re_` is the proof that money left the provider's account.
         */
        expect(String(detail.provider_refund_id), "a real Stripe refund exists").toMatch(/^re_/);
        expect(detail.recognized, "and Thread 8 recognised it").toBe(true);

        const onConnected = await fetch(`https://api.stripe.com/v1/refunds/${detail.provider_refund_id}`, {
            headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccount },
        });
        expect(onConnected.status, "on the provider's own account").toBe(200);

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "restored exactly").toBe(40_000);
        const { data: original } = await client.from("payments").select("status, amount_cents").eq("id", payment.id).single();
        expect((original as { status: string }).status, "the original receipt remains").toBe("posted");
    });

    it("refunds part of a card payment and leaves the retained portion intact", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 60_000);
        const { payment } = await collectByCardAndSettle(client, chargeId);

        const refunded = await action(PAYMENT_REFUND_ACTION_KEY).execute({
            supabase: client, ctx, invocation, payload: { payment_id: payment.id, amount_cents: 25_000 },
        } as never);
        expect(refunded.ok, JSON.stringify(refunded)).toBe(true);
        const detail = (refunded.result as { detail: Record<string, unknown> }).detail;
        expect(String(detail.provider_refund_id)).toMatch(/^re_/);
        expect(detail.amount_cents).toBe(25_000);

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "only the refunded part comes back").toBe(25_000);
        const { data: original } = await client.from("payments").select("amount_cents").eq("id", payment.id).single();
        expect((original as { amount_cents: number }).amount_cents, "the receipt still says what arrived").toBe(60_000);
    });

    it("keeps the manual rails on the canonical path with no merchant, attempt or provider id", async () => {
        const client = supabase!;
        for (const rail of ["cash", "check", "money_order"] as const) {
            const chargeId = await postCharge(client, 7_000);
            const executed = await action(PAYMENT_RECORD_ACTION_KEY).execute({
                supabase: client, ctx, invocation,
                payload: { charge_id: chargeId, amount_cents: 7_000, payment_method: rail },
            } as never);
            expect(executed.ok, `${rail}: ${JSON.stringify(executed)}`).toBe(true);
            const paymentId = String((executed.result as { detail: Record<string, unknown> }).detail.payment_id);

            const { data: row } = await client.from("payments").select("processor, processor_transaction_id, payment_method").eq("id", paymentId).single();
            const r = row as { processor: string | null; processor_transaction_id: string | null; payment_method: string };
            expect(r.payment_method).toBe(rail);
            expect(r.processor, `${rail} has no executor`).toBeNull();
            expect(r.processor_transaction_id).toBeNull();
            const { data: attempts } = await client.from("payment_collection_attempts").select("id").eq("charge_id", chargeId);
            expect((attempts ?? []).length, `${rail} needs no collection attempt`).toBe(0);
            expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);

            // And refunding a manual payment stays on the canonical path — it never asks Stripe.
            const refunded = await action(PAYMENT_REFUND_ACTION_KEY).execute({
                supabase: client, ctx, invocation, payload: { payment_id: paymentId },
            } as never);
            expect(refunded.ok, `${rail} refund: ${JSON.stringify(refunded)}`).toBe(true);
            const detail = (refunded.result as { detail: Record<string, unknown> }).detail;
            expect(detail.provider_refund_id, `${rail} refund involves no processor`).toBeUndefined();
            expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(7_000);
        }
    });
});
