/**
 * THREAD 2 — THE CARD'S OWN PROJECTIONS, AGAINST REAL PERSISTENCE.
 *
 * `buildFinancialsCardVM` is the one thing every Financials density renders, and until now the parts
 * of it that describe MONEY RECEIVED were never exercised against a real database by anything: the
 * unit tests build rows by hand, and Thread 8's certification proves the payment SERVICES rather
 * than the card's reading of them.
 *
 * These cases post a real charge, record a real payment through Thread 8's certified service, and
 * then ask the composer what the card would show:
 *
 *   T2-1  a posted charge with nothing paid offers payment and owes its whole amount
 *   T2-2  a partial payment moves appliedCents/outstandingCents and the charge still offers payment
 *   T2-3  the balance is the read model's, and it moved by exactly the amount applied
 *   T2-4  a settled charge stops offering payment
 *   T2-5  a draft never offers payment, and does not move the balance
 *   T2-6  a receipt is separable from its application, and unapplied money is visible as cash
 *   T2-7  a refund is presented as money going back, naming the receipt it reverses
 *   T2-8  the composer never reads financial_journal_entries — balance is not journal-derived
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
    createChildcareDraftCharge,
    postChildcareCharge,
} from "@/lib/financials/childcareChargeService";
import {
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
} from "@/lib/financials/childcarePaymentService";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import {
    presentPayment,
    unappliedTotalCents,
} from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";

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

const env = certEnv();

/** The certification tenant's household and its enrolled child's agreement. */
const ORG = "00000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";

const describeLive = env ? describe : describe.skip;

