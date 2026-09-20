/**
 * COLLECTING FROM A STORED METHOD, THROUGH THE ENGINE THAT ALREADY EXISTED.
 *
 * W2's collection claim is not "money can be taken" — Thread 8C certified that. It is that a stored
 * method feeds the SAME engine: the same attempt row, the same PaymentIntent call, the same direct
 * charge on the provider's connected account, the same canonical posting. If this needed a second
 * execution path, the architecture would be wrong.
 *
 * So the cases below assert sameness as much as success: one attempt, one PaymentIntent, on the
 * merchant rather than the platform, carrying the CLONE rather than the platform method.
 *
 * Requires: cert stack up, STRIPE_SECRET_KEY in the trusted-secrets slot.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { readMethod } from "@/lib/financials/payments/paymentMethodService";
import { readinessFromStripeAccount } from "@/lib/financials/payments/providerMerchant";
import { defaultStripeFormCall } from "@/lib/financials/payments/providerPaymentMethod";

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

/** This suite's own subject — never the shared certification organisation. */
const ORG = "9c000000-0000-4000-8000-00000000e005";
const CUSTOMER = "9c000000-0000-4000-8000-0000000c0005";
const OTHER_CUSTOMER = "9c000000-0000-4000-8000-0000000c0006";
const PAYER = "9c000000-0000-4000-8000-0000000d0005";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;
const runnable = Boolean(supabase && secret);

let connectedAccount = "";
let storedMethodId = "";
let platformMethodRef = "";

