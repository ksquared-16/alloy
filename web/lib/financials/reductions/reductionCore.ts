/**
 * ONE REDUCTION ENGINE. PROVENANCE IS WHAT DIFFERS.
 *
 * A manual credit, a commercial-policy discount and an Attendance-driven vacation credit are the
 * same financial event: money moves back to a family, through a negative contra charge, recorded
 * beside the gross that stays gross. What differs is WHO decided — an operator with a reason, a
 * `commercial_policies` row, or a `financial_policies` row — and that difference belongs in the
 * provenance columns, not in a second copy of the persistence rules.
 *
 * Before this, two copies existed. `applyManualReduction` and the commercial policy path each
 * carried their own idempotency pre-check, their own draft-charge creation and their own handling
 * of the unique-key race. A third copy for Thread 7's vacation credit would have made the divergence
 * permanent: the next fix to posted protection would land in one place and be missed in the others.
 *
 * ── WHAT THIS OWNS ──
 *
 *   idempotency, by caller-supplied key
 *   posted protection — settled money is history and is never rewritten
 *   draft recalculation — a draft reduction reconciles in place, because that is what a draft is
 *   the contra charge, created once and shared by every application row written with it
 *   the unique-key race, where the loser withdraws its surplus draft rather than erroring
 *
 * ── WHAT IT DOES NOT DECIDE ──
 *
 * Whether a reduction is owed, what it is worth, or which policy authorised it. Callers arrive
 * having decided; this writes it down.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createChildcareDraftCharge, recalculateDraftCharge } from "@/lib/financials/childcareChargeService";

export class ReductionCoreError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

/** One row in `financial_reduction_applications`, minus everything the core supplies itself. */
export type ReductionApplicationDraft = {
    /** `manual` carries a reason; `policy` carries exactly one policy authority. */
    reductionKind: "manual" | "policy";
    policyKind?: string | null;
    commercialPolicyId?: string | null;
    financialPolicyId?: string | null;
    policySnapshot?: Record<string, unknown>;
    /** The obligation this reduction answers, when one exists. Downstream canonical identity. */
    resolvedObligationId?: string | null;
    reason?: string | null;
    explanation?: string | null;
    basis?: string | null;
    basisValue?: number | null;
    basisAmountCents?: number | null;
    capped?: boolean;
    /** SIGNED cents. Negative reduces what the family owes. */
    amountCents: number;
    idempotencyKey: string;
};

export type ReductionCoreInput = {
    orgId: string;
    actorUserId: string | null;
    /** Canonical subject. The same fields the gross charge is attributed by. */
    subject: {
        enrollmentAgreementId: string;
        customerId?: string | null;
        customerMemberId?: string | null;
        sourceChargeId?: string | null;
        periodKey?: string | null;
        periodStart?: string | null;
        periodEnd?: string | null;
    };
    /** The contra charge these applications share. */
    charge: {
        chargeCategory: string;
        description: string;
        /** The date the reduction BELONGS to, so it lands in the period it reduces. */
        serviceDate: string;
        currencyCode: string;
        metadata?: Record<string, unknown>;
    };
    applications: ReductionApplicationDraft[];
    /**
     * What to do when the idempotency key is already present and its charge is a live draft.
     *
     * `return` — the caller treats a repeat as a no-op. A manual credit submitted twice is one
     * credit, and the second submission is not an instruction to re-price the first.
     * `reconcile` — the caller re-derives the amount each run, so a draft whose inputs moved is
     * brought into line. That is what a periodic policy pass is for.
     */
    onExisting: "return" | "reconcile";
};

export type ReductionCoreResult =
    | { kind: "applied"; chargeId: string; applicationIds: string[]; amountCents: number }
    | { kind: "unchanged"; chargeId: string; applicationIds: string[]; amountCents: number }
    | { kind: "already_posted"; chargeId: string; applicationIds: string[]; amountCents: number }
    /** The contra artifact is no longer a draft and no longer stands — withdrawn by a correction. */
    | { kind: "withdrawn"; chargeId: string; applicationIds: string[]; amountCents: number };

type ExistingRow = { id: string; charge_id: string; amount_cents: number; idempotency_key: string };

