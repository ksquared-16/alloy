/**
 * A BANK ACCOUNT IS AUTHORIZED BY ITS OWNER — proved where it is decided, not where it is rendered.
 *
 * Saving a bank account establishes a standing authorization to debit it. Stripe's ACH terms put
 * the warranty on the platform: it must hold the account holder's authorization BY NAME before a
 * debit is initiated, and the provider emails its confirmation to that person. So the boundary this
 * file defends is not a UI preference — an operator completing that flow makes Alloy warrant an
 * authorization nobody gave, and sends a parent confirmation of a debit they never agreed to.
 *
 * ── WHY EVERY CASE HERE IS SERVER-SIDE ──
 *
 * The operator's `Add bank account` button was removed in an earlier slice, and the capability
 * behind it still accepted `rail: "ach"`. A removed button is not a closed door: anything that can
 * POST an action could open the provider's collection and present the mandate at the front desk.
 * These cases exercise the capability, the service and the link resolver, because those are what a
 * caller actually reaches.
 *
 * The seven properties the slice must hold, each with its own section below:
 *
 *   1  an operator cannot complete a bank authorization
 *   2  a setup cannot be claimed by another payer
 *   3  a setup cannot rebind the organisation
 *   4  method ownership is narrowed in the query, not filtered after it
 *   5  only safe fields leave the provider adapter, on any surface
 *   6  the request is a request — it writes nothing
 *   7  the link's four refusals stay four different answers
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    beginAddPaymentMethod,
    completeAddPaymentMethod,
    readPayerOwnMethods,
} from "@/lib/financials/payments/paymentMethodService";
import { displayFromStripeMethod, type StripeFormCall } from "@/lib/financials/payments/providerPaymentMethod";
import { paymentMethodActions } from "@/lib/adminV2/actions/definitions/paymentMethodActions";
import {
    buildParticipantBankSetupView,
    participantMethodStatus,
} from "@/lib/enrollment/financial/participantBankSetup";
import { resolveBankSetupLink } from "@/lib/financials/payments/bankSetupRequest";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CUSTOMER = "cust-1";
const PAYER = "person-1";
const OTHER_PAYER = "person-2";

type Row = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * A STRICT FAKE. An unexpected table is an error, so a read nobody planned is caught rather than
 * quietly answered with nothing — which is how a scoping bug reads as an empty list.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function store(initial: Row[] = [], links: Row[] = []) {
    const rows: Row[] = initial.map((r, i) => ({ id: `m-${i + 1}`, created_at: `2026-09-0${i + 1}`, ...r }));
    const linkRows: Row[] = links.map((r) => ({ ...r }));
    const writes: Array<{ table: string; kind: string; values: Row }> = [];
    let seq = rows.length;

    const client = {
        from(table: string) {
            if (table !== "payment_methods" && table !== "customers" && table !== "action_links") {
                throw new Error(`unexpected table ${table}`);
            }
            const filters: Array<(r: Row) => boolean> = [];
            let kind = "select";
            let pending: Row | null = null;
            const self: Record<string, unknown> = {};

            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.not = () => self;
            self.is = (col: string, value: unknown) => {
                filters.push((r) => (value === null ? r[col] == null : r[col] === value));
                return self;
            };
            self.eq = (col: string, value: unknown) => {
                filters.push((r) => r[col] === value);
                return self;
            };
            self.neq = (col: string, value: unknown) => {
                filters.push((r) => r[col] !== value);
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

            const source = () => (table === "customers" ? [{ id: CUSTOMER }] : table === "action_links" ? linkRows : rows);
            const matching = () => source().filter((r) => filters.every((f) => f(r)));

            const settle = () => {
                if (kind === "insert" && pending) {
                    seq += 1;
                    const row: Row = { id: `m-${seq}`, created_at: "2026-09-19", is_default: false, ...pending };
                    rows.push(row);
                    writes.push({ table, kind: "insert", values: { ...pending } });
                    return { data: { ...row }, error: null };
                }
                if (kind === "update" && pending) {
                    const hit = matching();
                    hit.forEach((r) => Object.assign(r, pending));
                    writes.push({ table, kind: "update", values: { ...pending } });
                    return { data: hit.map((r) => ({ ...r })), error: null };
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
            throw new Error("nothing here is an RPC");
        },
    };
    return { client, rows, writes, linkRows };
}

/** A provider that answers what the test needs, and records what it was asked for. */
function provider(answers: Record<string, unknown>, log: Array<{ path: string; body: Row | null }> = []): StripeFormCall {
    return async (method, p, body) => {
        log.push({ path: `${method} ${p}`, body: (body as Row) ?? null });
        for (const [prefix, answer] of Object.entries(answers)) {
            if (p.startsWith(prefix)) return { status: 200, body: answer as Record<string, unknown> };
        }
        return { status: 404, body: { error: { message: `no stub for ${p}` } } };
    };
}