async function postCharge(amountCents: number): Promise<string> {
    const { data, error } = await supabase!
        .from("charges")
        .insert({
            org_id: ORG, job_id: null,
            /* A HOUSEHOLD obligation: the billable source names the account directly. */
            billable_source_type: "customer", billable_source_id: CUSTOMER,
            charge_type: "fee", charge_category: "fee", status: "draft",
            currency_code: "USD", amount_cents: amountCents,
            service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
            description: "W2 stored-method collection certification", metadata: {},
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

describe.runIf(runnable)("stored-method collection — live", () => {
    beforeAll(async () => {
        const client = supabase!;
        await client.from("orgs").upsert(
            { id: ORG, name: "Payments W2 collection certification", slug: "payments-w2-collect", status: "active" },
            { onConflict: "id" },
        );
        for (const id of [CUSTOMER, OTHER_CUSTOMER]) {
            await client.from("customers").upsert({ id, org_id: ORG, name: `W2 collect ${id.slice(-4)}` }, { onConflict: "id" });
        }
        await ensureAccountingPeriodCovers(client, ORG, TODAY);

        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_methods").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);

        const acct = await governedTestAccount(secret!);
        connectedAccount = String(acct.id);
        /*
         * The account ref is unique among ACTIVE merchants across all organisations, so this suite
         * takes the binding for its own org and gives it back in teardown. Asserted rather than
         * fired and forgotten: an insert that silently failed here would surface five tests later as
         * "this organization has no connected Stripe account", which is a long way from the cause.
         */
        await client.from("payment_provider_merchants")
            .update({ is_active: false })
            .eq("provider_account_ref", connectedAccount)
            .eq("is_active", true);

        const { error: merchantError } = await client.from("payment_provider_merchants").insert({
            org_id: ORG, processor: "stripe", provider_account_ref: connectedAccount,
            readiness: readinessFromStripeAccount(acct as { charges_enabled?: boolean }),
            ach_readiness: "not_connected",
            readiness_checked_at: new Date().toISOString(), created_by: ACTOR, updated_by: ACTOR,
        });
        if (merchantError) throw new Error(`could not bind the certification merchant: ${merchantError.message}`);

        /* A REAL platform-side card, owned by a real platform customer. */
        const customer = await defaultStripeFormCall("POST", "customers", { name: "W2 collection payer" }, {});
        const customerRef = String((customer.body as { id?: string }).id ?? "");
        const pm = await defaultStripeFormCall("POST", "payment_methods", { type: "card", "card[token]": "tok_visa" }, {});
        platformMethodRef = String((pm.body as { id?: string }).id ?? "");
        await defaultStripeFormCall("POST", `payment_methods/${platformMethodRef}/attach`, { customer: customerRef }, {});

        const { data: row, error } = await client.from("payment_methods").insert({
            org_id: ORG, payer_entity_type: "person", payer_entity_id: PAYER, customer_id: CUSTOMER,
            rail: "card", processor: "stripe",
            provider_customer_ref: customerRef, provider_method_ref: platformMethodRef,
            display_brand: "visa", display_last4: "4242",
            verification_state: "verified", usability_state: "usable",
            created_by: ACTOR,
        }).select("id").single();
        if (error) throw new Error(`could not store the certification method: ${error.message}`);
        storedMethodId = String((row as { id: string }).id);
    }, 120_000);

    afterAll(async () => {
        const client = supabase;
        if (!client) return;
        /* Unconditional: a failed case must not leave rows or attempts for the next run. */
        await client.from("payment_collection_attempts").delete().eq("org_id", ORG);
        await client.from("payment_methods").delete().eq("org_id", ORG);
        await client.from("payment_provider_merchants").delete().eq("org_id", ORG);
        await client.from("charges").delete().eq("org_id", ORG);
    });

    it("collects from the stored card through the existing engine, on the merchant's account", async () => {
        const chargeId = await postCharge(30_000);

        const out = await createCardCollection(supabase!, {
            orgId: ORG,
            chargeId,
            requestedAmountCents: 30_000,
            actorUserId: ACTOR,
            paymentMethodId: storedMethodId,
        });

        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        if (!out.ok) return;
        expect(out.paymentMethodId).toBe(storedMethodId);

        /* ONE attempt row — the same table Thread 8C certified, not a second ledger. */
        const { data: attempts } = await supabase!
            .from("payment_collection_attempts")
            .select("id, provider_account_ref, processor_state")
            .eq("org_id", ORG)
            .eq("charge_id", chargeId);
        expect(attempts).toHaveLength(1);
        expect((attempts as Array<{ provider_account_ref: string }>)[0].provider_account_ref).toBe(connectedAccount);

        /*
         * THE PAYMENTINTENT IS ON THE MERCHANT, and it is NOT the platform method — it carries the
         * clone. If it named the platform method, the charge would have been attempted against an
         * object the merchant cannot see.
         */
        const res = await fetch(`https://api.stripe.com/v1/payment_intents/${out.providerTransactionId}`, {
            headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": connectedAccount },
        });
        expect(res.status).toBe(200);
        const intent = (await res.json()) as { payment_method?: string; status?: string; confirmation_method?: string };
        expect(intent.payment_method, "the intent carries a method").toBeTruthy();
        expect(intent.payment_method).not.toBe(platformMethodRef);
        /* Confirmed server-side: there is no payer present to confirm it in a browser. */
        expect(["succeeded", "processing", "requires_action"]).toContain(String(intent.status));
    }, 120_000);

    it("a retry of the same intention collapses onto the same attempt, not a second charge", async () => {
        const chargeId = await postCharge(21_000);

        const first = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 21_000, actorUserId: ACTOR, paymentMethodId: storedMethodId,
        });
        const second = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 21_000, actorUserId: ACTOR, paymentMethodId: storedMethodId,
        });

        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.providerTransactionId).toBe(first.providerTransactionId);
        expect(second.reused).toBe(true);

        const { data: attempts } = await supabase!
            .from("payment_collection_attempts").select("id").eq("org_id", ORG).eq("charge_id", chargeId);
        expect(attempts, "a retry is not a second PaymentIntent against the family's card").toHaveLength(1);
    }, 120_000);

    it("a revoked method cannot collect, and nothing is attempted at the provider", async () => {
        const chargeId = await postCharge(11_000);
        const { data: row } = await supabase!.from("payment_methods").insert({
            org_id: ORG, payer_entity_type: "person", payer_entity_id: PAYER, customer_id: CUSTOMER,
            rail: "card", processor: "stripe",
            provider_customer_ref: "cus_revoked_cert", provider_method_ref: `pm_revoked_${Date.now()}`,
            verification_state: "verified", usability_state: "revoked", revoked_at: new Date().toISOString(),
            created_by: ACTOR,
        }).select("id").single();
        const revokedId = String((row as { id: string }).id);

        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 11_000, actorUserId: ACTOR, paymentMethodId: revokedId,
        });

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("method_not_usable");

        /* Refused BEFORE anything was created: no attempt row, so no PaymentIntent either. */
        const { data: attempts } = await supabase!
            .from("payment_collection_attempts").select("id").eq("org_id", ORG).eq("charge_id", chargeId);
        expect(attempts).toHaveLength(0);
    }, 60_000);

    it("a method scoped to another account cannot settle this family's obligation", async () => {
        const chargeId = await postCharge(9_000);
        const { data: row } = await supabase!.from("payment_methods").insert({
            org_id: ORG, payer_entity_type: "person", payer_entity_id: PAYER, customer_id: OTHER_CUSTOMER,
            rail: "card", processor: "stripe",
            provider_customer_ref: "cus_other_scope", provider_method_ref: `pm_scope_${Date.now()}`,
            verification_state: "verified", usability_state: "usable", created_by: ACTOR,
        }).select("id").single();
        const otherId = String((row as { id: string }).id);

        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 9_000, actorUserId: ACTOR, paymentMethodId: otherId,
        });

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason, "ownership is not authority over every family").toBe("method_wrong_account");
    }, 60_000);

    it("a bank method cannot be spent as a card", async () => {
        const chargeId = await postCharge(7_000);
        const { data: row } = await supabase!.from("payment_methods").insert({
            org_id: ORG, payer_entity_type: "person", payer_entity_id: PAYER, customer_id: CUSTOMER,
            rail: "ach", processor: "stripe",
            provider_customer_ref: "cus_bank_rail", provider_method_ref: `pm_bank_${Date.now()}`,
            display_brand: "TEST BANK", display_last4: "6789",
            mandate_ref: "mandate_cert", mandate_accepted_at: new Date().toISOString(),
            verification_state: "verified", usability_state: "usable", created_by: ACTOR,
        }).select("id").single();
        const bankId = String((row as { id: string }).id);

        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 7_000, actorUserId: ACTOR, rail: "card", paymentMethodId: bankId,
        });

        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("method_rail_mismatch");
    }, 60_000);

    /**
     * PAYER IS NOT RESPONSIBILITY, and using someone's card records the first without moving the
     * second. The method is owned by PAYER; the obligation belongs to the account.
     */
    it("records the method's owner as the payer, without touching who is responsible", async () => {
        const chargeId = await postCharge(13_000);

        const out = await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 13_000, actorUserId: ACTOR, paymentMethodId: storedMethodId,
        });
        expect(out.ok, !out.ok ? out.message : "").toBe(true);
        if (!out.ok) return;

        const { data: attempt } = await supabase!
            .from("payment_collection_attempts")
            .select("payer_person_id, billable_source_type, billable_source_id")
            .eq("id", out.attemptId)
            .single();
        const row = attempt as { payer_person_id: string | null; billable_source_type: string; billable_source_id: string };

        expect(row.payer_person_id, "the person whose card it was is recorded as the payer").toBe(PAYER);
        /* And the obligation still belongs to the ACCOUNT, not to the payer. */
        expect(row.billable_source_type).toBe("customer");
        expect(row.billable_source_id).toBe(CUSTOMER);
    }, 120_000);

    it("the stored method itself is unchanged by collecting with it", async () => {
        const before = await readMethod(supabase!, { orgId: ORG, methodId: storedMethodId });
        const chargeId = await postCharge(5_000);
        await createCardCollection(supabase!, {
            orgId: ORG, chargeId, requestedAmountCents: 5_000, actorUserId: ACTOR, paymentMethodId: storedMethodId,
        });
        const after = await readMethod(supabase!, { orgId: ORG, methodId: storedMethodId });

        /* Consuming a clone never consumes the source — the family's card stays on file. */
        expect(after?.providerMethodRef).toBe(before?.providerMethodRef);
        expect(after?.usabilityState).toBe("usable");
        expect(after?.verificationState).toBe("verified");
    }, 120_000);
});
