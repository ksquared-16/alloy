/**
 * SLICE E — THE WEBHOOK BOUNDARY, against real Stripe-signed events and real Postgres.
 *
 * Everything hostile about webhook delivery is normal, so it is all proven here rather than assumed:
 * forged and unsigned requests, an account Alloy has never heard of, the same event twice, two
 * deliveries at once, and older provider truth arriving after a terminal state.
 *
 * The signatures are genuine. Each payload is signed with the real `whsec_` that `stripe listen`
 * issued for this account, using Stripe's own scheme — which is the same computation Stripe performs
 * and the same one the handler verifies. Forging an INVALID signature is the one thing that can only
 * be done locally, which is exactly why it is done here.
 *
 * The slice stops at the attempt. No receipt, no allocation, no movement in outstanding — proving
 * that provider evidence and financial consequence are separate authorities.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readChargeBalance } from "@/lib/financials/childcarePaymentService";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";

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

const ORG = "00000000-0000-4000-8000-000000000001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret && whsec ? describe : describe.skip;

let connectedAccount = "";

/** Stripe's own signing computation, with the real secret Stripe issued for this account. */
function signed(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", whsec!).update(`${t}.${body}`).digest("hex");
    return `t=${t},v1=${v1}`;
}

function eventBody(args: {
    id: string;
    type: string;
    account: string | null;
    piId: string;
    status: string;
}): string {
    return JSON.stringify({
        id: args.id,
        type: args.type,
        created: Math.floor(Date.now() / 1000),
        ...(args.account ? { account: args.account } : {}),
        data: { object: { id: args.piId, object: "payment_intent", status: args.status } },
    });
}

