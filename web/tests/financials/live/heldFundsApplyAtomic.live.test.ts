/**
 * APPLYING HELD MONEY, AGAINST THE REAL DATABASE.
 *
 * The deterministic suite proves the caller makes one write instead of two. It CANNOT prove that the
 * pair is atomic: "both rows or neither" is a property of a transaction, and a fake that implements
 * a transaction is the test agreeing with itself.
 *
 * ── THE ONE CASE THAT DISCRIMINATES ──
 *
 * Two operators apply the same held deposit at the same moment, to two DIFFERENT charges, each for
 * more than half of what remains held. Both pass their own bound check, because each reads the
 * remaining amount before either has committed. Then:
 *
 *   * the hold's disposition trigger locks the lot and serialises them, so the second disposition is
 *     refused — that much was already true in W4, and is not what is being proved here
 *   * the question is what happens to the second ALLOCATION
 *
 * Under the old two-write implementation the allocation had already been committed by a separate
 * round trip, and the refusal arrived afterwards. The result was an allocation with no disposition:
 * the charge's balance fell, the money was still counted as held, and available prepaid was short by
 * the same cents with nothing on any surface to explain it.
 *
 * Under `apply_held_funds_atomic` the allocation is in the same transaction as the disposition, so
 * the refusal takes both. `allocations === dispositions` is therefore the assertion that separates
 * the repaired implementation from the defect, and it is the reason this file exists.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { applyPaymentToCharge, recordChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { applyHeldFunds, createPaymentHold, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";

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
/* The same tenant the payment-application live suite uses, so household parity is already satisfied. */
const ORG = "00000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);

const writtenCharges: string[] = [];
const writtenPayments: string[] = [];

async function postCharge(supabase: SupabaseClient, amountCents: number): Promise<string> {
    const { data: draft, error } = await supabase
        .from("charges")
        .insert({
            org_id: ORG, job_id: null,
            billable_source_type: "enrollment_agreement", billable_source_id: AGREEMENT,
            charge_type: "fee", charge_category: "fee", status: "draft",
            currency_code: "USD", amount_cents: amountCents,
            service_date: TODAY, occurs_on: TODAY, billable_on: TODAY,
            description: "held funds atomicity certification", metadata: {},
            created_by: ACTOR, updated_by: ACTOR,
        })
        .select("id").single();
    if (error) throw new Error(error.message);
    const id = (draft as { id: string }).id;
    writtenCharges.push(id);
    const { error: postError } = await supabase
        .from("charges")
        .update({ status: "posted", posted_at: new Date().toISOString(), posted_by: ACTOR, updated_by: ACTOR })
        .eq("id", id).eq("status", "draft");
    if (postError) throw new Error(postError.message);
    return id;
}

async function receipt(supabase: SupabaseClient, amountCents: number): Promise<string> {
    const out = await recordChildcarePayment(supabase, {
        orgId: ORG,
        billableSourceType: "customer",
        billableSourceId: HOUSEHOLD,
        customerId: HOUSEHOLD,
        amountCents,
        paymentMethod: "check",
        status: "posted",
        actorUserId: ACTOR,
    });
    const id = out.payment.id;
    writtenPayments.push(id);
    return id;
}

/** Every allocation and disposition currently standing against one hold. */
async function rows(supabase: SupabaseClient, holdId: string, paymentId: string) {
    const { data: allocs } = await supabase
        .from("payment_allocations")
        .select("id, charge_id, allocated_amount_cents, status, allocation_type, target_entity_type, target_entity_id, created_by, notes, metadata")
        .eq("org_id", ORG).eq("payment_id", paymentId).eq("status", "active");
    const { data: disps } = await supabase
        .from("payment_hold_dispositions")
        .select("id, kind, amount_cents, allocation_id, disposed_by")
        .eq("org_id", ORG).eq("hold_id", holdId);
    return {
        allocations: (allocs ?? []) as Array<Record<string, unknown>>,
        dispositions: (disps ?? []) as Array<Record<string, unknown>>,
    };
}

