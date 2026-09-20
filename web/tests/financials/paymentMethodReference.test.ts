/**
 * THE STORED PAYMENT METHOD — the lifecycle, without a provider.
 *
 * W2's risk is not that a Stripe call is shaped wrongly; it is that the ACT is shaped wrongly — a
 * method on file that does not exist, a bank account offered as usable while a deposit is still in
 * the post, a removal that takes a payment's reference with it, or a provider event that quietly
 * re-homes a family's card. All of those are provable here, deterministically.
 *
 * The live suite proves the provider call shapes and the DATABASE's structural guarantees — the
 * partial unique index, the atomic default move, the immutability trigger. A fake store cannot
 * prove those, so it does not pretend to: it proves what the product decides.
 */
import { describe, expect, it } from "vitest";

import {
    applyProviderMethodUpdate,
    beginAddPaymentMethod,
    completeAddPaymentMethod,
    lifecycleFromSetup,
    resolveCollectionMethod,
    revokePaymentMethod,
} from "@/lib/financials/payments/paymentMethodService";
import type { StripeFormCall } from "@/lib/financials/payments/providerPaymentMethod";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CUSTOMER = "cust-1";
const PAYER = "person-1";
const ACTOR = "actor-1";

type Row = Record<string, unknown>;

/** Every write the store saw, so a test asserts what was PERSISTED, not what a return value claimed. */
type Store = {
    client: unknown;
    rows: Row[];
    writes: Array<{ kind: string; values: Row }>;
};

