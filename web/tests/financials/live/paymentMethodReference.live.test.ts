/**
 * THE STORED PAYMENT METHOD, AGAINST THE REAL DATABASE AND THE REAL PROVIDER.
 *
 * The unit suite proves the ACT. This proves the two things a fake cannot:
 *
 *   THE DATABASE'S OWN GUARANTEES — the partial unique index that makes one default per account and
 *   rail structural, the function that moves it atomically, and the trigger that refuses to let a
 *   stored instrument change owner. A fake store that "implements" those is just the test agreeing
 *   with itself.
 *
 *   THE PROVIDER'S ACTUAL CONTRACT — that a platform customer and a SetupIntent are created with the
 *   parameters W2 sends, and above all that a platform PaymentMethod CLONES onto a connected
 *   merchant. That clone is the load-bearing claim of the whole architecture: it is what lets one
 *   durable method survive merchant replacement.
 *
 * It runs on an organisation this suite owns, for the reason W1 learned the hard way: the shared
 * certification merchant is infrastructure every other payment suite depends on.
 *
 * Requires: cert stack up, STRIPE_SECRET_KEY in the trusted-secrets slot.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";
import {
    completeAddPaymentMethod,
    materializeMethodForMerchant,
    readAccountMethods,
    readMethod,
    revokePaymentMethod,
    setDefaultPaymentMethod,
    type PaymentMethodRecord,
} from "@/lib/financials/payments/paymentMethodService";
import {
    createMethodSetup,
    createPlatformCustomer,
    defaultStripeFormCall,
    retrievePaymentMethod,
} from "@/lib/financials/payments/providerPaymentMethod";

import { governedTestAccount } from "./certEnvironment";

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

/** This suite's own subject. Never the primary certification organisation. */
const ORG = "9c000000-0000-4000-8000-00000000e003";
const CUSTOMER = "9c000000-0000-4000-8000-0000000c0003";
const OTHER_CUSTOMER = "9c000000-0000-4000-8000-0000000c0004";
const PAYER = "9c000000-0000-4000-8000-0000000d0003";
const OTHER_PAYER = "9c000000-0000-4000-8000-0000000d0004";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

const supabase: SupabaseClient | null = env ? createClient(env.url, env.serviceKey) : null;
const runnable = Boolean(supabase && secret);

function webhookSecret(): string | null {
    if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
    try {
        const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        const line = readFileSync(p, "utf8").split("\n").find((l) => l.startsWith("STRIPE_WEBHOOK_SECRET="));
        return line?.slice("STRIPE_WEBHOOK_SECRET=".length).trim() || null;
    } catch {
        return null;
    }
}
const whsec = webhookSecret();

