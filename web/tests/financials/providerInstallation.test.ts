/**
 * BECOMING A MERCHANT — the lifecycle, without a provider.
 *
 * W1's risk is not that a Stripe call is shaped wrongly; it is that the ACT is shaped wrongly — two
 * accounts created by two clicks, a merchant marked ready because an operator came back from a
 * redirect, or a disconnect that takes history with it. Those are all provable here, deterministically,
 * against a fake provider and a fake store.
 *
 * The live suite proves the Stripe call shapes against the real provider. This proves the product.
 */
import { describe, expect, it } from "vitest";

import {
    connectProviderMerchant,
    describeInstallation,
    disconnectProviderMerchant,
    refreshProviderReadiness,
} from "@/lib/financials/payments/providerInstallation";
import type { StripeJsonCall } from "@/lib/financials/payments/providerAccount";

const ORG = "org-1";
const ACTOR = "actor-1";
const URLS = { returnUrl: "https://alloy.test/return", refreshUrl: "https://alloy.test/refresh" };

type Row = Record<string, unknown>;

/**
 * A store that behaves like the merchant table's own rules: one ACTIVE row per (org, processor),
 * and an update that finds its row by id. It records every write so a test can assert what was
 * persisted rather than what a return value claimed.
 */
function store(initial: Row[] = []) {
    const rows: Row[] = initial.map((r) => ({ ...r }));
    const writes: Array<{ kind: string; values: Row }> = [];
    const client = {
        from(table: string) {
            if (table !== "payment_provider_merchants") throw new Error(`unexpected table ${table}`);
            const filters: Array<(r: Row) => boolean> = [];
            const self: Record<string, unknown> = {};
            let pending: Row | null = null;
            let kind = "select";
            self.select = () => self;
            self.eq = (col: string, value: unknown) => {
                filters.push((r) => r[col] === value);
                return self;
            };
            self.insert = (values: Row) => {
                kind = "insert";
                pending = values;
                return self;
            };
            self.update = (values: Row) => {
                kind = "update";
                pending = values;
                return self;
            };
            const matching = () => rows.filter((r) => filters.every((f) => f(r)));
            const settle = () => {
                if (kind === "insert" && pending) {
                    const active = rows.find((r) => r.org_id === pending!.org_id && r.is_active !== false);
                    if (active) return { data: null, error: { message: "uq_payment_provider_merchants_active_org_processor" } };
                    const row = { id: `merchant-${rows.length + 1}`, is_active: true, ...pending };
                    rows.push(row);
                    writes.push({ kind: "insert", values: row });
                    return { data: row, error: null };
                }
                if (kind === "update" && pending) {
                    for (const row of matching()) Object.assign(row, pending);
                    writes.push({ kind: "update", values: pending });
                    return { data: null, error: null };
                }
                const found = matching();
                return { data: found[0] ?? null, error: null };
            };
            self.maybeSingle = () => ({ then: (r: (v: unknown) => unknown) => r(settle()) });
            self.single = () => ({ then: (r: (v: unknown) => unknown) => r(settle()) });
            self.then = (r: (v: unknown) => unknown) => r(settle());
            return self;
        },
    } as never;
    return { client, rows, writes };
}

/** A provider that answers whatever the test says it answers, and records what it was asked. */
function provider(opts: {
    account?: Record<string, unknown>;
    createStatus?: number;
    linkStatus?: number;
    retrieveStatus?: number;
}) {
    const calls: Array<{ method: string; url: string; body: Record<string, unknown> | null }> = [];
    const call: StripeJsonCall = async (method, url, body) => {
        calls.push({ method, url, body });
        if (url.includes("/v2/core/accounts")) {
            return { status: opts.createStatus ?? 200, body: { id: "acct_new_1" } };
        }
        if (url.includes("/v2/core/account_links")) {
            return { status: opts.linkStatus ?? 200, body: { url: "https://connect.stripe.test/setup/abc" } };
        }
        return { status: opts.retrieveStatus ?? 200, body: opts.account ?? {} };
    };
    return { call, calls };
}