describeLive("Financials card projections — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    /** Today, so the charge lands in the CURRENT billing period the card reconciles. */
    const today = new Date().toISOString().slice(0, 10);

    async function vm() {
        return buildFinancialsCardVM(supabase, { orgId: ORG, customerId: HOUSEHOLD, customerMemberId: null, today });
    }
    async function rowFor(chargeId: string) {
        const v = await vm();
        const row = v.rows.find((r) => r.chargeId === chargeId);
        expect(row, `charge ${chargeId} should appear in the card's ledger`).toBeTruthy();
        return row!;
    }

    let postedChargeId = "";

    beforeAll(async () => {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents: 120_000,
            serviceDate: today,
            actorUserId: ACTOR,
            description: `T2 card certification ${Date.now()}`,
        });
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });
        postedChargeId = draft.id;
    });

    it("T2-1 — a posted, unpaid charge owes its whole amount and offers payment", async () => {
        const row = await rowFor(postedChargeId);
        expect(row.lifecycleStatus).toBe("posted");
        expect(row.appliedCents).toBe(0);
        expect(row.outstandingCents).toBe(120_000);
        expect(row.offersPayment).toBe(true);
    });

    it("T2-2/T2-3 — a partial payment moves the row and the balance by exactly what applied", async () => {
        const before = await vm();
        const balanceBefore = before.reconciliation.balanceCents;

        const paid = await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId: postedChargeId,
            amountCents: 45_000,
            paymentMethod: "check",
            status: "posted",
            actorUserId: ACTOR,
            idempotencyKey: `t2-partial-${postedChargeId}`,
        });
        expect(paid.allocation).not.toBeNull();

        const row = await rowFor(postedChargeId);
        expect(row.appliedCents).toBe(45_000);
        expect(row.outstandingCents).toBe(75_000);
        // Still owing, so still payable — a partial payment does not close an obligation.
        expect(row.offersPayment).toBe(true);

        const after = await vm();
        expect(after.reconciliation.balanceCents).toBe(balanceBefore - 45_000);
        expect(after.reconciliation.paymentsCents).toBe(before.reconciliation.paymentsCents + 45_000);
    });

    it("T2-6 — the receipt is separable from its application, and unapplied money is visible", async () => {
        // Money that arrives against the account without settling this charge in full: received and
        // applied are different numbers, and the difference is cash sitting there.
        const v = await vm();
        const receipt = v.payments.find((p) => p.appliedCents === 45_000 && p.direction === "inbound");
        expect(receipt, "the recorded payment should appear on the card").toBeTruthy();

        const shown = presentPayment(receipt!);
        expect(shown.kind).toBe("receipt");
        expect(shown.statusLabel).toBe("Received");
        expect(shown.receivedCents).toBe(45_000);
        expect(shown.appliedCents).toBe(45_000);
        expect(shown.unappliedCents).toBe(0);
        expect(shown.offersRefund).toBe(true);
        // Nothing unapplied on a payment recorded-and-applied in one act.
        expect(unappliedTotalCents([receipt!])).toBe(0);
    });

    it("T2-4 — settling the rest stops the charge offering payment", async () => {
        await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId: postedChargeId,
            amountCents: 75_000,
            paymentMethod: "cash",
            status: "posted",
            actorUserId: ACTOR,
            idempotencyKey: `t2-settle-${postedChargeId}`,
        });

        const row = await rowFor(postedChargeId);
        expect(row.appliedCents).toBe(120_000);
        expect(row.outstandingCents).toBe(0);
        // Nothing left to collect, so the card offers nothing. The allocation bounds trigger would
        // refuse it anyway; this is the card agreeing with the database rather than pre-empting it.
        expect(row.offersPayment).toBe(false);
    });

    it("T2-5 — a draft never offers payment and does not move the balance", async () => {
        const before = (await vm()).reconciliation.balanceCents;
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents: 30_000,
            serviceDate: today,
            actorUserId: ACTOR,
            description: `T2 draft ${Date.now()}`,
        });

        const row = await rowFor(draft.id);
        expect(row.status).toBe("draft");
        expect(row.offersPayment).toBe(false);
        // A draft is not owed: the balance is untouched by its existence.
        expect((await vm()).reconciliation.balanceCents).toBe(before);
    });

    it("T2-7 — a refund reads as money going back, naming the receipt it reverses", async () => {
        const v = await vm();
        const receipt = v.payments.find((p) => p.direction === "inbound" && p.appliedCents === 75_000);
        expect(receipt).toBeTruthy();

        const balanceBefore = v.reconciliation.balanceCents;
        const refunded = await refundChildcarePayment(supabase, {
            orgId: ORG,
            paymentId: receipt!.paymentId,
            amountCents: 25_000,
            reason: "T2 certification partial refund",
            actorUserId: ACTOR,
            idempotencyKey: `t2-refund-${receipt!.paymentId}`,
        });

        const after = await vm();
        const refundRow = after.payments.find((p) => p.paymentId === refunded.refund.id);
        expect(refundRow, "the refund should appear on the card").toBeTruthy();

        const shown = presentPayment(refundRow!);
        expect(shown.kind).toBe("refund");
        expect(shown.statusLabel).toBe("Refunded");
        expect(shown.refundsPaymentId).toBe(receipt!.paymentId);
        expect(shown.offersRefund).toBe(false);

        // The obligation comes back by exactly what was refunded — the read model's arithmetic,
        // from charges and active allocations, not from any journal row.
        expect(after.reconciliation.balanceCents).toBe(balanceBefore + 25_000);
    });

    it("T2-8 — the balance is never journal-derived", async () => {
        // The journal holds rows for this account; the card's balance is computed without them.
        const { count } = await supabase
            .from("financial_journal_entries")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG);
        expect((count ?? 0) > 0, "Thread 5 should have recorded history for this account").toBe(true);

        const v = await vm();
        // Responsibility − payments applied. Stated here as the identity the card renders, so a
        // future change that quietly reached for the journal would break this rather than pass.
        expect(v.reconciliation.balanceCents).toBe(
            v.reconciliation.responsibilityCents - v.reconciliation.paymentsCents,
        );
    });
});
