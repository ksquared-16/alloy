/**
 * RECOGNISING MONEY THE PROVIDER ALREADY TOOK — the act, without a provider.
 *
 * W3's risk is not that a Stripe call is shaped wrongly. It is that Alloy mints money it should not:
 * a receipt for a collection that never settled, a second receipt for one already recognised, or a
 * receipt built from Alloy's own stale copy of provider state rather than from the provider.
 *
 * Each of those is provable here, deterministically, against a fake store and a fake provider.
 */
import { describe, expect, it, vi } from "vitest";

import {
    operatorReason,
    readUnrecognizedCollections,
    recognizeCollectionAttempt,
    recordRecognitionRefusal,
    type ProviderIntentRead,
} from "@/lib/financials/payments/collectionRecognition";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const ACTOR = "actor-1";

type Row = Record<string, unknown>;

/** Records every write, so a test asserts what was PERSISTED rather than what a return value claimed. */
function store(attempts: Row[] = [], methods: Row[] = []) {
    const rows = attempts.map((r) => ({ ...r }));
    const methodRows = methods.map((r) => ({ ...r }));
    const writes: Array<{ table: string; values: Row }> = [];

    const client = {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let kind = "select";
            let pending: Row | null = null;
            let limitN: number | null = null;
            const self: Record<string, unknown> = {};

            self.select = () => self;
            self.order = () => self;
            self.limit = (n: number) => { limitN = n; return self; };
            self.eq = (col: string, value: unknown) => { filters.push((r) => r[col] === value); return self; };
            self.is = (col: string, value: unknown) => {
                filters.push((r) => (value === null ? r[col] == null : r[col] === value));
                return self;
            };
            self.in = (col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return self; };
            self.update = (values: Row) => { kind = "update"; pending = values; return self; };

            const source = () => (table === "payment_methods" ? methodRows : rows);
            const matching = () => source().filter((r) => filters.every((f) => f(r)));

            const settle = () => {
                if (kind === "update" && pending) {
                    const hit = matching();
                    hit.forEach((r) => Object.assign(r, pending));
                    writes.push({ table, values: { ...pending } });
                    return { data: hit[0] ? { ...hit[0] } : null, error: null };
                }
                const out = matching().map((r) => ({ ...r }));
                return { data: limitN ? out.slice(0, limitN) : out, error: null };
            };

            self.maybeSingle = async () => {
                const res = settle();
                return Array.isArray(res.data) ? { data: res.data[0] ?? null, error: res.error } : res;
            };
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
    };
    return { client, rows, methodRows, writes };
}

function attempt(over: Row = {}): Row {
    return {
        id: "att-1",
        org_id: ORG,
        charge_id: "chg-1",
        currency: "USD",
        requested_amount_cents: 30_000,
        payer_person_id: "person-1",
        provider_transaction_id: "pi_1",
        processor_state: "succeeded",
        canonical_payment_id: null,
        rail: "card",
        provider_account_ref: "acct_1",
        merchant_id: "merch-1",
        payment_method_id: "m-1",
        expected_settlement_on: null,
        billable_source_type: "customer",
        billable_source_id: "cust-1",
        processor_state_at: "2026-09-20T10:00:00Z",
        last_provider_detail: {},
        ...over,
    };
}

const provider = (body: Record<string, unknown>, status = 200): ProviderIntentRead =>
    async () => ({ status, body });

const SETTLED = { status: "succeeded", amount_received: 30_000, currency: "usd" };

