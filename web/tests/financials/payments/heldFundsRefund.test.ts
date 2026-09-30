/**
 * REFUNDING HELD MONEY — held straight back to the payer, refused before anything is executed.
 *
 * Three rules govern this path and each one exists because the obvious implementation breaks it.
 *
 *   1. NO AVAILABLE-PREPAID INTERMEDIATE. The tempting shape is release-then-refund: the release
 *      already exists, the refund already exists, and composing them looks like reuse. It makes the
 *      money ordinary spendable prepaid for the interval before the refund lands, where another
 *      operation can apply it to an obligation while it is already on its way back to the payer.
 *
 *   2. THE REFUSAL COMES BEFORE PROVIDER EXECUTION. A non-refundable deposit that reached Stripe
 *      and failed there would already have told the family a refund was under way.
 *      `heldRefundEligibility` was separated from the refund for exactly this, and it reads the
 *      SNAPSHOT terms the money was taken under — never the organisation's current policy.
 *
 *   3. THE DISCHARGE HAPPENS WHERE IT CAN. `..._refunded_names_payment_chk` requires the
 *      disposition to name the refund payment it became, so on a card rail it cannot be written
 *      when the operator clicks — Stripe has been asked and no canonical refund row exists yet. The
 *      hold is carried on the provider refund record and discharged at RECOGNITION. The manual rail
 *      discharges immediately, because cash handed back has no executor to wait for.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { heldRefundEligibility, type HeldDeposit } from "@/lib/financials/prepaid/heldDeposits";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MIGRATION = "../supabase/migrations/20261103120000_provider_refund_carries_hold.sql";
const REFUND_COLLECTION = "lib/financials/payments/refundCollection.ts";
const ACTION = "lib/adminV2/actions/definitions/financialPaymentActions.ts";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";

const hold = (over: Partial<HeldDeposit> = {}): HeldDeposit => ({
    id: "hold-1", orgId: "org-1", paymentId: "pay-1",
    originalAmountCents: 50_000, remainingCents: 50_000,
    releasedCents: 0, appliedCents: 0, refundedCents: 0,
    refundable: true, refundableTerms: {}, policyId: null, reason: null,
    heldAt: null, createdBy: null, dispositions: [], open: true, ...over,
});

describe("the terms the money was taken under decide, and they decide early", () => {
    it("refuses a non-refundable lot", () => {
        const out = heldRefundEligibility(hold({ refundable: false }), 10_000);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.message).toMatch(/non-refundable/i);
    });

    it("refuses more than is still held, even on a refundable lot", () => {
        const out = heldRefundEligibility(hold({ remainingCents: 10_000 }), 20_000);
        expect(out.ok).toBe(false);
    });

    it("allows the remaining amount of a refundable lot", () => {
        expect(heldRefundEligibility(hold({ remainingCents: 10_000 }), 10_000).ok).toBe(true);
    });

    /**
     * THE ORDERING IS THE REQUIREMENT, not the presence of the check.
     *
     * An eligibility check placed after `requestProviderRefund` would refuse a deposit whose refund
     * Stripe had already accepted — the family told a refund was under way, and then told it was
     * not allowed.
     */
    it("the refusal is raised BEFORE any provider call", () => {
        const src = code(ACTION);
        const check = src.indexOf("heldRefundEligibility(hold");
        const provider = src.indexOf("requestProviderRefund(");
        expect(check, "the eligibility check exists").toBeGreaterThan(-1);
        expect(provider, "the provider call exists").toBeGreaterThan(-1);
        expect(check, "eligibility must precede provider execution").toBeLessThan(provider);
        /* And before the manual rail's executor too. */
        expect(check).toBeLessThan(src.indexOf("refundChildcarePayment("));
    });

    it("bounds the refund by the LOT, not by the receipt", () => {
        /*
         * The receipt's refundable ceiling is larger than the lot's remaining amount whenever only
         * part of a receipt was held. Using the receipt's would let a $175 lot refund $500.
         */
        const src = code(ACTION);
        const window = src.slice(src.indexOf("heldRefundEligibility(hold"), src.indexOf("heldRefundEligibility(hold") + 200);
        expect(src).toMatch(/hold\.remainingCents/);
        expect(window).toMatch(/requested/);
    });
});