const READY_ACCOUNT = {
    charges_enabled: true,
    details_submitted: true,
    capabilities: { card_payments: "active", us_bank_account_ach_payments: "active" },
};
const CARD_ONLY_ACCOUNT = {
    charges_enabled: true,
    details_submitted: true,
    capabilities: { card_payments: "active" },
};
const UNFINISHED_ACCOUNT = { charges_enabled: false, details_submitted: false, capabilities: {} };

describe("connecting a payment provider", () => {
    it("creates one provider account, records the association, and returns a setup link", async () => {
        const s = store();
        const p = provider({ account: UNFINISHED_ACCOUNT });
        const outcome = await connectProviderMerchant(
            s.client,
            { orgId: ORG, actorUserId: ACTOR, displayName: "Northwind Early Learning", ...URLS },
            p.call,
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.created).toBe(true);
        expect(outcome.onboardingUrl).toMatch(/^https:\/\//);
        expect(s.rows).toHaveLength(1);
        expect(s.rows[0].provider_account_ref).toBe("acct_new_1");
        expect(s.rows[0].org_id, "the org is the server's, not the payload's").toBe(ORG);
        /* A brand-new account has submitted nothing, so it is NOT ready and the row says so. */
        expect(s.rows[0].readiness).toBe("onboarding_incomplete");
        expect(outcome.state.cardAvailable).toBe(false);
        expect(outcome.state.bankAvailable).toBe(false);
    });

    it("RESUMES an unfinished merchant instead of creating a second provider account", async () => {
        const s = store([
            { id: "m1", org_id: ORG, processor: "stripe", provider_account_ref: "acct_existing", readiness: "onboarding_incomplete", ach_readiness: null, readiness_checked_at: null, is_active: true },
        ]);
        const p = provider({ account: UNFINISHED_ACCOUNT });
        const outcome = await connectProviderMerchant(
            s.client,
            { orgId: ORG, actorUserId: ACTOR, displayName: "Northwind", ...URLS },
            p.call,
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.created, "a second click creates nothing").toBe(false);
        expect(outcome.resumed).toBe(true);
        expect(s.rows, "still exactly one merchant").toHaveLength(1);
        /*
         * The decisive assertion: the provider was never asked for another account. A stranded second
         * account at the provider is not visible from Alloy and cannot be cleaned up from here.
         */
        expect(p.calls.some((c) => c.url.includes("/v2/core/accounts"))).toBe(false);
        const link = p.calls.find((c) => c.url.includes("account_links"));
        expect(link?.body?.account, "the link is for the account it already has").toBe("acct_existing");
    });

    it("refuses to connect again when the organization is already ready, and says so", async () => {
        const s = store([
            { id: "m1", org_id: ORG, processor: "stripe", provider_account_ref: "acct_ready", readiness: "ready", ach_readiness: "ready", readiness_checked_at: null, is_active: true },
        ]);
        const p = provider({ account: READY_ACCOUNT });
        const outcome = await connectProviderMerchant(
            s.client,
            { orgId: ORG, actorUserId: ACTOR, displayName: "Northwind", ...URLS },
            p.call,
        );
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.reason).toBe("already_ready");
        expect(outcome.state.cardAvailable).toBe(true);
        expect(p.calls, "nothing was asked of the provider").toHaveLength(0);
    });

    it("keeps the association when the provider refuses the setup link, so setup can be resumed", async () => {
        const s = store();
        const p = provider({ account: UNFINISHED_ACCOUNT, linkStatus: 400 });
        const outcome = await connectProviderMerchant(
            s.client,
            { orgId: ORG, actorUserId: ACTOR, displayName: "Northwind", ...URLS },
            p.call,
        );
        expect(outcome.ok).toBe(false);
        expect(s.rows, "the account exists at the provider, so the association is recorded").toHaveLength(1);
    });
});

