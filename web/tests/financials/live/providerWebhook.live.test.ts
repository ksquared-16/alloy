/**
 * THE PROVIDER TELLING US WHAT A MERCHANT CAN NOW DO.
 *
 * Every other event this handler models is about the fate of one payment. `account.updated` is about
 * whether an organisation can take payments AT ALL, so it needed the same admission discipline and
 * one more guard the others never did: the two Stripe worlds must not touch.
 *
 * A production Connect endpoint receives BOTH live and test deliveries. The merchant binding already
 * isolates them — a test account id and a live account id are different objects — but a mismatch
 * must be LOUD rather than merely improbable, and the evidence kept either way.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProviderAccount, defaultStripeJsonCall } from "@/lib/financials/payments/providerAccount";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";

function readTrusted(key: string): string | null {
    if (process.env[key]) return process.env[key] as string;
    try {
        const p = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        return readFileSync(p, "utf8").split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() || null;
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

/** This suite's own organisation — never the shared certification merchant. */
const ORG = "9c000000-0000-4000-8000-00000000e002";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret && whsec ? describe : describe.skip;

let accountRef = "";
let merchantId = "";

function signed(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac("sha256", whsec!).update(`${t}.${body}`).digest("hex")}`;
}

function accountUpdatedEvent(opts: { id?: string; account?: string; livemode?: boolean }): string {
    return JSON.stringify({
        id: opts.id ?? `evt_acct_${Math.random().toString(36).slice(2)}`,
        type: "account.updated",
        created: Math.floor(Date.now() / 1000),
        account: opts.account ?? accountRef,
        ...(opts.livemode === undefined ? {} : { livemode: opts.livemode }),
        data: { object: { id: opts.account ?? accountRef, object: "account" } },
    });
}

async function post(body: string) {
    return await handleStripeWebhook(supabase!, body, signed(body), whsec!);
}

describeLive("Payments W1 — the provider tells us a merchant changed", () => {
    beforeAll(async () => {
        const client = supabase!;
        await client
            .from("orgs")
            .upsert({ id: ORG, name: "Payments W1 webhook certification", slug: "payments-w1-webhook", status: "active" }, { onConflict: "id" });
        await client.from("payment_provider_merchants").update({ is_active: false }).eq("org_id", ORG).eq("is_active", true);

        const account = await createProviderAccount(
            { displayName: `Alloy W1 webhook ${Date.now()}`, country: "us" },
            defaultStripeJsonCall,
        );
        if (!account.ok) throw new Error(`could not create a provider account: ${account.message}`);
        accountRef = account.providerAccountRef;

        const { data, error } = await client
            .from("payment_provider_merchants")
            .insert({
                org_id: ORG,
                processor: "stripe",
                provider_account_ref: accountRef,
                readiness: "not_connected",
                ach_readiness: null,
                readiness_detail: {},
                created_by: ACTOR,
                updated_by: ACTOR,
            })
            .select("id")
            .single();
        if (error) throw new Error(error.message);
        merchantId = (data as { id: string }).id;
    }, 120_000);

    afterAll(async () => {
        await supabase!.from("payment_provider_merchants").update({ is_active: false }).eq("org_id", ORG).eq("is_active", true);
        if (accountRef) {
            await fetch(`https://api.stripe.com/v1/accounts/${accountRef}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
            }).catch(() => undefined);
        }
    });

    it("resolves the organization from the merchant binding and records the provider's answer", async () => {
        const result = await post(accountUpdatedEvent({}));
        expect(result.outcome, result.detail).toBe("applied");
        expect(result.orgId, "tenancy came from the binding, never the payload").toBe(ORG);

        const { data } = await supabase!
            .from("payment_provider_merchants")
            .select("readiness, ach_readiness, readiness_checked_at")
            .eq("id", merchantId)
            .single();
        const row = data as { readiness: string; readiness_checked_at: string | null };
        // A fresh account has submitted nothing, so the honest answer is not `ready` — and the point
        // is that the readiness now came from the PROVIDER rather than from the seeded placeholder.
        expect(row.readiness).not.toBe("not_connected");
        expect(row.readiness).not.toBe("ready");
        expect(row.readiness_checked_at).toBeTruthy();
    }, 60_000);

    it("is idempotent: the same delivery twice changes nothing the second time", async () => {
        const body = accountUpdatedEvent({ id: `evt_acct_dup_${Math.random().toString(36).slice(2)}` });
        expect((await post(body)).outcome).toBe("applied");
        expect((await post(body)).outcome, "the database decides duplicates, not a lookup").toBe("duplicate");
    }, 60_000);

    it("fails closed on an account no organization has claimed", async () => {
        const result = await post(accountUpdatedEvent({ account: "acct_never_bound_to_alloy" }));
        expect(result.outcome).toBe("unattributed");
        expect(result.orgId, "no tenant is guessed").toBeUndefined();
    }, 60_000);

    it("refuses to cross environments, and keeps the evidence", async () => {
        /*
         * This runtime collects with a TEST key, so a delivery claiming livemode is a live event and
         * must not touch test merchant state. Storing it and refusing is the whole behaviour: an
         * event arriving in the wrong world is exactly what somebody will need to see.
         */
        const eventId = `evt_acct_live_${Math.random().toString(36).slice(2)}`;
        const result = await post(accountUpdatedEvent({ id: eventId, livemode: true }));
        expect(result.outcome).toBe("rejected");
        expect(result.detail).toMatch(/livemode/i);

        const { data } = await supabase!
            .from("payment_provider_events")
            .select("disposition, disposition_detail")
            .eq("provider_event_id", eventId)
            .single();
        expect((data as { disposition: string }).disposition, "evidence is retained").toBe("rejected");
    }, 60_000);

    it("does not revive a withdrawn merchant because the provider said something", async () => {
        const client = supabase!;
        await client.from("payment_provider_merchants").update({ is_active: false }).eq("id", merchantId);
        const result = await post(accountUpdatedEvent({}));
        /*
         * A withdrawn association resolves to NO TENANT — tenancy only ever comes from an active
         * merchant binding — so the handler fails closed before it can update anything. That is a
         * stronger answer than "stale": after a disconnect, the provider can say whatever it likes
         * and Alloy has nobody to say it about.
         */
        expect(result.outcome, "a disconnected merchant stays disconnected").toBe("unattributed");

        const { data } = await client
            .from("payment_provider_merchants")
            .select("is_active")
            .eq("id", merchantId)
            .single();
        expect((data as { is_active: boolean }).is_active).toBe(false);
        // Put it back so the suite's own teardown is the thing that withdraws it.
        await client.from("payment_provider_merchants").update({ is_active: true }).eq("id", merchantId);
    }, 60_000);
});
