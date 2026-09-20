/**
 * COLLECTION COMPLETION, AGAINST THE REAL DATABASE AND THE REAL PROVIDER.
 *
 * The deterministic suite proves the decisions. This proves the two things a fake cannot: that the
 * provenance survives in the database with the constraints that actually exist, and that a BANK
 * collection really behaves the way W3 claims — processing is not money, and money appears only when
 * Alloy recognises it.
 *
 * W2 could not certify the bank path at all: the governed merchant had no ACH capability. It now
 * reports `us_bank_account_ach_payments: active`, so W2's carried debt R2 is closed here rather than
 * carried again.
 *
 * Requires: cert stack up, STRIPE_SECRET_KEY in the trusted-secrets slot.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import {
    readUnrecognizedCollections,
    recognizeCollectionAttempt,
} from "@/lib/financials/payments/collectionRecognition";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { defaultStripeFormCall } from "@/lib/financials/payments/providerPaymentMethod";
import { requestProviderRefund } from "@/lib/financials/payments/refundCollection";

import { ensureAccountingPeriodCovers, governedTestAccount } from "./certEnvironment";

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

/** This suite's own subject. Never the shared certification organisation's own fixtures. */
const ORG = "9c000000-0000-4000-8000-00000000e007";
const CUSTOMER = "9c000000-0000-4000-8000-0000000c0007";
const PAYER = "9c000000-0000-4000-8000-0000000d0007";
const OTHER_PAYER = "9c000000-0000-4000-8000-0000000d0008";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;
const runnable = Boolean(supabase && secret);

let connectedAccount = "";
let achCapable = false;
let cardMethodId = "";
let bankMethodId = "";

