/**
 * SLICE C — WHICH MERCHANT COLLECTS, against real Postgres and a REAL Stripe connected account.
 *
 * The Director's topology makes each childcare provider the merchant for its own families, so the
 * question "whose account does this money land in" is a security question before it is a product
 * one. These cases prove the server answers it from the database and refuses when it cannot —
 * including the refusal that matters most, which is the one that does NOT quietly fall back to
 * Alloy's platform account.
 *
 * The readiness half is certified against Stripe itself rather than a fixture: the test reads the
 * real test-mode connected account and maps its own `charges_enabled` / `details_submitted` through
 * the same function collection uses. A mock could not fail the way Stripe fails.
 *
 * Requires: cert stack up, and STRIPE_SECRET_KEY resolvable from the trusted-secrets slot.
 * Neither the key nor any account secret is printed; only ids and booleans appear.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
    readinessFromStripeAccount,
    resolveCollectionMerchant,
    resolveOrgForConnectedAccount,
} from "@/lib/financials/payments/providerMerchant";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

/** The trusted-host slot — the only place a Stripe key is read from. Never logged. */
function stripeSecret(): string | null {
    if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
    try {
        const p = resolve(
            homedir(),
            ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env",
        );
        const line = readFileSync(p, "utf8")
            .split("\n")
            .find((l) => l.startsWith("STRIPE_SECRET_KEY="));
        const v = line?.slice("STRIPE_SECRET_KEY=".length).trim();
        return v || null;
    } catch {
        return null;
    }
}

const env = certEnv();
const secret = stripeSecret();
const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;

const describeLive = env && secret ? describe : describe.skip;

async function stripeGet(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${secret}` },
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/**
 * Merchants are pinned by the attempts that used them — `merchant_id` is ON DELETE RESTRICT,
 * because the account that collected money must stay nameable. So teardown removes the dependents
 * first, and ASSERTS the delete rather than ignoring its error: a silently failed cleanup leaves the
 * previous merchant active and makes the next case fail for a reason that has nothing to do with it,
 * which is exactly how this file first went red.
 */
async function clearMerchants(client: SupabaseClient) {
    const { data: attempts } = await client
        .from("payment_collection_attempts").select("id").in("org_id", [ORG, OTHER_ORG]);
    const attemptIds = ((attempts ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (attemptIds.length) {
        await client.from("payment_provider_events").delete().in("collection_attempt_id", attemptIds);
        await client.from("payment_collection_attempts").delete().in("id", attemptIds);
    }
    const { error } = await client
        .from("payment_provider_merchants").delete().in("org_id", [ORG, OTHER_ORG]);
    if (error) throw new Error(`merchant teardown failed, so the next case would lie: ${error.message}`);
}

describeLive("Slice C — the collecting merchant, live against Postgres and Stripe", () => {
    afterAll(async () => {
        if (supabase) await clearMerchants(supabase);
    });

    it("refuses collection when the organization has no connected account — and does NOT fall back to the platform", async () => {
        const client = supabase!;
        await clearMerchants(client);

        const resolution = await resolveCollectionMerchant(client, ORG);
        expect(resolution.ok, "no mapping means no merchant").toBe(false);
        if (resolution.ok) throw new Error("unreachable");
        expect(resolution.reason).toBe("not_connected");
        // The refusal must not name a platform account anywhere: falling back would silently make
        // Alloy the merchant of record for this family's money.
        expect(JSON.stringify(resolution)).not.toMatch(/acct_/);
    });

    it("reads readiness from the REAL Stripe connected account and only then permits collection", async () => {
        const client = supabase!;
        await clearMerchants(client);

        // Real provider evidence: whichever connected account this test-mode platform actually has.
        const list = await stripeGet("accounts?limit=1");
        expect(list.status, "the application key can enumerate connected accounts").toBe(200);
        const accounts = (list.body.data ?? []) as Array<Record<string, unknown>>;
        expect(accounts.length, "the test platform has at least one connected account").toBeGreaterThan(0);

        const account = accounts[0];
        const accountRef = String(account.id);
        expect(accountRef.startsWith("acct_")).toBe(true);
        // Test mode is proven by the KEY, not by the payload: a Stripe list envelope has no
        // `livemode`, and the Account object is one of the few Stripe objects that does not carry it
        // either — asserting it there passes silently on `undefined` and proves nothing.
        expect(secret!.startsWith("sk_test_"), "never certify against a live key").toBe(true);

        const readiness = readinessFromStripeAccount(account as { charges_enabled?: boolean });

        await client.from("payment_provider_merchants").insert({
            org_id: ORG,
            processor: "stripe",
            provider_account_ref: accountRef,
            readiness,
            readiness_checked_at: new Date().toISOString(),
            created_by: ACTOR,
            updated_by: ACTOR,
        });

        const resolution = await resolveCollectionMerchant(client, ORG);
        if (readiness === "ready") {
            expect(resolution.ok, "a charges_enabled account may collect").toBe(true);
            if (!resolution.ok) throw new Error("unreachable");
            expect(resolution.merchant.providerAccountRef).toBe(accountRef);
            expect(resolution.merchant.orgId).toBe(ORG);
        } else {
            expect(resolution.ok, "an account Stripe will not charge cannot collect").toBe(false);
        }
    });

    it("refuses an account that belongs to another organization, and fails closed on an unknown one", async () => {
        const client = supabase!;

        // The mapping above belongs to ORG. Another org asking gets nothing — tenancy is the query
        // scope, so there is no parameter through which OTHER_ORG could name ORG's account.
        const foreign = await resolveCollectionMerchant(client, OTHER_ORG);
        expect(foreign.ok).toBe(false);
        if (foreign.ok) throw new Error("unreachable");
        expect(foreign.reason).toBe("not_connected");

        // And the inbound direction — an account reference arriving from outside is turned into
        // tenancy, never trusted as tenancy.
        const unknown = await resolveOrgForConnectedAccount(client, "acct_thisdoesnotexist");
        expect(unknown, "an unknown connected account resolves to no org").toBeNull();
    });

    it("will not repoint where money settles, and will not hold two active merchants for one org", async () => {
        const client = supabase!;
        // Self-sufficient on purpose: a case that depends on a previous case's leftovers reports the
        // previous case's failure as its own, which is exactly what it did the first time this ran.
        await clearMerchants(client);
        const { data: inserted, error: insertError } = await client
            .from("payment_provider_merchants")
            .insert({
                org_id: ORG,
                processor: "stripe",
                provider_account_ref: "acct_slice_c_binding_probe",
                readiness: "ready",
                created_by: ACTOR,
                updated_by: ACTOR,
            })
            .select("id, provider_account_ref")
            .single();
        expect(insertError, "the mapping inserts cleanly").toBeNull();
        const row = inserted as { id: string; provider_account_ref: string };

        // Repointing in place would redirect settlement while every payment already recorded still
        // names the old account.
        const repoint = await client
            .from("payment_provider_merchants")
            .update({ provider_account_ref: "acct_somewhere_else" })
            .eq("id", row.id);
        expect(repoint.error?.message ?? "", "the account id is bound once set").toMatch(/is bound/);

        // A second active merchant for the same org is not richer configuration, it is an
        // unanswerable question at collection time.
        const second = await client.from("payment_provider_merchants").insert({
            org_id: ORG,
            processor: "stripe",
            provider_account_ref: "acct_a_second_one",
            readiness: "ready",
            created_by: ACTOR,
            updated_by: ACTOR,
        });
        expect(second.error?.message ?? "", "one active merchant per org per processor").toMatch(
            /uq_payment_provider_merchants_active_org_processor/,
        );
    });
});