describe("refreshing provider readiness", () => {
    it("asks the provider and persists the answer, rather than trusting a redirect", async () => {
        const s = store([
            { id: "m1", org_id: ORG, processor: "stripe", provider_account_ref: "acct_1", readiness: "onboarding_incomplete", ach_readiness: null, readiness_checked_at: null, is_active: true },
        ]);
        const p = provider({ account: READY_ACCOUNT });
        const outcome = await refreshProviderReadiness(s.client, { orgId: ORG, actorUserId: ACTOR }, p.call);
        expect(outcome.ok).toBe(true);
        expect(s.rows[0].readiness).toBe("ready");
        expect(s.rows[0].ach_readiness).toBe("ready");
        expect(s.rows[0].readiness_checked_at, "when it was asked is recorded").toBeTruthy();
        if (!outcome.ok) return;
        expect(outcome.state.cardAvailable).toBe(true);
        expect(outcome.state.bankAvailable).toBe(true);
    });

    it("reports card-only truthfully when the provider has not enabled the bank rail", async () => {
        const s = store([
            { id: "m1", org_id: ORG, processor: "stripe", provider_account_ref: "acct_1", readiness: "onboarding_incomplete", ach_readiness: null, readiness_checked_at: null, is_active: true },
        ]);
        const outcome = await refreshProviderReadiness(
            s.client,
            { orgId: ORG, actorUserId: ACTOR },
            provider({ account: CARD_ONLY_ACCOUNT }).call,
        );
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.state.cardAvailable).toBe(true);
        expect(outcome.state.bankAvailable, "bank stays unavailable, and card is unaffected").toBe(false);
        expect(outcome.state.attention).toMatch(/bank payments are not enabled/i);
    });

    it("refuses when nothing is connected, instead of inventing a state", async () => {
        const s = store();
        const outcome = await refreshProviderReadiness(s.client, { orgId: ORG, actorUserId: ACTOR }, provider({}).call);
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.reason).toBe("not_connected");
        expect(outcome.state.cardAvailable).toBe(false);
    });
});

describe("disconnecting", () => {
    it("withdraws the association and deletes nothing", async () => {
        const s = store([
            { id: "m1", org_id: ORG, processor: "stripe", provider_account_ref: "acct_1", readiness: "ready", ach_readiness: "ready", readiness_checked_at: null, is_active: true },
        ]);
        const outcome = await disconnectProviderMerchant(s.client, { orgId: ORG, actorUserId: ACTOR });
        expect(outcome.ok).toBe(true);
        expect(s.rows, "the row survives — history keeps naming the account that collected").toHaveLength(1);
        expect(s.rows[0].is_active).toBe(false);
        expect(
            s.rows[0].provider_account_ref,
            "and the account reference is never rewritten on a historical row",
        ).toBe("acct_1");
        if (!outcome.ok) return;
        expect(outcome.state.connected).toBe(false);
        expect(outcome.state.cardAvailable).toBe(false);
        expect(outcome.state.bankAvailable).toBe(false);
    });

    it("says nothing is connected rather than pretending it withdrew something", async () => {
        const s = store();
        const outcome = await disconnectProviderMerchant(s.client, { orgId: ORG, actorUserId: ACTOR });
        expect(outcome.ok).toBe(false);
    });
});

describe("what an operator is told", () => {
    it("never offers a rail the merchant cannot actually use", () => {
        const base = { id: "m", processor: "stripe" as const, provider_account_ref: "acct", readiness_checked_at: null };
        expect(describeInstallation({ ...base, readiness: "ready", ach_readiness: "ready" }).bankAvailable).toBe(true);
        /* The N2 rule, restated here so the configuration surface cannot regress it independently. */
        expect(describeInstallation({ ...base, readiness: "onboarding_incomplete", ach_readiness: "ready" }).bankAvailable).toBe(false);
        expect(describeInstallation({ ...base, readiness: "restricted", ach_readiness: "ready" }).bankAvailable).toBe(false);
        expect(describeInstallation({ ...base, readiness: "restricted", ach_readiness: "ready" }).cardAvailable).toBe(false);
        expect(describeInstallation(null).connected).toBe(false);
    });

    it("explains a restricted account in a sentence an operator can act on", () => {
        const state = describeInstallation({
            id: "m", processor: "stripe", provider_account_ref: "acct",
            readiness: "restricted", ach_readiness: "ready", readiness_checked_at: null,
        });
        expect(state.attention).toMatch(/restricted/i);
        expect(state.attention, "never a generic failure").not.toMatch(/payment failed/i);
    });
});