const BANK_METHOD = {
    id: "pm_1",
    type: "us_bank_account",
    us_bank_account: { bank_name: "TEST BANK", last4: "6789", routing_number: "110000000", account_type: "checking" },
};

/** A setup as the provider reports it, with whatever ownership the case is about. */
function setupIntent(over: Row = {}): Row {
    return {
        id: "seti_1",
        status: "succeeded",
        payment_method: "pm_1",
        mandate: "mandate_1",
        customer: "cus_payer1",
        metadata: { alloy_org_id: ORG, alloy_payer_id: PAYER },
        ...over,
    };
}

const src = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ── 1 ─────────────────────────────────────────────────────────────────────────────────────────── */

describe("an operator cannot complete a bank authorization", () => {
    const add = paymentMethodActions.find((a) => a.actionKey === "payment_method.add")!;

    it("the capability refuses `rail: ach`, not merely the screen", () => {
        const refused = add.validatePayload!({ stage: "begin", customer_id: CUSTOMER, rail: "ach" });
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.blockers.map((b) => b.code)).toContain(
            "bank_setup_is_the_payers_act",
        );
    });

    it("and still saves a card, which carries no mandate of this kind", () => {
        const allowed = add.validatePayload!({ stage: "begin", customer_id: CUSTOMER, rail: "card" });
        expect(allowed.ok).toBe(true);
    });

    it("the refusal names where the act actually belongs", () => {
        const refused = add.validatePayload!({ stage: "begin", customer_id: CUSTOMER, rail: "ach" });
        const message = refused.ok === false ? refused.blockers[0]!.message : "";
        expect(message).toMatch(/authorized by the payer/i);
        expect(message).toMatch(/Request bank account setup/);
        /* An operator must not be told to go and find a control that no longer exists. */
        expect(message).not.toMatch(/Add bank account/i);
    });
});

/* ── 2 and 3 ───────────────────────────────────────────────────────────────────────────────────── */

describe("a setup cannot be claimed by anybody it was not opened for", () => {
    async function complete(setup: Row, as: { orgId: string; payerEntityId: string }, existing: Row[] = []) {
        const s = store(existing);
        const call = provider({ setup_intents: setup, payment_methods: BANK_METHOD });
        const out = await completeAddPaymentMethod(
            s.client as never,
            {
                orgId: as.orgId,
                customerId: CUSTOMER,
                payerEntityType: "person",
                payerEntityId: as.payerEntityId,
                rail: "ach",
                setupRef: "seti_1",
                providerCustomerRef: "",
            },
            call,
        );
        return { out, s };
    }

    it("refuses a setup stamped for a different payer, and writes nothing", async () => {
        const { out, s } = await complete(setupIntent(), { orgId: ORG, payerEntityId: OTHER_PAYER });
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.reason).toBe("not_this_payers_setup");
        expect(s.rows).toHaveLength(0);
        expect(s.writes).toHaveLength(0);
    });

    it("refuses a setup stamped for a different organisation", async () => {
        const { out, s } = await complete(setupIntent(), { orgId: OTHER_ORG, payerEntityId: PAYER });
        expect(out.ok === false && out.reason).toBe("not_this_payers_setup");
        expect(s.rows).toHaveLength(0);
    });

    it("refuses a setup opened against a platform customer that is not this payer's", async () => {
        /*
         * The stamp is absent — a setup created before it existed — so the CUSTOMER is the only
         * thing left to check, and it is re-derived from this payer's own rows rather than taken
         * from the payload.
         */
        const onFile = {
            org_id: ORG, processor: "stripe", payer_entity_type: "person", payer_entity_id: PAYER,
            customer_id: CUSTOMER, provider_customer_ref: "cus_payer1", provider_method_ref: "pm_old",
            rail: "ach", usability_state: "usable", verification_state: "verified",
        };
        const { out } = await complete(
            setupIntent({ metadata: {}, customer: "cus_SOMEBODY_ELSE" }),
            { orgId: ORG, payerEntityId: PAYER },
            [onFile],
        );
        expect(out.ok === false && out.reason).toBe("not_this_payers_setup");
    });

    it("allows the payer's own setup, and writes the customer the PROVIDER named", async () => {
        const { out, s } = await complete(setupIntent(), { orgId: ORG, payerEntityId: PAYER });
        expect(out.ok, out.ok === false ? out.message : "").toBe(true);
        expect(s.writes).toHaveLength(1);
        expect(s.writes[0]!.values.provider_customer_ref).toBe("cus_payer1");
        expect(s.writes[0]!.values.payer_entity_id).toBe(PAYER);
        expect(s.writes[0]!.values.org_id).toBe(ORG);
    });

    it("a payer's FIRST method still works — there is nothing on file to compare, and the stamp answers", async () => {
        const { out } = await complete(setupIntent(), { orgId: ORG, payerEntityId: PAYER });
        expect(out.ok).toBe(true);
    });

    it("the stamp is written by Alloy at creation, so it is a server fact and not a browser one", async () => {
        const s = store();
        const log: Array<{ path: string; body: Row | null }> = [];
        const call = provider({ customers: { id: "cus_payer1" }, setup_intents: { id: "seti_1", client_secret: "sec" } }, log);
        await beginAddPaymentMethod(
            s.client as never,
            { orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER, rail: "ach" },
            call,
        );
        const created = log.find((l) => l.path.includes("setup_intents"))!;
        expect(created.body?.["metadata[alloy_org_id]"]).toBe(ORG);
        expect(created.body?.["metadata[alloy_payer_id]"]).toBe(PAYER);
    });
});

