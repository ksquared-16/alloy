/**
 * SLICE D — CARD COLLECTION CREATION, against real Stripe test mode and real Postgres.
 *
 * The claim under test is narrow and important: Alloy can ask a provider's OWN connected account to
 * collect a server-derived amount, and none of that becomes money. No receipt, no allocation, no
 * change to outstanding. A PaymentIntent is a request.
 *
 * Everything financial is proven by refusal as much as by success — a tampered amount, a substituted
 * obligation, another tenant's charge and a non-ready merchant each have to be turned away by the
 * server rather than by the absence of a button.
 *
 * Requires: cert stack up, STRIPE_SECRET_KEY in the trusted-secrets slot, one test connected account.
 * No key, client secret or card data is printed.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCardCollection, deriveIntentKey } from "@/lib/financials/payments/collectionAttempt";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { recordAndApplyChildcarePayment, readChargeBalance } from "@/lib/financials/childcarePaymentService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
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

function stripeSecret(): string | null {
    if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
    try {
        const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        const line = readFileSync(p, "utf8").split("\n").find((l) => l.startsWith("STRIPE_SECRET_KEY="));
        return line?.slice("STRIPE_SECRET_KEY=".length).trim() || null;
    } catch {
        return null;
    }
}

const env = certEnv();
const secret = stripeSecret();
if (secret && !process.env.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = secret;

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret ? describe : describe.skip;

let connectedAccount = "";
const charges: string[] = [];

async function stripeGet(path: string, account?: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: {
            Authorization: `Bearer ${secret}`,
            ...(account ? { "Stripe-Account": account } : {}),
        },
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client
        .from("charges")
        .insert({
            org_id: ORG, job_id: null,
            billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
            charge_type: "fee", charge_category: "fee", status: "draft",
            currency_code: "USD", amount_cents: amountCents,
            service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
            description: "slice D collection certification", metadata: {},
            created_by: ACTOR, updated_by: ACTOR,
        })
        .select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    charges.push(id);
    await client.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

describeLive("Slice D — card collection creation, live", () => {
    beforeAll(async () => {
        const client = supabase!;
        await client.from("payment_collection_attempts").delete().in("org_id", [ORG, OTHER_ORG]);
        await client.from("payment_provider_merchants").delete().in("org_id", [ORG, OTHER_ORG]);

        const list = await stripeGet("accounts?limit=1");
        const acct = ((list.body.data ?? []) as Array<Record<string, unknown>>)[0];
        connectedAccount = String(acct.id);
        await client.from("payment_provider_merchants").insert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            readiness_checked_at: new Date().toISOString(), created_by: ACTOR, updated_by: ACTOR,
        });
    });

    afterAll(async () => {
        const client = supabase!;
        await client.from("payment_collection_attempts").delete().in("org_id", [ORG, OTHER_ORG]);
        await client.from("payment_provider_merchants").delete().in("org_id", [ORG, OTHER_ORG]);
    });

    it("creates a real PaymentIntent on the PROVIDER's connected account, never the platform", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);

        const result = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 40_000, actorUserId: ACTOR,
        });
        expect(result.ok, JSON.stringify(result)).toBe(true);
        if (!result.ok) throw new Error("unreachable");

        expect(result.providerTransactionId.startsWith("pi_")).toBe(true);
        expect(result.connectedAccountRef).toBe(connectedAccount);
        expect(result.clientSecret.length).toBeGreaterThan(0);

        // THE DIRECT-CHARGE PROOF. The intent is retrievable WITH the connected-account header and
        // invisible without it — which is what "the provider is the merchant" means in practice. A
        // platform-account fallback would invert both of these.
        const onConnected = await stripeGet(`payment_intents/${result.providerTransactionId}`, connectedAccount);
        expect(onConnected.status, "retrievable on the connected account").toBe(200);
        expect(onConnected.body.amount).toBe(40_000);
        expect(onConnected.body.currency).toBe("usd");
        expect(onConnected.body.livemode, "test mode").toBe(false);

        const onPlatform = await stripeGet(`payment_intents/${result.providerTransactionId}`);
        expect(onPlatform.status, "NOT on the platform account").not.toBe(200);

        // And none of this is money.
        const balance = await readChargeBalance(client, ORG, chargeId);
        expect(balance.outstandingCents, "a request is not a receipt").toBe(40_000);
    });

    it("derives the amount from canonical truth and refuses a tampered one", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 25_000);

        const tampered = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 25_001, actorUserId: ACTOR,
        });
        expect(tampered.ok).toBe(false);
        if (tampered.ok) throw new Error("unreachable");
        expect(tampered.reason).toBe("amount_exceeds_collectible");

        // A partial collection within the ceiling is legitimate and permitted.
        const partial = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 10_000, actorUserId: ACTOR,
        });
        expect(partial.ok, JSON.stringify(partial)).toBe(true);
    });

    it("refuses another organization's obligation, an unknown one, and a non-positive amount", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 15_000);

        // Cross-org: the resolver is scoped by the session org, so ORG's charge is simply not there
        // for OTHER_ORG — substitution is unreachable rather than merely checked. OTHER_ORG also has
        // no merchant, which is the first refusal it meets.
        const crossOrg = await createCardCollection(client, {
            orgId: OTHER_ORG, chargeId, requestedAmountCents: 1_000, actorUserId: ACTOR,
        });
        expect(crossOrg.ok).toBe(false);
        if (crossOrg.ok) throw new Error("unreachable");
        expect(["not_connected", "charge_not_found"]).toContain(crossOrg.reason);
        expect(JSON.stringify(crossOrg), "no platform account is ever named").not.toMatch(/acct_/);

        const unknown = await createCardCollection(client, {
            orgId: ORG, chargeId: "00000000-0000-4000-8000-0000000000cc",
            requestedAmountCents: 1_000, actorUserId: ACTOR,
        });
        expect(unknown.ok).toBe(false);

        const zero = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 0, actorUserId: ACTOR,
        });
        expect(zero.ok).toBe(false);
        if (zero.ok) throw new Error("unreachable");
        expect(zero.reason).toBe("invalid_amount");
    });

    it("refuses when the organization has no ready merchant, without falling back", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 12_000);
        await client.from("payment_provider_merchants")
            .update({ readiness: "onboarding_incomplete" }).eq("org_id", ORG);

        const refused = await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 12_000, actorUserId: ACTOR,
        });
        expect(refused.ok).toBe(false);
        if (refused.ok) throw new Error("unreachable");
        expect(refused.reason).toBe("onboarding_incomplete");
        expect(JSON.stringify(refused)).not.toMatch(/acct_/);

        await client.from("payment_provider_merchants").update({ readiness: "ready" }).eq("org_id", ORG);
    });

    it("collapses a retried intent onto one attempt and one PaymentIntent, including concurrently", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 30_000);
        const args = { orgId: ORG, chargeId, requestedAmountCents: 30_000, actorUserId: ACTOR };

        // Sequential retry — the shape of a dropped response resubmitted.
        const first = await createCardCollection(client, args);
        const retry = await createCardCollection(client, args);
        expect(first.ok && retry.ok).toBe(true);
        if (!first.ok || !retry.ok) throw new Error("unreachable");
        expect(retry.attemptId, "same canonical attempt").toBe(first.attemptId);
        expect(retry.providerTransactionId, "same PaymentIntent — the card is not charged twice")
            .toBe(first.providerTransactionId);

        // Concurrent submission — two tabs. The unique index decides, not a lookup.
        const concurrentCharge = await postCharge(client, 22_000);
        const cargs = { orgId: ORG, chargeId: concurrentCharge, requestedAmountCents: 22_000, actorUserId: ACTOR };
        const [a, b] = await Promise.all([
            createCardCollection(client, cargs),
            createCardCollection(client, cargs),
        ]);
        expect(a.ok && b.ok, `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(true);
        if (!a.ok || !b.ok) throw new Error("unreachable");
        expect(b.attemptId).toBe(a.attemptId);
        expect(b.providerTransactionId).toBe(a.providerTransactionId);

        const { data: rows } = await client
            .from("payment_collection_attempts")
            .select("id").eq("org_id", ORG).eq("charge_id", concurrentCharge);
        expect((rows ?? []).length, "exactly one attempt row survived the race").toBe(1);

        // The derived key is what made that possible, and it is stable for the same intent.
        expect(deriveIntentKey({ chargeId, amountCents: 30_000, rail: "card" }))
            .toBe(deriveIntentKey({ chargeId, amountCents: 30_000, rail: "card" }));
    });

    it("leaves no Thread 8 receipt, and manual rails never touch the attempt model", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 18_000);

        await createCardCollection(client, {
            orgId: ORG, chargeId, requestedAmountCents: 18_000, actorUserId: ACTOR,
        });

        // A PaymentIntent exists and Stripe may even be mid-flight. Alloy has recognised nothing.
        const { data: receipts } = await client
            .from("payment_allocations").select("id").eq("charge_id", chargeId);
        expect((receipts ?? []).length, "no allocation exists for a mere request").toBe(0);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(18_000);

        // And the manual rail bypasses all of it: a cash payment is a canonical receipt with no
        // attempt, no processor and no provider transaction.
        const cashCharge = await postCharge(client, 9_000);
        const cash = await recordAndApplyChildcarePayment(client, {
            orgId: ORG, chargeId: cashCharge, amountCents: 9_000, paymentMethod: "cash",
            idempotencyKey: `sliceD-cash-${Date.now()}`, actorUserId: ACTOR,
        });
        expect(cash.payment.status).toBe("posted");
        const { data: cashAttempts } = await client
            .from("payment_collection_attempts").select("id").eq("charge_id", cashCharge);
        expect((cashAttempts ?? []).length, "cash never enters the collection-attempt model").toBe(0);
        expect((await readChargeBalance(client, ORG, cashCharge)).outstandingCents).toBe(0);
    });
});
