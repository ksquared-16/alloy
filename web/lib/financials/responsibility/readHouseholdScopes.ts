import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE SCOPES AN OPERATOR MAY ARRANGE RESPONSIBILITY FOR.
 *
 * Responsibility has two canonical grains, so administering it means choosing between the
 * household and one of its children. That choice must come from canonical household membership —
 * `customer_members` — and not from whichever ledger rows happen to exist: a child with no charge
 * yet is exactly the child an operator is most likely to be setting responsibility up for, and
 * deriving the list from activity would hide them.
 *
 * Inactive members are excluded on the same reasoning `readChildNames` uses: a child who has left
 * is not who an operator is arranging for today. An arrangement already authored for such a child
 * is untouched — this decides what may be AUTHORED, never what is in force.
 */
export type HouseholdScopeMember = {
    customerMemberId: string;
    label: string;
};

export async function readHouseholdScopes(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string },
): Promise<HouseholdScopeMember[]> {
    const { data, error } = await supabase
        .from("customer_members")
        .select("id, display_name, first_name, last_name, is_active")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId);
    /*
     * FAIL CLOSED. An empty scope list reads as "this household has no children", which would send
     * an operator to author a household arrangement for a family they meant to scope to one child.
     */
    if (error) throw new Error(`household scopes could not be read (${error.message.trim()})`);

    const rows = (data ?? []) as Array<{
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        is_active: boolean | null;
    }>;
    return rows
        .filter((r) => r.is_active !== false)
        .map((r) => {
            const name =
                (r.display_name ?? "").trim() ||
                [(r.first_name ?? "").trim(), (r.last_name ?? "").trim()].filter(Boolean).join(" ");
            return { customerMemberId: String(r.id), label: name || "Child" };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}
