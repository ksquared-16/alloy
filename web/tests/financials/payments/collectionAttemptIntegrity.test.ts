/**
 * PAYMENT-ATTEMPT INTEGRITY — who an attempt belongs to, and what happens after a decline.
 *
 * Measured defects this pins closed:
 *
 *   1. The intent key was charge + amount + rail + day. Two parents paying the same fee from their own
 *      links on the same day got ONE attempt — and the second parent was handed the first parent's
 *      PaymentIntent and client secret.
 *   2. A retry after a decline reused the failed attempt, so the provider's later success on it was
 *      refused as "stale" and never posted.
 *   3. A stored card declined at confirmation threw, leaving the attempt `initiated` with no provider
 *      id: unfindable by the webhook, and shown as "Processing" indefinitely.
 *
 * Against a fake store that enforces the real unique index and a fake provider that records every
 * call, so each claim is about what was PERSISTED and what was ASKED of Stripe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/financials/subsidy/resolveFamilyCollectible", () => ({
    resolveFamilyCollectible: vi.fn(async () => ({ currentlyCollectibleCents: collectibleCents, currencyCode: "USD" })),
}));
vi.mock("@/lib/financials/payments/providerMerchant", () => ({
    resolveCollectionMerchant: vi.fn(async () => ({
        ok: true,
        merchant: { merchantId: "merchant-1", providerAccountRef: "acct_1", achReadiness: "ready", readiness: "ready" },
    })),
}));
vi.mock("@/lib/financials/payments/paymentMethodService", async (importActual) => ({
    ...(await importActual<typeof import("@/lib/financials/payments/paymentMethodService")>()),
    materializeMethodForMerchant: vi.fn(async () => ({ ok: true, clonedMethodRef: "pm_clone" })),
}));

import {
    attemptPayerKey,
    createCardCollection,
    deriveIntentKey,
    type StripeRead,
} from "@/lib/financials/payments/collectionAttempt";

const ORG = "org-1";
const CHARGE = "chg-1";
const CUSTOMER = "cust-1";
const AGREEMENT = "agr-1";
const MOM = "person-mom";
const DAD = "person-dad";
const STRANGER = "person-elsewhere";
const OPERATOR_A = "user-a";
const OPERATOR_B = "user-b";

let collectibleCents = 10_000;

type Row = Record<string, unknown>;

/** A store that enforces `uq_payment_collection_attempts_org_intent` the way Postgres does. */
function store() {
    const tables: Record<string, Row[]> = {
        persons: [
            { id: MOM, org_id: ORG },
            { id: DAD, org_id: ORG },
            { id: STRANGER, org_id: "org-2" },
        ],
        charges: [{ id: CHARGE, org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT }],
        child_enrollment_agreements: [{ id: AGREEMENT, org_id: ORG, customer_id: CUSTOMER }],
        payment_methods: [
            method("pm-mom-card", MOM, "person"),
            method("pm-mom-card-2", MOM, "person"),
            method("pm-dad-card", DAD, "person"),
            method("pm-agency-card", "agency-1", "agency"),
            { ...method("pm-unscoped", MOM, "person"), customer_id: null },
        ],
        payment_collection_attempts: [],
    };
    let seq = 0;

    const client = {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let kind: "select" | "insert" | "update" = "select";
            let pending: Row | null = null;
            const self: Record<string, unknown> = {};
            const rows = () => (tables[table] ??= []);
            const matching = () => rows().filter((r) => filters.every((f) => f(r)));

            self.select = () => self;
            self.order = () => self;
            self.limit = () => self;
            self.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return self; };
            self.neq = (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return self; };
            self.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return self; };
            self.is = (c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return self; };
            self.insert = (values: Row) => { kind = "insert"; pending = values; return self; };
            self.update = (values: Row) => { kind = "update"; pending = values; return self; };

            const settle = (): { data: unknown; error: { message: string } | null } => {
                if (kind === "insert" && pending) {
                    if (
                        table === "payment_collection_attempts"
                        && rows().some((r) => r.org_id === pending!.org_id && r.intent_key === pending!.intent_key)
                    ) {
                        return { data: null, error: { message: 'duplicate key value violates unique constraint "uq_payment_collection_attempts_org_intent"' } };
                    }
                    const row = { id: `att-${++seq}`, provider_transaction_id: null, last_provider_detail: {}, ...pending };
                    rows().push(row);
                    return { data: [{ ...row }], error: null };
                }
                if (kind === "update" && pending) {
                    const hit = matching();
                    hit.forEach((r) => Object.assign(r, pending));
                    return { data: hit.map((r) => ({ ...r })), error: null };
                }
                return { data: matching().map((r) => ({ ...r })), error: null };
            };
            const one = async () => {
                const res = settle();
                const list = res.data as Row[] | null;
                return { data: list?.[0] ?? null, error: res.error };
            };
            self.single = one;
            self.maybeSingle = one;
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
    };
    return { client: client as never, tables };
}

