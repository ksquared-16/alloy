/**
 * WHO OWES GENERATED TUITION — the same responsibility authority Add Charge uses (W7-F023).
 *
 * ── THE LIFECYCLE RULE (canonical, already stated by the resolver) ────────────────────────────
 *
 * Responsibility BINDS WHEN THE CHARGE IS CREATED. `resolveChargeResponsibility` divides a charge's
 * net under the arrangement in force on its service date (charge-specific > child > household) and
 * writes keyed allocation rows; resolving again is `unchanged`; a DRAFT whose arrangement changed is
 * re-divided by superseding the old rows with lineage; a POSTED charge is never re-divided without the
 * explicit reallocation command. Posting does not allocate and does not recompute — it changes the
 * lifecycle state, never the debtor.
 *
 * Add Charge honours that rule by sequencing the canonical acts right after `charge.add` (configure
 * the shares the operator reviewed, then `billing.resolve_responsibility`). Generated tuition never
 * called the resolver, so every generated draft read "Not allocated" under an arrangement that named
 * a responsible party. This module is that missing step — not a tuition allocator: the PREVIEW reads
 * the arrangement and divides it with the very functions the resolver uses, and the RUN calls the
 * resolver itself.
 *
 * ── NO ARRANGEMENT ──
 *
 * Add Charge with no standing arrangement creates the charge and writes no allocation ("Not
 * allocated"). Generation does the same — it never invents a party — and SAYS so in both the preview
 * and the run result, so a charge nobody is responsible for is never created silently.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { readArrangementInForce, resolveChargeResponsibility } from "@/lib/financials/responsibility/responsibilityService";
import { resolveResponsibilitySplit } from "@/lib/financials/responsibility/resolveResponsibilitySplit";

export type TuitionResponsibilityParty = {
    partyId: string;
    name: string | null;
    /** "100%", "60%", "$650.00", or "remainder" — the share as the arrangement states it. */
    share: string;
    assignedCents: number;
};

export type TuitionResponsibility =
    | { status: "resolved"; arrangementId: string; parties: TuitionResponsibilityParty[] }
    | { status: "none"; detail: string }
    | { status: "refused"; reason: string; detail: string }
    | { status: "review"; detail: string };

async function partyNames(supabase: SupabaseClient, orgId: string, ids: readonly string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const { data } = await supabase.from("persons").select("id, full_name").eq("org_id", orgId).in("id", unique);
    return new Map(((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name]));
}

function shareLabel(basis: string, basisValue: number | null): string {
    if (basis === "percentage" && basisValue != null) return `${basisValue / 100}%`;
    if (basis === "fixed" && basisValue != null) return `$${(basisValue / 100).toFixed(2)}`;
    return basis;
}

/**
 * WHAT THE RUN WILL BIND, without writing — the arrangement in force for this enrolment's charge on
 * its service date, divided over the amount the run would draft.
 */
export async function planTuitionResponsibility(
    supabase: SupabaseClient,
    args: { orgId: string; agreementId: string; serviceDate: string; netCents: number },
): Promise<TuitionResponsibility> {
    const { data: agreement } = await supabase
        .from("child_enrollment_agreements")
        .select("customer_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("id", args.agreementId)
        .maybeSingle();
    const customerId = (agreement as { customer_id?: string | null } | null)?.customer_id ?? null;
    if (!customerId) return { status: "refused", reason: "no_account", detail: "The enrolment names no household." };
    const arrangement = await readArrangementInForce(supabase, {
        orgId: args.orgId,
        customerId,
        customerMemberId: (agreement as { customer_member_id?: string | null }).customer_member_id ?? null,
        onDate: args.serviceDate,
    });
    if (!arrangement) {
        return {
            status: "none",
            detail: "No responsibility arrangement is in force for this period, so the charge will read Not allocated.",
        };
    }
    const split = resolveResponsibilitySplit({ netCents: args.netCents, shares: arrangement.shares });
    if (split.kind === "refused") {
        return { status: "refused", reason: split.reason, detail: `The arrangement in force cannot divide this charge (${split.detail}).` };
    }
    const names = await partyNames(supabase, args.orgId, split.allocations.map((a) => a.responsiblePartyId ?? ""));
    return {
        status: "resolved",
        arrangementId: arrangement.id,
        parties: split.allocations.map((a) => ({
            partyId: a.responsiblePartyId ?? "",
            name: a.isUnassigned ? "Unassigned" : names.get(a.responsiblePartyId ?? "") ?? null,
            share: a.isUnassigned ? "unassigned" : shareLabel(a.basis, a.basisValue),
            assignedCents: a.assignedAmountCents,
        })),
    };
}

/**
 * BIND IT — through the canonical resolver, on the draft the run just wrote, before it can post.
 * Idempotent: an identical division is `unchanged`; no row is ever written twice.
 */
export async function applyTuitionResponsibility(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string; agreementId: string; serviceDate: string; netCents: number; actorUserId: string | null },
): Promise<TuitionResponsibility> {
    const plan = await planTuitionResponsibility(supabase, args);
    if (plan.status !== "resolved") return plan;
    const outcome = await resolveChargeResponsibility(supabase, {
        orgId: args.orgId,
        chargeId: args.chargeId,
        actorUserId: args.actorUserId,
        // A background run NEVER moves posted money between parties; that is the explicit command's.
        allowReallocation: false,
    });
    if (outcome.kind === "resolved" || outcome.kind === "unchanged") return plan;
    if (outcome.kind === "reallocation_required") return { status: "review", detail: outcome.detail };
    return { status: "refused", reason: outcome.reason, detail: outcome.detail };
}
