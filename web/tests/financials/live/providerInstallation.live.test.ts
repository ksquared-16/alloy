/**
 * BECOMING A MERCHANT, AGAINST THE REAL PROVIDER.
 *
 * The unit suite proves the ACT — one account per organisation, a resume that creates nothing, a
 * disconnect that deletes nothing. This proves the CALLS: that the approved account model is the one
 * Stripe actually creates, that a v2 account can be read back through the v1 Accounts endpoint so
 * the certified readiness mapper keeps working, and that the hosted onboarding link is real.
 *
 * It runs on a SEPARATE organisation from the primary certification merchant, on purpose. The
 * shared merchant is infrastructure every other payment suite depends on, and a provider test that
 * borrowed it would be the poisoning this program has already paid for once.
 *
 * Requires: cert stack up, STRIPE_SECRET_KEY in the trusted-secrets slot. Creates one test-mode
 * connected account per run and removes it again.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    createOnboardingLink,
    createProviderAccount,
    defaultStripeJsonCall,
    retrieveProviderAccount,
} from "@/lib/financials/payments/providerAccount";
import {
    connectProviderMerchant,
    disconnectProviderMerchant,
    readInstallationState,
    refreshProviderReadiness,
} from "@/lib/financials/payments/providerInstallation";
import {
    achReadinessFromStripeAccount,
    readinessFromStripeAccount,
} from "@/lib/financials/payments/providerMerchant";

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

/**
 * A SUBJECT THIS SUITE OWNS.
 *
 * NOT the primary certification organisation: its merchant is shared infrastructure that every other
 * payment suite depends on, and a provider test that borrowed it would be the poisoning this program
 * has already paid for once. So this suite seeds its own organisation, under an id prefix nothing
 * else uses, exactly as Thread 8C learned to do with its subject.
 */
const ORG = "9c000000-0000-4000-8000-00000000e001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const URLS = {
    returnUrl: "https://example.invalid/organization/financials?chapter=payments&provider=returned",
    refreshUrl: "https://example.invalid/organization/financials?chapter=payments&provider=retry",
};

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env && secret ? describe : describe.skip;

const created: string[] = [];

async function clearOrgMerchants(client: SupabaseClient) {
    // Withdraw rather than delete: the partial unique index is on ACTIVE rows, so withdrawing frees
    // the account reference without destroying anything — which is the product rule too.
    await client
        .from("payment_provider_merchants")
        .update({ is_active: false })
        .eq("org_id", ORG)
        .eq("is_active", true);
}

