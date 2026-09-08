/**
 * WHERE A PARTY'S SHARE IS EXPECTED TO COME FROM — and why that is not a payment.
 *
 * The Director's decision: a funding source is ATTACHED TO RESPONSIBILITY. An employer, a
 * scholarship or a subsidy agency does not become contractually responsible by funding something;
 * making an external party responsible takes an arrangement share, exactly like a parent. So this
 * records expected funding against a share or an allocation, and never against a charge directly.
 *
 * Expected funding is not money. It does not reduce Thread 8 outstanding, it does not appear as a
 * receipt, and nothing here writes to `payments`. A family whose subsidy has not arrived still owes
 * what they owe, and the platform says so.
 *
 * ── THE ENGINE IS COMMERCIAL'S, AND STAYS COMMERCIAL'S ──
 *
 * `toFundingPlan` adapts these persisted rows into the `FundingPlan` that
 * `lib/commercial/execution/fundingAttribute.ts` already takes — the same contract, the same
 * residual-absorbs-rounding invariant, the same hermetic proofs. Thread 6 supplies the input
 * Commercial Execution's doctrine always said was a consumer's to supply; it does not reimplement
 * the arithmetic, and the engine does not become the system of record for responsibility.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FundingPlan, FundingSourceType, PayerAllocationInstruction } from "@/lib/commercial/execution/funding";
import { ResponsibilityError } from "@/lib/financials/responsibility/responsibilityService";

export type ExpectedFundingInput = {
    orgId: string;
    /** Attach to the authored share (applies to every period) or to one resolved allocation. */
    shareId?: string | null;
    allocationId?: string | null;
    arrangementId?: string | null;
    fundingSourceType: FundingSourceType;
    fundingSourceLabel: string;
    fundingSourceReference?: string | null;
    basis: "percentage" | "fixed_amount";
    percentBasisPoints?: number | null;
    expectedAmountCents?: number | null;
    effectiveStart?: string | null;
    effectiveEnd?: string | null;
    idempotencyKey: string;
    actorUserId: string | null;
};

const SOURCE_TYPES: readonly string[] = [
    "private_pay",
    "government_subsidy",
    "employer_sponsorship",
    "scholarship",
    "corporate_program",
];

export async function configureExpectedFunding(
    supabase: SupabaseClient,
    input: ExpectedFundingInput,
): Promise<{ fundingId: string; idempotent: boolean }> {
    if (!input.shareId && !input.allocationId) {
        throw new ResponsibilityError(
            "missing_anchor",
            "Expected funding attaches to a responsibility share or allocation — funding with no responsibility belongs to nobody.",
        );
    }
    if (!SOURCE_TYPES.includes(input.fundingSourceType)) {
        throw new ResponsibilityError("invalid_source_type", `Unknown funding source: ${input.fundingSourceType}.`);
    }
    if (!input.fundingSourceLabel?.trim()) {
        throw new ResponsibilityError("missing_source_label", "Name the funding source.");
    }
    if (input.basis === "percentage") {
        const bp = Number(input.percentBasisPoints);
        if (!Number.isInteger(bp) || bp < 0 || bp > 10_000) {
            throw new ResponsibilityError("invalid_percentage", "Expected funding is 0–10000 basis points.");
        }
    } else {
        const cents = Number(input.expectedAmountCents);
        if (!Number.isInteger(cents) || cents < 0) {
            throw new ResponsibilityError("invalid_amount", "Expected funding is a whole, non-negative number of cents.");
        }
    }

    const { data: existing, error: existingError } = await supabase
        .from("financial_expected_funding")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
    if (existingError) throw new ResponsibilityError("db_error", existingError.message);
    if (existing) return { fundingId: (existing as { id: string }).id, idempotent: true };

    const { data, error } = await supabase
        .from("financial_expected_funding")
        .insert({
            org_id: input.orgId,
            arrangement_id: input.arrangementId ?? null,
            share_id: input.shareId ?? null,
            allocation_id: input.allocationId ?? null,
            funding_source_type: input.fundingSourceType,
            funding_source_label: input.fundingSourceLabel.trim(),
            funding_source_reference: input.fundingSourceReference ?? null,
            basis: input.basis,
            percent_basis_points: input.basis === "percentage" ? Number(input.percentBasisPoints) : null,
            expected_amount_cents: input.basis === "fixed_amount" ? Number(input.expectedAmountCents) : null,
            effective_start: input.effectiveStart ?? null,
            effective_end: input.effectiveEnd ?? null,
            idempotency_key: input.idempotencyKey,
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
        })
        .select("id")
        .single();
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            const { data: winner } = await supabase
                .from("financial_expected_funding").select("id")
                .eq("org_id", input.orgId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
            if (winner) return { fundingId: (winner as { id: string }).id, idempotent: true };
        }
        throw new ResponsibilityError("db_error", error.message);
    }
    return { fundingId: (data as { id: string }).id, idempotent: false };
}

/**
 * Adapt one responsibility allocation's expected funding into Commercial Execution's `FundingPlan`.
 *
 * The responsible PARTY is the plan's `primary` — which is exactly right and exactly why this
 * adapter exists: in the engine the primary owns the residual, and here the residual is what the
 * family still expects to pay out of pocket after the agency and the employer have covered their
 * parts. Feeding the engine anything else would make an unfunded gap look like somebody else's.
 */
export async function toFundingPlan(
    supabase: SupabaseClient,
    args: { orgId: string; allocationId: string },
): Promise<FundingPlan | null> {
    const { data: allocationRow, error: allocationError } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, share_id, responsible_party_id, is_unassigned, assigned_amount_cents")
        .eq("org_id", args.orgId)
        .eq("id", args.allocationId)
        .maybeSingle();
    if (allocationError) throw new ResponsibilityError("db_error", allocationError.message);
    if (!allocationRow) return null;
    const allocation = allocationRow as {
        id: string;
        share_id: string | null;
        responsible_party_id: string | null;
        is_unassigned: boolean;
    };
    /*
     * UNASSIGNED CENTS CANNOT BE FUNDED. There is no party for a funder to be funding, and inventing
     * a primary here would smuggle back the default responsible party the Director removed.
     */
    if (allocation.is_unassigned || !allocation.responsible_party_id) return null;

    const { data: fundingRows, error: fundingError } = await supabase
        .from("financial_expected_funding")
        .select("funding_source_type, funding_source_label, funding_source_reference, basis, percent_basis_points, expected_amount_cents, state")
        .eq("org_id", args.orgId)
        .eq("state", "active")
        .or(`allocation_id.eq.${allocation.id}${allocation.share_id ? `,share_id.eq.${allocation.share_id}` : ""}`);
    if (fundingError) throw new ResponsibilityError("db_error", fundingError.message);

    const allocations: PayerAllocationInstruction[] = ((fundingRows ?? []) as Array<Record<string, unknown>>).map((f) => ({
        payer: {
            partyType: "funding_source",
            partyId: (f.funding_source_reference as string | null) ?? null,
            source: f.funding_source_type as FundingSourceType,
            label: String(f.funding_source_label),
        },
        basis: f.basis === "percentage" ? "percentage" : "fixed_amount",
        value:
            f.basis === "percentage"
                ? Number(f.percent_basis_points) / 100 // the engine speaks percent, this table speaks basis points
                : Number(f.expected_amount_cents),
    }));

    return {
        primary: {
            partyType: "person",
            partyId: allocation.responsible_party_id,
            source: "private_pay",
            label: "Responsible party",
        },
        allocations,
    };
}
