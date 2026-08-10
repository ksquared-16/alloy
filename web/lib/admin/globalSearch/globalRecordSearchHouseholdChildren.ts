import type { SupabaseClient } from "@supabase/supabase-js";

import { personRowIsChildRelationship } from "@/lib/admin/globalSearch/globalRecordSearchPersonPresentation";

export type GlobalSearchChildMemberRow = {
    id: string;
    customer_id: string;
    person_id?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    relationship?: string | null;
    status_key?: string | null;
    dob?: string | null;
};

export const GLOBAL_SEARCH_CHILD_MEMBER_SELECT =
    "id, customer_id, person_id, display_name, first_name, last_name, relationship, dob";

/** Customer ids whose household name matches the search token. */
export async function resolveGlobalSearchHouseholdCustomerIdsByName(
    supabase: SupabaseClient,
    orgId: string,
    token: string
): Promise<string[]> {
    const pattern = `%${token}%`;
    const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .ilike("name", pattern)
        .limit(24);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean))];
}

/** All child customer_members for the given household customer ids. */
export async function fetchGlobalSearchChildMembersByCustomerIds(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[]
): Promise<GlobalSearchChildMemberRow[]> {
    const ids = [...new Set(customerIds.map(String).filter(Boolean))];
    if (!ids.length) return [];

    const { data, error } = await supabase
        .from("customer_members")
        .select(GLOBAL_SEARCH_CHILD_MEMBER_SELECT)
        .eq("org_id", orgId)
        .in("customer_id", ids);
    if (error) throw new Error(error.message);

    return ((data ?? []) as GlobalSearchChildMemberRow[]).filter((row) =>
        personRowIsChildRelationship(row.relationship)
    );
}

/**
 * Merge direct name matches with household-name matches and full sibling sets
 * so searching a family name returns every child in that household.
 */
export async function expandGlobalSearchChildMemberRows(args: {
    supabase: SupabaseClient;
    orgId: string;
    token: string;
    directMatches: GlobalSearchChildMemberRow[];
    seedCustomerIds?: string[];
}): Promise<GlobalSearchChildMemberRow[]> {
    const byId = new Map<string, GlobalSearchChildMemberRow>();
    for (const row of args.directMatches) {
        if (row?.id && personRowIsChildRelationship(row.relationship)) {
            byId.set(String(row.id), row);
        }
    }

    const householdIds = new Set<string>(args.seedCustomerIds ?? []);
    for (const row of byId.values()) {
        if (row.customer_id) householdIds.add(String(row.customer_id));
    }
    for (const cid of await resolveGlobalSearchHouseholdCustomerIdsByName(args.supabase, args.orgId, args.token)) {
        householdIds.add(cid);
    }

    if (householdIds.size) {
        const siblings = await fetchGlobalSearchChildMembersByCustomerIds(
            args.supabase,
            args.orgId,
            [...householdIds]
        );
        for (const row of siblings) {
            if (row?.id) byId.set(String(row.id), row);
        }
    }

    return [...byId.values()];
}

export function globalSearchCollectHouseholdCustomerIds(
    hits: Array<{ customer_id?: string | null }>
): string[] {
    return [...new Set(hits.map((h) => String(h.customer_id ?? "").trim()).filter(Boolean))];
}
