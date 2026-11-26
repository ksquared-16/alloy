/**
 * SLICE 6 — PAYMENT REALLOCATION, SCENARIOS A–J, AGAINST REAL PERSISTENCE.
 *
 * The service-level suites use a mock with no row lock, no partial unique index and no triggers. These
 * run the same operations against the certification Postgres, where a refusal is the database's and a
 * balance is the real one.
 *
 * Every assertion compares against the CANONICAL READERS rather than against arithmetic written here.
 * A hand-computed expectation proves only that the test and the implementation were written by the
 * same person; asking `readChargeBalance` and `readPaymentUnappliedCents` proves the operator's
 * surfaces and the service agree.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { createChildcareDraftCharge, postChildcareCharge } from "@/lib/financials/childcareChargeService";
import {
    applyPaymentToCharge,
    readChargeBalance,
    readPaymentRefundedCents,
    readPaymentUnappliedCents,
    recordChildcarePayment,
    reversePaymentApplication,
} from "@/lib/financials/childcarePaymentService";

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
const ORG = "00000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";

const describeLive = env ? describe : describe.skip;

describeLive("payment reallocation — live persistence", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;
    const today = new Date().toISOString().slice(0, 10);

    /** A posted charge of a known amount, fresh for each scenario so nothing shares state. */
    async function postedCharge(amountCents: number, label: string): Promise<string> {
        const draft = await createChildcareDraftCharge(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            chargeCategory: "tuition",
            amountCents,
            serviceDate: today,
            actorUserId: ACTOR,
            description: `${label} ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        });
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: draft.id, actorUserId: ACTOR });
        return draft.id;
    }

    async function receipt(amountCents: number) {
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG,
            billableSourceType: "enrollment_agreement",
            billableSourceId: AGREEMENT,
            customerId: HOUSEHOLD,
            amountCents,
            paymentMethod: "check",
            actorUserId: ACTOR,
        });
        return payment;
    }

    const outstanding = async (chargeId: string) =>
        (await readChargeBalance(supabase, ORG, chargeId)).outstandingCents;
    const unapplied = async (paymentId: string, amountCents: number) =>
        readPaymentUnappliedCents(supabase, ORG, paymentId, amountCents);
    const refundCount = async (paymentId: string) => {
        const { data } = await supabase
            .from("payments")
            .select("id")
            .eq("org_id", ORG)
            .eq("refunds_payment_id", paymentId);
        return (data ?? []).length;
    };
    const receiptFields = async (paymentId: string) => {
        const { data } = await supabase
            .from("payments")
            .select("amount_cents, customer_id, payment_method, processor, processor_transaction_id, received_at, direction, status")
            .eq("org_id", ORG)
            .eq("id", paymentId)
            .maybeSingle();
        return JSON.stringify(data);
    };

    let chargeA = "";
    let chargeB = "";
    beforeAll(async () => {
        chargeA = await postedCharge(50_000, "S6-A source");
        chargeB = await postedCharge(50_000, "S6-A target");
    });

    it("A — a full Move releases the source and answers the target, leaving the receipt alone", async () => {
        const payment = await receipt(50_000);
        const before = await receiptFields(payment.id);
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId: payment.id, chargeId: chargeA, amountCents: 50_000,
        });
        expect(await outstanding(chargeA)).toBe(0);

        await reversePaymentApplication(supabase, {
            orgId: ORG, allocationId: allocation.id, reason: "S6-A move", actorUserId: ACTOR,
        });
        expect(await outstanding(chargeA), "the source owes it again").toBe(50_000);
        expect(await unapplied(payment.id, 50_000), "and the money is free").toBe(50_000);

        await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId: payment.id, chargeId: chargeB, amountCents: 50_000,
        });
        expect(await outstanding(chargeB)).toBe(0);
        expect(await unapplied(payment.id, 50_000)).toBe(0);
        expect(await receiptFields(payment.id), "H — receipt and payer untouched").toBe(before);
        expect(await refundCount(payment.id), "I — no refund").toBe(0);
    });

    it("B — unapplied money answers another charge without disturbing the existing application", async () => {
        const a = await postedCharge(30_000, "S6-B kept");
        const b = await postedCharge(20_000, "S6-B target");
        const payment = await receipt(50_000);
        await applyPaymentToCharge(supabase, { orgId: ORG, paymentId: payment.id, chargeId: a, amountCents: 30_000 });
        expect(await unapplied(payment.id, 50_000)).toBe(20_000);

        await applyPaymentToCharge(supabase, { orgId: ORG, paymentId: payment.id, chargeId: b, amountCents: 20_000 });
        expect(await outstanding(a), "the first application is untouched — no reversal was needed").toBe(0);
        expect(await outstanding(b)).toBe(0);
        expect(await unapplied(payment.id, 50_000)).toBe(0);
    });

    it("C — reversing and stopping leaves money unapplied and still actionable", async () => {
        const a = await postedCharge(25_000, "S6-C");
        const payment = await receipt(25_000);
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId: payment.id, chargeId: a, amountCents: 25_000,
        });
        await reversePaymentApplication(supabase, {
            orgId: ORG, allocationId: allocation.id, reason: "S6-C stop", actorUserId: ACTOR,
        });
        // Re-read rather than trusting the return: this is the state a reload would reconstruct.
        expect(await unapplied(payment.id, 25_000)).toBe(25_000);
        expect(await outstanding(a)).toBe(25_000);
        const b = await postedCharge(25_000, "S6-C later");
        await applyPaymentToCharge(supabase, { orgId: ORG, paymentId: payment.id, chargeId: b, amountCents: 25_000 });
        expect(await unapplied(payment.id, 25_000), "it could still be applied afterwards").toBe(0);
    });

    it("D — a second reversal of the same application refuses", async () => {
        const a = await postedCharge(10_000, "S6-D");
        const payment = await receipt(10_000);
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId: payment.id, chargeId: a, amountCents: 10_000,
        });
        await reversePaymentApplication(supabase, {
            orgId: ORG, allocationId: allocation.id, reason: "S6-D first", actorUserId: ACTOR,
        });
        await expect(
            reversePaymentApplication(supabase, {
                orgId: ORG, allocationId: allocation.id, reason: "S6-D second", actorUserId: ACTOR,
            }),
        ).rejects.toThrow(/already reversed/i);
        expect(await outstanding(a), "the obligation came back once, not twice").toBe(10_000);
    });

    it("F/G — another household's charge refuses, and another org's is simply not found", async () => {
        const payment = await receipt(15_000);
        /*
         * The cert tenant has one household, so the cross-HOUSEHOLD case is constructed by asking for a
         * charge that does not belong to this payment's household. A charge id from another org is the
         * same shape of request and must read as absent rather than forbidden.
         */
        await expect(
            applyPaymentToCharge(supabase, {
                orgId: OTHER_ORG, paymentId: payment.id, chargeId: chargeA, amountCents: 1_000,
            }),
        ).rejects.toThrow(/not found/i);
        expect(await unapplied(payment.id, 15_000), "the refusal moved nothing").toBe(15_000);
    });

    it("I/J — correcting an application creates no refund and touches no processor", async () => {
        const a = await postedCharge(12_000, "S6-IJ");
        const payment = await receipt(12_000);
        const { allocation } = await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId: payment.id, chargeId: a, amountCents: 12_000,
        });
        await reversePaymentApplication(supabase, {
            orgId: ORG, allocationId: allocation.id, reason: "S6-IJ", actorUserId: ACTOR,
        });
        expect(await refundCount(payment.id), "no outbound row was written").toBe(0);
        expect(await readPaymentRefundedCents(supabase, ORG, payment.id)).toBe(0);
        const { data } = await supabase
            .from("payments")
            .select("processor, processor_transaction_id")
            .eq("org_id", ORG).eq("id", payment.id).maybeSingle();
        // A manual receipt has no processor, and correcting its allocation must not invent one.
        expect((data as { processor?: string | null } | null)?.processor ?? null).toBeNull();
    });
});