function signed(body: string, secret: string): string {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** A real card PaymentMethod on the platform, from Stripe's own test instrument. */
async function platformCardMethod(customerRef: string): Promise<string> {
    const created = await defaultStripeFormCall("POST", "payment_methods", { type: "card", "card[token]": "tok_visa" }, {});
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const pmId = String((created.body as { id?: string }).id ?? "");
    const attached = await defaultStripeFormCall(
        "POST",
        `payment_methods/${pmId}/attach`,
        { customer: customerRef },
        {},
    );
    expect(attached.status, JSON.stringify(attached.body)).toBe(200);
    return pmId;
}

/** Insert a canonical row directly, for the structural cases that are about the DATABASE. */
async function seedMethod(over: Record<string, unknown> = {}): Promise<PaymentMethodRecord> {
    const { data, error } = await supabase!
        .from("payment_methods")
        .insert({
            org_id: ORG,
            payer_entity_type: "person",
            payer_entity_id: PAYER,
            customer_id: CUSTOMER,
            rail: "card",
            processor: "stripe",
            provider_customer_ref: `cus_seed_${Math.random().toString(36).slice(2, 10)}`,
            provider_method_ref: `pm_seed_${Math.random().toString(36).slice(2, 12)}`,
            display_brand: "visa",
            display_last4: "4242",
            verification_state: "verified",
            usability_state: "usable",
            ...over,
        })
        .select("*")
        .single();
    if (error) throw new Error(`could not seed a payment method: ${error.message}`);
    return { id: String((data as { id: string }).id) } as PaymentMethodRecord;
}

describe.runIf(runnable)("the payment method reference — live, against the database and the provider", () => {
    let connectedAccountRef = "";

    beforeAll(async () => {
        // Idempotent: this suite owns these rows and re-running must not need a clean stack.
        await supabase!
            .from("orgs")
            .upsert({ id: ORG, name: "Payments W2 certification", slug: "payments-w2-cert", status: "active" }, { onConflict: "id" });
        for (const id of [CUSTOMER, OTHER_CUSTOMER]) {
            await supabase!
                .from("customers")
                .upsert({ id, org_id: ORG, name: `W2 cert account ${id.slice(-4)}` }, { onConflict: "id" });
        }
        const account = await governedTestAccount(secret!);
        connectedAccountRef = String(account.id ?? "");
    }, 60_000);

    /*
     * EACH CASE STARTS EMPTY.
     *
     * Defaults are per account and rail, so a default left by an earlier case is indistinguishable
     * from one this case created — which is exactly how the revocation case first "passed" while
     * reading another test's bank default. Isolation here is cheaper than scoping every assertion.
     */
    beforeEach(async () => {
        if (supabase) await supabase.from("payment_methods").delete().eq("org_id", ORG);
    });

    afterAll(async () => {
        /* Unconditional: a failed case must not leave rows for the next run to inherit. */
        if (supabase) await supabase.from("payment_methods").delete().eq("org_id", ORG);
    });

    // ── THE DATABASE'S OWN GUARANTEES ────────────────────────────────────────────────────────────

    it("a second default for the same account and rail is refused by the database", async () => {
        const first = await seedMethod();
        await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: first.id, actorUserId: ACTOR });
        const second = await seedMethod();

        /* Not a service check: the partial unique index itself, which two concurrent writers hit. */
        const { error } = await supabase!.from("payment_methods").update({ is_default: true }).eq("id", second.id);
        expect(error, "the index must refuse a second default").toBeTruthy();
        expect(error!.message).toMatch(/uq_payment_methods_default_account_rail|duplicate key/i);
    });

    it("setting a new default moves it atomically — never two, never none", async () => {
        const first = await seedMethod();
        const second = await seedMethod();
        await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: first.id, actorUserId: ACTOR });

        const moved = await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: second.id, actorUserId: ACTOR });
        expect(moved.ok).toBe(true);

        const rows = await readAccountMethods(supabase!, { orgId: ORG, customerId: CUSTOMER });
        const defaults = rows.filter((m) => m.rail === "card" && m.isDefault);
        expect(defaults.map((m) => m.id)).toEqual([second.id]);
    });

    it("a bank default and a card default are independent", async () => {
        const card = await seedMethod();
        const bank = await seedMethod({ rail: "ach", display_brand: "TEST BANK", display_last4: "6789", mandate_ref: "mandate_live", mandate_accepted_at: new Date().toISOString() });

        await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: card.id, actorUserId: ACTOR });
        await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: bank.id, actorUserId: ACTOR });

        const rows = await readAccountMethods(supabase!, { orgId: ORG, customerId: CUSTOMER });
        expect(rows.find((m) => m.id === card.id)?.isDefault, "setting the bank default did not clear the card").toBe(true);
        expect(rows.find((m) => m.id === bank.id)?.isDefault).toBe(true);
    });

    it("revoking the default leaves the account with NO default — nothing is promoted", async () => {
        const first = await seedMethod();
        const second = await seedMethod();
        await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: first.id, actorUserId: ACTOR });

        const revoked = await revokePaymentMethod(supabase!, { orgId: ORG, methodId: first.id, reason: "certification" });
        expect(revoked.ok).toBe(true);

        const rows = await readAccountMethods(supabase!, { orgId: ORG, customerId: CUSTOMER });
        expect(rows.filter((m) => m.isDefault), "a family's money must not move to a method nobody chose").toHaveLength(0);
        /* And the other method is still there, usable, simply not chosen. */
        expect(rows.find((m) => m.id === second.id)?.usabilityState).toBe("usable");
    });

    it("a method that cannot be used cannot be made the default", async () => {
        const blocked = await seedMethod({ usability_state: "blocked", verification_state: "pending" });
        const out = await setDefaultPaymentMethod(supabase!, { orgId: ORG, methodId: blocked.id, actorUserId: ACTOR });
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe("not_usable");
    });

    it("a stored instrument cannot change owner, account, rail or provider handle in place", async () => {
        const method = await seedMethod();

        for (const patch of [
            { payer_entity_id: OTHER_PAYER },
            { customer_id: OTHER_CUSTOMER },
            { rail: "ach" },
            { provider_method_ref: "pm_somebody_elses" },
        ]) {
            const { error } = await supabase!.from("payment_methods").update(patch).eq("id", method.id);
            expect(error, `the trigger must refuse ${JSON.stringify(patch)}`).toBeTruthy();
            expect(error!.message).toMatch(/is bound/i);
        }
    });

    it("one provider method belongs to ONE Alloy method, across organizations", async () => {
        const mine = await seedMethod();
        const { data: row } = await supabase!
            .from("payment_methods")
            .select("provider_method_ref")
            .eq("id", mine.id)
            .single();
        const ref = String((row as { provider_method_ref: string }).provider_method_ref);

        const { error } = await supabase!.from("payment_methods").insert({
            org_id: ORG,
            payer_entity_type: "person",
            payer_entity_id: OTHER_PAYER,
            customer_id: OTHER_CUSTOMER,
            rail: "card",
            processor: "stripe",
            provider_customer_ref: "cus_other",
            provider_method_ref: ref,
        });
        expect(error, "a second claim on one provider instrument must be refused").toBeTruthy();
        expect(error!.message).toMatch(/uq_payment_methods_provider_method_ref|duplicate key/i);
    });

    // ── THE PROVIDER'S ACTUAL CONTRACT ───────────────────────────────────────────────────────────

    it("a platform customer and a card setup are created with the parameters W2 sends", async () => {
        const customer = await createPlatformCustomer(defaultStripeFormCall, {
            email: "w2-cert@example.invalid",
            name: "W2 certification payer",
            alloyPayerId: PAYER,
        });
        expect(customer.ok, !customer.ok ? customer.message : "").toBe(true);
        if (!customer.ok) return;
        expect(customer.customerRef).toMatch(/^cus_/);

        const setup = await createMethodSetup(defaultStripeFormCall, { customerRef: customer.customerRef, rail: "card" });
        expect(setup.ok, !setup.ok ? setup.message : "").toBe(true);
        if (!setup.ok) return;
        expect(setup.setupRef).toMatch(/^seti_/);

        /*
         * AND IT CARRIES NO `on_behalf_of`, which is the parameter that would pin the resulting
         * method to one connected account and break cross-merchant reuse. Read back from Stripe
         * rather than asserted about the request body.
         */
        const read = await defaultStripeFormCall("GET", `setup_intents/${setup.setupRef}`, null, {});
        expect(read.status).toBe(200);
        expect((read.body as { on_behalf_of?: unknown }).on_behalf_of ?? null).toBeNull();
        expect((read.body as { usage?: string }).usage).toBe("off_session");
    }, 60_000);

    it("a bank setup is accepted with the verification options W2 asks for", async () => {
        const customer = await createPlatformCustomer(defaultStripeFormCall, {
            email: "w2-cert-bank@example.invalid",
            name: "W2 certification bank payer",
            alloyPayerId: PAYER,
        });
        expect(customer.ok).toBe(true);
        if (!customer.ok) return;

        const setup = await createMethodSetup(defaultStripeFormCall, { customerRef: customer.customerRef, rail: "ach" });
        expect(setup.ok, !setup.ok ? setup.message : "").toBe(true);
        if (!setup.ok) return;

        const read = await defaultStripeFormCall("GET", `setup_intents/${setup.setupRef}`, null, {});
        const body = read.body as {
            payment_method_types?: string[];
            payment_method_options?: { us_bank_account?: { verification_method?: string } };
            on_behalf_of?: unknown;
        };
        expect(body.payment_method_types).toContain("us_bank_account");
        expect(body.payment_method_options?.us_bank_account?.verification_method).toBe("automatic");
        expect(body.on_behalf_of ?? null, "a mandate taken on behalf of one merchant cannot be reused").toBeNull();
    }, 60_000);

    /**
     * THE LOAD-BEARING CLAIM OF THE WHOLE ARCHITECTURE.
     *
     * If a platform method cannot be cloned onto a connected merchant, the platform-handle model is
     * wrong and every family would need one stored method per merchant. This proves it against the
     * real provider and the real connected account.
     */
    it("a platform method CLONES onto the connected merchant, and the clone is a different object", async () => {
        const customer = await createPlatformCustomer(defaultStripeFormCall, {
            email: "w2-cert-clone@example.invalid",
            name: "W2 clone payer",
            alloyPayerId: PAYER,
        });
        expect(customer.ok).toBe(true);
        if (!customer.ok) return;

        const platformMethodRef = await platformCardMethod(customer.customerRef);

        const cloned = await materializeMethodForMerchant(
            {
                providerCustomerRef: customer.customerRef,
                providerMethodRef: platformMethodRef,
            } as PaymentMethodRecord,
            connectedAccountRef,
        );
        expect(cloned.ok, !cloned.ok ? cloned.message : "").toBe(true);
        if (!cloned.ok) return;

        expect(cloned.clonedMethodRef).toMatch(/^pm_/);
        expect(cloned.clonedMethodRef, "a clone is an independent object, not the same id").not.toBe(platformMethodRef);

        /* It exists ON THE MERCHANT, and carries the same safe display as the platform original. */
        const onMerchant = await retrievePaymentMethod(defaultStripeFormCall, cloned.clonedMethodRef, connectedAccountRef);
        expect(onMerchant.ok).toBe(true);
        if (!onMerchant.ok) return;
        expect(onMerchant.display.last4).toBe("4242");
        expect(onMerchant.display.rail).toBe("card");

        /* And the PLATFORM original is untouched — consuming a clone never consumes the source. */
        const onPlatform = await retrievePaymentMethod(defaultStripeFormCall, platformMethodRef);
        expect(onPlatform.ok).toBe(true);
    }, 90_000);

    /**
     * THE CANONICAL ROW, WRITTEN FROM A REALLY CONFIRMED SETUP.
     *
     * The setup is confirmed server-side with Stripe's own test instrument, so every fact on the row
     * — the method reference, the brand, the last four, the state — comes from the provider rather
     * than from a fixture.
     */
    it("a confirmed setup produces one canonical method carrying the provider's own facts", async () => {
        const customer = await createPlatformCustomer(defaultStripeFormCall, {
            email: "w2-cert-complete@example.invalid",
            name: "W2 completion payer",
            alloyPayerId: PAYER,
        });
        expect(customer.ok).toBe(true);
        if (!customer.ok) return;

        const setup = await createMethodSetup(defaultStripeFormCall, { customerRef: customer.customerRef, rail: "card" });
        expect(setup.ok).toBe(true);
        if (!setup.ok) return;

        const confirmed = await defaultStripeFormCall(
            "POST",
            `setup_intents/${setup.setupRef}/confirm`,
            { payment_method: "pm_card_visa", return_url: "https://example.invalid/return" },
            {},
        );
        expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
        expect((confirmed.body as { status?: string }).status).toBe("succeeded");

        const done = await completeAddPaymentMethod(supabase!, {
            orgId: ORG,
            customerId: CUSTOMER,
            payerEntityType: "person",
            payerEntityId: PAYER,
            rail: "card",
            setupRef: setup.setupRef,
            providerCustomerRef: customer.customerRef,
            actorUserId: ACTOR,
            makeDefault: true,
        });

        expect(done.ok, !done.ok ? done.message : "").toBe(true);
        if (!done.ok) return;
        expect(done.method.verificationState).toBe("verified");
        expect(done.method.usabilityState).toBe("usable");
        expect(done.method.last4).toBe("4242");
        expect(done.method.isDefault).toBe(true);
        expect(done.method.providerMethodRef).toMatch(/^pm_/);

        /*
         * AND NOTHING SENSITIVE LANDED. Read the row back raw and look at every value: Alloy has no
         * column for a credential, so there is nowhere for one to be even if the provider sent it.
         */
        const { data: raw } = await supabase!.from("payment_methods").select("*").eq("id", done.method.id).single();
        const serialized = JSON.stringify(raw);
        expect(serialized).not.toMatch(/routing/i);
        expect(serialized).not.toMatch(/account_number/i);
        expect(serialized).not.toMatch(/cvc|cvv/i);
        expect(serialized, "no full card number in any field").not.toMatch(/\b4242424242424242\b/);
    }, 90_000);

    /**
     * VERIFICATION COMPLETING IS THE CASE THAT MATTERS MOST, and it arrives as an EVENT.
     *
     * A bank account awaiting microdeposits is stored `pending` / `blocked`. Nobody in Alloy will
     * ever click anything to change that — the provider says so, days later, and the method has to
     * become usable on its own. This drives the real signed webhook path end to end.
     */
    it("a completed verification makes a pending bank method usable, through the signed webhook", async () => {
        if (!whsec) return; /* No webhook secret in this runtime; the hermetic suite covers the mapping. */

        const ref = `pm_verify_${Date.now()}`;
        const pending = await seedMethod({
            rail: "ach",
            provider_method_ref: ref,
            display_brand: "TEST BANK",
            display_last4: "6789",
            verification_state: "pending",
            usability_state: "blocked",
            mandate_ref: "mandate_verify",
            mandate_accepted_at: new Date().toISOString(),
        });

        const body = JSON.stringify({
            id: `evt_verify_${Date.now()}`,
            type: "setup_intent.succeeded",
            data: { object: { id: "seti_verify", object: "setup_intent", payment_method: ref } },
        });
        const result = await handleStripeWebhook(supabase!, body, signed(body, whsec), whsec);
        expect(result.outcome, result.detail).toBe("applied");

        const after = await readMethod(supabase!, { orgId: ORG, methodId: pending.id });
        expect(after?.verificationState).toBe("verified");
        expect(after?.usabilityState, "the family can now be charged without anyone intervening").toBe("usable");
        expect(after?.verifiedAt).toBeTruthy();

        /* And the event changed nothing about WHOSE method it is. */
        expect(after?.payerEntityId).toBe(PAYER);
        expect(after?.customerId).toBe(CUSTOMER);
        expect(after?.rail).toBe("ach");
    }, 60_000);

    /**
     * THE PROMISE THE WHOLE HANDLE MODEL EXISTS TO KEEP.
     *
     * An organisation replaces its merchant. Every family's stored card must still work, without one
     * of them re-entering anything — which is only true because the durable handle is on the platform
     * and the connected-account object is derived per collection.
     */
    it("a canonical method survives merchant replacement and works with the NEW merchant", async () => {
        const customer = await createPlatformCustomer(defaultStripeFormCall, {
            email: "w2-cert-replace@example.invalid",
            name: "W2 replacement payer",
            alloyPayerId: PAYER,
        });
        expect(customer.ok).toBe(true);
        if (!customer.ok) return;
        const platformMethodRef = await platformCardMethod(customer.customerRef);

        const { data: row } = await supabase!.from("payment_methods").insert({
            org_id: ORG, payer_entity_type: "person", payer_entity_id: PAYER, customer_id: CUSTOMER,
            rail: "card", processor: "stripe",
            provider_customer_ref: customer.customerRef, provider_method_ref: platformMethodRef,
            display_brand: "visa", display_last4: "4242",
            verification_state: "verified", usability_state: "usable", created_by: ACTOR,
        }).select("id").single();
        const methodId = String((row as { id: string }).id);

        const before = await readMethod(supabase!, { orgId: ORG, methodId });

        /*
         * The organisation's merchant changes. W2 stores no merchant on the method at all, so
         * "replacement" is simply: derive the connected-account object for a DIFFERENT account ref.
         * Here the same governed account stands in for the new merchant — what is being proved is
         * that the canonical row is not a function of any merchant.
         */
        const materialized = await materializeMethodForMerchant(before as never, connectedAccountRef);
        expect(materialized.ok, !materialized.ok ? materialized.message : "").toBe(true);

        const after = await readMethod(supabase!, { orgId: ORG, methodId });
        expect(after?.providerMethodRef, "the canonical row still names the same durable handle").toBe(before?.providerMethodRef);
        expect(after?.usabilityState).toBe("usable");
        /* Nothing on the row names a merchant, which is why replacement cannot invalidate it. */
        const { data: raw } = await supabase!.from("payment_methods").select("*").eq("id", methodId).single();
        expect(Object.keys(raw as Record<string, unknown>)).not.toContain("merchant_id");
        expect(JSON.stringify(raw)).not.toContain(connectedAccountRef);
    }, 90_000);
});
