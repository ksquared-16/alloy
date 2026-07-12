/**
 * Attach canonical relationship instances to entity GET payloads for Focus Panel consumers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePersonChildRelationshipsFromStore } from "./personChildRelationshipResolverRegistry";

export type PersonChildRelationshipMemberBag = {
    customer_member_id: string;
    customer_id: string;
    child_id: string | null;
    items: Awaited<ReturnType<typeof resolvePersonChildRelationshipsFromStore>>["items"];
};

export async function attachPersonChildRelationshipsToEntityRecord(args: {
    supabase: SupabaseClient;
    orgId: string;
    customerId: string;
    customerMemberIds: readonly string[];
    memberChildIds?: ReadonlyMap<string, string | null>;
}): Promise<PersonChildRelationshipMemberBag[]> {
    const bags: PersonChildRelationshipMemberBag[] = [];
    for (const memberId of args.customerMemberIds) {
        if (!memberId.trim()) continue;
        const resolved = await resolvePersonChildRelationshipsFromStore({
            supabase: args.supabase,
            orgId: args.orgId,
            customerId: args.customerId,
            customerMemberId: memberId,
        });
        bags.push({
            customer_member_id: memberId,
            customer_id: args.customerId,
            child_id: args.memberChildIds?.get(memberId) ?? null,
            items: resolved.items,
        });
    }
    return bags;
}