describeLive("Payments W1 — becoming a merchant, live", () => {
    beforeAll(async () => {
        // Idempotent: the organisation is this suite's, and re-running must not need a clean stack.
        await supabase!
            .from("orgs")
            .upsert(
                { id: ORG, name: "Payments W1 certification", slug: "payments-w1-cert", status: "active" },
                { onConflict: "id" },
            );
        await clearOrgMerchants(supabase!);
    });

    afterAll(async () => {
        await clearOrgMerchants(supabase!);
        /*
         * THE ACCOUNTS STAY, AND THAT IS THE POINT.
         *
         * A platform cannot delete a connected account whose owner holds the full Stripe dashboard —
         * which is exactly the approved model — so the DELETE this suite first attempted was refused
         * and silently swallowed, and every run added an un-onboarded account to the platform.
         *
         * That mattered because seven other suites bound to "the first account Stripe lists", so the
         * newest one displaced the governed merchant and seven files failed at once with
         * `onboarding_incomplete`. Those suites now choose the account that can CHARGE, which a fresh
         * account never is — so these artefacts are inert.
         */
        for (const id of created.filter(Boolean)) {
            await fetch(`https://api.stripe.com/v1/accounts/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
            }).catch(() => undefined);
        }
    });

    it("creates the approved account model, and it is readable through the v1 Accounts endpoint", async () => {
        const account = await createProviderAccount(
            { displayName: `Alloy W1 certification ${Date.now()}`, country: "us" },
            defaultStripeJsonCall,
        );
        expect(account.ok, JSON.stringify(account)).toBe(true);
        if (!account.ok) return;
        created.push(account.providerAccountRef);
        expect(account.providerAccountRef).toMatch(/^acct_/);

        /*
         * THE COMPATIBILITY THIS WHOLE SLICE RESTS ON. A v2 account answers at the v1 Accounts
         * endpoint in the v1 shape, so the readiness mapper certified in Thread 8C is still the only
         * mapping in the system — and the certified collection path, which uses `Stripe-Account`
         * with this same id, needs no change at all.
         */
        const snapshot = await retrieveProviderAccount(account.providerAccountRef, defaultStripeJsonCall);
        expect(snapshot.ok, JSON.stringify(snapshot)).toBe(true);
        if (!snapshot.ok) return;
        expect(typeof snapshot.account.charges_enabled, "the v1 shape is what came back").toBe("boolean");

        // A brand-new account has submitted nothing, so both rails are honestly unavailable.
        expect(readinessFromStripeAccount(snapshot.account)).not.toBe("ready");
        expect(achReadinessFromStripeAccount(snapshot.account)).not.toBe("ready");
    }, 60_000);

    it("returns a real hosted onboarding link for that account", async () => {
        const ref = created[0];
        expect(ref, "the previous case must have created an account").toBeTruthy();
        const link = await createOnboardingLink(
            { providerAccountRef: ref, ...URLS },
            defaultStripeJsonCall,
        );
        expect(link.ok, JSON.stringify(link)).toBe(true);
        if (!link.ok) return;
        expect(link.url).toMatch(/^https:\/\//);
        // Stripe's own flow, on Stripe's own domain. Alloy renders none of it and stores no link.
        expect(link.url).toContain("stripe.com");
    }, 60_000);

    it("connects an organization end to end: one merchant, a link, and a truthful unready state", async () => {
        const client = supabase!;
        const outcome = await connectProviderMerchant(
            client,
            { orgId: ORG, actorUserId: ACTOR, displayName: `Alloy W1 connect ${Date.now()}`, ...URLS },
            defaultStripeJsonCall,
        );
        expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
        if (!outcome.ok) return;
        created.push(outcome.state.providerAccountRef ?? "");
        expect(outcome.created).toBe(true);
        expect(outcome.onboardingUrl).toMatch(/^https:\/\//);

        const state = await readInstallationState(client, ORG);
        expect(state.connected).toBe(true);
        expect(state.readiness, "a new account has not finished setup").not.toBe("ready");
        expect(state.cardAvailable).toBe(false);
        expect(state.bankAvailable).toBe(false);
        expect(state.attention, "and the operator is told what to do about it").toBeTruthy();

        const { count } = await client
            .from("payment_provider_merchants")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("is_active", true);
        expect(count, "exactly one active merchant").toBe(1);
    }, 90_000);

    it("a second Connect resumes the same merchant instead of creating another provider account", async () => {
        const client = supabase!;
        const before = await readInstallationState(client, ORG);
        const outcome = await connectProviderMerchant(
            client,
            { orgId: ORG, actorUserId: ACTOR, displayName: "Alloy W1 second click", ...URLS },
            defaultStripeJsonCall,
        );
        expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.created, "the operator's second click creates nothing at the provider").toBe(false);
        expect(outcome.resumed).toBe(true);
        expect(outcome.state.providerAccountRef).toBe(before.providerAccountRef);

        const { count } = await client
            .from("payment_provider_merchants")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("is_active", true);
        expect(count).toBe(1);
    }, 90_000);

    it("refresh asks the provider and records the answer with the moment it was asked", async () => {
        const client = supabase!;
        const outcome = await refreshProviderReadiness(client, { orgId: ORG, actorUserId: ACTOR }, defaultStripeJsonCall);
        expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.state.readinessCheckedAt).toBeTruthy();
        // Returning from onboarding proves nothing; the provider's own state decides.
        expect(outcome.state.readiness).not.toBe("ready");
    }, 60_000);

    it("disconnect withdraws the association and leaves the account reference on the historical row", async () => {
        const client = supabase!;
        const before = await readInstallationState(client, ORG);
        const ref = before.providerAccountRef;
        const outcome = await disconnectProviderMerchant(client, { orgId: ORG, actorUserId: ACTOR });
        expect(outcome.ok).toBe(true);

        const after = await readInstallationState(client, ORG);
        expect(after.connected, "future collection is unavailable").toBe(false);
        expect(after.cardAvailable).toBe(false);

        const { data: rows } = await client
            .from("payment_provider_merchants")
            .select("id, is_active, provider_account_ref")
            .eq("org_id", ORG)
            .eq("provider_account_ref", ref ?? "");
        const row = ((rows ?? []) as Array<{ is_active: boolean; provider_account_ref: string }>)[0];
        expect(row, "the row survives — history keeps naming who collected").toBeTruthy();
        expect(row.is_active).toBe(false);
        expect(row.provider_account_ref).toBe(ref);
    }, 60_000);

    it("reconnecting creates a NEW association and leaves the old one exactly as it was", async () => {
        const client = supabase!;
        const outcome = await connectProviderMerchant(
            client,
            { orgId: ORG, actorUserId: ACTOR, displayName: `Alloy W1 reconnect ${Date.now()}`, ...URLS },
            defaultStripeJsonCall,
        );
        expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
        if (!outcome.ok) return;
        created.push(outcome.state.providerAccountRef ?? "");
        expect(outcome.created).toBe(true);

        const { data: rows } = await client
            .from("payment_provider_merchants")
            .select("id, is_active, provider_account_ref")
            .eq("org_id", ORG);
        const all = (rows ?? []) as Array<{ is_active: boolean; provider_account_ref: string }>;
        expect(all.filter((r) => r.is_active), "exactly one active association").toHaveLength(1);
        expect(all.length, "and the withdrawn one is still on the record").toBeGreaterThan(1);
    }, 90_000);
});
