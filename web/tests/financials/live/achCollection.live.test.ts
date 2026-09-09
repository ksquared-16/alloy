/**
 * THREAD 8C SLICE 1/2 — collecting by bank, against real Stripe and real Postgres.
 *
 * REAL STRIPE EVIDENCE. The PaymentIntent is created on the provider's own connected account with
 * `us_bank_account`, and the ACH capability is read from the account rather than assumed.
 *
 * The invariant that matters most is the one ACH makes unavoidable: a bank collection takes days,
 * so `processing` is a real and lasting state, and it is NOT money. Nothing may exist in Thread 8
 * until the provider confirms.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readChargeBalance } from "@/lib/financials/childcarePaymentService";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { collectionLifecycle, lifecycleLabel } from "@/lib/financials/payments/collectionLifecycle";
import { achReadinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";

function readTrusted(key: string): string | null {
    if (process.env[key]) return process.env[key] as string;
    try {
        const f = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
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
if (secret && !process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = secret;

const ORG = "00000000-0000-4000-8000-000000000001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret ? describe : describe.skip;

async function stripePost(path: string, body: Record<string, string>, account?: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/x-www-form-urlencoded",
            ...(account ? { "Stripe-Account": account } : {}),
        },
        body: new URLSearchParams(body).toString(),
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function stripeGet(path: string, account?: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: {
            Authorization: `Bearer ${secret}`,
            ...(account ? { "Stripe-Account": account } : {}),
        },
    });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client
        .from("charges")
        .insert({
            org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
            charge_type: "service", charge_category: "tuition", status: "draft",
            amount_cents: amountCents, currency_code: "USD", service_date: TODAY, occurs_on: TODAY,
            billable_on: TODAY, description: "8C ACH certification", created_by: ACTOR, updated_by: ACTOR,
        })
        .select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await client.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

describeLive("Thread 8C — ACH collection", () => {
    let connectedAccount = "";

    beforeAll(async () => {
        const client = supabase!;
        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);

        const list = await stripeGet("accounts?limit=1");
        const acct = (list.body.data ?? [])[0] as Record<string, unknown>;
        connectedAccount = String(acct.id);
        await client.from("payment_provider_merchants").insert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: "ready", readiness_checked_at: new Date().toISOString(),
            // Deliberately NOT ACH-ready to begin with: that is every merchant written before 8C.
            ach_readiness: null,
            is_active: true, created_by: ACTOR, updated_by: ACTOR,
        });
    });

    afterAll(async () => {
        const client = supabase!;
        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
    });

    it("refuses ACH on a merchant nobody has checked, and still collects by card", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 60_000);

        const refused = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 5_000, rail: "ach", actorUserId: ACTOR,
        });
        expect(refused.ok, JSON.stringify(refused)).toBe(false);
        expect((refused as { reason: string }).reason).toBe("ach_not_enabled");
        expect(JSON.stringify(refused), "a refusal never names an account").not.toMatch(/acct_/);

        // The same merchant takes cards perfectly well. ACH readiness is a rail question.
        const card = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 5_000, rail: "card", actorUserId: ACTOR,
        });
        expect(card.ok, JSON.stringify(card)).toBe(true);
    });

    it("reads ACH capability from the provider, then creates a real bank collection on the connected account", async () => {
        const client = supabase!;

        // The capability is the provider's answer, not Alloy's assumption.
        const account = await stripeGet(`accounts/${connectedAccount}`);
        const achReadiness = achReadinessFromStripeAccount(account.body as { capabilities?: Record<string, string> });
        expect(achReadiness, "the governed test merchant must have ACH enabled for this proof").toBe("ready");
        await client.from("payment_provider_merchants")
            .update({ ach_readiness: achReadiness }).eq("org_id", ORG);

        const chargeId = await postCharge(client, 60_000);
        const before = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;

        const created = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 4_200, rail: "ach", actorUserId: ACTOR,
        });
        expect(created.ok, JSON.stringify(created)).toBe(true);
        const result = created as { ok: true; providerTransactionId: string; attemptId: string; connectedAccountRef: string };

        // THE INTENT IS A BANK INTENT, ON THE PROVIDER'S OWN ACCOUNT.
        const onConnected = await stripeGet(`payment_intents/${result.providerTransactionId}`, connectedAccount);
        expect(onConnected.status, "retrievable on the connected account").toBe(200);
        expect(onConnected.body.payment_method_types, "the rail the operator chose").toEqual(["us_bank_account"]);
        expect(onConnected.body.amount).toBe(4_200);

        const onPlatform = await stripeGet(`payment_intents/${result.providerTransactionId}`);
        expect(onPlatform.status, "and invisible on the platform account").not.toBe(200);

        // AND IT IS NOT MONEY. Asking a bank for money is not receiving it.
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents, "no balance moves on a request").toBe(before);
        const { data: payments } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", result.providerTransactionId);
        expect((payments ?? []).length, "no receipt exists for an unconfirmed ACH collection").toBe(0);

        const { data: attempt } = await client.from("payment_collection_attempts")
            .select("rail, processor_state, canonical_payment_id").eq("id", result.attemptId).single();
        const a = attempt as Record<string, unknown>;
        expect(a.rail, "the attempt records the rail it asked on").toBe("ach");
        expect(a.canonical_payment_id, "nothing is recognised yet").toBeNull();
    });

    it("asks for the same bank collection twice and gets one intent", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 60_000);
        const first = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 3_300, rail: "ach", actorUserId: ACTOR,
        });
        const second = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 3_300, rail: "ach", actorUserId: ACTOR,
        });
        expect(first.ok && second.ok, "both requests are answered").toBe(true);
        expect((second as { providerTransactionId: string }).providerTransactionId)
            .toBe((first as { providerTransactionId: string }).providerTransactionId);
        expect((second as { reused?: boolean }).reused, "the second is the same collection").toBe(true);
    });

    it("keeps card and bank collections of the same charge and amount as separate intents", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 60_000);
        const card = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 2_100, rail: "card", actorUserId: ACTOR,
        });
        const ach = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 2_100, rail: "ach", actorUserId: ACTOR,
        });
        expect(card.ok && ach.ok).toBe(true);
        expect(
            (ach as { providerTransactionId: string }).providerTransactionId,
            "the rail is part of what makes an intent the same intent",
        ).not.toBe((card as { providerTransactionId: string }).providerTransactionId);
    });

    it("an unverified bank account is VERIFICATION REQUIRED, and is not money", async () => {
        /*
         * Real provider behaviour: raw bank details answer `requires_action` with
         * `verify_with_microdeposits` — days of waiting, not a challenge anyone can finish now.
         * Thread 8C does not build the microdeposit product; it must still tell the truth about the
         * state, and must create nothing financial while it lasts.
         *
         * The account details go straight to Stripe and are never seen by Alloy — this is the
         * tokenization boundary the product relies on, exercised here in one step instead of
         * through Elements.
         */
        const client = supabase!;
        const chargeId = await postCharge(client, 60_000);
        const before = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;

        const created = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 5_500, rail: "ach", actorUserId: ACTOR,
        });
        expect(created.ok, JSON.stringify(created)).toBe(true);
        const result = created as { ok: true; providerTransactionId: string; attemptId: string };

        const pm = await stripePost("payment_methods", {
            type: "us_bank_account",
            "us_bank_account[routing_number]": "110000000",
            "us_bank_account[account_number]": "000123456789",
            "us_bank_account[account_holder_type]": "individual",
            "billing_details[name]": "Certification Payer",
            "billing_details[email]": "cert@example.com",
        }, connectedAccount);
        expect(pm.status, "the provider tokenizes the account details").toBe(200);

        const confirmed = await stripePost(`payment_intents/${result.providerTransactionId}/confirm`, {
            payment_method: String(pm.body.id),
            "mandate_data[customer_acceptance][type]": "online",
            "mandate_data[customer_acceptance][online][ip_address]": "127.0.0.1",
            "mandate_data[customer_acceptance][online][user_agent]": "alloy-certification",
        }, connectedAccount);
        expect(confirmed.status).toBe(200);
        expect(confirmed.body.status, "real provider behaviour for an unverified account").toBe("requires_action");
        expect(confirmed.body.next_action?.type).toBe("verify_with_microdeposits");

        // A mandate exists — the payer authorised the debit, which is what makes it lawful to try.
        expect(confirmed.body.payment_method, "the tokenized method is attached").toBeTruthy();

        // ── AND NOTHING FINANCIAL HAPPENED. Asserted on persisted state, not on a label. ─────────
        const { data: payments } = await client.from("payments").select("id")
            .eq("org_id", ORG).eq("processor_transaction_id", result.providerTransactionId);
        expect((payments ?? []).length, "verification pending creates no receipt").toBe(0);
        const { data: allocs } = await client.from("payment_allocations").select("id").eq("charge_id", chargeId);
        expect((allocs ?? []).length, "and no application").toBe(0);
        expect(
            (await readChargeBalance(client, ORG, chargeId)).outstandingCents,
            "and moves no outstanding",
        ).toBe(before);

        // The operator is told the truth about which of the two `requires_action` meanings this is.
        const state = collectionLifecycle({
            rail: "ach",
            processorState: "requires_action",
            providerActionType: String(confirmed.body.next_action?.type),
            canonicallyRecognized: false,
        });
        expect(state).toBe("verification_required");
        expect(lifecycleLabel(state, "ach")).toBe("Verification required");
    });

    it("never persists raw bank credentials anywhere Alloy owns", async () => {
        const client = supabase!;
        // The routing/account numbers used above must exist nowhere in Alloy's own records.
        const { data: attempts } = await client.from("payment_collection_attempts")
            .select("id, last_provider_detail, provider_action_type, provider_transaction_id").eq("org_id", ORG);
        const serialised = JSON.stringify(attempts ?? []);
        expect(serialised, "no routing number").not.toMatch(/110000000/);
        expect(serialised, "no account number").not.toMatch(/000123456789/);
        const { data: events } = await client.from("payment_provider_events").select("payload").limit(50);
        expect(JSON.stringify(events ?? []), "provider evidence carries no raw bank credentials")
            .not.toMatch(/000123456789/);
    });
});
