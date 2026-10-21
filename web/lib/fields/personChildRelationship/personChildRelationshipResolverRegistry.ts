/**
 * DB-backed relationship-instance resolver registration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    loadCustomFieldValuesForRelationships,
    loadRelationshipsForCustomerMember,
    loadRelationshipsForCustomerMembers,
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
        // persons has NO display_name column. Selecting it failed the whole query, every relationship
        // resolved as missing_person, and every focus-panel relationship bag was empty on deployed
        // staging (Lil' Sunshine ZZQALM234600: Household card "0 Authorized pickups"). The resolver
        // derives the display name from full_name / first + last.
        .select("id, full_name, first_name, last_name, email, phone")
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

/**
 * SEVERAL CHILDREN, ONE BOUNDED READ.
 *
 * A household view needs every child's relationships. Resolving them child by child cost five
 * queries per child; this reads relationships, roles, custom values and persons ONCE for all of
 * them (a fixed query count, whatever the family size) and hands each child's slice to the same
 * pure resolver the per-child path uses — so a child's list is identical either way. The resolver
 * re-filters every row by org, household and child, so a row can never cross into a sibling's or
 * another family's list.
 */
export async function resolvePersonChildRelationshipsForMembersFromStore(args: {
    supabase: SupabaseClient;
    orgId: string;
    customerId: string;
    customerMemberIds: readonly string[];
    includeInactive?: boolean;
}): Promise<Map<string, PersonChildRelationshipCollectionResult>> {
    const memberIds = [...new Set(args.customerMemberIds.map((m) => m.trim()).filter(Boolean))];
    const out = new Map<string, PersonChildRelationshipCollectionResult>();
    if (memberIds.length === 0) return out;
    const relationships = await loadRelationshipsForCustomerMembers(args.supabase, args.orgId, memberIds);
    const ids = relationships.map((r) => r.id);
    const personIds = [...new Set(relationships.map((r) => r.person_id))];
    const [roleAssignments, customValues, personsRes] = await Promise.all([
        loadRoleAssignmentsForRelationships(args.supabase, args.orgId, ids),
        loadCustomFieldValuesForRelationships(args.supabase, args.orgId, ids),
        personIds.length > 0
            ? args.supabase
                  .from("persons")
                  .select("id, full_name, first_name, last_name, email, phone")
                  .eq("org_id", args.orgId)
                  .in("id", personIds)
            : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);
    if (personsRes.error) throw new Error(personsRes.error.message);
    const personsById = new Map<string, Record<string, unknown>>();
    for (const row of personsRes.data ?? []) {
        const rec = row as Record<string, unknown>;
        personsById.set(String(rec.id), rec);
    }
    for (const memberId of memberIds) {
        out.set(
            memberId,
            resolvePersonChildRelationshipsForCustomerMember({
                orgId: args.orgId,
                customerId: args.customerId,
                customerMemberId: memberId,
                relationships,
                roleAssignments,
                personsById,
                requiredOperationalRole: null,
                includeInactive: args.includeInactive,
                customValuesByRelationshipId: customValues,
            }),
        );
    }
    return out;
}