function store(initial: Row[] = []): Store {
    const rows: Row[] = initial.map((r, i) => ({ id: `m-${i + 1}`, created_at: `2026-09-0${i + 1}`, ...r }));
    const writes: Array<{ kind: string; values: Row }> = [];
    let seq = rows.length;

    const client = {
        from(table: string) {
            if (table !== "payment_methods" && table !== "customers") throw new Error(`unexpected table ${table}`);
            const filters: Array<(r: Row) => boolean> = [];
            let kind = "select";
            let pending: Row | null = null;
            const self: Record<string, unknown> = {};

            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.eq = (col: string, value: unknown) => {
                filters.push((r) => r[col] === value);
                return self;
            };
            self.not = () => self;
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

            const matching = () => (table === "customers" ? [{ id: CUSTOMER }] : rows).filter((r) => filters.every((f) => f(r)));

            const settle = () => {
                if (kind === "insert" && pending) {
                    /* The provider-reference unique index, as the database would apply it. */
                    if (rows.some((r) => r.provider_method_ref === pending!.provider_method_ref)) {
                        return { data: null, error: { message: "duplicate key value violates unique constraint uq_payment_methods_provider_method_ref" } };
                    }
                    seq += 1;
                    const row: Row = { id: `m-${seq}`, created_at: "2026-09-19", is_default: false, ...pending };
                    rows.push(row);
                    writes.push({ kind: "insert", values: { ...pending } });
                    return { data: { ...row }, error: null };
                }
                if (kind === "update" && pending) {
                    const hit = matching();
                    hit.forEach((r) => Object.assign(r, pending));
                    writes.push({ kind: "update", values: { ...pending } });
                    return { data: hit[0] ? { ...hit[0] } : null, error: null };
                }
                return { data: matching().map((r) => ({ ...r })), error: null };
            };

            self.maybeSingle = async () => {
                const res = settle();
                if (Array.isArray(res.data)) return { data: res.data[0] ?? null, error: res.error };
                return res;
            };
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
        async rpc() {
            throw new Error("the atomic default move is a database function and is proved against the database");
        },
    };
    return { client, rows, writes };
}

/** A provider that answers whatever the test needs, and records what it was asked. */
function provider(answers: Record<string, unknown>, log: string[] = []): StripeFormCall {
    return async (method, path) => {
        log.push(`${method} ${path}`);
        for (const [prefix, body] of Object.entries(answers)) {
            if (path.startsWith(prefix)) return { status: 200, body: body as Record<string, unknown> };
        }
        return { status: 404, body: { error: { message: `no stub for ${path}` } } };
    };
}

const SUCCEEDED_SETUP = { id: "seti_1", status: "succeeded", payment_method: "pm_1", mandate: null };
const CARD_METHOD = { id: "pm_1", type: "card", card: { brand: "visa", last4: "4242", exp_month: 8, exp_year: 2029 } };
const BANK_METHOD = {
    id: "pm_1",
    type: "us_bank_account",
    us_bank_account: { bank_name: "TEST BANK", last4: "6789", routing_number: "110000000", account_type: "checking" },
};

describe("the canonical payment method reference", () => {
    it("opening the provider's collection creates NOTHING canonical", async () => {
        const s = store();
        const log: string[] = [];
        const call = provider({ customers: { id: "cus_1" }, setup_intents: { id: "seti_1", client_secret: "seti_1_secret" } }, log);

        const begun = await beginAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card" },
            call,
        );

        expect(begun.ok).toBe(true);
        // The whole point: a click is not a method on file.
        expect(s.rows).toHaveLength(0);
        expect(s.writes).toHaveLength(0);
    });

    it("a payer who already has a wallet does not get a second one", async () => {
        const s = store([
            { org_id: ORG, processor: "stripe", payer_entity_type: "person", payer_entity_id: PAYER, provider_customer_ref: "cus_existing", provider_method_ref: "pm_old", rail: "card", usability_state: "revoked", revoked_at: "2026-09-01" },
        ]);
        const log: string[] = [];
        const call = provider({ customers: { id: "cus_NEW" }, setup_intents: { id: "seti_1", client_secret: "sec" } }, log);

        const begun = await beginAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card" },
            call,
        );

        expect(begun.ok && begun.providerCustomerRef).toBe("cus_existing");
        // A REVOKED row still carries the wallet — which is why revocation must never delete.
        expect(log.some((l) => l.includes("customers"))).toBe(false);
    });

    it("a bank setup carries the authorization disclosure Stripe requires; a card does not", async () => {
        const s = store();
        const call = provider({ customers: { id: "cus_1" }, setup_intents: { id: "seti_1", client_secret: "sec" } });

        const bank = await beginAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "ach" },
            call,
        );
        const card = await beginAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card" },
            call,
        );

        expect(bank.ok && bank.authorizationDisclosure).toMatch(/connected to Alloy now and any provider/i);
        expect(card.ok && card.authorizationDisclosure).toBeNull();
    });

    it("a setup that never produced an instrument stores nothing at all", async () => {
        const s = store();
        const call = provider({
            setup_intents: { id: "seti_1", status: "requires_payment_method", payment_method: null, last_setup_error: { message: "The customer closed the window." } },
        });

        const done = await completeAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card", setupRef: "seti_1", providerCustomerRef: "cus_1" },
            call,
        );

        expect(done.ok).toBe(false);
        expect(!done.ok && done.reason).toBe("no_instrument");
        expect(s.rows).toHaveLength(0);
    });

    it("a completed card is verified and usable, with only safe display persisted", async () => {
        const s = store();
        const call = provider({ setup_intents: SUCCEEDED_SETUP, payment_methods: CARD_METHOD });

        const done = await completeAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card", setupRef: "seti_1", providerCustomerRef: "cus_1", actorUserId: ACTOR },
            call,
        );

        expect(done.ok).toBe(true);
        expect(done.ok && done.method.verificationState).toBe("verified");
        expect(done.ok && done.method.usabilityState).toBe("usable");
        expect(done.ok && done.method.brand).toBe("visa");
        expect(done.ok && done.method.last4).toBe("4242");
    });

    it("a bank account awaiting microdeposits EXISTS but is not usable", async () => {
        const s = store();
        const call = provider({
            setup_intents: { id: "seti_1", status: "requires_action", payment_method: "pm_1", mandate: "mandate_1", next_action: { type: "verify_with_microdeposits" } },
            payment_methods: BANK_METHOD,
        });

        const done = await completeAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "ach", setupRef: "seti_1", providerCustomerRef: "cus_1" },
            call,
        );

        expect(done.ok).toBe(true);
        expect(done.ok && done.method.verificationState).toBe("pending");
        // Offering this as usable would let an operator schedule a collection the provider refuses.
        expect(done.ok && done.method.usabilityState).toBe("blocked");
        expect(done.ok && done.method.mandateRef).toBe("mandate_1");
        expect(done.ok && done.method.mandateAcceptedAt).toBeTruthy();
    });

    it("NO CREDENTIAL is ever written — the routing number Stripe returned is not persisted", async () => {
        const s = store();
        const call = provider({ setup_intents: SUCCEEDED_SETUP, payment_methods: BANK_METHOD });

        await completeAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "ach", setupRef: "seti_1", providerCustomerRef: "cus_1" },
            call,
        );

        const written = JSON.stringify(s.writes);
        expect(written).not.toContain("110000000");
        expect(written).not.toMatch(/routing/i);
        expect(written).not.toMatch(/account_number/i);
        // And the columns that exist are only the safe ones.
        expect(s.writes[0]?.values.display_last4).toBe("6789");
        expect(s.writes[0]?.values.display_brand).toBe("TEST BANK");
    });

    it("the provider's answer decides the rail, not the caller's request", async () => {
        const s = store();
        const call = provider({ setup_intents: SUCCEEDED_SETUP, payment_methods: BANK_METHOD });

        const done = await completeAddPaymentMethod(
            s.client as never,
            // The caller says card; the provider produced a bank account.
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card", setupRef: "seti_1", providerCustomerRef: "cus_1" },
            call,
        );

        expect(done.ok && done.method.rail).toBe("ach");
    });

    it("an instrument already on file cannot be claimed a second time", async () => {
        const s = store([{ org_id: OTHER_ORG, processor: "stripe", provider_method_ref: "pm_1", rail: "card", usability_state: "usable" }]);
        const call = provider({ setup_intents: SUCCEEDED_SETUP, payment_methods: CARD_METHOD });

        const done = await completeAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "card", setupRef: "seti_1", providerCustomerRef: "cus_1" },
            call,
        );

        expect(done.ok).toBe(false);
        expect(!done.ok && done.reason).toBe("already_claimed");
    });

    it("an unrecognised provider status is never quietly usable", () => {
        expect(lifecycleFromSetup("some_future_status", null).usability).toBe("blocked");
        expect(lifecycleFromSetup("processing", null).usability).toBe("blocked");
        expect(lifecycleFromSetup("succeeded", null)).toEqual({ verification: "verified", usability: "usable" });
    });

    it("removing a method revokes it, clears its default, and deletes nothing", async () => {
        const s = store([
            { org_id: ORG, customer_id: CUSTOMER, provider_method_ref: "pm_1", provider_customer_ref: "cus_1", rail: "card", usability_state: "usable", is_default: true, display_last4: "4242" },
        ]);
        const call = provider({ payment_methods: { id: "pm_1", object: "payment_method" } });

        const out = await revokePaymentMethod(s.client as never, { orgId: ORG, methodId: "m-1", reason: "card was lost", actorUserId: ACTOR }, call);

        expect(out.ok).toBe(true);
        expect(out.ok && out.method.usabilityState).toBe("revoked");
        expect(out.ok && out.method.isDefault).toBe(false);
        expect(out.ok && out.method.revokedReason).toBe("card was lost");
        // The row is still there, and still names the instrument a payment may have used.
        expect(s.rows).toHaveLength(1);
        expect(s.rows[0].provider_method_ref).toBe("pm_1");
    });

    it("a provider detach that fails does not leave the operator's instruction unexecuted", async () => {
        const s = store([{ org_id: ORG, customer_id: CUSTOMER, provider_method_ref: "pm_1", provider_customer_ref: "cus_1", rail: "card", usability_state: "usable" }]);
        const refusing: StripeFormCall = async () => ({ status: 400, body: { error: { message: "already detached" } } });

        const out = await revokePaymentMethod(s.client as never, { orgId: ORG, methodId: "m-1" }, refusing);

        expect(out.ok).toBe(true);
        expect(out.ok && out.method.usabilityState).toBe("revoked");
        expect(out.ok && out.providerDetached).toBe(false);
    });

    it("collection refuses a method that is revoked, pending, or another family's", async () => {
        const s = store([
            { org_id: ORG, customer_id: CUSTOMER, provider_method_ref: "pm_r", rail: "card", usability_state: "revoked", revoked_at: "2026-09-01" },
            { org_id: ORG, customer_id: CUSTOMER, provider_method_ref: "pm_p", rail: "ach", usability_state: "blocked", verification_state: "pending" },
            { org_id: ORG, customer_id: "cust-OTHER", provider_method_ref: "pm_o", rail: "card", usability_state: "usable" },
            { org_id: ORG, customer_id: CUSTOMER, provider_method_ref: "pm_g", rail: "card", usability_state: "usable" },
        ]);

        const revoked = await resolveCollectionMethod(s.client as never, { orgId: ORG, methodId: "m-1", customerId: CUSTOMER });
        const pending = await resolveCollectionMethod(s.client as never, { orgId: ORG, methodId: "m-2", customerId: CUSTOMER });
        const other = await resolveCollectionMethod(s.client as never, { orgId: ORG, methodId: "m-3", customerId: CUSTOMER });
        const good = await resolveCollectionMethod(s.client as never, { orgId: ORG, methodId: "m-4", customerId: CUSTOMER });

        expect(!revoked.ok && revoked.reason).toBe("not_usable");
        expect(!revoked.ok && revoked.message).toMatch(/removed/i);
        expect(!pending.ok && pending.message).toMatch(/still being verified/i);
        expect(!other.ok && other.reason).toBe("wrong_account");
        expect(good.ok).toBe(true);
    });

    it("a method in another organization reads as absent, not as forbidden", async () => {
        const s = store([{ org_id: OTHER_ORG, customer_id: CUSTOMER, provider_method_ref: "pm_x", rail: "card", usability_state: "usable" }]);
        const out = await resolveCollectionMethod(s.client as never, { orgId: ORG, methodId: "m-1", customerId: CUSTOMER });
        expect(!out.ok && out.reason).toBe("not_found");
    });

    it("a provider event updates display and usability, and touches nothing else", async () => {
        const s = store([
            { org_id: ORG, processor: "stripe", customer_id: CUSTOMER, payer_entity_type: "person", payer_entity_id: PAYER, provider_method_ref: "pm_1", provider_customer_ref: "cus_1", rail: "card", usability_state: "usable", verification_state: "verified", display_last4: "4242", display_exp_year: 2029 },
        ]);

        const out = await applyProviderMethodUpdate(s.client as never, {
            providerMethodRef: "pm_1",
            methodObject: { id: "pm_1", type: "card", card: { brand: "visa", last4: "9999", exp_month: 3, exp_year: 2031 } },
        });

        expect(out.ok).toBe(true);
        expect(out.ok && out.changed).toBe(true);
        expect(s.rows[0].display_last4).toBe("9999");
        expect(s.rows[0].display_exp_year).toBe(2031);

        // The patch NEVER names ownership, scope, rail or the provider handles.
        const patch = s.writes.find((w) => w.kind === "update")?.values ?? {};
        for (const forbidden of ["org_id", "payer_entity_type", "payer_entity_id", "customer_id", "rail", "processor", "provider_method_ref", "provider_customer_ref"]) {
            expect(Object.keys(patch)).not.toContain(forbidden);
        }
    });

    it("a provider event for an instrument nobody stored fails closed", async () => {
        const s = store([{ org_id: ORG, processor: "stripe", provider_method_ref: "pm_known", rail: "card", usability_state: "usable" }]);
        const out = await applyProviderMethodUpdate(s.client as never, { providerMethodRef: "pm_stranger", methodObject: { id: "pm_stranger", type: "card", card: {} } });
        expect(out.ok).toBe(false);
        expect(!out.ok && out.reason).toBe("unbound");
    });

    it("a withdrawn method is not revived by provider chatter", async () => {
        const s = store([{ org_id: ORG, processor: "stripe", provider_method_ref: "pm_1", rail: "card", usability_state: "revoked", revoked_at: "2026-09-01" }]);
        const out = await applyProviderMethodUpdate(s.client as never, {
            providerMethodRef: "pm_1",
            methodObject: { id: "pm_1", type: "card", card: { last4: "1111" } },
            usability: "usable",
            verification: "verified",
        });
        // It must have FOUND the row and declined to change it — not merely failed to find it.
        expect(out.ok).toBe(true);
        expect(out.ok && out.changed).toBe(false);
        expect(s.rows[0].usability_state).toBe("revoked");
    });

    it("a method that stops being usable stops being the default in the same write", async () => {
        const s = store([{ org_id: ORG, processor: "stripe", customer_id: CUSTOMER, provider_method_ref: "pm_1", rail: "card", usability_state: "usable", is_default: true }]);
        await applyProviderMethodUpdate(s.client as never, { providerMethodRef: "pm_1", methodObject: { id: "pm_1", type: "card", card: {} }, usability: "expired" });
        expect(s.rows[0].usability_state).toBe("expired");
        expect(s.rows[0].is_default).toBe(false);
    });
});
