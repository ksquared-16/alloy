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

export type ShareExpectedFunding = {
    id: string;
    sourceType: string;
    label: string;
    /** The canonical reference the source was named by — an agency id for government subsidy. */
    reference: string | null;
    basis: string;
    expectedAmountCents: number | null;
    percentBasisPoints: number | null;
};

export type AccountArrangementShare = {
    /*
     * THE ANCHOR. Expected funding attaches to a SHARE, so the share's own id is what makes the
     * capability reachable — without it a surface can show that funding exists and never say which
     * responsibility it funds, which is how a funding control becomes an account-wide toggle.
     */
    id: string;
    responsiblePartyId: string | null;
    /** Who the share is held by, so the operator is funding a person rather than an identifier. */
    name: string;
    /** `fixed`, `percentage`, `remainder` — the method the arrangement was stated in. */
    method: string | null;
    amountCents: number | null;
    percentBasisPoints: number | null;
    /** What is expected to cover this share, from elsewhere. Expectation, never receipt. */
    expectedFunding: ShareExpectedFunding[];
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
        .select("id, responsible_party_id, method, amount_cents, percent_basis_points")
        .eq("org_id", args.orgId)
        .eq("arrangement_id", row.id)
        .order("priority", { ascending: true, nullsFirst: false });
    if (shareError) throw new Error(`responsibility shares could not be read (${shareError.message.trim()})`);

    const shares = ((shareRows ?? []) as Array<Record<string, unknown>>).map((s) => ({
        id: String(s.id),
        responsiblePartyId: s.responsible_party_id != null ? String(s.responsible_party_id) : null,
        method: s.method != null ? String(s.method) : null,
        amountCents: s.amount_cents != null ? Number(s.amount_cents) : null,
        percentBasisPoints: s.percent_basis_points != null ? Number(s.percent_basis_points) : null,
    }));

    /*
     * NAMES, FROM `persons`, ORG-FILTERED. A share names a person id; an operator deciding who a
     * funder is covering cannot read a uuid. The org filter is the same load-bearing one the
     * candidate resolver uses — a party this org does not own never reaches the screen with a name.
     */
    const partyIds = [...new Set(shares.map((s) => s.responsiblePartyId).filter((v): v is string => !!v))];
    const nameById = new Map<string, string>();
    if (partyIds.length > 0) {
        const { data: personRows, error: personError } = await supabase
            .from("persons")
            .select("id, full_name, first_name, last_name")
            .eq("org_id", args.orgId)
            .in("id", partyIds);
        if (personError) throw new Error(`responsible parties could not be named (${personError.message.trim()})`);
        for (const person of ((personRows ?? []) as Array<Record<string, unknown>>)) {
            const full = person.full_name != null ? String(person.full_name).trim() : "";
            const first = person.first_name != null ? String(person.first_name).trim() : "";
            const last = person.last_name != null ? String(person.last_name).trim() : "";
            nameById.set(String(person.id), full || [first, last].filter(Boolean).join(" ") || "Responsible party");
        }
    }

    /*
     * WHAT IS EXPECTED AGAINST EACH SHARE. Active rows only: a superseded expectation is history,
     * and summing it with its replacement would state a funder covering the same money twice.
     *
     * Anchored by share, not by allocation. Share-anchored funding is the durable form — "this
     * agency covers $650 of this parent's share, every month" — which is what an operator is
     * configuring here; per-period allocation-anchored rows are the resolution machinery's.
     */
    const fundingByShare = new Map<string, ShareExpectedFunding[]>();
    if (shares.length > 0) {
        const { data: fundingRows, error: fundingError } = await supabase
            .from("financial_expected_funding")
            .select("id, share_id, funding_source_type, funding_source_label, funding_source_reference, basis, expected_amount_cents, percent_basis_points")
            .eq("org_id", args.orgId)
            .eq("state", "active")
            .is("allocation_id", null)
            .in("share_id", shares.map((s) => s.id));
        if (fundingError) throw new Error(`expected funding could not be read (${fundingError.message.trim()})`);
        for (const f of ((fundingRows ?? []) as Array<Record<string, unknown>>)) {
            const shareId = f.share_id != null ? String(f.share_id) : "";
            if (!shareId) continue;
            const list = fundingByShare.get(shareId) ?? [];
            list.push({
                id: String(f.id),
                sourceType: String(f.funding_source_type ?? ""),
                label: String(f.funding_source_label ?? ""),
                reference: f.funding_source_reference != null ? String(f.funding_source_reference) : null,
                basis: String(f.basis ?? ""),
                expectedAmountCents: f.expected_amount_cents == null ? null : Number(f.expected_amount_cents),
                percentBasisPoints: f.percent_basis_points == null ? null : Number(f.percent_basis_points),
            });
            fundingByShare.set(shareId, list);
        }
    }

    return {
        id: row.id,
        effectiveStart: row.effective_start,
        effectiveEnd: row.effective_end,
        shares: shares.map((s) => ({
            ...s,
            name: (s.responsiblePartyId && nameById.get(s.responsiblePartyId)) || "Responsible party",
            expectedFunding: fundingByShare.get(s.id) ?? [],
        })),
    };
}