/**
 * EXACTLY ONE POLICY AUTHORITY, REFUSED HERE BEFORE THE DATABASE SEES IT.
 *
 * The CHECK constraint says the same thing and remains the invariant for anything arriving by
 * another route. It refuses as a constraint violation, which is an accurate answer to a question
 * the caller did not ask; this refuses in the domain's own words, and it refuses before a draft
 * charge has been created and has to be cleaned up.
 */
function assertProvenance(app: ReductionApplicationDraft): void {
    if (!Number.isInteger(app.amountCents) || app.amountCents === 0) {
        throw new ReductionCoreError("invalid_amount", "A reduction needs a whole, non-zero amount in cents.");
    }
    if (!app.idempotencyKey || !app.idempotencyKey.trim()) {
        throw new ReductionCoreError("idempotency_key_required", "A reduction must carry the identity that makes a repeat one reduction.");
    }
    if (app.reductionKind === "manual") {
        if (!(app.reason ?? "").trim()) {
            throw new ReductionCoreError("reason_required", "Say why the account is being reduced. A manual credit with no reason cannot be explained later.");
        }
        if (app.commercialPolicyId || app.financialPolicyId) {
            throw new ReductionCoreError(
                "manual_carries_policy_authority",
                "A manual reduction is one somebody granted by hand. Naming a policy on it would claim an authority that did not decide it.",
            );
        }
        return;
    }
    if (!(app.policyKind ?? "").trim()) {
        throw new ReductionCoreError("policy_kind_required", "A policy reduction must say what kind of policy decided it.");
    }
    const commercial = Boolean(app.commercialPolicyId);
    const financial = Boolean(app.financialPolicyId);
    if (commercial === financial) {
        throw new ReductionCoreError(
            commercial ? "ambiguous_policy_authority" : "missing_policy_authority",
            commercial
                ? "A policy reduction names one authority. With both a commercial and a financial policy set, nothing says which decided the money."
                : "A policy reduction must name the policy that decided it — a commercial policy or a financial policy, exactly one.",
        );
    }
}