describe("recognizing a provider-confirmed collection", () => {
    it("REFUSES to recognize from Alloy's own cached state — it asks the provider", async () => {
        const s = store([attempt()]);
        /*
         * The attempt row SAYS succeeded. If that were enough, a stale or tampered row would mint a
         * receipt. The provider is the authority, and here it says otherwise.
         */
        const out = await recognizeCollectionAttempt(
            s.client as never,
            { orgId: ORG, attemptId: "att-1" },
            provider({ status: "processing" }),
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("not_settled");
        expect(out.message).toMatch(/still processing/i);
    });

    it("refuses an attempt that never reached the provider", async () => {
        const s = store([attempt({ provider_transaction_id: null })]);
        const out = await recognizeCollectionAttempt(s.client as never, { orgId: ORG, attemptId: "att-1" }, provider({}));
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("not_settled");
        expect(out.message).toMatch(/never reached the provider/i);
    });

    it("an attempt in another organization reads as absent, not as forbidden", async () => {
        const s = store([attempt({ org_id: OTHER_ORG })]);
        const out = await recognizeCollectionAttempt(s.client as never, { orgId: ORG, attemptId: "att-1" }, provider(SETTLED));
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("attempt_not_found");
        expect(out.message).toMatch(/not in this organization/i);
    });

    it("ALREADY RECOGNIZED is a success that mints nothing, and returns the existing receipt", async () => {
        const s = store([attempt({ canonical_payment_id: "pay-existing" })]);
        const asked = vi.fn();
        const out = await recognizeCollectionAttempt(
            s.client as never,
            { orgId: ORG, attemptId: "att-1" },
            async (...a) => { asked(...a); return { status: 200, body: SETTLED }; },
        );
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.recognized, "it did not recognize it now — it was already done").toBe(false);
        expect(out.paymentId).toBe("pay-existing");
        /* And it did not even need to ask the provider. */
        expect(asked).not.toHaveBeenCalled();
    });

    it("reports a provider it cannot reach, rather than assuming either answer", async () => {
        const s = store([attempt()]);
        const out = await recognizeCollectionAttempt(
            s.client as never,
            { orgId: ORG, attemptId: "att-1" },
            async () => { throw new Error("connection reset"); },
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("provider_unreachable");
        /* Crucially it did NOT fall through to recognizing. */
        expect(s.rows[0].canonical_payment_id).toBeNull();
    });

    it("a provider error status is unreachable, not settled", async () => {
        const s = store([attempt()]);
        const out = await recognizeCollectionAttempt(
            s.client as never,
            { orgId: ORG, attemptId: "att-1" },
            provider({ error: { message: "No such payment_intent" } }, 404),
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toBe("provider_unreachable");
    });

    /**
     * REVOKING A METHOD CANNOT UN-TAKE MONEY.
     *
     * If the card was removed after the provider collected but before Alloy recognised it, the money
     * still moved. Refusing here would leave a family's payment permanently unrecorded to punish a
     * later, unrelated decision.
     */
    it("recognizes money whose method was revoked after the provider took it", async () => {
        const s = store([attempt()], [{ id: "m-1", org_id: ORG, usability_state: "revoked", display_brand: "visa", display_last4: "4242" }]);
        const out = await recognizeCollectionAttempt(
            s.client as never,
            { orgId: ORG, attemptId: "att-1" },
            provider(SETTLED),
        );
        /*
         * It reaches the canonical posting authority — which this fake store cannot complete — rather
         * than refusing on the method's current state. The refusal it returns is a POSTING one.
         */
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason, "it must not refuse for method revocation").not.toBe("not_settled");
    });

    it("a refusal is written where an operator will see it again, and never touches provider state", async () => {
        const s = store([attempt()]);
        await recordRecognitionRefusal(s.client as never, {
            orgId: ORG,
            attemptId: "att-1",
            reason: "The provider collected a different amount than this collection authorized.",
            actorUserId: ACTOR,
        });

        const detail = s.rows[0].last_provider_detail as Record<string, unknown>;
        expect(String(detail.recognition_reason)).toMatch(/different amount/i);
        expect(detail.recognition_attempted_at).toBeTruthy();

        const written = s.writes.find((w) => w.table === "payment_collection_attempts")?.values ?? {};
        /* The evidence itself is untouched: mutating it to make recognition succeed is the one sin. */
        for (const forbidden of ["processor_state", "canonical_payment_id", "requested_amount_cents", "payer_person_id", "payment_method_id"]) {
            expect(Object.keys(written)).not.toContain(forbidden);
        }
    });

    it("says a posting refusal in words an operator can act on", () => {
        expect(operatorReason("amount_mismatch", "provider collected 31000 but Alloy authorised 30000"))
            .toMatch(/different amount .* needs a person to decide/i);
        expect(operatorReason("currency_mismatch")).toMatch(/different currency/i);
        /* And never a bare reason code. */
        expect(operatorReason("amount_mismatch")).not.toMatch(/amount_mismatch/);
    });
});

describe("the recognition queue", () => {
    it("lists only provider-confirmed collections Alloy has not recognized", async () => {
        const s = store([
            attempt({ id: "att-unrecognized" }),
            attempt({ id: "att-done", canonical_payment_id: "pay-1" }),
            attempt({ id: "att-processing", processor_state: "processing" }),
            attempt({ id: "att-other-org", org_id: OTHER_ORG }),
        ]);
        const queue = await readUnrecognizedCollections(s.client as never, { orgId: ORG });
        expect(queue.map((q) => q.attemptId)).toEqual(["att-unrecognized"]);
    });

    it("carries the business meaning needed to act, including safe method display", async () => {
        const s = store(
            [attempt({ rail: "ach", expected_settlement_on: "2026-09-24", last_provider_detail: { recognition_reason: "Alloy could not record the payment: the accounting period is closed." } })],
            [{ id: "m-1", org_id: ORG, display_brand: "TEST BANK", display_last4: "6789" }],
        );
        const [row] = await readUnrecognizedCollections(s.client as never, { orgId: ORG });

        expect(row.amountCents).toBe(30_000);
        expect(row.rail).toBe("ach");
        expect(row.customerId).toBe("cust-1");
        expect(row.payerPersonId).toBe("person-1");
        expect(row.expectedSettlementOn).toBe("2026-09-24");
        expect(row.methodBrand).toBe("TEST BANK");
        expect(row.methodLast4).toBe("6789");
        expect(row.lastReason).toMatch(/accounting period is closed/i);
    });

    it("never exposes a provider reference as the row's identity", async () => {
        const s = store([attempt()], [{ id: "m-1", org_id: ORG, display_brand: "visa", display_last4: "4242" }]);
        const [row] = await readUnrecognizedCollections(s.client as never, { orgId: ORG });
        const serialized = JSON.stringify(row);
        expect(serialized).not.toContain("pi_1");
        expect(serialized).not.toContain("acct_1");
    });

    it("a method from another organization is not joined into the row", async () => {
        const s = store([attempt()], [{ id: "m-1", org_id: OTHER_ORG, display_brand: "visa", display_last4: "4242" }]);
        const [row] = await readUnrecognizedCollections(s.client as never, { orgId: ORG });
        expect(row.methodBrand, "the method read is org-scoped").toBeNull();
    });
});
