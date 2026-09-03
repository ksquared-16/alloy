/**
 * THE PAYMENT READ MODEL, AGAINST THE REAL DATABASE.
 *
 * `buildFinancialsCardVM` reported `paymentsCents` as a hard-coded zero, and every test that
 * asserted it was asserting a constant. These cases run the composer and the payment service
 * against the certification stack (`alloy-cert`) over rows this file records, applies and refunds
 * through real persistence — so the number on the card is the number in Postgres.
 *
 * Thread 8 requirements certified here:
 *   B  one payment persisted, one application, balance decreased exactly once; a re-read preserves it
 *   C  a partial payment leaves an exact residual and a second payment settles it, first intact
 *   D  a refund leaves the original intact, carries lineage, and moves the balance back
 *   E  the DB refuses a duplicate application — the guarantee no mock has
 *
 * The SQL certification (`certification/financials/payment-application.cert.sh`) proves the database
 * holds the rules; this proves the READ MODEL agrees with what the database holds. They are
 * different claims, and Thread 1's history is the argument for both: a mock is what let
 * `chargeLifecycleService` write `updated_by` for months against a column that did not exist.
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic. Bring the stack
 * up and write the env file with certification/alloy-certify up && certification/alloy-certify env, or export
 * CERT_SUPABASE_URL / CERT_SERVICE_ROLE_KEY.
 *
 * Fixture: certification/fixtures/financials-charge-spine.sql (apply it first).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import {
    applyPaymentToCharge,
    readChargeBalance,
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
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
const TODAY = new Date().toISOString().slice(0, 10);

const writtenCharges: string[] = [];
const writtenPayments: string[] = [];

/** A unique key per run, so a re-run is not mistaken for a retry of the previous one. */
const RUN = `live-${Date.now()}`;

async function postCharge(supabase: SupabaseClient, amountCents: number): Promise<string> {
    const { data: draft, error } = await supabase
        .from("charges")
        .insert({
            org_id: ORG,
            job_id: null,
            billable_source_type: "enrollment_agreement",
            billable_source_id: AGREEMENT,
            charge_type: "fee",
            charge_category: "fee",
            status: "draft",
            currency_code: "USD",
            amount_cents: amountCents,
            service_date: TODAY,
            occurs_on: TODAY,
            billable_on: TODAY,
            description: "live payment certification",
            metadata: {},
            created_by: ACTOR,
            updated_by: ACTOR,
        })
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    const id = (draft as { id: string }).id;
    writtenCharges.push(id);
    const { error: postError } = await supabase
        .from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id)
        .eq("status", "draft");
    if (postError) throw new Error(postError.message);
    return id;
}

/** The card's own answer for this period, composed exactly as the surface composes it. */
async function cardBalance(supabase: SupabaseClient): Promise<{ payments: number; balance: number }> {
    const vm = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId: HOUSEHOLD, today: TODAY });
    return { payments: vm.reconciliation.paymentsCents, balance: vm.reconciliation.balanceCents };
}

