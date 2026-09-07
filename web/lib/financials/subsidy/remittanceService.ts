/**
 * WHAT THE AGENCY SAID, WHAT ACTUALLY SETTLED, AND WHAT IS STILL MISSING.
 *
 * A remittance advice is evidence, not money. It is recorded on its own because advice and cash
 * genuinely arrive apart, and treating the advice as settlement is how a provider comes to believe
 * it was paid. `payment_id` stays null until Thread 8 has a real receipt, and reconciliation
 * compares what was claimed against what the advice actually granted.
 *
 * ── THE SHORTFALL RULE, IN ONE PLACE ──
 *
 * Reconciling writes a VARIANCE and stops. It does not raise the family's collectible amount, does
 * not write off the difference, does not resubmit and does not move responsibility. That is decision
 * B point 8, and the only way past it is an operator naming a resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyManualReduction } from "@/lib/financials/reductions/manualReductionService";
import { SubsidyError } from "@/lib/financials/subsidy/subsidyService";

export type RemittanceLineInput = {
    claimLineId: string;
    amountCents: number;
    state?: "paid" | "denied" | "adjusted" | "recouped";
    adjustmentReason?: string | null;
    denialReason?: string | null;
};

/**
 * Record an advice and its lines. Idempotent by the caller's key, because an agency file that is
 * imported twice must not double the money the provider believes it is owed.
 */
export async function recordRemittanceAdvice(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        agencyId: string;
        externalRemittanceId?: string | null;
        adviceDate?: string | null;
        totalAmountCents: number;
        sourceDocumentId?: string | null;
        lines: RemittanceLineInput[];
        idempotencyKey: string;
        actorUserId: string | null;
    },
): Promise<{ remittanceId: string; lines: number; idempotent: boolean }> {
    if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents < 0) {
        throw new SubsidyError("invalid_amount", "A remittance total is a whole, non-negative number of cents.");
    }
    if (!input.lines?.length) throw new SubsidyError("no_lines", "A remittance must say which claim lines it answers.");

    const { data: existing } = await supabase
        .from("financial_subsidy_remittances").select("id").eq("org_id", input.orgId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (existing) {
        const remittanceId = (existing as { id: string }).id;
        const { data: lines } = await supabase
            .from("financial_subsidy_remittance_lines").select("id").eq("org_id", input.orgId).eq("remittance_id", remittanceId);
        return { remittanceId, lines: (lines ?? []).length, idempotent: true };
    }

    // Every claim line must be this org's. A foreign line would let one tenant's advice reconcile
    // against another tenant's claim.
    const { data: claimLineRows } = await supabase
        .from("financial_subsidy_claim_lines")
        .select("id")
        .eq("org_id", input.orgId)
        .in("id", input.lines.map((l) => l.claimLineId));
    const known = new Set(((claimLineRows ?? []) as Array<{ id: string }>).map((r) => r.id));
    const unknown = input.lines.filter((l) => !known.has(l.claimLineId));
    if (unknown.length > 0) {
        throw new SubsidyError("unknown_claim_line", `Not a claim line in this organisation: ${unknown[0]!.claimLineId}.`);
    }

    const { data: created, error } = await supabase
        .from("financial_subsidy_remittances")
        .insert({
            org_id: input.orgId,
            agency_id: input.agencyId,
            external_remittance_id: input.externalRemittanceId ?? null,
            advice_date: input.adviceDate ?? null,
            total_amount_cents: input.totalAmountCents,
            source_document_id: input.sourceDocumentId ?? null,
            reconciliation_state: "pending",
            idempotency_key: input.idempotencyKey,
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
        })
        .select("id")
        .single();
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            return recordRemittanceAdvice(supabase, input);
        }
        throw new SubsidyError("db_error", error.message);
    }
    const remittanceId = (created as { id: string }).id;

    const { error: lineError } = await supabase.from("financial_subsidy_remittance_lines").insert(
        input.lines.map((l) => ({
            org_id: input.orgId,
            remittance_id: remittanceId,
            claim_line_id: l.claimLineId,
            amount_cents: l.amountCents,
            state: l.state ?? (l.amountCents === 0 ? "denied" : "paid"),
            adjustment_reason: l.adjustmentReason ?? null,
            denial_reason: l.denialReason ?? null,
            idempotency_key: `fsrl:${remittanceId}:${l.claimLineId}`,
            created_by: input.actorUserId,
        })),
    );
    if (lineError) throw new SubsidyError("db_error", lineError.message);
    return { remittanceId, lines: input.lines.length, idempotent: false };
}