describe("held money goes straight to refunded", () => {
    it("neither rail releases first", () => {
        /*
         * A `released` disposition anywhere in the refund path is the defect: it makes the money
         * ordinary available prepaid for an interval in which it can be spent.
         */
        for (const rel of [ACTION, REFUND_COLLECTION]) {
            const src = code(rel);
            const refundPath = src.slice(src.indexOf("PAYMENT_REFUND_ACTION_KEY") >= 0 ? src.indexOf("PAYMENT_REFUND_ACTION_KEY") : 0);
            expect(refundPath, `${rel} must not release before refunding`).not.toMatch(/kind:\s*"released"/);
        }
        /*
         * Scoped to the refund HANDLER. A dot-all regex over the whole host matches any release
         * anywhere — including the legitimate one on the release panel — so it would have passed
         * whatever this function did.
         */
        const host = code(HOST);
        const fn = host.slice(host.indexOf("const openRefundHeldFunds"));
        const handler = fn.slice(0, fn.indexOf("const confirmRelease"));
        expect(handler, "refund must not release the lot first").not.toMatch(/deposit\.release/);
        expect(handler).not.toMatch(/kind:\s*"released"/);
    });

    it("the provider refund record carries the lot it discharges", () => {
        const src = code(REFUND_COLLECTION);
        expect(src).toMatch(/hold_id:\s*\(input\.holdId/);
        expect(src).toMatch(/holdId\?:/);
        /* And recognition reads it back. */
        expect(src).toMatch(/canonical_refund_payment_id, reason, hold_id/);
    });

    it("recognition writes the disposition, naming the canonical refund", () => {
        const src = code(REFUND_COLLECTION);
        const at = src.indexOf("recognizeProviderRefund");
        const body = src.slice(at);
        expect(body).toMatch(/kind:\s*"refunded"/);
        expect(body).toMatch(/refund_payment_id:\s*result\.refund\.id/);
        /*
         * AFTER THE CLAIM. Two recognisers may reach the canonical refund; only the one that
         * actually claimed it may write the disposition, or the same money is disposed twice.
         */
        expect(body.indexOf("kind: \"refunded\""))
            .toBeGreaterThan(body.indexOf("already_recognized\", detail: result.refund.id"));
    });

    /**
     * A FAILED DISCHARGE MUST NOT FAIL THE REFUND.
     *
     * The money has gone back. Reporting the recognition as failed invites a retry of a refund that
     * already happened, which is worse than an overstated hold — so the defect is recorded and
     * surfaced, and the refund still reports as recognised.
     */
    it("a discharge failure is recorded without failing a refund that happened", () => {
        const src = code(REFUND_COLLECTION);
        const body = src.slice(src.indexOf("recognizeProviderRefund"));
        const dispose = body.indexOf("kind: \"refunded\"");
        const tail = body.slice(dispose);
        expect(tail).toMatch(/recognition_error/);
        expect(tail).toMatch(/return \{ recognized: true, canonicalRefundId: result\.refund\.id \}/);
    });

    it("a replayed recognition is a no-op rather than a second disposal", () => {
        /* The webhook and the inline path both reach it for the same refund. */
        for (const rel of [REFUND_COLLECTION, ACTION]) {
            expect(code(rel), `${rel} tolerates the replay`)
                .toMatch(/uq_payment_hold_dispositions_one_per_refund/);
        }
    });

    it("the manual rail discharges immediately, because it can", () => {
        const src = code(ACTION);
        const at = src.indexOf("refundChildcarePayment(");
        const body = src.slice(at);
        expect(body).toMatch(/kind:\s*"refunded"/);
        expect(body).toMatch(/refund_payment_id:\s*result\.refund\.id/);
        expect(body).toMatch(/disposed_by/);
    });
});

describe("the schema lets a refund remember its lot, exactly once", () => {
    it("adds the carried column with a real reference", () => {
        const sql = read(MIGRATION);
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS hold_id uuid REFERENCES public\.payment_holds/);
    });

    it("permits one refunded disposition per refund payment", () => {
        const sql = read(MIGRATION);
        expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_hold_dispositions_one_per_refund/);
        /* Partial: released and applied dispositions are unaffected and a lot may have many. */
        expect(sql).toMatch(/WHERE kind = 'refunded' AND refund_payment_id IS NOT NULL/);
    });

    it("is re-runnable, because a failed apply does not roll back DDL", () => {
        const sql = read(MIGRATION);
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
        expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS|CREATE UNIQUE INDEX IF NOT EXISTS/);
    });
});

describe("the operator is offered refund only where it can be honoured", () => {
    it("the control is absent on a non-refundable lot", () => {
        const detail = read(DETAIL);
        const at = detail.indexOf('kind="refund"');
        expect(at).toBeGreaterThan(-1);
        /* Guarded by the lot's own terms, not by a permission or a feature flag. */
        expect(detail.slice(Math.max(0, at - 400), at)).toMatch(/h\.refundable/);
    });

    it("the mount supplies it", () => {
        /*
         * Read at the MOUNT. A component written to consume a callback that no production mount
         * supplies is the defect this sprint hit three times, and a component test cannot see it.
         */
        const host = code(HOST);
        const at = host.indexOf("onReverseAdjustment={openReverseAdjustment}");
        const block = host.slice(at, at + 500);
        expect(block).toMatch(/onRefundHeldFunds=\{/);
        expect(block).not.toMatch(/onRefundHeldFunds=\{\s*null\s*\}/);
    });

    it("the host carries the lot and narrows the ceiling to it", () => {
        const host = code(HOST);
        expect(host).toMatch(/hold_id: refundTarget\.hold\.holdId/);
        expect(host, "the composer's ceiling, not the row's").toMatch(/refundTarget\?\.refundableCents \?\? p\.refundableCents/);
        expect(host).toMatch(/Math\.min\(args\.remainingCents, receipt\.refundableCents\)/);
    });

    it("refund opens the receipt's own composer rather than a second refund form", () => {
        /* A refund belongs to the receipt it reverses; two refund surfaces would drift. */
        const host = code(HOST);
        const fn = host.slice(host.indexOf("const openRefundHeldFunds"));
        expect(fn.slice(0, 1400)).toMatch(/setRefundTarget\(\{/);
    });
});
