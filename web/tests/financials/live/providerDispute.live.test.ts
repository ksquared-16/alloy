/**
 * THREAD 8C SLICE 3 — the money the provider took back, against real Postgres.
 *
 * The invariants here are the ones a family notices if they are wrong: their outstanding must come
 * back by exactly what was returned, once, and the receipt that recorded the money arriving must
 * still say so afterwards. A returned payment is not a refund they asked for and must never read as
 * one.
 *
 * Provider events are constructed here rather than awaited, deliberately: duplicate, out-of-order
 * and concurrent delivery cannot be produced on demand by a real bank. The dispute SHAPE is the one
 * measured on the governed test merchant — `du_…`, `debit_not_authorized`, funds withdrawn
 * separately from creation — so this is HERMETIC CONVERGENCE evidence over a real provider model,
 * and it is not claimed as real Stripe proof.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readChargeBalance, recordAndApplyChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { recognizeProviderDispute } from "@/lib/financials/payments/providerDispute";
import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) =>
            file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

function readTrusted(key: string): string | null {
    if (process.env[key]) return process.env[key] as string;
    try {
        const f = resolve(homedir(), ".local/state/alloy-dev/gateway/vacilando/trusted-secrets/stripe-test.env");
        const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
        return line?.slice(key.length + 1).trim() || null;
    } catch {
        return null;
    }
}

const env = certEnv();
const whsec = readTrusted("STRIPE_WEBHOOK_SECRET");
const ORG = "00000000-0000-4000-8000-000000000001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const CHILD = "fc500000-0000-4000-8000-0000000c0002";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;
const describeLive = env ? describe : describe.skip;
const describeWebhook = env && whsec ? describe : describe.skip;

function signed(body: string): string {
    const t = Math.floor(Date.now() / 1000);
    return `t=${t},v1=${createHmac("sha256", whsec!).update(`${t}.${body}`).digest("hex")}`;
}

/** A dispute event in the shape the governed test merchant actually produced. */
function disputeEvent(
    type: string,
    disputeId: string,
    opts: { amount?: number; pi?: string | null; account?: string; id?: string; status?: string } = {},
): string {
    return JSON.stringify({
        id: opts.id ?? `evt_8c_${Math.random().toString(36).slice(2)}`,
        type,
        created: Math.floor(Date.now() / 1000),
        account: opts.account ?? "acct_certification_8c",
        data: {
            object: {
                id: disputeId,
                object: "dispute",
                amount: opts.amount ?? 1_000,
                currency: "usd",
                reason: "debit_not_authorized",
                status: opts.status ?? "lost",
                payment_intent: opts.pi ?? null,
            },
        },
    });
}

const charges: string[] = [];
const disputes: string[] = [];

async function postCharge(client: SupabaseClient, amountCents: number): Promise<string> {
    const { data, error } = await client
        .from("charges")
        .insert({
            org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
            charge_type: "service", charge_category: "tuition", status: "draft",
            amount_cents: amountCents, currency_code: "USD", service_date: TODAY, occurs_on: TODAY,
            billable_on: TODAY, description: "8C dispute certification", created_by: ACTOR, updated_by: ACTOR,
        })
        .select("id").single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    charges.push(id);
    await client.from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    return id;
}

/** A receipt that really arrived, so there is something for the provider to take back. */
async function receipt(client: SupabaseClient, chargeId: string, amountCents: number) {
    const r = await recordAndApplyChildcarePayment(client, {
        orgId: ORG, chargeId, amountCents, paymentMethod: "ach", status: "posted", receivedAt: TODAY,
        payerEntityType: "person", payerEntityId: CHILD, actorUserId: ACTOR,
        idempotencyKey: `8c-receipt:${chargeId}:${amountCents}`,
    });
    return (r.payment as { id: string }).id;
}