async function post(body: string, sig: string | null) {
    return await handleStripeWebhook(supabase!, body, sig, whsec!);
}

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client.from("charges").insert({
        org_id: ORG, job_id: null,
        billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
        charge_type: "fee", charge_category: "fee", status: "draft",
        currency_code: "USD", amount_cents: amountCents,
        service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
        description: "slice E webhook certification", metadata: {},
        created_by: ACTOR, updated_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await client.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

/** An attempt in `processing`, with a provider transaction id, ready to be converged by an event. */
async function seedAttempt(client: SupabaseClient, piId: string, chargeId: string): Promise<string> {
    const { data: merchant } = await client
        .from("payment_provider_merchants").select("id").eq("org_id", ORG).eq("is_active", true).single();
    const { data, error } = await client.from("payment_collection_attempts").insert({
        org_id: ORG, processor: "stripe",
        merchant_id: (merchant as { id: string }).id,
        provider_account_ref: connectedAccount,
        rail: "card",
        billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
        charge_id: chargeId, currency: "USD", requested_amount_cents: 5_000,
        intent_key: `slice-e:${piId}`,
        provider_transaction_id: piId,
        processor_state: "processing",
        created_by: ACTOR, updated_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
}

describeLive("Slice E — the webhook boundary, live", () => {
    beforeAll(async () => {
        const client = supabase!;
        await client.from("payment_provider_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);

        const res = await fetch("https://api.stripe.com/v1/accounts?limit=1", {
            headers: { Authorization: `Bearer ${secret}` },
        });
        const acct = ((await res.json()) as { data: Array<Record<string, unknown>> }).data[0];
        connectedAccount = String(acct.id);
        await client.from("payment_provider_merchants").insert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            created_by: ACTOR, updated_by: ACTOR,
        });
    });

    afterAll(async () => {
        const client = supabase!;
        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
    });

    it("refuses an unsigned request, a forged one, and a stale-timestamped one", async () => {
        const body = eventBody({ id: "evt_forged_1", type: "payment_intent.succeeded", account: connectedAccount, piId: "pi_x", status: "succeeded" });

        expect((await post(body, null)).outcome).toBe("rejected");
        expect((await post(body, "t=1,v1=deadbeef")).outcome).toBe("rejected");
        // A correctly-computed signature over an old timestamp: replaying last week's capture.
        const old = Math.floor(Date.now() / 1000) - 4000;
        const v1 = createHmac("sha256", whsec!).update(`${old}.${body}`).digest("hex");
        const stale = await post(body, `t=${old},v1=${v1}`);
        expect(stale.outcome).toBe("rejected");
        expect(stale.detail).toMatch(/tolerance/);

        // And none of them left evidence claiming to be real.
        const { data } = await supabase!.from("payment_provider_events").select("id").eq("provider_event_id", "evt_forged_1");
        expect((data ?? []).length, "a refused request is not recorded as an event").toBe(0);
    });

    it("fails closed on a connected account Alloy has no binding for", async () => {
        const body = eventBody({
            id: `evt_unknown_${Date.now()}`, type: "payment_intent.succeeded",
            account: "acct_neverseenbefore", piId: "pi_unknown", status: "succeeded",
        });
        const result = await post(body, signed(body));
        expect(result.outcome).toBe("unattributed");
        expect(result.detail).toMatch(/failing closed/);
    });

    it("converges processing → succeeded, and the same event twice is harmless", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 5_000);
        const piId = `pi_slice_e_${Date.now()}`;
        const attemptId = await seedAttempt(client, piId, chargeId);

        const evtId = `evt_success_${Date.now()}`;
        const body = eventBody({ id: evtId, type: "payment_intent.succeeded", account: connectedAccount, piId, status: "succeeded" });

        const first = await post(body, signed(body));
        expect(first.outcome, first.detail).toBe("applied");
        expect(first.attemptId).toBe(attemptId);

        // Delivery is at-least-once. The second one must be a non-event.
        const second = await post(body, signed(body));
        expect(second.outcome).toBe("duplicate");

        const { data: after } = await client
            .from("payment_collection_attempts").select("processor_state").eq("id", attemptId).single();
        expect((after as { processor_state: string }).processor_state).toBe("succeeded");
    });

    it("converges when two deliveries of one event execute concurrently", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 5_000);
        const piId = `pi_slice_e_conc_${Date.now()}`;
        const attemptId = await seedAttempt(client, piId, chargeId);

        const evtId = `evt_conc_${Date.now()}`;
        const body = eventBody({ id: evtId, type: "payment_intent.succeeded", account: connectedAccount, piId, status: "succeeded" });

        // Both in flight at once — the unique index decides, not a lookup either of them performed.
        const [a, b] = await Promise.all([post(body, signed(body)), post(body, signed(body))]);
        const outcomes = [a.outcome, b.outcome].sort();
        expect(outcomes, `${a.outcome}/${b.outcome}`).toEqual(["applied", "duplicate"]);

        const { data: rows } = await client
            .from("payment_provider_events").select("id").eq("provider_event_id", evtId);
        expect((rows ?? []).length, "exactly one event row survived the race").toBe(1);

        const { data: after } = await client
            .from("payment_collection_attempts").select("processor_state").eq("id", attemptId).single();
        expect((after as { processor_state: string }).processor_state).toBe("succeeded");
    });

    it("does not let older provider truth walk a succeeded attempt backwards", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 5_000);
        const piId = `pi_slice_e_order_${Date.now()}`;
        const attemptId = await seedAttempt(client, piId, chargeId);

        const okBody = eventBody({ id: `evt_ok_${Date.now()}`, type: "payment_intent.succeeded", account: connectedAccount, piId, status: "succeeded" });
        expect((await post(okBody, signed(okBody))).outcome).toBe("applied");

        // The `processing` that Stripe emitted first, arriving second.
        const lateBody = eventBody({ id: `evt_late_${Date.now()}`, type: "payment_intent.processing", account: connectedAccount, piId, status: "processing" });
        const late = await post(lateBody, signed(lateBody));
        expect(late.outcome, late.detail).toBe("stale");

        const { data: after } = await client
            .from("payment_collection_attempts").select("processor_state").eq("id", attemptId).single();
        expect((after as { processor_state: string }).processor_state, "terminal success holds").toBe("succeeded");
    });

    it("records a failure without creating cash, and leaves outstanding untouched throughout", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 7_500);
        const piId = `pi_slice_e_fail_${Date.now()}`;
        const attemptId = await seedAttempt(client, piId, chargeId);

        const body = eventBody({ id: `evt_fail_${Date.now()}`, type: "payment_intent.payment_failed", account: connectedAccount, piId, status: "requires_payment_method" });
        expect((await post(body, signed(body))).outcome).toBe("applied");

        const { data: after } = await client
            .from("payment_collection_attempts").select("processor_state").eq("id", attemptId).single();
        expect((after as { processor_state: string }).processor_state).toBe("failed");

        // THE SLICE BOUNDARY. Provider-confirmed success elsewhere in this file did not create a
        // receipt either — evidence and financial consequence are separate authorities, and Thread 8
        // posting is Slice F.
        const { data: allocations } = await client
            .from("payment_allocations").select("id").eq("charge_id", chargeId);
        expect((allocations ?? []).length).toBe(0);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(7_500);

        const { data: anyReceipt } = await client
            .from("payments").select("id").eq("org_id", ORG).eq("processor", "stripe");
        expect((anyReceipt ?? []).length, "Slice E creates no Thread 8 receipt at all").toBe(0);
    });
});
