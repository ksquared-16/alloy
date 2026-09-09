/**
 * MANUAL RAILS ARE CANONICAL PAYMENTS — cash, check and money order, against the real database.
 *
 * Thread 8B introduces Stripe as an EXECUTOR. The risk that introduces is not that Stripe stops
 * working; it is that "payment" quietly starts to mean "PaymentIntent", and a family who hands over
 * $500 in cash needs a fabricated provider identifier to be recorded at all.
 *
 * These cases hold the line the canonical model already draws:
 *
 *   payment_method / rail   HOW value was tendered   cash | check | money_order | card | ach | …
 *   processor               WHO executed it          stripe, or nobody
 *   processor_transaction_id   provider evidence     present only when there was a provider
 *
 * So a manual payment is recorded through the SAME canonical authority as a card payment
 * (`recordAndApplyChildcarePayment`), reduces the authoritative balance the same way, and carries
 * `processor` and `processor_transaction_id` as NULL rather than as a placeholder. It never passes
 * through a Stripe collection-attempt model, because it never had a collection attempt.
 *
 * Certification: Thread 8B Slice I items 36 (cash), 37 (check), 38 (money order).
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic.
 * Fixture: certification/fixtures/financials-charge-spine.sql (apply it first).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
    readChargeBalance,
    recordAndApplyChildcarePayment,
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
const RUN = `manual-${Date.now()}`;

const writtenCharges: string[] = [];

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
            description: "manual rail certification",
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

const supabase: SupabaseClient | null = env
    ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
    : null;

const describeLive = env ? describe : describe.skip;

describeLive("manual rails — cash, check and money order are canonical payments, live", () => {
    afterAll(() => {
        // The fixture is self-cleaning and owns teardown; posted childcare money refuses DELETE by
        // design, which is the guarantee under test elsewhere. Nothing is removed here.
        writtenCharges.length = 0;
    });

    /*
     * One case per rail rather than a loop, because the point is not that a string round-trips: it
     * is that each of the three tenders a childcare office actually receives is a first-class
     * canonical payment with no provider identity at all.
     */
    for (const [label, rail, item] of [
        ["cash", "cash", 36],
        ["check", "check", 37],
        ["money order", "money_order", 38],
    ] as const) {
        it(`records a ${label} payment with no processor and no provider transaction (item ${item})`, async () => {
            const client = supabase!;
            const chargeId = await postCharge(client, 60_000);

            const before = await readChargeBalance(client, ORG, chargeId);
            expect(before.outstandingCents, "the charge starts fully outstanding").toBe(60_000);

            const paid = await recordAndApplyChildcarePayment(client, {
                orgId: ORG,
                chargeId,
                amountCents: 60_000,
                paymentMethod: rail,
                // No processor. No processor transaction. No Stripe collection attempt. There was
                // no provider, so there is no provider evidence to record.
                idempotencyKey: `${RUN}-${rail}`,
                actorUserId: ACTOR,
            });

            const { data: persisted } = await client
                .from("payments")
                .select("payment_method, processor, processor_transaction_id, status, direction, job_id")
                .eq("id", paid.payment.id)
                .single();
            const row = persisted as Record<string, unknown>;

            expect(row.payment_method, "the rail is recorded as itself").toBe(rail);
            expect(row.processor, "a manual payment has no executor").toBeNull();
            expect(
                row.processor_transaction_id,
                "and therefore no provider transaction — not a placeholder, not an empty string",
            ).toBeNull();
            expect(row.status, "money handed over is posted money").toBe("posted");
            expect(row.direction).toBe("inbound");
            expect(row.job_id, "a childcare payment carries no job").toBeNull();

            // The authoritative balance moves exactly as it does for any other rail.
            const after = await readChargeBalance(client, ORG, chargeId);
            expect(after.outstandingCents, "the balance dropped once, by the amount tendered").toBe(0);
            expect(paid.allocation?.allocated_amount_cents).toBe(60_000);

            // And a replay is harmless here for the same reason it is for a card: the idempotency
            // key is the payment's, not the processor's.
            const replay = await recordAndApplyChildcarePayment(client, {
                orgId: ORG,
                chargeId,
                amountCents: 60_000,
                paymentMethod: rail,
                idempotencyKey: `${RUN}-${rail}`,
                actorUserId: ACTOR,
            });
            expect(replay.alreadyRecorded).toBe(true);
            expect(replay.payment.id).toBe(paid.payment.id);
            expect((await readChargeBalance(client, ORG, chargeId)).outstandingCents).toBe(0);
        });
    }
});