function method(id: string, owner: string, ownerType: "person" | "agency"): Row {
    return {
        id, org_id: ORG, payer_entity_type: ownerType, payer_entity_id: owner, customer_id: CUSTOMER,
        rail: "card", processor: "stripe", usability_state: "usable", verification_state: "verified",
        provider_customer_ref: "cus_1", provider_method_ref: `pm_${id}`,
    };
}

/** A provider that remembers every PaymentIntent and every call. */
function provider(opts: { declineMethods?: Set<string>; uncancelable?: Record<string, string> } = {}) {
    const intents = new Map<string, Row>();
    const calls: Array<{ path: string; body: Record<string, string>; headers: Record<string, string> }> = [];
    let n = 0;

    const call = async (path: string, body: Record<string, string>, headers: Record<string, string>) => {
        calls.push({ path, body, headers });
        const cancel = path.match(/^payment_intents\/([^/]+)\/cancel$/);
        if (cancel) {
            const id = decodeURIComponent(cancel[1]);
            const blocked = opts.uncancelable?.[id];
            if (blocked) {
                intents.set(id, { ...(intents.get(id) ?? {}), status: blocked });
                return { status: 400, body: { error: { code: "payment_intent_unexpected_state" } } };
            }
            intents.set(id, { ...(intents.get(id) ?? {}), status: "canceled" });
            return { status: 200, body: { id, status: "canceled" } };
        }
        const id = `pi_${++n}`;
        const declined = body.payment_method && opts.declineMethods?.has(body.payment_method);
        const intent = {
            id,
            client_secret: `${id}_secret_${n}`,
            status: declined ? "requires_payment_method" : body.confirm ? "succeeded" : "requires_payment_method",
        };
        intents.set(id, intent);
        if (declined) {
            return {
                status: 402,
                body: {
                    error: {
                        type: "card_error", code: "card_declined", decline_code: "generic_decline",
                        message: "Your card was declined.", payment_intent: { id, status: "requires_payment_method" },
                    },
                },
            };
        }
        return { status: 200, body: intent };
    };
    const read: StripeRead = async (path) => {
        const id = decodeURIComponent(path.replace(/^payment_intents\//, ""));
        const intent = intents.get(id);
        return intent ? { status: 200, body: intent } : { status: 404, body: { error: { message: "no such intent" } } };
    };
    const creates = () => calls.filter((c) => c.path === "payment_intents");
    const cancels = () => calls.filter((c) => c.path.endsWith("/cancel"));
    return { call, read, intents, calls, creates, cancels };
}

beforeEach(() => {
    collectibleCents = 10_000;
});

describe("the intent key names the payer and the method", () => {
    it("two payers, one charge, one amount, one day → two keys", () => {
        const base = { chargeId: CHARGE, amountCents: 5_000, rail: "card", day: "2026-10-16" };
        const mom = deriveIntentKey({ ...base, payerKey: attemptPayerKey({ payerPersonId: MOM }) });
        const dad = deriveIntentKey({ ...base, payerKey: attemptPayerKey({ payerPersonId: DAD }) });
        expect(mom).not.toBe(dad);
        expect(deriveIntentKey({ ...base, payerKey: attemptPayerKey({ payerPersonId: MOM }) })).toBe(mom);
    });

    it("a different stored method is a different intent; a later generation is a different key", () => {
        const base = { chargeId: CHARGE, amountCents: 5_000, rail: "card", day: "2026-10-16", payerKey: `person:${MOM}` };
        expect(deriveIntentKey({ ...base, paymentMethodId: "pm-a" })).not.toBe(deriveIntentKey({ ...base, paymentMethodId: "pm-b" }));
        expect(deriveIntentKey({ ...base })).not.toBe(deriveIntentKey({ ...base, generation: 1 }));
    });

    it("never shares a shape with a historical key, so no old attempt can be reached by a new request", () => {
        const key = deriveIntentKey({ chargeId: CHARGE, amountCents: 5_000, rail: "card", day: "2026-10-16" });
        expect(key.startsWith("collect:v2:")).toBe(true);
        expect(key).not.toBe(["collect", CHARGE, "5000", "card", "2026-10-16"].join(":"));
    });

    it("an unnamed payer is keyed by the operator who asked", () => {
        expect(attemptPayerKey({ actorUserId: OPERATOR_A })).not.toBe(attemptPayerKey({ actorUserId: OPERATOR_B }));
        expect(attemptPayerKey({ payerPersonId: MOM, actorUserId: OPERATOR_A })).toBe(`person:${MOM}`);
    });
});

describe("payer-scoped attempts", () => {
    it("the same payer retrying gets the same attempt and ONE PaymentIntent", async () => {
        const { client } = store();
        const p = provider();
        const args = { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM };
        const first = await createCardCollection(client, args, p.call, p.read);
        const retry = await createCardCollection(client, args, p.call, p.read);
        expect(first.ok && retry.ok).toBe(true);
        if (!first.ok || !retry.ok) return;
        expect(retry.attemptId).toBe(first.attemptId);
        expect(retry.reused).toBe(true);
        expect(retry.clientSecret).toBe(first.clientSecret);
        expect(p.creates()).toHaveLength(1);
    });

    it("two payers paying the same amount against the same charge on the same day are independent", async () => {
        const { client, tables } = store();
        const p = provider();
        const mom = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM }, p.call, p.read);
        const dad = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: DAD }, p.call, p.read);
        expect(mom.ok && dad.ok).toBe(true);
        if (!mom.ok || !dad.ok) return;
        expect(dad.attemptId).not.toBe(mom.attemptId);
        expect(dad.providerTransactionId).not.toBe(mom.providerTransactionId);
        // The defect: Dad was handed Mom's session. He must never be.
        expect(dad.clientSecret).not.toBe(mom.clientSecret);
        expect(dad.reused).toBe(false);
        const rows = tables.payment_collection_attempts;
        expect(rows.map((r) => r.payer_person_id).sort()).toEqual([DAD, MOM].sort());
        // And each provider request carries its own idempotency key.
        const keys = p.creates().map((c) => c.headers["Idempotency-Key"]);
        expect(new Set(keys).size).toBe(2);
    });

    it("two operators collecting unnamed payers do not share a session", async () => {
        const { client } = store();
        const p = provider();
        const a = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, actorUserId: OPERATOR_A }, p.call, p.read);
        const b = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, actorUserId: OPERATOR_B }, p.call, p.read);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(b.clientSecret).not.toBe(a.clientSecret);
    });

    it("the same payer with a different stored method is a different attempt", async () => {
        const { client } = store();
        const p = provider();
        const one = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card" }, p.call, p.read);
        const two = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card-2" }, p.call, p.read);
        expect(one.ok && two.ok).toBe(true);
        if (!one.ok || !two.ok) return;
        expect(two.attemptId).not.toBe(one.attemptId);
    });

    it("refuses a stored method owned by a different payer, and an agency method for a named person", async () => {
        const { client } = store();
        const p = provider();
        const other = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-dad-card" }, p.call, p.read);
        expect(other.ok).toBe(false);
        if (!other.ok) expect(other.reason).toBe("method_payer_mismatch");

        const agency = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-agency-card" }, p.call, p.read);
        expect(agency.ok).toBe(false);
        if (!agency.ok) expect(agency.reason).toBe("method_payer_mismatch");
        expect(p.creates()).toHaveLength(0);
    });

    it("refuses a stored method with no account scope", async () => {
        const { client } = store();
        const p = provider();
        const out = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-unscoped" }, p.call, p.read);
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("method_wrong_account");
    });

    it("refuses a payer who is not a person in this organization", async () => {
        const { client } = store();
        const p = provider();
        const elsewhere = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: STRANGER }, p.call, p.read);
        expect(elsewhere.ok).toBe(false);
        if (!elsewhere.ok) expect(elsewhere.reason).toBe("payer_not_found");
        const invented = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: "made-up" }, p.call, p.read);
        expect(invented.ok).toBe(false);
        expect(p.creates()).toHaveLength(0);
    });

    it("never hands out an attempt whose recorded payer is someone else, even on a key collision", async () => {
        const { client, tables } = store();
        const p = provider();
        const first = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM }, p.call, p.read);
        expect(first.ok).toBe(true);
        // Corrupt the row so its key is Mom's but its payer is Dad — the shape a forged key would take.
        tables.payment_collection_attempts[0].payer_person_id = DAD;
        await expect(
            createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM }, p.call, p.read),
        ).rejects.toThrow(/different payer/);
    });
});

