/**
 * RESOLVING WHO OWES ONE CHARGE — and persisting it once.
 *
 * The arrangement is the intent; this is where it becomes a consequence. It reads the arrangement
 * in force for the charge's household and child, asks `resolveAllocatableNet` what there is to
 * divide, asks `resolveResponsibilitySplit` how it divides, and writes the answer with a snapshot
 * of the net it was computed from.
 *
 * ── WHEN NOBODY HAS SAID ──
 *
 * A charge with no arrangement in force is not an error and is not the household's by default. It
 * resolves to a single UNASSIGNED allocation for the whole net: the platform states plainly that
 * nobody has been made responsible yet, and the reconciliation invariant still holds exactly. That
 * is the Director's decision, and it is why this service can run over every charge in a tenant
 * without inventing a single responsible person.
 *
 * ── WHEN THE ANSWER WOULD CHANGE AFTER POSTING ──
 *
 * Re-running is harmless while the answer is the same. If a superseding arrangement would move
 * money between two real people on a POSTED charge, this refuses and says so — moving a
 * contractual position is an explicit operator act with a preview, never a background convergence.
 * Before posting, a draft simply re-resolves.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { AllocatableNetError, resolveAllocatableNet, type AllocatableNet } from "@/lib/financials/responsibility/resolveAllocatableNet";
import {
    resolveResponsibilitySplit,
    responsibilityAllocationKey,
    type ResponsibilityShare,
} from "@/lib/financials/responsibility/resolveResponsibilitySplit";

export class ResponsibilityError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export type ArrangementInForce = {
    id: string;
    customerId: string;
    customerMemberId: string | null;
    effectiveStart: string;
    effectiveEnd: string | null;
    shares: ResponsibilityShare[];
};

export type ResolveOutcome =
    | { kind: "resolved"; chargeId: string; arrangementId: string | null; allocations: number; unassignedCents: number; netCents: number }
    | { kind: "unchanged"; chargeId: string; arrangementId: string | null }
    | { kind: "reallocation_required"; chargeId: string; from: string | null; to: string | null; detail: string }
    | { kind: "refused"; chargeId: string; reason: string; detail: string };

/**
 * The arrangement governing one child's charge on one date.
 *
 * MOST SPECIFIC WINS, the same rule `resolvePolicy` uses for commercial policy: a child-scoped
 * arrangement beats an account-wide one. Overlap within a scope cannot happen — the database's
 * exclusion constraint refuses it — so this never has to break a tie it was not given a rule for.
 */
export async function readArrangementInForce(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; customerMemberId: string | null; onDate: string },
): Promise<ArrangementInForce | null> {
    const { data, error } = await supabase
        .from("financial_responsibility_arrangements")
        .select("id, customer_id, customer_member_id, effective_start, effective_end, state")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("state", "active");
    if (error) throw new ResponsibilityError("db_error", error.message);

    const candidates = ((data ?? []) as Array<{
        id: string;
        customer_id: string;
        customer_member_id: string | null;
        effective_start: string;
        effective_end: string | null;
    }>)
        .filter((a) => a.customer_member_id === null || a.customer_member_id === args.customerMemberId)
        .filter((a) => a.effective_start <= args.onDate)
        .filter((a) => !a.effective_end || a.effective_end >= args.onDate);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        const specificity = Number(b.customer_member_id !== null) - Number(a.customer_member_id !== null);
        if (specificity !== 0) return specificity;
        return a.effective_start < b.effective_start ? 1 : -1;
    });
    const winner = candidates[0]!;

    const { data: shareRows, error: shareError } = await supabase
        .from("financial_responsibility_shares")
        .select("id, responsible_party_id, method, percent_basis_points, amount_cents, priority")
        .eq("org_id", args.orgId)
        .eq("arrangement_id", winner.id);
    if (shareError) throw new ResponsibilityError("db_error", shareError.message);

    return {
        id: winner.id,
        customerId: winner.customer_id,
        customerMemberId: winner.customer_member_id,
        effectiveStart: winner.effective_start,
        effectiveEnd: winner.effective_end,
        shares: ((shareRows ?? []) as Array<Record<string, unknown>>).map((s) => ({
            shareId: String(s.id),
            responsiblePartyId: String(s.responsible_party_id),
            method: String(s.method) as ResponsibilityShare["method"],
            percentBasisPoints: s.percent_basis_points == null ? null : Number(s.percent_basis_points),
            amountCents: s.amount_cents == null ? null : Number(s.amount_cents),
            priority: Number(s.priority ?? 100),
        })),
    };
}

