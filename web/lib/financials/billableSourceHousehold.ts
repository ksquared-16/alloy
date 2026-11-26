/**
 * WHOSE MONEY, AND WHOSE OBLIGATION — one answer, used by both sides.
 *
 * A payment and a charge each name an account the same way: a childcare billable source, which is
 * either the household itself or one child's enrollment agreement. Deciding whether a payment may
 * answer a charge is therefore a question about those two sources resolving to the SAME household.
 *
 * ── WHY NOT `payments.customer_id` ──
 *
 * That column is populated for a household-sourced payment and left NULL for an agreement-sourced one
 * unless a caller passes it, and the service that writes it says so in as many words: it exists so
 * job-era readers keep working and "it is never a second source of truth". Comparing it against a
 * charge would therefore be comparing a convenience column against canonical identity, and would
 * silently permit every agreement-sourced payment — the case with no value to compare.
 *
 * ── WHY HOUSEHOLD AND NOT SOURCE ──
 *
 * Requiring the two sources to be EQUAL would be wrong and would break a supported flow: a household
 * pays, and the money answers a charge raised against one child's agreement. The boundary is the
 * household; the grain below it is not the question.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChildcareBillableSourceType } from "@/lib/financials/billableSource";

/**
 * The household a childcare billable source belongs to, or null when it cannot be established.
 *
 * NULL IS NOT "ALLOWED". A caller enforcing an identity boundary must treat an unresolvable household
 * as a refusal: "we could not tell whose this is" is the one answer that must never open the gate.
 */
export async function resolveBillableSourceHouseholdId(
    supabase: SupabaseClient,
    orgId: string,
    sourceType: ChildcareBillableSourceType | string | null,
    sourceId: string | null,
): Promise<string | null> {
    const type = typeof sourceType === "string" ? sourceType.trim() : "";
    const id = typeof sourceId === "string" ? sourceId.trim() : "";
    if (!orgId || !type || !id) return null;

    // The household source IS the household. Nothing to traverse.
    if (type === "customer") return id;

    if (type !== "enrollment_agreement") return null;

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("customer_id, customer_member_id")
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) return null;
    const row = data as { customer_id?: string | null; customer_member_id?: string | null } | null;
    if (!row) return null;

    const direct = typeof row.customer_id === "string" ? row.customer_id.trim() : "";
    if (direct) return direct;

    /*
     * `child_enrollment_agreements.customer_id` is nullable; `customer_members.customer_id` is NOT
     * NULL, so the child is the reliable way back to the household when the agreement does not carry
     * it directly. One extra bounded read, and only for agreements missing the denormalised column.
     */
    const memberId = typeof row.customer_member_id === "string" ? row.customer_member_id.trim() : "";
    if (!memberId) return null;
    const { data: member, error: memberError } = await supabase
        .from("customer_members")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("id", memberId)
        .maybeSingle();
    if (memberError) return null;
    const viaMember = (member as { customer_id?: string | null } | null)?.customer_id;
    return typeof viaMember === "string" && viaMember.trim() ? viaMember.trim() : null;
}
