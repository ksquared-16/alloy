/**
 * WHOSE SHARE A PAYMENT WENT AGAINST — explained, never inferred, and never a second balance.
 *
 * Thread 8 remains the only authority that reduces a charge's outstanding: a payment application
 * names a charge and an amount, and that is what moves the balance. Nothing here changes that, and
 * an attribution row cannot reduce anything on its own — it explains, after the fact, which
 * responsibility allocation an application satisfied.
 *
 * ── EXPLICIT, BECAUSE PAYING IS NOT OWING ──
 *
 * The attribution is stated by the caller, never guessed from who paid. A grandparent settling a
 * bill does not become responsible for it, and a parent paying more than their share has not
 * renegotiated the arrangement. `payments.payer_entity_type/id` records who actually paid — the
 * columns existed with no writer until this thread — and that identity stays deliberately separate
 * from the responsibility identity attributed here.
 *
 * ── THE BOUND ──
 *
 * The attributed portions of one application may not exceed what that application applied.
 * Anything else would let an explanation claim more money than moved.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ResponsibilityError } from "@/lib/financials/responsibility/responsibilityService";

export type AttributionInput = {
    orgId: string;
    paymentAllocationId: string;
    responsibilityAllocationId: string;
    amountCents: number;
    idempotencyKey: string;
    actorUserId: string | null;
};

export async function attributePaymentToResponsibility(
    supabase: SupabaseClient,
    input: AttributionInput,
): Promise<{ attributionId: string; idempotent: boolean }> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new ResponsibilityError("invalid_amount", "An attribution is a whole, positive number of cents.");
    }

    const { data: existing, error: existingError } = await supabase
        .from("payment_responsibility_attributions")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
    if (existingError) throw new ResponsibilityError("db_error", existingError.message);
    if (existing) return { attributionId: (existing as { id: string }).id, idempotent: true };

    const { data: applicationRow, error: applicationError } = await supabase
        .from("payment_allocations")
        .select("id, org_id, charge_id, allocated_amount_cents, status")
        .eq("org_id", input.orgId)
        .eq("id", input.paymentAllocationId)
        .maybeSingle();
    if (applicationError) throw new ResponsibilityError("db_error", applicationError.message);
    if (!applicationRow) throw new ResponsibilityError("not_found", "No such payment application in this organisation.");
    const application = applicationRow as { id: string; charge_id: string | null; allocated_amount_cents: number; status: string };

    const { data: responsibilityRow, error: responsibilityError } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, charge_id, is_unassigned, state")
        .eq("org_id", input.orgId)
        .eq("id", input.responsibilityAllocationId)
        .maybeSingle();
    if (responsibilityError) throw new ResponsibilityError("db_error", responsibilityError.message);
    if (!responsibilityRow) throw new ResponsibilityError("not_found", "No such responsibility allocation.");
    const responsibility = responsibilityRow as { id: string; charge_id: string; is_unassigned: boolean; state: string };

    /*
     * THE SAME CHARGE, OR IT EXPLAINS NOTHING. An application against March's tuition cannot satisfy
     * a share of April's, and allowing it would let the ledger tell two stories about one payment.
     */
    if (application.charge_id && application.charge_id !== responsibility.charge_id) {
        throw new ResponsibilityError(
            "charge_mismatch",
            "The payment application and the responsibility allocation are for different charges.",
        );
    }
    if (responsibility.is_unassigned) {
        throw new ResponsibilityError(
            "unassigned_responsibility",
            "These cents have no responsible party yet. Record who is responsible before attributing a payment to them.",
        );
    }

    const { data: siblingRows, error: siblingError } = await supabase
        .from("payment_responsibility_attributions")
        .select("amount_cents")
        .eq("org_id", input.orgId)
        .eq("payment_allocation_id", input.paymentAllocationId);
    if (siblingError) throw new ResponsibilityError("db_error", siblingError.message);
    const already = ((siblingRows ?? []) as Array<{ amount_cents: number }>).reduce((a, r) => a + Number(r.amount_cents), 0);
    if (already + input.amountCents > Number(application.allocated_amount_cents)) {
        throw new ResponsibilityError(
            "over_attributed",
            `This application applied $${(Number(application.allocated_amount_cents) / 100).toFixed(2)}; `
            + `attributing $${(input.amountCents / 100).toFixed(2)} more would explain money that never moved.`,
        );
    }

    const { data, error } = await supabase
        .from("payment_responsibility_attributions")
        .insert({
            org_id: input.orgId,
            payment_allocation_id: input.paymentAllocationId,
            responsibility_allocation_id: input.responsibilityAllocationId,
            amount_cents: input.amountCents,
            idempotency_key: input.idempotencyKey,
            created_by: input.actorUserId,
        })
        .select("id")
        .single();
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            const { data: winner } = await supabase
                .from("payment_responsibility_attributions").select("id")
                .eq("org_id", input.orgId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
            if (winner) return { attributionId: (winner as { id: string }).id, idempotent: true };
        }
        throw new ResponsibilityError("db_error", error.message);
    }
    return { attributionId: (data as { id: string }).id, idempotent: false };
}

/**
 * What one party still owes on one charge: their allocation, less what has been attributed to it.
 *
 * DERIVED, never stored — a stored per-party balance would be the second balance this thread is
 * forbidden to create, and it would drift from Thread 8's the first time an application was
 * reversed.
 */
export async function readRemainingResponsibility(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string },
): Promise<Array<{
    allocationId: string;
    responsiblePartyId: string | null;
    isUnassigned: boolean;
    assignedCents: number;
    attributedCents: number;
    remainingCents: number;
}>> {
    const { data: allocationRows, error: allocationError } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, responsible_party_id, is_unassigned, assigned_amount_cents")
        .eq("org_id", args.orgId)
        .eq("charge_id", args.chargeId)
        .eq("state", "active");
    if (allocationError) throw new ResponsibilityError("db_error", allocationError.message);
    const allocations = (allocationRows ?? []) as Array<{
        id: string;
        responsible_party_id: string | null;
        is_unassigned: boolean;
        assigned_amount_cents: number;
    }>;
    if (allocations.length === 0) return [];

    const { data: attributionRows, error: attributionError } = await supabase
        .from("payment_responsibility_attributions")
        .select("responsibility_allocation_id, amount_cents")
        .eq("org_id", args.orgId)
        .in("responsibility_allocation_id", allocations.map((a) => a.id));
    if (attributionError) throw new ResponsibilityError("db_error", attributionError.message);
    const attributed = new Map<string, number>();
    for (const row of (attributionRows ?? []) as Array<{ responsibility_allocation_id: string; amount_cents: number }>) {
        attributed.set(
            row.responsibility_allocation_id,
            (attributed.get(row.responsibility_allocation_id) ?? 0) + Number(row.amount_cents),
        );
    }

    return allocations.map((a) => {
        const paid = attributed.get(a.id) ?? 0;
        return {
            allocationId: a.id,
            responsiblePartyId: a.responsible_party_id,
            isUnassigned: a.is_unassigned,
            assignedCents: Number(a.assigned_amount_cents),
            attributedCents: paid,
            remainingCents: Number(a.assigned_amount_cents) - paid,
        };
    });
}