function disputeEvidence(over: Partial<Parameters<typeof recognizeProviderDispute>[1]> = {}) {
    const id = over.providerDisputeId ?? `du_8c_${Math.random().toString(36).slice(2, 10)}`;
    disputes.push(id);
    return {
        orgId: ORG,
        processor: "stripe" as const,
        providerDisputeId: id,
        providerAccountRef: "acct_certification",
        providerTransactionId: null,
        amountCents: 1_000,
        currency: "USD",
        providerReason: "debit_not_authorized",
        providerState: "lost",
        fundsWithdrawn: true,
        providerStateAt: new Date().toISOString(),
        ...over,
    };
}

describeLive("Thread 8C — provider-initiated reversal", () => {
    afterAll(async () => {
        if (!supabase) return;
        await supabase.from("payment_provider_disputes").delete().in("provider_dispute_id", disputes);
        for (const c of charges) {
            const { data } = await supabase.from("payments").select("id").eq("org_id", ORG);
            void data;
            await supabase.from("payment_allocations").delete().eq("charge_id", c);
        }
    });

    it("a dispute that has only been RAISED takes no money back", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);
        const original = await receipt(client, chargeId, 10_000);
        const before = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;

        // `created` is a notification. The cash is still there.
        const outcome = await recognizeProviderDispute(client, disputeEvidence({
            providerState: "needs_response", fundsWithdrawn: false,
        }));

        expect(outcome.recognized, JSON.stringify(outcome)).toBe(false);
        expect((outcome as { reason: string }).reason).toBe("awaiting_funds_withdrawn");
        expect(
            (await readChargeBalance(client, ORG, chargeId)).outstandingCents,
            "raising a dispute must not restore a family's outstanding",
        ).toBe(before);
        // …and evidence is durable regardless.
        const { data } = await client.from("payment_provider_disputes").select("id").eq("provider_dispute_id", disputes.at(-1)!);
        expect((data ?? []).length, "the dispute is recorded even before it takes money").toBe(1);
        void original;
    });

    it("funds withdrawn reverses exactly once, leaves the receipt standing, and restores the exact amount", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);
        const original = await receipt(client, chargeId, 10_000);
        const afterPayment = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;

        const ev = disputeEvidence({ amountCents: 10_000 });
        // Evidence first, then the receipt becomes resolvable — the order the webhook produces.
        await recognizeProviderDispute(client, { ...ev, fundsWithdrawn: false });
        await client.from("payment_provider_disputes")
            .update({ original_payment_id: original }).eq("provider_dispute_id", ev.providerDisputeId);
        const outcome = await recognizeProviderDispute(client, ev);

        expect(outcome.recognized, JSON.stringify(outcome)).toBe(true);
        const reversalId = (outcome as { reversalPaymentId: string }).reversalPaymentId;

        // THE ORIGINAL STANDS. A reversal is a new fact, never an edit of the receipt.
        const { data: orig } = await client.from("payments")
            .select("id, amount_cents, status, direction, reversal_origin").eq("id", original).single();
        const o = orig as Record<string, unknown>;
        expect(o.amount_cents, "the receipt still says what arrived").toBe(10_000);
        expect(o.status).toBe("posted");
        expect(o.direction).toBe("inbound");
        expect(o.reversal_origin, "a receipt has no reversal origin").toBeNull();

        // THE REVERSAL NAMES ITS CAUSE. This is what stops it reading as a refund.
        const { data: rev } = await client.from("payments")
            .select("id, direction, refunds_payment_id, reversal_origin, amount_cents").eq("id", reversalId).single();
        const r = rev as Record<string, unknown>;
        expect(r.direction).toBe("outbound");
        expect(r.refunds_payment_id).toBe(original);
        expect(r.reversal_origin, "a returned payment is not an operator refund").toBe("provider");
        expect(r.amount_cents).toBe(10_000);

        // EXACT RESTORATION.
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(afterPayment + 10_000);

        // THREE EVENTS, ONE REVERSAL. `closed` arriving later changes evidence, not money.
        const again = await recognizeProviderDispute(client, { ...ev, providerState: "lost" });
        expect(again.recognized).toBe(true);
        expect((again as { alreadyRecognized: boolean }).alreadyRecognized).toBe(true);
        const { data: all } = await client.from("payments").select("id").eq("refunds_payment_id", original);
        expect((all ?? []).length, "one dispute must not become two reversals").toBe(1);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(afterPayment + 10_000);
    });

    it("restores the DISPUTE amount, never the balance impact that includes the provider's fee", async () => {
        /*
         * Measured on the real merchant: a 1500 return carried a 1500 dispute fee and netted -3000.
         * The fee is what it costs the merchant to be disputed. Restoring it would bill the family
         * twice for one return, so the family's outstanding follows `dispute.amount` alone.
         */
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);
        const original = await receipt(client, chargeId, 1_500);
        const afterPayment = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;

        const ev = disputeEvidence({ amountCents: 1_500 });
        await recognizeProviderDispute(client, { ...ev, fundsWithdrawn: false });
        await client.from("payment_provider_disputes")
            .update({ original_payment_id: original }).eq("provider_dispute_id", ev.providerDisputeId);
        const outcome = await recognizeProviderDispute(client, ev);
        expect(outcome.recognized, JSON.stringify(outcome)).toBe(true);

        expect(
            (await readChargeBalance(client, ORG, chargeId)).outstandingCents,
            "outstanding restored by the returned principal, not by principal + dispute fee",
        ).toBe(afterPayment + 1_500);
        expect((outcome as { amountCents: number }).amountCents).toBe(1_500);
    });

    it("a withdrawal observed before recognition creates no reversal, and converges when it can", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);

        // The provider says the money went back before Alloy has a receipt for it arriving.
        const ev = disputeEvidence({ amountCents: 2_000, providerTransactionId: "pi_8c_not_yet_recognised" });
        const early = await recognizeProviderDispute(client, ev);
        expect(early.recognized, JSON.stringify(early)).toBe(false);
        expect((early as { reason: string }).reason).toBe("original_not_recognized");

        // Nothing was invented against a receipt that does not exist.
        const { data: none } = await client.from("payments")
            .select("id").eq("org_id", ORG).eq("reversal_origin", "provider")
            .eq("idempotency_key", `stripe-dispute:${ev.providerDisputeId}`);
        expect((none ?? []).length, "no reversal may exist without an original").toBe(0);

        // Recognition catches up; the same evidence replayed now converges.
        const original = await receipt(client, chargeId, 2_000);
        const afterPayment = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;
        await client.from("payment_provider_disputes")
            .update({ original_payment_id: original }).eq("provider_dispute_id", ev.providerDisputeId);

        const converged = await recognizeProviderDispute(client, ev);
        expect(converged.recognized, JSON.stringify(converged)).toBe(true);
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(afterPayment + 2_000);
    });
});