/** Attach the Thread 8 receipt that actually settled this advice. Cash never originates here. */
export async function settleRemittanceWithPayment(
    supabase: SupabaseClient,
    args: { orgId: string; remittanceId: string; paymentId: string; settledDate?: string | null; actorUserId: string | null },
): Promise<{ remittanceId: string }> {
    const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("id, status, direction, payer_entity_type, payer_entity_id, amount_cents")
        .eq("org_id", args.orgId)
        .eq("id", args.paymentId)
        .maybeSingle();
    if (paymentError) throw new SubsidyError("db_error", paymentError.message);
    if (!payment) throw new SubsidyError("unknown_payment", "No such payment in this organisation.");
    const row = payment as { status: string; payer_entity_type: string | null; payer_entity_id: string | null };
    /*
     * THE MONEY MUST ACTUALLY BE THE AGENCY'S. Without this, a family's own payment could be
     * recorded as settling an agency remittance and the provider would think the subsidy arrived.
     */
    if ((row.payer_entity_type ?? "") !== "agency") {
        throw new SubsidyError("not_agency_payment", "Only a payment whose payer is the agency can settle a remittance.");
    }
    if (row.status !== "posted") {
        throw new SubsidyError("payment_not_posted", "A pending payment has not arrived and cannot settle anything.");
    }

    const { error } = await supabase
        .from("financial_subsidy_remittances")
        .update({
            payment_id: args.paymentId,
            settled_date: args.settledDate ?? new Date().toISOString().slice(0, 10),
            updated_by: args.actorUserId,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", args.orgId)
        .eq("id", args.remittanceId);
    if (error) throw new SubsidyError("db_error", error.message);
    return { remittanceId: args.remittanceId };
}

export type VarianceState =
    | "pending" | "matched" | "short_paid" | "overpaid" | "denied" | "unapplied" | "recouped" | "under_review";

/**
 * Compare what was claimed with what the advice granted, and write the difference down.
 *
 * One variance per claim line, upserted on its own idempotency key, so reconciling twice converges
 * rather than double-counting. A line that matches exactly still gets a row: "nothing is missing" is
 * an answer an operator needs as much as "$75 is".
 */
export async function reconcileRemittance(
    supabase: SupabaseClient,
    args: { orgId: string; remittanceId: string; actorUserId: string | null },
): Promise<{ remittanceId: string; variances: number; shortPaidCents: number; overpaidCents: number; deniedCents: number }> {
    const { data: lineRows, error } = await supabase
        .from("financial_subsidy_remittance_lines")
        .select("id, claim_line_id, amount_cents, state")
        .eq("org_id", args.orgId)
        .eq("remittance_id", args.remittanceId);
    if (error) throw new SubsidyError("db_error", error.message);
    const lines = (lineRows ?? []) as Array<{ id: string; claim_line_id: string; amount_cents: number; state: string }>;
    if (lines.length === 0) throw new SubsidyError("no_lines", "That remittance has no lines to reconcile.");

    const { data: claimLineRows } = await supabase
        .from("financial_subsidy_claim_lines")
        .select("id, claimed_amount_cents")
        .eq("org_id", args.orgId)
        .in("id", lines.map((l) => l.claim_line_id));
    const claimed = new Map(
        ((claimLineRows ?? []) as Array<{ id: string; claimed_amount_cents: number }>).map((r) => [r.id, Number(r.claimed_amount_cents)]),
    );

    let shortPaidCents = 0;
    let overpaidCents = 0;
    let deniedCents = 0;
    const now = new Date().toISOString();
    const rows = lines.map((line) => {
        const expected = claimed.get(line.claim_line_id) ?? 0;
        const actual = Number(line.amount_cents);
        const variance = actual - expected;
        let state: VarianceState;
        if (line.state === "denied" || (actual === 0 && expected > 0)) {
            state = "denied";
            deniedCents += expected;
        } else if (variance === 0) {
            state = "matched";
        } else if (variance < 0) {
            state = "short_paid";
            shortPaidCents += -variance;
        } else {
            state = "overpaid";
            overpaidCents += variance;
        }
        return {
            org_id: args.orgId,
            claim_line_id: line.claim_line_id,
            expected_cents: expected,
            actual_cents: actual,
            variance_cents: variance,
            state,
            idempotency_key: `fsv:${line.claim_line_id}`,
            created_by: args.actorUserId,
            updated_by: args.actorUserId,
            updated_at: now,
        };
    });

    const { error: upsertError } = await supabase
        .from("financial_subsidy_variances")
        /*
         * ON THE CLAIM LINE, not the idempotency key. Both indexes are unique and both would be
         * violated, but only one can be the conflict target — and naming the other made a second
         * reconciliation of the same advice fail instead of converging.
         */
        .upsert(rows, { onConflict: "org_id,claim_line_id" });
    if (upsertError) throw new SubsidyError("db_error", upsertError.message);

    const everythingMatched = rows.every((r) => r.state === "matched");
    await supabase
        .from("financial_subsidy_remittances")
        .update({
            reconciliation_state: everythingMatched ? "reconciled" : "partially_reconciled",
            updated_by: args.actorUserId,
            updated_at: now,
        })
        .eq("org_id", args.orgId)
        .eq("id", args.remittanceId);

    return { remittanceId: args.remittanceId, variances: rows.length, shortPaidCents, overpaidCents, deniedCents };
}

export const VARIANCE_RESOLUTIONS = [
    "accept_family_responsibility",
    "resubmit",
    "write_off",
    "hold_under_review",
    "correct_authorization",
] as const;
export type VarianceResolution = (typeof VARIANCE_RESOLUTIONS)[number];

/**
 * An operator names what happens to the difference. There is no default and there is no automatic
 * path here — that is the point of the whole variance table.
 *
 * `accept_family_responsibility` writes NO money: the family was always contractually responsible
 * for the net, and what changes is that the submitted-claim suppression stops applying to a
 * shortfall nobody is going to fund. `write_off` genuinely forgives it, and does so through Thread
 * 10's manual reduction rather than a subsidy-shaped copy of one.
 */
export async function resolveSubsidyVariance(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        varianceId: string;
        resolution: VarianceResolution;
        note?: string | null;
        reference?: string | null;
        actorUserId: string | null;
    },
): Promise<{ varianceId: string; resolution: VarianceResolution; writeOffChargeId: string | null; alreadyResolved: boolean }> {
    if (!(VARIANCE_RESOLUTIONS as readonly string[]).includes(args.resolution)) {
        throw new SubsidyError("invalid_resolution", `Unknown resolution: ${args.resolution}.`);
    }
    const { data: row, error } = await supabase
        .from("financial_subsidy_variances")
        .select("id, claim_line_id, variance_cents, state, resolution_kind")
        .eq("org_id", args.orgId)
        .eq("id", args.varianceId)
        .maybeSingle();
    if (error) throw new SubsidyError("db_error", error.message);
    if (!row) throw new SubsidyError("unknown_variance", "No such variance in this organisation.");
    const variance = row as { id: string; claim_line_id: string; variance_cents: number; resolution_kind: string | null };
    // ONE resolution. A second would forgive or re-bill the same difference twice.
    if (variance.resolution_kind) {
        return {
            varianceId: variance.id,
            resolution: variance.resolution_kind as VarianceResolution,
            writeOffChargeId: null,
            alreadyResolved: true,
        };
    }

    let writeOffChargeId: string | null = null;
    if (args.resolution === "write_off") {
        const shortfall = Math.abs(Math.min(0, Number(variance.variance_cents)));
        if (shortfall <= 0) throw new SubsidyError("nothing_to_write_off", "There is no shortfall to write off.");
        const { data: claimLine } = await supabase
            .from("financial_subsidy_claim_lines")
            .select("charge_id, customer_member_id, service_period_start")
            .eq("org_id", args.orgId)
            .eq("id", variance.claim_line_id)
            .maybeSingle();
        const line = claimLine as { charge_id: string; customer_member_id: string | null; service_period_start: string | null };
        const { data: charge } = await supabase
            .from("charges").select("billable_source_id, service_date").eq("org_id", args.orgId).eq("id", line.charge_id).maybeSingle();
        const chargeRow = charge as { billable_source_id: string; service_date: string | null };
        // THREAD 10 FORGIVES MONEY, not a subsidy-shaped copy of it. The reason travels with it.
        const written = await applyManualReduction(supabase, {
            orgId: args.orgId,
            enrollmentAgreementId: chargeRow.billable_source_id,
            customerMemberId: line.customer_member_id,
            chargeCategory: "adjustment",
            amountCents: -shortfall,
            reason: `Subsidy shortfall written off: ${args.note ?? "agency short-paid"}`,
            effectiveDate: chargeRow.service_date ?? new Date().toISOString().slice(0, 10),
            sourceChargeId: line.charge_id,
            actorUserId: args.actorUserId,
            idempotencyKey: `fred:subsidy-writeoff:${variance.id}`,
        });
        writeOffChargeId = written.chargeId;
    }

    const { error: updateError } = await supabase
        .from("financial_subsidy_variances")
        .update({
            resolution_kind: args.resolution,
            resolution_note: args.note ?? null,
            resolution_reference: args.reference ?? writeOffChargeId,
            resolved_by: args.actorUserId,
            resolved_at: new Date().toISOString(),
            state: args.resolution === "hold_under_review" ? "under_review" : undefined,
            updated_by: args.actorUserId,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", args.orgId)
        .eq("id", args.varianceId)
        .is("resolution_kind", null);
    if (updateError) throw new SubsidyError("db_error", updateError.message);

    return { varianceId: variance.id, resolution: args.resolution, writeOffChargeId, alreadyResolved: false };
}