describe.skipIf(!env)("payment application — live, against the certification database", () => {
    const supabase = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;

    /**
     * THIS TEST CANNOT CLEAN UP AFTER ITSELF, and that is the guarantee working.
     *
     * A posted childcare payment refuses DELETE and an application refuses DELETE — the rules this
     * file exists to certify. The service-role client is exempt from RLS but NOT from triggers, so a
     * teardown that deleted these rows would mean the rules were not there. (A `delete()` here would
     * simply fail, and failing quietly while claiming to tidy up is worse than not trying.)
     *
     * The reclaim path is `certification/fixtures/financials-charge-spine.sql`, which suspends the
     * triggers with `session_replication_role = replica` for its own teardown and removes exactly
     * these rows by billable source. Restoring a proving state is not an operator action; that is
     * the whole reason the fixture is allowed to do what this is not.
     *
     * So this only ASSERTS the refusal, leaving the rows for the fixture — which makes the
     * certification's own inability to tidy up a piece of evidence rather than an untidiness.
     */
    afterAll(async () => {
        if (!supabase || writtenPayments.length === 0) return;
        const attempted = await supabase.from("payments").delete().in("id", writtenPayments);
        expect(
            attempted.error?.message ?? "",
            "a posted childcare payment must refuse DELETE, including this test's own rows",
        ).toMatch(/is immutable/);
    });

    it("B — money applies once, the card agrees with the database, and a retry adds nothing", async () => {
        const client = supabase!;
        const before = await cardBalance(client);
        const chargeId = await postCharge(client, 130_000);
        const afterPost = await cardBalance(client);
        expect(afterPost.balance).toBe(before.balance + 130_000);

        const input = {
            orgId: ORG,
            chargeId,
            amountCents: 130_000,
            paymentMethod: "check" as const,
            idempotencyKey: `${RUN}-full`,
            actorUserId: ACTOR,
        };
        const paid = await recordAndApplyChildcarePayment(client, input);
        writtenPayments.push(paid.payment.id);

        // The PERSISTED row, not the return value.
        const { data: persisted } = await client
            .from("payments")
            .select("id, job_id, billable_source_type, billable_source_id, status, direction, created_by")
            .eq("id", paid.payment.id)
            .single();
        const row = persisted as Record<string, unknown>;
        expect(row.job_id, "a childcare payment carries no job").toBeNull();
        expect(row.billable_source_type).toBe("enrollment_agreement");
        expect(row.billable_source_id).toBe(AGREEMENT);
        expect(row.status).toBe("posted");
        expect(row.direction).toBe("inbound");
        expect(row.created_by).toBe(ACTOR);

        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);
        const afterPay = await cardBalance(client);
        expect(afterPay.payments).toBe(afterPost.payments + 130_000);
        expect(afterPay.balance).toBe(before.balance);

        // A RETRY. Same key, same request — the money moves zero further times.
        const replay = await recordAndApplyChildcarePayment(client, input);
        expect(replay.alreadyRecorded).toBe(true);
        expect(replay.alreadyApplied).toBe(true);
        expect(replay.payment.id).toBe(paid.payment.id);
        expect((await cardBalance(client)).balance).toBe(before.balance);

        // E — THE DATABASE REFUSES A SECOND APPLICATION. This is the guarantee no mock holds: the
        // service's lookup would let two concurrent applies through, and the partial unique index
        // will not.
        await expect(
            client.from("payment_allocations").insert({
                org_id: ORG,
                payment_id: paid.payment.id,
                charge_id: chargeId,
                target_entity_type: "charge",
                target_entity_id: chargeId,
                allocated_amount_cents: 1,
                status: "active",
                allocation_type: "payment_application",
            }).then((r) => {
                if (r.error) throw new Error(r.error.message);
            }),
        ).rejects.toThrow(/uq_payment_allocations_one_active_per_payment_charge/);
    });

    it("C — a partial payment leaves an exact residual, and the first survives the second", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 100_000);

        const first = await recordAndApplyChildcarePayment(client, {
            orgId: ORG,
            chargeId,
            amountCents: 40_000,
            paymentMethod: "cash",
            idempotencyKey: `${RUN}-part-a`,
            actorUserId: ACTOR,
        });
        writtenPayments.push(first.payment.id);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(60_000);

        const second = await recordAndApplyChildcarePayment(client, {
            orgId: ORG,
            chargeId,
            amountCents: 60_000,
            paymentMethod: "check",
            idempotencyKey: `${RUN}-part-b`,
            actorUserId: ACTOR,
        });
        writtenPayments.push(second.payment.id);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);

        // The FIRST application is untouched — a second payment must not disturb it.
        const { data: firstAlloc } = await client
            .from("payment_allocations")
            .select("allocated_amount_cents, status")
            .eq("id", first.allocation!.id)
            .single();
        expect((firstAlloc as { allocated_amount_cents: number }).allocated_amount_cents).toBe(40_000);
        expect((firstAlloc as { status: string }).status).toBe("active");

        // OVER-PAYING IS REFUSED BY THE DATABASE, not merely by the service's arithmetic.
        const spare = await recordAndApplyChildcarePayment(client, {
            orgId: ORG,
            chargeId: await postCharge(client, 5_000),
            amountCents: 5_000,
            paymentMethod: "cash",
            idempotencyKey: `${RUN}-spare`,
            actorUserId: ACTOR,
        });
        writtenPayments.push(spare.payment.id);
        await expect(
            applyPaymentToCharge(client, {
                orgId: ORG,
                paymentId: spare.payment.id,
                chargeId,
                amountCents: 1_000,
            }),
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("D — a refund leaves the receipt exactly as received and puts the balance back", async () => {
        const client = supabase!;
        const before = await cardBalance(client);
        const chargeId = await postCharge(client, 70_000);

        const paid = await recordAndApplyChildcarePayment(client, {
            orgId: ORG,
            chargeId,
            amountCents: 70_000,
            paymentMethod: "check",
            idempotencyKey: `${RUN}-refundable`,
            actorUserId: ACTOR,
        });
        writtenPayments.push(paid.payment.id);
        expect((await cardBalance(client)).balance).toBe(before.balance);

        const refunded = await refundChildcarePayment(client, {
            orgId: ORG,
            paymentId: paid.payment.id,
            reason: "live certification refund",
            idempotencyKey: `${RUN}-refund`,
            actorUserId: ACTOR,
        });
        writtenPayments.push(refunded.refund.id);

        // The receipt is untouched IN THE DATABASE — no in-place rewrite of financial history.
        const { data: original } = await client
            .from("payments")
            .select("amount_cents, direction, status")
            .eq("id", paid.payment.id)
            .single();
        expect(original).toMatchObject({ amount_cents: 70_000, direction: "inbound", status: "posted" });

        // The refund is its own row with lineage.
        const { data: refundRow } = await client
            .from("payments")
            .select("refunds_payment_id, direction, amount_cents")
            .eq("id", refunded.refund.id)
            .single();
        expect(refundRow).toMatchObject({
            refunds_payment_id: paid.payment.id,
            direction: "outbound",
            amount_cents: 70_000,
        });

        // The application is REVERSED and still exists — history is not erased.
        const { data: alloc } = await client
            .from("payment_allocations")
            .select("status, reversed_at, reversal_reason")
            .eq("id", paid.allocation!.id)
            .single();
        expect((alloc as { status: string }).status).toBe("reversed");
        expect((alloc as { reversed_at: string | null }).reversed_at).toBeTruthy();
        expect((alloc as { reversal_reason: string }).reversal_reason).toBe("live certification refund");

        // The balance is back on the card, by exactly the refunded amount.
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(70_000);
        expect((await cardBalance(client)).balance).toBe(before.balance + 70_000);

        // The posted receipt cannot be edited in place, whatever asks.
        const edit = await client.from("payments").update({ amount_cents: 1 }).eq("id", paid.payment.id);
        expect(edit.error?.message ?? "").toMatch(/is immutable/);
    });
});
