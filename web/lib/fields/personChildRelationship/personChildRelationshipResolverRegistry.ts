/**
 * DB-backed relationship-instance resolver registration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    loadCustomFieldValuesForRelationships,
    loadRelationshipsForCustomerMember,
    loadRoleAssignmentsForRelationships,
} from "./personChildRelationshipRepository";
import { resolvePersonChildRelationshipsForCustomerMember } from "./personChildRelationshipResolver";
import type { PersonChildRelationshipCollectionResult } from "./personChildRelationshipEntity";

export async function resolvePersonChildRelationshipsFromStore(args: {
    supabase: SupabaseClient;
    orgId: string;
    customerId: string;
    customerMemberId: string;
    requiredOperationalRole?: string | null;
    includeInactive?: boolean;
}): Promise<PersonChildRelationshipCollectionResult> {
    const relationships = await loadRelationshipsForCustomerMember(
        args.supabase,
        args.orgId,
        args.customerMemberId,
    );
    const ids = relationships.map((r) => r.id);
    const roleAssignments = await loadRoleAssignmentsForRelationships(args.supabase, args.orgId, ids);
    const customValues = await loadCustomFieldValuesForRelationships(args.supabase, args.orgId, ids);
    const personIds = [...new Set(relationships.map((r) => r.person_id))];
    const { data: persons } = await args.supabase
        .from("persons")
        .select("id, display_name, full_name, first_name, last_name, email, phone")
        .eq("org_id", args.orgId)
        .in("id", personIds);
    const personsById = new Map<string, Record<string, unknown>>();
    for (const row of persons ?? []) {
        const rec = row as Record<string, unknown>;
        personsById.set(String(rec.id), rec);
    }
    const result = resolvePersonChildRelationshipsForCustomerMember({
        orgId: args.orgId,
        customerId: args.customerId,
        customerMemberId: args.customerMemberId,
        relationships,
        roleAssignments,
        personsById,
        requiredOperationalRole: args.requiredOperationalRole ?? null,
        includeInactive: args.includeInactive,
        customValuesByRelationshipId: customValues,
    });
    return result;
}