describe.skipIf(!env)("applying held money — live, one transaction or none", () => {
    const supabase = env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null;

    afterAll(async () => {
        if (!supabase) return;
        /* Dispositions first: they RESTRICT their hold and their allocation. */
        for (const id of writtenPayments) {
            const { data: holds } = await supabase.from("payment_holds").select("id").eq("payment_id", id);
            for (const h of (holds ?? []) as Array<{ id: string }>) {
                await supabase.from("payment_hold_dispositions").delete().eq("hold_id", h.id);
            }
            await supabase.from("payment_allocations").delete().eq("payment_id", id);
            for (const h of (holds ?? []) as Array<{ id: string }>) {
                await supabase.from("payment_holds").delete().eq("id", h.id);
            }
        }
        await supabase.from("ledger_transactions").delete().in("payment_id", writtenPayments);
        for (const id of writtenPayments) await supabase.from("payments").delete().eq("id", id);
        for (const id of writtenCharges) {
            await supabase.from("charges").update({ status: "void" }).eq("id", id);
            await supabase.from("charges").delete().eq("id", id);
        }
    });

    it("the function is installed with the signature the caller uses", async () => {
        /*
         * Asserted FIRST and on its own. Without it every case below fails as "could not find the
         * function", which reads as an application defect rather than an unapplied migration.
         */
        const { error } = await supabase!.rpc("apply_held_funds_atomic", {
            p_org_id: ORG,
            p_hold_id: "00000000-0000-4000-8000-0000000000ff",
            p_charge_id: "00000000-0000-4000-8000-0000000000fe",
            p_amount_cents: 1,
            p_actor: null,
            p_notes: null,
        });
        /* A missing hold is the expected refusal; a missing FUNCTION is the failure being excluded. */
        expect(error?.message ?? "", "apply_held_funds_atomic is not installed")
            .not.toMatch(/could not find the function|does not exist/i);
        expect(error?.message ?? "").toMatch(/is not in organization/i);
    });

    it("commits the allocation and the applied disposition together", async () => {
        const chargeId = await postCharge(supabase!, 60_000);
        const paymentId = await receipt(supabase!, 50_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 50_000, refundable: true,
            reason: "Security deposit", actorUserId: ACTOR,
        });
        expect(held.ok, !held.ok ? held.message : "").toBe(true);
        if (!held.ok) return;

        const out = await applyHeldFunds(
            supabase!,
            { orgId: ORG, holdId: held.hold.id, chargeId, amountCents: 20_000, actorUserId: ACTOR, notes: "Applied to fees" },
            async (input) => {
                const r = await applyPaymentToCharge(supabase!, {
                    orgId: input.orgId,
                    paymentId: input.paymentId,
                    chargeId: input.chargeId,
                    amountCents: input.amountCents,
                    actorUserId: input.actorUserId,
                    notes: input.notes,
                    disposeHoldId: input.disposeHoldId,
                });
                return { allocationId: r.allocation.id, appliedCents: Number(r.allocation.allocated_amount_cents) };
            },
        );
        expect(out.ok, !out.ok ? out.message : "").toBe(true);

        const { allocations, dispositions } = await rows(supabase!, held.hold.id, paymentId);
        expect(allocations).toHaveLength(1);
        expect(dispositions).toHaveLength(1);
        /* The constraint requires the name, and only one transaction can satisfy it. */
        expect(dispositions[0].allocation_id).toBe(allocations[0].id);
        expect(dispositions[0].kind).toBe("applied");
        expect(Number(dispositions[0].amount_cents)).toBe(20_000);
        expect(dispositions[0].disposed_by).toBe(ACTOR);
    });

    it("the allocation it writes is indistinguishable from an ordinary one", async () => {
        /*
         * Compared against a CONTROL written by the ordinary path on the same tenant. A row of a
         * different shape would be a second kind of allocation wearing the same table — invisible to
         * every reader that filters the canonical way, and so to the balance itself.
         */
        const heldCharge = await postCharge(supabase!, 60_000);
        const plainCharge = await postCharge(supabase!, 60_000);
        const heldPayment = await receipt(supabase!, 30_000);
        const plainPayment = await receipt(supabase!, 30_000);

        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId: heldPayment, amountCents: 30_000, refundable: false, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        await applyPaymentToCharge(supabase!, {
            orgId: ORG, paymentId: heldPayment, chargeId: heldCharge, amountCents: 10_000,
            actorUserId: ACTOR, notes: "held", disposeHoldId: held.hold.id,
        });
        await applyPaymentToCharge(supabase!, {
            orgId: ORG, paymentId: plainPayment, chargeId: plainCharge, amountCents: 10_000,
            actorUserId: ACTOR, notes: "held",
        });

        const viaRpc = (await rows(supabase!, held.hold.id, heldPayment)).allocations[0];
        const { data: control } = await supabase!
            .from("payment_allocations")
            .select("allocated_amount_cents, status, allocation_type, target_entity_type, target_entity_id, created_by, notes, metadata")
            .eq("org_id", ORG).eq("payment_id", plainPayment).eq("status", "active").single();
        const plain = control as Record<string, unknown>;

        for (const column of ["status", "allocation_type", "target_entity_type", "created_by", "notes"]) {
            expect(viaRpc[column], `${column} must match the ordinary allocator`).toEqual(plain[column]);
        }
        expect(viaRpc.metadata).toEqual(plain.metadata);
        /* target_entity_id is the charge, so it differs by row but must equal THIS row's charge. */
        expect(viaRpc.target_entity_id).toBe(viaRpc.charge_id);
    });

    /**
     * THE ATOMICITY PROOF. See the header: this is the case the old implementation failed.
     */
    it("a refused concurrent application leaves NO orphan allocation", async () => {
        const chargeA = await postCharge(supabase!, 60_000);
        const chargeB = await postCharge(supabase!, 60_000);
        const paymentId = await receipt(supabase!, 50_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 30_000, refundable: true, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const apply = (chargeId: string) =>
            applyPaymentToCharge(supabase!, {
                orgId: ORG, paymentId, chargeId, amountCents: 20_000,
                actorUserId: ACTOR, disposeHoldId: held.hold.id,
            });

        /*
         * $20,000 each against $30,000 held. Both are individually valid and together are not, so
         * exactly one must survive — and `allSettled` because the loser is SUPPOSED to reject.
         */
        const settled = await Promise.allSettled([apply(chargeA), apply(chargeB)]);
        const won = settled.filter((r) => r.status === "fulfilled");
        const lost = settled.filter((r) => r.status === "rejected");
        expect(won, "one application must succeed").toHaveLength(1);
        expect(lost, "and the other must be refused, not silently clamped").toHaveLength(1);

        const { allocations, dispositions } = await rows(supabase!, held.hold.id, paymentId);
        /*
         * THE ASSERTION THAT SEPARATES THE REPAIR FROM THE DEFECT.
         *
         * Two allocations and one disposition is the old behaviour: money applied to a charge while
         * still counted as held. Neither count may exceed the other.
         */
        expect(allocations, "an allocation with no disposition is the two-write defect").toHaveLength(1);
        expect(dispositions).toHaveLength(1);
        expect(dispositions[0].allocation_id).toBe(allocations[0].id);

        /* And the lot itself is untouched: immutable original, derived remainder. */
        const after = (await readHoldsForPayments(supabase!, { orgId: ORG, paymentIds: [paymentId] }))
            .find((h) => h.id === held.hold.id);
        expect(after?.originalAmountCents, "the lot is never decremented in place").toBe(30_000);
        expect(after?.remainingCents).toBe(10_000);
        expect(after?.appliedCents).toBe(20_000);
    });

    it("an over-application is refused and writes neither row", async () => {
        const chargeId = await postCharge(supabase!, 60_000);
        const paymentId = await receipt(supabase!, 50_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 10_000, refundable: true, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        /*
         * MATCHED ON THE REFUSAL, not merely on throwing.
         *
         * `rejects.toThrow()` alone passed while the migration was unapplied — "could not find the
         * function" is also a throw, so the case reported the bound as enforced by an RPC that did
         * not exist. The message has to be the one the bound raises.
         */
        await expect(applyPaymentToCharge(supabase!, {
            orgId: ORG, paymentId, chargeId, amountCents: 20_000,
            actorUserId: ACTOR, disposeHoldId: held.hold.id,
        })).rejects.toThrow(/remain held on deposit|would exceed hold/i);

        const { allocations, dispositions } = await rows(supabase!, held.hold.id, paymentId);
        expect(allocations).toHaveLength(0);
        expect(dispositions).toHaveLength(0);
    });

    /**
     * AVAILABLE PREPAID IS CERTIFIED, NOT REBUILT.
     *
     * `available = unapplied − held` is W4's equation and this does not restate it: it asks the
     * authority that owns it what the account's position is, before and after an application, and
     * checks that applying held money moves the HELD figure and not the available one. A deposit
     * becoming spendable is `release`; applying it was never supposed to pass through available.
     */
    it("applying held money never passes through available prepaid", async () => {
        const chargeId = await postCharge(supabase!, 60_000);
        const paymentId = await receipt(supabase!, 40_000);
        const held = await createPaymentHold(supabase!, {
            orgId: ORG, paymentId, amountCents: 40_000, refundable: true, actorUserId: ACTOR,
        });
        if (!held.ok) throw new Error(held.message);

        const positionFor = async () => {
            const { outcome } = await readAccountPrepaidPosition(supabase!, {
                orgId: ORG, householdId: HOUSEHOLD, authorized: true,
            });
            /*
             * `unavailable` and `forbidden` are NOT zero positions, and reading them as one is the
             * mistake the outcome union exists to prevent. The test fails on them rather than
             * quietly comparing two zeroes and passing.
             */
            expect(outcome.state, "the prepaid authority could not answer").toBe("ok");
            if (outcome.state !== "ok") throw new Error(`prepaid position ${outcome.state}`);
            return { available: outcome.position.availableCents, heldCents: outcome.position.heldCents };
        };
        const before = await positionFor();

        await applyPaymentToCharge(supabase!, {
            orgId: ORG, paymentId, chargeId, amountCents: 15_000,
            actorUserId: ACTOR, disposeHoldId: held.hold.id,
        });
        const after = await positionFor();

        /* The held figure falls by exactly what was applied. */
        expect(before.heldCents - after.heldCents).toBe(15_000);
        /*
         * And available does not rise. The whole receipt was held, so there was nothing available
         * before and there must be nothing after: the money went to the obligation, not to the
         * account. A release-then-apply implementation would have shown 15,000 available in between.
         */
        expect(after.available).toBe(before.available);
    });
});