describe("a declined stored method", () => {
    it("is recorded as a FAILED attempt with its provider id — not left initiated, not thrown", async () => {
        const { client, tables } = store();
        const p = provider({ declineMethods: new Set(["pm_clone"]) });
        const out = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card" }, p.call, p.read);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("payment_declined");
        expect(out.attemptId).toBeTruthy();
        expect(out.message).toMatch(/Nothing was collected/);

        const row = tables.payment_collection_attempts.find((r) => r.id === out.attemptId)!;
        expect(row.processor_state).toBe("failed");
        // The webhook can now find it, because the intent id was recorded.
        expect(row.provider_transaction_id).toBe("pi_1");
        expect(row.last_provider_detail).toMatchObject({ failure_code: "card_declined", decline_code: "generic_decline" });
        // Card data never lands here.
        expect(JSON.stringify(row.last_provider_detail)).not.toMatch(/4242|number|cvc/);
    });

    it("a retry opens a NEW attempt, retires the declined intent, and keeps the failure's history", async () => {
        const { client, tables } = store();
        const declines = new Set(["pm_clone"]);
        const p = provider({ declineMethods: declines });
        const args = { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card" };
        const declined = await createCardCollection(client, args, p.call, p.read);
        expect(declined.ok).toBe(false);

        declines.clear(); // the card works now
        const retried = await createCardCollection(client, args, p.call, p.read);
        expect(retried.ok).toBe(true);
        if (!retried.ok || declined.ok) return;
        expect(retried.attemptId).not.toBe(declined.attemptId);
        expect(retried.reused).toBe(false);
        expect(p.cancels().map((c) => c.path)).toEqual(["payment_intents/pi_1/cancel"]);
        const rows = tables.payment_collection_attempts;
        expect(rows).toHaveLength(2);
        expect(rows[0].processor_state).toBe("failed"); // history kept
        expect(String(rows[1].intent_key)).toMatch(/:g1$/);
        // Its own provider idempotency key, so Stripe cannot replay the decline.
        const keys = p.creates().map((c) => c.headers["Idempotency-Key"]);
        expect(new Set(keys).size).toBe(2);
    });

    it("a network retry of the declined request is still answered as declined only once — the next try is fresh", async () => {
        const { client } = store();
        const p = provider({ declineMethods: new Set(["pm_clone"]) });
        const args = { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card" };
        const a = await createCardCollection(client, args, p.call, p.read);
        const b = await createCardCollection(client, args, p.call, p.read);
        expect(a.ok || b.ok).toBe(false);
        if (a.ok || b.ok) return;
        expect(b.attemptId).not.toBe(a.attemptId);
        expect(b.reason).toBe("payment_declined");
    });

    it("refuses to open a new attempt while the declined intent has gone on to collect", async () => {
        const { client, tables } = store();
        const p = provider({ declineMethods: new Set(["pm_clone"]), uncancelable: { pi_1: "succeeded" } });
        const args = { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card" };
        await createCardCollection(client, args, p.call, p.read);
        const out = await createCardCollection(client, args, p.call, p.read);
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("previous_attempt_unresolved");
        expect(tables.payment_collection_attempts).toHaveLength(1);
        expect(p.creates()).toHaveLength(1);
    });

    it("is bounded: a payer cannot open attempts without limit", async () => {
        const { client } = store();
        const p = provider({ declineMethods: new Set(["pm_clone"]) });
        const args = { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 5_000, payerPersonId: MOM, paymentMethodId: "pm-mom-card" };
        let last;
        for (let i = 0; i < 11; i += 1) last = await createCardCollection(client, args, p.call, p.read);
        expect(last!.ok).toBe(false);
        if (!last!.ok) expect(last!.reason).toBe("too_many_attempts");
    });
});

describe("money already on its way counts against what may be asked", () => {
    it("a second payer cannot ask for the whole balance while the first payer's money is settling", async () => {
        const { client, tables } = store();
        const p = provider();
        const mom = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 4_000, payerPersonId: MOM }, p.call, p.read);
        expect(mom.ok).toBe(true);
        tables.payment_collection_attempts[0].processor_state = "processing";

        const tooMuch = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 10_000, payerPersonId: DAD }, p.call, p.read);
        expect(tooMuch.ok).toBe(false);
        if (!tooMuch.ok) {
            expect(tooMuch.reason).toBe("amount_exceeds_collectible");
            expect(tooMuch.message).toMatch(/6000 cents/);
        }

        const remainder = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 6_000, payerPersonId: DAD }, p.call, p.read);
        expect(remainder.ok).toBe(true);
    });

    it("the same payer's own in-flight attempt does not block their retry", async () => {
        const { client, tables } = store();
        const p = provider();
        const args = { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 10_000, payerPersonId: MOM };
        const first = await createCardCollection(client, args, p.call, p.read);
        tables.payment_collection_attempts[0].processor_state = "processing";
        const again = await createCardCollection(client, args, p.call, p.read);
        expect(first.ok && again.ok).toBe(true);
        if (first.ok && again.ok) expect(again.attemptId).toBe(first.attemptId);
    });

    it("a declined or recognised attempt is not in flight", async () => {
        const { client, tables } = store();
        const p = provider();
        await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 10_000, payerPersonId: MOM }, p.call, p.read);
        tables.payment_collection_attempts[0].processor_state = "failed";
        const dad = await createCardCollection(client, { orgId: ORG, chargeId: CHARGE, requestedAmountCents: 10_000, payerPersonId: DAD }, p.call, p.read);
        expect(dad.ok).toBe(true);
    });
});
