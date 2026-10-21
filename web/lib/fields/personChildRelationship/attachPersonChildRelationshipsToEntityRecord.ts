/**
 * Attach canonical relationship instances to entity GET payloads for Focus Panel consumers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePersonChildRelationshipsForMembersFromStore } from "./personChildRelationshipResolverRegistry";
import type { PersonChildRelationshipCollectionResult } from "./personChildRelationshipEntity";

export type PersonChildRelationshipMemberBag = {
    customer_member_id: string;
    customer_id: string;
    child_id: string | null;
    items: PersonChildRelationshipCollectionResult["items"];
};

export async function attachPersonChildRelationshipsToEntityRecord(args: {
    supabase: SupabaseClient;
    orgId: string;
    customerId: string;
    customerMemberIds: readonly string[];
    memberChildIds?: ReadonlyMap<string, string | null>;
}): Promise<PersonChildRelationshipMemberBag[]> {
    const bags: PersonChildRelationshipMemberBag[] = [];
    // One bounded read for every child (was five queries per child, in sequence).
    const resolved = await resolvePersonChildRelationshipsForMembersFromStore({
        supabase: args.supabase,
        orgId: args.orgId,
        customerId: args.customerId,
        customerMemberIds: args.customerMemberIds,
    });
    for (const memberId of args.customerMemberIds) {
        if (!memberId.trim()) continue;
        bags.push({
            customer_member_id: memberId,
            customer_id: args.customerId,
            child_id: args.memberChildIds?.get(memberId) ?? null,
            items: resolved.get(memberId.trim())?.items ?? [],
        });
    }
    return bags;
}
