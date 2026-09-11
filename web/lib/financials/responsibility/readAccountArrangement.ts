/**
 * IS THERE AN ARRANGEMENT, AND WHAT DOES IT SAY?
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ──
 *
 * Every responsibility surface read `financial_responsibility_allocations` — who bears THIS charge.
 * Nothing read `financial_responsibility_arrangements` — who bears this ACCOUNT, from a date. The
 * two are not the same fact, and the gap between them was visible to an operator as a lie: after
 * successfully configuring an arrangement, the obligation went on saying "No responsibility
 * arrangement yet", because the posted charge it was looking at had no allocation and never would
 * without an explicit decision to re-divide money that has already been billed.
 *
 * So the answer had to come from the record that actually holds it.
 *
 * ── WHAT IT DOES NOT DO ──
 *
 * It does not allocate anything, and it does not imply that any particular charge has been divided.
 * Thread 6 deliberately refuses to move a posted charge onto a new arrangement without somebody
 * saying so; an arrangement in force and a charge still unassigned under it is a legitimate state,
 * and the only honest thing to do is say both.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountArrangementShare = {
    responsiblePartyId: string | null;
    /** `fixed`, `percent`, `remainder` — the method the arrangement was stated in. */
    method: string | null;
    amountCents: number | null;
    percentBasisPoints: number | null;
};

export type AccountArrangement = {
    id: string;
    effectiveStart: string | null;
    effectiveEnd: string | null;
    shares: AccountArrangementShare[];
};

/**
 * The arrangement in force for one account, if there is one.
 *
 * Active state only, and the newest start first: an arrangement is superseded by a later one rather
 * than edited, so the most recent active start is the one that governs.
 */
export async function readAccountArrangement(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string | null },
): Promise<AccountArrangement | null> {
    if (!args.customerId) return null;

    const { data, error } = await supabase
        .from("financial_responsibility_arrangements")
        .select("id, effective_start, effective_end")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("state", "active")
        .order("effective_start", { ascending: false, nullsFirst: false })
        .limit(1);
    /*
     * FAIL CLOSED. "There is no arrangement" is a claim an operator acts on — it is the sentence
     * that invites them to create one — so it may only be made about a record that was read.
     */
    if (error) throw new Error(`responsibility arrangement could not be read (${error.message.trim()})`);

    const row = ((data ?? []) as Array<{ id: string; effective_start: string | null; effective_end: string | null }>)[0];
    if (!row) return null;

    const { data: shareRows, error: shareError } = await supabase
        .from("financial_responsibility_shares")
        .select("responsible_party_id, method, amount_cents, percent_basis_points")
        .eq("org_id", args.orgId)
        .eq("arrangement_id", row.id)
        .order("priority", { ascending: true, nullsFirst: false });
    if (shareError) throw new Error(`responsibility shares could not be read (${shareError.message.trim()})`);

    return {
        id: row.id,
        effectiveStart: row.effective_start,
        effectiveEnd: row.effective_end,
        shares: ((shareRows ?? []) as Array<Record<string, unknown>>).map((s) => ({
            responsiblePartyId: s.responsible_party_id != null ? String(s.responsible_party_id) : null,
            method: s.method != null ? String(s.method) : null,
            amountCents: s.amount_cents != null ? Number(s.amount_cents) : null,
            percentBasisPoints: s.percent_basis_points != null ? Number(s.percent_basis_points) : null,
        })),
    };
}