/* ── 4 ─────────────────────────────────────────────────────────────────────────────────────────── */

describe("a payer is shown their own methods and nobody else's", () => {
    const base = {
        org_id: ORG, processor: "stripe", payer_entity_type: "person", customer_id: CUSTOMER,
        rail: "ach", provider_customer_ref: "cus_1", verification_state: "verified", usability_state: "usable",
    };

    it("narrows by payer, account, org and rail, and drops revoked rows", async () => {
        const s = store([
            { ...base, payer_entity_id: PAYER, provider_method_ref: "pm_mine" },
            { ...base, payer_entity_id: OTHER_PAYER, provider_method_ref: "pm_coparent" },
            { ...base, payer_entity_id: PAYER, provider_method_ref: "pm_other_org", org_id: OTHER_ORG },
            { ...base, payer_entity_id: PAYER, provider_method_ref: "pm_other_account", customer_id: "cust-2" },
            { ...base, payer_entity_id: PAYER, provider_method_ref: "pm_card", rail: "card" },
            { ...base, payer_entity_id: PAYER, provider_method_ref: "pm_gone", usability_state: "revoked" },
        ]);
        const mine = await readPayerOwnMethods(s.client as never, {
            orgId: ORG, payerEntityType: "person", payerEntityId: PAYER, customerId: CUSTOMER, rail: "ach",
        });
        expect(mine.map((m) => m.providerMethodRef)).toEqual(["pm_mine"]);
    });

    it("keeps a PENDING account, which the usable-only reader correctly hides", async () => {
        /*
         * The reason this third reader exists. A bank account waiting on its deposits cannot pay
         * anything, so `readPayerUsableMethods` is right to omit it — but its owner must see it, or
         * they add the same account again every time they come back during the wait.
         */
        const s = store([
            { ...base, payer_entity_id: PAYER, provider_method_ref: "pm_pending", verification_state: "pending", usability_state: "blocked" },
        ]);
        const mine = await readPayerOwnMethods(s.client as never, {
            orgId: ORG, payerEntityType: "person", payerEntityId: PAYER, customerId: CUSTOMER, rail: "ach",
        });
        expect(mine).toHaveLength(1);
    });

    it("a missing scope reads as NOTHING, never as unscoped", async () => {
        const s = store([{ ...base, payer_entity_id: PAYER, provider_method_ref: "pm_mine" }]);
        const none = await readPayerOwnMethods(s.client as never, {
            orgId: ORG, payerEntityType: "person", payerEntityId: "", customerId: CUSTOMER,
        });
        expect(none).toEqual([]);
    });
});

/* ── 5 ─────────────────────────────────────────────────────────────────────────────────────────── */

