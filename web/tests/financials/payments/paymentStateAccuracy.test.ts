/**
 * PAYMENT-STATE ACCURACY, AND WHO MAY ASK ABOUT AN ATTEMPT.
 *
 * A declined saved card read as "Processing": the operator's collection-state route mapped every
 * state it did not name to `processing`, and a decline left the attempt `initiated`. These pin the
 * shared vocabulary that replaced it, and the recognition scope a participant surface must pass so a
 * family's link cannot name another family's attempt.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/financials/payments/canonicalPosting", () => ({
    postProviderConfirmedCollection: vi.fn(async () => ({ posted: true, paymentId: "pay-1", alreadyRecorded: false, appliedCents: 5_000 })),
}));

import {
    collectionLifecycle,
    isDeclineFailure,
    lifecycleLabel,
    meansSettledCash,
    retryAvailable,
} from "@/lib/financials/payments/collectionLifecycle";
import {
    attemptWithinScope,
    recognizeCollectionAttempt,
    type ProviderIntentRead,
} from "@/lib/financials/payments/collectionRecognition";

describe("the lifecycle says what happened to a declined payment", () => {
    it("a card decline is DECLINED, with a retry available, and is not money", () => {
        const state = collectionLifecycle({
            rail: "card", processorState: "failed", canonicallyRecognized: false, providerFailureCode: "card_declined",
        });
        expect(state).toBe("declined");
        expect(lifecycleLabel(state, "card")).toBe("Declined — retry available");
        expect(retryAvailable(state)).toBe(true);
        expect(meansSettledCash(state)).toBe(false);
    });

    it("an issuer decline code alone makes it a decline", () => {
        expect(isDeclineFailure(null, "insufficient_funds")).toBe(true);
        expect(isDeclineFailure("processing_error", null)).toBe(false);
    });

    it("a failure that is not a decline is FAILED, still retryable, never Processing", () => {
        const state = collectionLifecycle({ rail: "card", processorState: "failed", canonicallyRecognized: false });
        expect(state).toBe("failed");
        expect(lifecycleLabel(state, "card")).not.toMatch(/processing/i);
        expect(retryAvailable(state)).toBe(true);
    });

    it("nothing in flight offers a retry, and only recognition means money", () => {
        for (const processorState of ["initiated", "requires_payment_method", "requires_action", "processing", "succeeded"]) {
            const state = collectionLifecycle({ rail: "card", processorState, canonicallyRecognized: false });
            expect(retryAvailable(state), processorState).toBe(false);
            expect(meansSettledCash(state), processorState).toBe(false);
        }
        expect(meansSettledCash(collectionLifecycle({ rail: "card", processorState: "failed", canonicallyRecognized: true }))).toBe(true);
    });

    it("an attempt that never reached the provider is not 'Processing'", () => {
        const state = collectionLifecycle({ rail: "card", processorState: "initiated", canonicallyRecognized: false });
        expect(lifecycleLabel(state, "card")).not.toMatch(/processing/i);
    });
});

describe("the operator's collection-state route uses the shared vocabulary", () => {
    const src = () => readFileSync(join(process.cwd(), "app/api/admin/financials/collection-state/route.ts"), "utf8");

    it("derives its stage from collectionLifecycle rather than its own fallthrough", () => {
        const s = src();
        expect(s).toMatch(/collectionLifecycle\(\{/);
        expect(s).toMatch(/providerFailureCode/);
        expect(s).toMatch(/retryAvailable: retryAvailable\(lifecycle\)/);
        // The old fallthrough mapped `initiated` and `requires_payment_method` to "processing".
        expect(s).not.toMatch(/row\.processor_state === "requires_action"\s*\?\s*"requires_action"\s*:\s*"processing"/);
    });

    it("keeps `recognized` as the only handover signal the surface polls on", () => {
        expect(src()).toMatch(/recognized: Boolean\(row\.canonical_payment_id\)/);
    });
});

type Row = Record<string, unknown>;

function store(rows: Row[]) {
    const client = {
        from() {
            const filters: Array<(r: Row) => boolean> = [];
            let pending: Row | null = null;
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return self; };
            self.neq = (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return self; };
            self.update = (v: Row) => { pending = v; return self; };
            const settle = () => {
                const hit = rows.filter((r) => filters.every((f) => f(r)));
                if (pending) hit.forEach((r) => Object.assign(r, pending));
                return { data: hit.map((r) => ({ ...r })), error: null };
            };
            self.maybeSingle = async () => ({ data: settle().data[0] ?? null, error: null });
            self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
            return self;
        },
    };
    return client as never;
}

const attempt = (over: Row = {}): Row => ({
    id: "att-1", org_id: "org-1", charge_id: "chg-family-a", currency: "USD", requested_amount_cents: 5_000,
    payer_person_id: "person-a", provider_transaction_id: "pi_1", processor_state: "requires_payment_method",
    canonical_payment_id: null, rail: "card", provider_account_ref: "acct_1", merchant_id: "m", payment_method_id: null,
    expected_settlement_on: null, ...over,
});

const settled: ProviderIntentRead = async () => ({ status: 200, body: { status: "succeeded", amount_received: 5_000, currency: "usd" } });

describe("recognition scope — a participant may only ask about its own attempt", () => {
    it("an attempt on another family's charge reads as absent and posts nothing", async () => {
        const rows = [attempt()];
        const out = await recognizeCollectionAttempt(
            store(rows),
            { orgId: "org-1", attemptId: "att-1", scope: { chargeIds: ["chg-family-b"], payerPersonId: "person-b" } },
            settled,
        );
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.reason).toBe("attempt_not_found");
            expect(out.attemptId).toBeNull();
        }
        expect(rows[0].processor_state).toBe("requires_payment_method");
    });

    it("the right charge but a different payer is also absent", () => {
        expect(attemptWithinScope({ charge_id: "chg-family-a", payer_person_id: "person-a" }, { chargeIds: ["chg-family-a"], payerPersonId: "person-b" })).toBe(false);
        expect(attemptWithinScope({ charge_id: "chg-family-a", payer_person_id: null }, { payerPersonId: "person-a" })).toBe(false);
        expect(attemptWithinScope({ charge_id: "chg-family-a", payer_person_id: "person-a" }, { chargeIds: ["chg-family-a"], payerPersonId: "person-a" })).toBe(true);
        // An operator passes no scope and keeps org-wide reach.
        expect(attemptWithinScope({ charge_id: "x", payer_person_id: null }, undefined)).toBe(true);
    });

    it("within scope, a provider success posts and the cached state converges to succeeded — even after a decline", async () => {
        const rows = [attempt({ processor_state: "failed" })];
        const out = await recognizeCollectionAttempt(
            store(rows),
            { orgId: "org-1", attemptId: "att-1", scope: { chargeIds: new Set(["chg-family-a"]), payerPersonId: "person-a" } },
            settled,
        );
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.recognized).toBe(true);
        expect(rows[0].processor_state).toBe("succeeded");
    });
});