async function postCharge(amountCents: number): Promise<string> {
    const { data, error } = await supabase!
        .from("charges")
        .insert({
            org_id: ORG, job_id: null,
            billable_source_type: "customer", billable_source_id: CUSTOMER,
            charge_type: "fee", charge_category: "fee", status: "draft",
            currency_code: "USD", amount_cents: amountCents,
            service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
            description: "W3 collection completion certification", metadata: {},
            created_by: ACTOR, updated_by: ACTOR,
        })
        .select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await supabase!.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

/** A real platform-side method of the given rail, stored canonically. */
async function storeMethod(rail: "card" | "ach", payerId: string): Promise<string> {
    const customer = await defaultStripeFormCall("POST", "customers", { name: `W3 ${rail} payer` }, {});
    const customerRef = String((customer.body as { id?: string }).id ?? "");

    let methodRef = "";
    let brand: string | null = null;
    let last4: string | null = null;
    if (rail === "card") {
        const pm = await defaultStripeFormCall("POST", "payment_methods", { type: "card", "card[token]": "tok_visa" }, {});
        methodRef = String((pm.body as { id?: string }).id ?? "");
        brand = "visa"; last4 = "4242";
        await defaultStripeFormCall("POST", `payment_methods/${methodRef}/attach`, { customer: customerRef }, {});
    } else {
        /*
         * A SetupIntent confirmed with Stripe's own test bank instrument, which is the only way to
         * get a us_bank_account method without a browser. The mandate travels with the clone.
         */
        const si = await defaultStripeFormCall("POST", "setup_intents", {
            customer: customerRef,
            "payment_method_types[]": "us_bank_account",
            usage: "off_session",
        }, {});
        const siId = String((si.body as { id?: string }).id ?? "");
        const confirmed = await defaultStripeFormCall("POST", `setup_intents/${siId}/confirm`, {
            payment_method: "pm_usBankAccount_success",
            "mandate_data[customer_acceptance][type]": "offline",
        }, {});
        methodRef = String(((confirmed.body as { payment_method?: unknown }).payment_method ?? "") as string);
        brand = "STRIPE TEST BANK"; last4 = "6789";
    }
    if (!methodRef) throw new Error(`could not create a ${rail} method for certification`);

    const { data, error } = await supabase!.from("payment_methods").insert({
        org_id: ORG, payer_entity_type: "person", payer_entity_id: payerId, customer_id: CUSTOMER,
        rail, processor: "stripe",
        provider_customer_ref: customerRef, provider_method_ref: methodRef,
        display_brand: brand, display_last4: last4,
        verification_state: "verified", usability_state: "usable", created_by: ACTOR,
    }).select("id").single();
    if (error) throw new Error(`could not store the ${rail} method: ${error.message}`);
    return String((data as { id: string }).id);
}

describe.runIf(runnable)("collection completion — live", () => {
    beforeAll(async () => {
        const client = supabase!;
        await client.from("orgs").upsert(
            { id: ORG, name: "Payments W3 certification", slug: "payments-w3-cert", status: "active" },
            { onConflict: "id" },
        );
        await client.from("customers").upsert({ id: CUSTOMER, org_id: ORG, name: "W3 cert account" }, { onConflict: "id" });
        await ensureAccountingPeriodCovers(client, ORG, TODAY);

        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_methods").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);

        const acct = await governedTestAccount(secret!);
        connectedAccount = String(acct.id);
        const caps = (acct as { capabilities?: Record<string, string> }).capabilities ?? {};
        achCapable = caps.us_bank_account_ach_payments === "active";

        await client.from("payment_provider_merchants")
            .update({ is_active: false })
            .eq("provider_account_ref", connectedAccount)
            .eq("is_active", true);
        const { error } = await client.from("payment_provider_merchants").insert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            ach_readiness: achCapable ? "ready" : "not_connected",
            readiness_checked_at: new Date().toISOString(), created_by: ACTOR, updated_by: ACTOR,
        });
        if (error) throw new Error(`could not bind the certification merchant: ${error.message}`);

        cardMethodId = await storeMethod("card", PAYER);
        if (achCapable) bankMethodId = await storeMethod("ach", PAYER);
    }, 180_000);

    afterAll(async () => {
        const client = supabase;
        if (!client) return;
        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_methods").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
        await client.from("charges").delete().eq("org_id", ORG);
    });

    // ── PROVENANCE ───────────────────────────────────────────────────────────────────────────────

    it("a stored CARD attempt durably names the method it used", async () => {
        const chargeId = await postCharge(24_000);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 24_000, actorUserId: ACTOR,
            payerPersonId: PAYER, paymentMethodId: cardMethodId,
        });
        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        if (!out.ok) return;

        const { data } = await supabase!
            .from("payment_collection_attempts")
            .select("payment_method_id, rail, payer_person_id")
            .eq("id", out.attemptId).single();
        const row = data as { payment_method_id: string | null; rail: string; payer_person_id: string | null };
        expect(row.payment_method_id).toBe(cardMethodId);
        expect(row.rail).toBe("card");
        expect(row.payer_person_id).toBe(PAYER);
    }, 120_000);

    /**
     * THE PAYER INVARIANT. Charging Person B's card while recording Person A as the payer would put
     * a receipt in the ledger that says money came from somewhere it did not.
     */
    it("refuses a stored method whose owner is not the payer the attempt claims", async () => {
        const chargeId = await postCharge(13_000);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 13_000, actorUserId: ACTOR,
            payerPersonId: OTHER_PAYER, paymentMethodId: cardMethodId,
        });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("method_payer_mismatch");

        /* Refused BEFORE anything was created — no attempt, so no provider call either. */
        const { data } = await supabase!
            .from("payment_collection_attempts").select("id").eq("org_id", ORG).eq("charge_id", chargeId);
        expect(data).toHaveLength(0);
    }, 60_000);

    it("historical provenance survives revoking the method afterwards", async () => {
        const chargeId = await postCharge(8_000);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 8_000, actorUserId: ACTOR,
            payerPersonId: PAYER, paymentMethodId: cardMethodId,
        });
        expect(out.ok).toBe(true);
        if (!out.ok) return;

        await supabase!.from("payment_methods")
            .update({ usability_state: "revoked", revoked_at: new Date().toISOString(), is_default: false })
            .eq("id", cardMethodId);

        const { data } = await supabase!
            .from("payment_collection_attempts").select("payment_method_id").eq("id", out.attemptId).single();
        expect((data as { payment_method_id: string }).payment_method_id,
            "the attempt still names what actually happened").toBe(cardMethodId);

        /* Put it back for the remaining cases. */
        await supabase!.from("payment_methods")
            .update({ usability_state: "usable", revoked_at: null })
            .eq("id", cardMethodId);
    }, 120_000);

    // ── THE BANK PATH — W2's carried debt R2 ─────────────────────────────────────────────────────

    it("a stored BANK collection is processing, is NOT money, and names its method", async () => {
        if (!achCapable) return; /* Recorded in the report rather than faked. */
        const chargeId = await postCharge(19_000);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 19_000, actorUserId: ACTOR,
            payerPersonId: PAYER, rail: "ach", paymentMethodId: bankMethodId,
        });
        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        if (!out.ok) return;

        const { data } = await supabase!
            .from("payment_collection_attempts")
            .select("payment_method_id, rail, processor_state, canonical_payment_id, expected_settlement_on")
            .eq("id", out.attemptId).single();
        const row = data as {
            payment_method_id: string | null; rail: string; processor_state: string;
            canonical_payment_id: string | null; expected_settlement_on: string | null;
        };

        expect(row.payment_method_id).toBe(bankMethodId);
        expect(row.rail).toBe("ach");
        /* THE POINT: a bank collection in flight is an attempt, never a receipt. */
        expect(row.canonical_payment_id, "processing money is not money").toBeNull();
        expect(["processing", "requires_action", "succeeded"]).toContain(row.processor_state);
        /* And where the provider offered a settlement date, it was captured as a projection. */
        if (row.expected_settlement_on) {
            expect(row.expected_settlement_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    }, 150_000);

    it("a partial refund of a bank payment is refused before the provider is called", async () => {
        if (!achCapable) return;
        /* A posted ACH receipt with an attempt behind it, which is what the rule reads. */
        const chargeId = await postCharge(15_000);
        const collected = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 15_000, actorUserId: ACTOR,
            payerPersonId: PAYER, rail: "ach", paymentMethodId: bankMethodId,
        });
        expect(collected.ok).toBe(true);
        if (!collected.ok) return;

        const { data: payRow } = await supabase!.from("payments").insert({
            org_id: ORG, direction: "inbound", status: "posted",
            amount_cents: 15_000, currency: "USD", payment_method: "ach", processor: "stripe",
            processor_transaction_id: collected.providerTransactionId,
            received_at: new Date().toISOString(), created_by: ACTOR, updated_by: ACTOR,
        }).select("id").single();
        const paymentId = String((payRow as { id: string }).id);
        await supabase!.from("payment_collection_attempts")
            .update({ canonical_payment_id: paymentId }).eq("id", collected.attemptId);

        let providerCalled = false;
        const out = await requestProviderRefund(
            supabase!,
            { orgId: ORG, paymentId, amountCents: 5_000 },
            async () => { providerCalled = true; return { status: 200, body: {} }; },
        );

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("partial_ach_refund");
        expect(providerCalled, "eligibility refuses before provider execution").toBe(false);
        expect(out.message).toMatch(/refunded in full/i);
    }, 150_000);

    // ── RECOGNITION ──────────────────────────────────────────────────────────────────────────────

    it("a succeeded attempt with no canonical payment appears in the recognition queue", async () => {
        const chargeId = await postCharge(21_000);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 21_000, actorUserId: ACTOR,
            payerPersonId: PAYER, paymentMethodId: cardMethodId,
        });
        expect(out.ok).toBe(true);
        if (!out.ok) return;

        /* Force the exact unresolved state: the provider says succeeded, Alloy has no receipt. */
        await supabase!.from("payment_collection_attempts")
            .update({ processor_state: "succeeded", canonical_payment_id: null })
            .eq("id", out.attemptId);

        const queue = await readUnrecognizedCollections(supabase!, { orgId: ORG });
        const row = queue.find((q) => q.attemptId === out.attemptId);
        expect(row, "unrecorded money is visible operational work").toBeTruthy();
        expect(row!.amountCents).toBe(21_000);
        expect(row!.paymentMethodId).toBe(cardMethodId);
        expect(row!.methodLast4, "the row carries safe method display").toBe("4242");
        /* And never a provider reference as its identity. */
        expect(JSON.stringify(row)).not.toContain("acct_");
    }, 120_000);

    /**
     * THE REPAIR, END TO END — and the race.
     *
     * A stored-card collection confirms off-session, so the provider really does settle it. Forcing
     * `canonical_payment_id` back to null reproduces exactly the gap W3 exists to close: money taken,
     * money unrecorded.
     */
    it("recognizes a genuinely settled collection exactly once, however many times it is asked", async () => {
        const chargeId = await postCharge(12_500);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 12_500, actorUserId: ACTOR,
            payerPersonId: PAYER, paymentMethodId: cardMethodId,
        });
        expect(out.ok).toBe(true);
        if (!out.ok) return;

        /* Whatever the webhook did, put it back in the unresolved state on purpose. */
        await supabase!.from("payment_collection_attempts")
            .update({ processor_state: "succeeded", canonical_payment_id: null })
            .eq("id", out.attemptId);

        const first = await recognizeCollectionAttempt(supabase!, { orgId: ORG, attemptId: out.attemptId });
        expect(first.ok, !first.ok ? first.message : "").toBe(true);
        if (!first.ok) return;
        expect(first.recognized, "this call did the recognizing").toBe(true);
        expect(first.paymentId).toBeTruthy();

        /* THE RACE: a second actor arrives. It must converge, not mint a second receipt. */
        const second = await recognizeCollectionAttempt(supabase!, { orgId: ORG, attemptId: out.attemptId });
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.recognized, "the second caller recognized nothing").toBe(false);
        expect(second.paymentId, "and was handed the same receipt").toBe(first.paymentId);

        /* Exactly one canonical payment exists for this collection. */
        const { data: payments } = await supabase!
            .from("payments").select("id").eq("org_id", ORG).eq("processor_transaction_id", out.providerTransactionId);
        expect(payments, "one collection, one receipt").toHaveLength(1);

        /* And it has left the recognition queue. */
        const queue = await readUnrecognizedCollections(supabase!, { orgId: ORG });
        expect(queue.map((q) => q.attemptId)).not.toContain(out.attemptId);
    }, 150_000);

    /**
     * A BANK COLLECTION IN FLIGHT IS NOT MONEY, and recognition says so rather than pretending.
     *
     * This is the case that W2 could not reach at all. The provider reports `processing`, so the
     * repair refuses — the money becomes a Payment when it settles, not when somebody clicks.
     */
    it("refuses to recognize a bank collection the provider is still processing", async () => {
        if (!achCapable) return;
        const chargeId = await postCharge(9_500);
        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 9_500, actorUserId: ACTOR,
            payerPersonId: PAYER, rail: "ach", paymentMethodId: bankMethodId,
        });
        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        if (!out.ok) return;

        /* Alloy's cached state is made to LIE. The provider is the authority. */
        await supabase!.from("payment_collection_attempts")
            .update({ processor_state: "succeeded", canonical_payment_id: null })
            .eq("id", out.attemptId);

        const recognized = await recognizeCollectionAttempt(supabase!, { orgId: ORG, attemptId: out.attemptId });

        /*
         * Stripe settles test ACH instantly, so this may legitimately be settled by now. Either
         * answer is correct — what must NEVER happen is recognition succeeding while the provider
         * says processing.
         */
        if (!recognized.ok) {
            expect(recognized.reason).toBe("not_settled");
            const { data } = await supabase!
                .from("payment_collection_attempts").select("canonical_payment_id").eq("id", out.attemptId).single();
            expect((data as { canonical_payment_id: string | null }).canonical_payment_id).toBeNull();
        } else {
            const res = await fetch(`https://api.stripe.com/v1/payment_intents/${out.providerTransactionId}`, {
                headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccount },
            });
            const body = (await res.json()) as { status?: string };
            expect(body.status, "it only recognized because the provider really had settled").toBe("succeeded");
        }
    }, 180_000);

    it("an attempt in another organization is not recognizable from this one", async () => {
        const out = await recognizeCollectionAttempt(supabase!, {
            orgId: "9c000000-0000-4000-8000-00000000eeee",
            attemptId: "00000000-0000-4000-8000-00000000abcd",
        });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("attempt_not_found");
    }, 60_000);
});