describe("only safe fields leave the provider, on any surface", () => {
    it("the adapter reads a bank name and a last four, and drops the routing number", () => {
        const display = displayFromStripeMethod(BANK_METHOD);
        expect(display.brand).toBe("TEST BANK");
        expect(display.last4).toBe("6789");
        expect(JSON.stringify(display)).not.toContain("110000000");
        expect(Object.keys(display).join(",")).not.toMatch(/routing|account_number/i);
    });

    it("what is PERSISTED carries no credential either", async () => {
        const s = store();
        const call = provider({ setup_intents: setupIntent(), payment_methods: BANK_METHOD });
        await completeAddPaymentMethod(
            s.client as never,
            {
                orgId: ORG, customerId: CUSTOMER, payerEntityType: "person", payerEntityId: PAYER,
                rail: "ach", setupRef: "seti_1", providerCustomerRef: "",
            },
            call,
        );
        const written = JSON.stringify(s.writes[0]!.values);
        expect(written).not.toContain("110000000");
        expect(written).not.toMatch(/routing_number|account_number/);
    });

    it("no surface asks for a routing or account number, because no field for one exists", () => {
        for (const file of [
            "components/operationalCards/PaymentMethodsSection.tsx",
            "app/bank-setup/[token]/BankSetupClient.tsx",
            "app/api/public/bank-setup/[token]/route.ts",
        ]) {
            expect(code(file), file).not.toMatch(/routing[_ ]?number|account[_ ]?number/i);
        }
    });

    it("the payer is told where they have got to WITHOUT a provider status string", () => {
        const say = (verification: string, usability: string) =>
            participantMethodStatus({ verificationState: verification, usabilityState: usability } as never);

        expect(say("verified", "usable").label).toBe("Ready to use");
        expect(say("pending", "blocked").status).toBe("needs_you");
        expect(say("failed", "blocked").status).toBe("unusable");

        const everything = [
            say("verified", "usable"), say("pending", "blocked"), say("failed", "blocked"),
            say("unverified", "blocked"), say("verified", "revoked"), say("verified", "expired"),
        ];
        for (const s of everything) {
            const words = `${s.label} ${s.detail ?? ""}`;
            for (const leak of [
                "requires_action", "verify_with_microdeposits", "setup_intent", "SetupIntent",
                "us_bank_account", "succeeded", "requires_payment_method", "processing",
                "pending", "unverified", "blocked",
            ]) {
                expect(words, `${leak} reached a parent`).not.toContain(leak);
            }
        }
    });

    it("an unrecognised canonical state is never quietly presentable as ready", () => {
        const odd = participantMethodStatus({ verificationState: "something_new", usabilityState: "usable" } as never);
        expect(odd.status).not.toBe("ready");
    });
});

/* ── 6 ─────────────────────────────────────────────────────────────────────────────────────────── */

describe("the request is a request", () => {
    const request = paymentMethodActions.find((a) => a.actionKey === "payment_method.request_setup")!;

    it("is registered beside the acts it is not", () => {
        expect(request).toBeTruthy();
        expect(request.defaultLabel).toBe("Request bank account setup");
    });

    it("says, before it is pressed, that nothing is saved yet", async () => {
        const preview = await request.buildPreview!({} as never);
        const said = `${preview.summary} ${preview.changes.join(" ")}`;
        expect(said).toMatch(/nothing is saved on this account yet/i);
        expect(said).toMatch(/authorization themselves/i);
    });

    it("does not resolve the payer from whoever asked", () => {
        const source = code("lib/financials/payments/bankSetupRequest.ts");
        /* `requested_by_user_id` is written as provenance; nothing may read it back as a payer. */
        expect(source).toMatch(/requested_by_user_id/);
        expect(source.split("requested_by_user_id").length - 1, "written once, never read").toBe(1);
    });

    it("mints a link that outlives the two-hour default it would otherwise inherit", async () => {
        const { BANK_SETUP_LINK_MINUTES } = await import("@/lib/financials/payments/bankSetupRequest");
        expect(BANK_SETUP_LINK_MINUTES).toBeGreaterThan(120);
    });
});

/* ── 7 ─────────────────────────────────────────────────────────────────────────────────────────── */