export async function resolveChargeResponsibility(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        chargeId: string;
        actorUserId?: string | null;
        /** Set only by the explicit reallocation command, never by a background run. */
        allowReallocation?: boolean;
        reallocationReason?: string | null;
    },
): Promise<ResolveOutcome> {
    let net: AllocatableNet;
    try {
        net = await resolveAllocatableNet(supabase, { orgId: args.orgId, chargeId: args.chargeId });
    } catch (err) {
        if (err instanceof AllocatableNetError) {
            return { kind: "refused", chargeId: args.chargeId, reason: err.code, detail: err.message };
        }
        throw err;
    }
    if (!net.customerId) {
        return { kind: "refused", chargeId: args.chargeId, reason: "no_account", detail: "The charge's enrolment names no household." };
    }

    const onDate = net.serviceDate ?? new Date().toISOString().slice(0, 10);
    const arrangement = await readArrangementInForce(supabase, {
        orgId: args.orgId,
        customerId: net.customerId,
        customerMemberId: net.customerMemberId,
        onDate,
    });

    const split = arrangement
        ? resolveResponsibilitySplit({ netCents: net.netCents, shares: arrangement.shares })
        : ({
              // NOBODY HAS SAID. One row, the whole net, no person invented.
              kind: "allocated" as const,
              allocations: [
                  {
                      shareId: null,
                      responsiblePartyId: null,
                      isUnassigned: true,
                      assignedAmountCents: net.netCents,
                      basis: "unassigned" as const,
                      basisValue: null,
                      explanation: "No responsibility arrangement is in force for this period.",
                  },
              ],
              unassignedCents: net.netCents,
          });
    if (split.kind === "refused") {
        return { kind: "refused", chargeId: args.chargeId, reason: split.reason, detail: split.detail };
    }

    // ── WHAT ALREADY STANDS ─────────────────────────────────────────────────────────────────
    const { data: existingRows, error: existingError } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, arrangement_id, share_id, assigned_amount_cents, is_unassigned, idempotency_key")
        .eq("org_id", args.orgId)
        .eq("charge_id", args.chargeId)
        .eq("state", "active");
    if (existingError) throw new ResponsibilityError("db_error", existingError.message);
    const existing = (existingRows ?? []) as Array<{
        id: string;
        arrangement_id: string | null;
        assigned_amount_cents: number;
        idempotency_key: string;
    }>;

    const arrangementId = arrangement?.id ?? null;
    const desiredKeys = split.allocations.map((a) =>
        responsibilityAllocationKey(args.chargeId, arrangementId ?? "none", a.shareId),
    );

    if (existing.length > 0) {
        const sameSet =
            existing.length === desiredKeys.length && existing.every((e) => desiredKeys.includes(e.idempotency_key));
        const sameAmounts =
            sameSet
            && split.allocations.every((a) => {
                const key = responsibilityAllocationKey(args.chargeId, arrangementId ?? "none", a.shareId);
                const row = existing.find((e) => e.idempotency_key === key);
                return row && Number(row.assigned_amount_cents) === a.assignedAmountCents;
            });
        if (sameAmounts) return { kind: "unchanged", chargeId: args.chargeId, arrangementId };

        const priorArrangement = existing[0]!.arrangement_id;
        /*
         * MOVING A CONTRACTUAL POSITION IS AN ACT, NOT A RECALCULATION. On a posted charge a
         * different answer means one real person now owes what another owed, and that must be
         * chosen by an operator who saw it coming — never converged into by a scheduled run.
         */
        if (net.status !== "draft" && !args.allowReallocation) {
            return {
                kind: "reallocation_required",
                chargeId: args.chargeId,
                from: priorArrangement,
                to: arrangementId,
                detail:
                    "This charge is posted and the arrangement in force would divide it differently. "
                    + "Reallocating moves what one party owes to another and needs an explicit decision.",
            };
        }
        // Supersede rather than edit: the old division stays readable, with lineage.
        const { error: supersedeError } = await supabase
            .from("financial_responsibility_allocations")
            .update({ state: "superseded", updated_by: args.actorUserId ?? null, updated_at: new Date().toISOString() })
            .eq("org_id", args.orgId)
            .in("id", existing.map((e) => e.id));
        if (supersedeError) throw new ResponsibilityError("db_error", supersedeError.message);
    }

    const now = new Date().toISOString();
    const rows = split.allocations.map((a) => ({
        org_id: args.orgId,
        charge_id: args.chargeId,
        arrangement_id: arrangementId,
        share_id: a.shareId,
        responsible_party_type: a.isUnassigned ? null : "person",
        responsible_party_id: a.responsiblePartyId,
        is_unassigned: a.isUnassigned,
        assigned_amount_cents: a.assignedAmountCents,
        currency_code: net.currencyCode,
        net_snapshot_cents: net.netCents,
        gross_snapshot_cents: net.grossCents,
        reductions_snapshot_cents: net.reductionsCents,
        basis: a.basis,
        basis_value: a.basisValue,
        explanation:
            a.explanation
            + (args.reallocationReason ? ` Reallocated: ${args.reallocationReason}` : ""),
        period_key: net.periodKey,
        service_date: net.serviceDate,
        idempotency_key: `${responsibilityAllocationKey(args.chargeId, arrangementId ?? "none", a.shareId)}${
            existing.length > 0 ? `:${now}` : ""
        }`,
        supersedes_id: existing.find((e) =>
            e.idempotency_key.endsWith(a.shareId ?? "unassigned"),
        )?.id ?? null,
        created_by: args.actorUserId ?? null,
        updated_by: args.actorUserId ?? null,
    }));

    const { error: insertError } = await supabase.from("financial_responsibility_allocations").insert(rows);
    if (insertError) {
        // The loser of a race: the other writer already resolved this charge identically.
        if ((insertError as { code?: string }).code === "23505") {
            return { kind: "unchanged", chargeId: args.chargeId, arrangementId };
        }
        throw new ResponsibilityError("db_error", insertError.message);
    }

    return {
        kind: "resolved",
        chargeId: args.chargeId,
        arrangementId,
        allocations: rows.length,
        unassignedCents: split.unassignedCents,
        netCents: net.netCents,
    };
}