export async function applyReductionCore(
    supabase: SupabaseClient,
    input: ReductionCoreInput,
): Promise<ReductionCoreResult> {
    if (!input.applications.length) {
        throw new ReductionCoreError("no_applications", "A reduction run must carry at least one application.");
    }
    for (const app of input.applications) assertProvenance(app);

    const keys = input.applications.map((a) => a.idempotencyKey);
    const total = input.applications.reduce((sum, a) => sum + a.amountCents, 0);

    // ── ALREADY DONE IS NOT AN ERROR ────────────────────────────────────────────────────────
    const { data: existingRows, error: existingError } = await supabase
        .from("financial_reduction_applications")
        .select("id, charge_id, amount_cents, idempotency_key")
        .eq("org_id", input.orgId)
        .in("idempotency_key", keys);
    if (existingError) throw new ReductionCoreError("db_error", existingError.message);
    const existing = (existingRows ?? []) as ExistingRow[];

    if (existing.length > 0) {
        const chargeId = existing[0]!.charge_id;
        const applicationIds = existing.map((r) => r.id);
        const recorded = existing.reduce((sum, r) => sum + r.amount_cents, 0);
        const { data: chargeRow, error: chargeError } = await supabase
            .from("charges")
            .select("id, status, amount_cents")
            .eq("org_id", input.orgId)
            .eq("id", chargeId)
            .maybeSingle();
        if (chargeError) throw new ReductionCoreError("db_error", chargeError.message);
        const row = chargeRow as { id: string; status: string; amount_cents: number } | null;

        // POSTED money is history. Re-running reports it and touches nothing.
        if (!row || row.status === "posted") {
            return { kind: "already_posted", chargeId, applicationIds, amountCents: recorded };
        }
        /*
         * ONLY A DRAFT MAY BE RECONCILED, and that is narrower than "not posted".
         *
         * A correction can retire this consequence's contra charge — draft to void — while leaving
         * the application row standing as the record that the credit was once decided. Recalculating
         * a void charge would resurrect money a correction had already withdrawn, quietly, on the
         * next replay. So anything that is not a live draft is treated as settled.
         */
        if (row.status !== "draft") {
            return { kind: "withdrawn", chargeId, applicationIds, amountCents: recorded };
        }
        if (input.onExisting === "return" || row.amount_cents === total) {
            return { kind: "unchanged", chargeId, applicationIds, amountCents: recorded };
        }
        await recalculateDraftCharge(supabase, {
            orgId: input.orgId,
            chargeId: row.id,
            amountCents: total,
            actorUserId: input.actorUserId,
        } as never);
        await supabase
            .from("financial_reduction_applications")
            .update({ updated_at: new Date().toISOString(), updated_by: input.actorUserId })
            .eq("org_id", input.orgId)
            .in("idempotency_key", keys);
        return { kind: "applied", chargeId: row.id, applicationIds, amountCents: total };
    }

    const created = await createChildcareDraftCharge(supabase, {
        orgId: input.orgId,
        enrollmentAgreementId: input.subject.enrollmentAgreementId,
        chargeCategory: input.charge.chargeCategory,
        chargeType: "adjustment",
        amountCents: total,
        currencyCode: input.charge.currencyCode,
        serviceDate: input.charge.serviceDate,
        description: input.charge.description,
        actorUserId: input.actorUserId,
        metadata: input.charge.metadata ?? {},
    } as never);
    const createdChargeId = (created as { id: string }).id;

    const now = new Date().toISOString();
    const rows = input.applications.map((app) => ({
        org_id: input.orgId,
        reduction_kind: app.reductionKind,
        policy_kind: app.policyKind ?? null,
        commercial_policy_id: app.commercialPolicyId ?? null,
        financial_policy_id: app.financialPolicyId ?? null,
        // The policy AS IT WAS. Editing it later must not rewrite what it already reduced.
        policy_snapshot: app.policySnapshot ?? {},
        resolved_obligation_id: app.resolvedObligationId ?? null,
        charge_id: createdChargeId,
        source_charge_id: input.subject.sourceChargeId ?? null,
        customer_id: input.subject.customerId ?? null,
        customer_member_id: input.subject.customerMemberId ?? null,
        enrollment_agreement_id: input.subject.enrollmentAgreementId,
        period_key: input.subject.periodKey ?? null,
        period_start: input.subject.periodStart ?? null,
        period_end: input.subject.periodEnd ?? null,
        basis: app.basis ?? null,
        basis_value: app.basisValue ?? null,
        basis_amount_cents: app.basisAmountCents ?? null,
        capped: app.capped ?? false,
        amount_cents: app.amountCents,
        currency_code: input.charge.currencyCode,
        explanation: app.explanation ?? null,
        reason: app.reason ?? null,
        idempotency_key: app.idempotencyKey,
        created_by: input.actorUserId,
        updated_by: input.actorUserId,
        updated_at: now,
    }));

    const { data: inserted, error: insertError } = await supabase
        .from("financial_reduction_applications")
        .insert(rows)
        .select("id");
    if (insertError) {
        /*
         * THE LOSER OF A RACE IS NOT AN ERROR. The unique key makes the database the authority on
         * "this reduction, once", so a concurrent run collides here rather than crediting the
         * family twice. Its charge is surplus and is withdrawn — a DRAFT created moments ago that
         * nothing has seen.
         */
        if ((insertError as { code?: string }).code === "23505") {
            await supabase.from("charges").delete()
                .eq("org_id", input.orgId).eq("id", createdChargeId).eq("status", "draft");
            const { data: winnerRows } = await supabase
                .from("financial_reduction_applications")
                .select("id, charge_id, amount_cents, idempotency_key")
                .eq("org_id", input.orgId)
                .in("idempotency_key", keys);
            const winners = (winnerRows ?? []) as ExistingRow[];
            if (winners.length) {
                return {
                    kind: "unchanged",
                    chargeId: winners[0]!.charge_id,
                    applicationIds: winners.map((r) => r.id),
                    amountCents: winners.reduce((sum, r) => sum + r.amount_cents, 0),
                };
            }
        }
        throw new ReductionCoreError("db_error", insertError.message);
    }

    return {
        kind: "applied",
        chargeId: createdChargeId,
        applicationIds: ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id),
        amountCents: total,
    };
}