describe("the link's refusals stay four different answers", () => {
    const TOKEN = "a".repeat(48);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    const link = (over: Row = {}): Row => ({
        id: "link-1",
        token_hash: hashFormLinkToken(TOKEN),
        org_id: ORG,
        action_type: "payment_method_setup",
        entity_type: "person",
        entity_id: PAYER,
        metadata: { customer_id: CUSTOMER, rail: "ach" },
        consumed_at: null,
        revoked_at: null,
        expires_at: future,
        ...over,
    });

    const resolve = (rows: Row[], token = TOKEN) => resolveBankSetupLink(store([], rows).client as never, token);

    it("resolves a live link to the org, account and payer it NAMES", async () => {
        const out = await resolve([link()]);
        expect(out.ok).toBe(true);
        expect(out.ok && out.link).toEqual({
            linkId: "link-1", orgId: ORG, customerId: CUSTOMER, payerEntityId: PAYER,
        });
    });

    it("tells expired, used and withdrawn apart, because they send a parent three different places", async () => {
        const expired = await resolve([link({ expires_at: past })]);
        const used = await resolve([link({ consumed_at: "2026-09-20T00:00:00Z" })]);
        const revoked = await resolve([link({ revoked_at: "2026-09-20T00:00:00Z" })]);
        expect(expired.ok === false && expired.reason).toBe("expired");
        expect(used.ok === false && used.reason).toBe("used");
        expect(revoked.ok === false && revoked.reason).toBe("revoked");
    });

    it("a link for a DIFFERENT act is unknown here, not a bank setup", async () => {
        const out = await resolve([link({ action_type: "customer_cancel" })]);
        expect(out.ok === false && out.reason).toBe("unknown");
    });

    it("a link that names no account is malformed, never a licence to infer one", async () => {
        const out = await resolve([link({ metadata: {} })]);
        expect(out.ok === false && out.reason).toBe("malformed");
    });

    it("a link that names no person is malformed too", async () => {
        const out = await resolve([link({ entity_type: "customer" })]);
        expect(out.ok === false && out.reason).toBe("malformed");
    });

    it("is found by DIGEST — a short code is not a credential for this", async () => {
        const out = await resolve([link()], "not-the-token");
        expect(out.ok === false && out.reason).toBe("unknown");
        const source = code("lib/financials/payments/bankSetupRequest.ts");
        expect(source, "no short_code lookup").not.toMatch(/eq\(\s*"short_code"/);
    });

    it("never hands the provider's own sentence to a payer", () => {
        /*
         * Measured on deployed staging: a tampered setup reference answered
         * `No such setupintent: 'seti_…'`. That is the provider's noun, the provider's identifier
         * and a hint about what else exists, on a page read by a parent.
         */
        const route = code("app/api/public/bank-setup/[token]/route.ts");
        expect(route).toMatch(/done\.reason === "provider_error" \|\| done\.reason === "write_failed"/);
        expect(route).toMatch(/Nothing has been saved, and you can try again/);
        /* And the route names no provider noun of its own in anything it sends. */
        for (const noun of ["setupintent", "SetupIntent", "us_bank_account", "seti_", "pm_", "cus_"]) {
            const sent = route.split("\n").filter((l) => /publicOk\(|publicErr\(|message[:=]/.test(l)).join("\n");
            expect(sent, noun).not.toContain(noun);
        }
    });

    it("names the payer from `persons`, which is the table that exists", () => {
        /*
         * Measured on deployed staging: the route read `people`, PostgREST errored, and a parent
         * was shown a bank-authorization page addressed to nobody. The whole platform names a
         * person through `persons` — `resolvePayerCandidates` selects `persons(first_name,
         * last_name)` — so this is the one spelling, asserted in both places.
         */
        const route = code("app/api/public/bank-setup/[token]/route.ts");
        expect(route).toMatch(/from\("persons"\)/);
        expect(route, "the table that does not exist").not.toMatch(/from\("people"\)/);
        expect(code("lib/financials/payments/paymentSubjectModel.ts")).toMatch(/persons\(first_name, last_name\)/);
    });

    it("the entry page sends this action type to the payer's own surface", () => {
        const page = code("app/a/[token]/page.tsx");
        expect(page).toMatch(/payment_method_setup/);
        expect(page).toMatch(/\/bank-setup\//);
    });
});

/* ── The view the payer is handed ──────────────────────────────────────────────────────────────── */

describe("what the payer is offered", () => {
    const ready = { readiness: "ready", achReadiness: "ready" };

    it("offers nothing when the organisation cannot take bank payments", () => {
        const view = buildParticipantBankSetupView({
            payer: { personId: PAYER, name: "A Parent" },
            methods: [],
            merchant: { readiness: "ready", achReadiness: "pending" },
        });
        expect(view.canAddBankAccount).toBe(false);
        expect(view.unavailableReason).toMatch(/not set up to take bank payments/i);
    });

    it("offers nothing, and shows nothing, when the link names no payer", () => {
        const view = buildParticipantBankSetupView({ payer: null, methods: [{ id: "m1" } as never], merchant: ready });
        expect(view.canAddBankAccount).toBe(false);
        expect(view.savedMethods).toEqual([]);
    });

    it("carries the platform's authorization sentence verbatim, above the provider's own terms", () => {
        const view = buildParticipantBankSetupView({ payer: { personId: PAYER, name: "A" }, methods: [], merchant: ready });
        expect(view.canAddBankAccount).toBe(true);
        expect(view.authorizationDisclosure).toMatch(/you authorize Alloy, on behalf of the childcare providers/);
        expect(view.authorizationDisclosure).toMatch(/You may remove this bank account at any time\./);
    });
});