/**
 * HERMETIC CONVERGENCE EVIDENCE — not real Stripe proof.
 *
 * The dispute SHAPE is the one the governed merchant produced, but duplicate, concurrent and
 * deliberately out-of-order deliveries cannot be ordered from a bank. Signatures are genuine, so
 * the verification boundary is exercised for real; the ORDERING is manufactured, and this suite is
 * labelled as such rather than counted as provider proof.
 */
describeWebhook("Thread 8C — dispute convergence through the real webhook", () => {
    /*
     * The org's OWN bound merchant, read rather than invented: one active merchant per
     * org+processor is a unique index, so a second one cannot exist — and tenancy resolving through
     * the real binding is the property under test anyway.
     */
    let account = "";
    let createdMerchant = false;

    beforeAll(async () => {
        const { data } = await supabase!
            .from("payment_provider_merchants")
            .select("provider_account_ref")
            .eq("org_id", ORG).eq("processor", "stripe").eq("is_active", true)
            .maybeSingle();
        account = (data as { provider_account_ref: string } | null)?.provider_account_ref ?? "";
        if (!account) {
            // Self-sufficient: sibling suites delete the org's merchant in their own teardown, and a
            // suite that depends on another one having run is not a proof.
            account = `acct_8c_dispute_${Date.now()}`;
            await supabase!.from("payment_provider_merchants").insert({
                org_id: ORG, processor: "stripe", provider_account_ref: account,
                readiness: "ready", readiness_checked_at: new Date().toISOString(),
                is_active: true, created_by: ACTOR, updated_by: ACTOR,
            });
            createdMerchant = true;
        }
    });

    afterAll(async () => {
        if (createdMerchant) {
            await supabase!.from("payment_provider_merchants").delete().eq("provider_account_ref", account);
        }
    });

    it("refuses an unsigned or forged dispute event before reading it", async () => {
        const body = disputeEvent("charge.dispute.funds_withdrawn", `du_8c_forged_${Date.now()}`, { account });
        const unsigned = await handleStripeWebhook(supabase!, body, null, whsec!);
        expect(unsigned.outcome).toBe("rejected");
        const forged = await handleStripeWebhook(supabase!, body, "t=1,v1=deadbeef", whsec!);
        expect(forged.outcome).toBe("rejected");
    });

    it("keeps a raised dispute as evidence and moves no money", async () => {
        const du = `du_8c_raised_${Date.now()}`;
        disputes.push(du);
        const body = disputeEvent("charge.dispute.created", du, { account, status: "needs_response" });
        const res = await handleStripeWebhook(supabase!, body, signed(body), whsec!);
        expect(res.outcome, res.detail).toBe("observed");
        const { data } = await supabase!.from("payment_provider_disputes").select("id, canonical_reversal_payment_id").eq("provider_dispute_id", du).single();
        expect((data as Record<string, unknown>).canonical_reversal_payment_id, "raising takes no money").toBeNull();
    });

    it("three events for one dispute produce exactly one canonical reversal", async () => {
        const client = supabase!;
        const chargeId = await postCharge(client, 40_000);
        const original = await receipt(client, chargeId, 3_000);
        const afterPayment = (await readChargeBalance(client, ORG, chargeId)).outstandingCents;

        const du = `du_8c_conv_${Date.now()}`;
        disputes.push(du);
        // created → evidence only
        const created = disputeEvent("charge.dispute.created", du, { account, amount: 3_000, status: "needs_response" });
        expect((await handleStripeWebhook(client, created, signed(created), whsec!)).outcome).toBe("observed");
        await client.from("payment_provider_disputes").update({ original_payment_id: original }).eq("provider_dispute_id", du);

        // funds_withdrawn → the money actually leaves, exactly once
        const withdrawn = disputeEvent("charge.dispute.funds_withdrawn", du, { account, amount: 3_000 });
        expect((await handleStripeWebhook(client, withdrawn, signed(withdrawn), whsec!)).outcome).toBe("applied");

        // a DIFFERENT event id for the same dispute, plus closed — evidence, never a second reversal
        const again = disputeEvent("charge.dispute.funds_withdrawn", du, { account, amount: 3_000 });
        expect((await handleStripeWebhook(client, again, signed(again), whsec!)).outcome).toBe("duplicate");
        const closed = disputeEvent("charge.dispute.closed", du, { account, amount: 3_000 });
        expect((await handleStripeWebhook(client, closed, signed(closed), whsec!)).outcome).toBe("duplicate");

        const { data: reversals } = await client.from("payments").select("id, reversal_origin").eq("refunds_payment_id", original);
        expect((reversals ?? []).length, "one dispute, one reversal").toBe(1);
        expect((reversals as Array<Record<string, unknown>>)[0].reversal_origin).toBe("provider");
        expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(afterPayment + 3_000);
    });

    it("fails closed for a connected account bound to no organization", async () => {
        const du = `du_8c_unknown_${Date.now()}`;
        const body = disputeEvent("charge.dispute.funds_withdrawn", du, { account: "acct_never_seen_8c" });
        const res = await handleStripeWebhook(supabase!, body, signed(body), whsec!);
        expect(res.outcome).toBe("unattributed");
    });
});
