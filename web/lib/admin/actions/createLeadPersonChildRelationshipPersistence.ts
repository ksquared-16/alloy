/**
 * Create Lead → canonical Person ↔ Child relationship instances.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildScopedContactAssignment } from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import {
    createPersonChildRelationship,
    getPersonChildRelationshipById,
} from "@/lib/fields/personChildRelationship/personChildRelationshipService";
import { addPersonChildRelationshipRole } from "@/lib/fields/personChildRelationship/personChildRelationshipService";

const MEMBER_ROLE_TO_OPERATIONAL: Record<string, string> = {
    guardian: "guardian",
    primary_contact: "parent",
    parent: "parent",
    secondary_guardian: "guardian",
    secondary: "guardian",
    emergency_contact: "emergency_contact",
    emergency: "emergency_contact",
    authorized_pickup: "authorized_pickup",
    pickup: "authorized_pickup",
    billing_contact: "billing_contact",
    payer: "billing_contact",
    billing: "billing_contact",
    billing_responsible: "billing_contact",
};

function mapMemberContactRoleToOperational(roleKey: string): string | null {
    const key = roleKey.trim().toLowerCase();
    return MEMBER_ROLE_TO_OPERATIONAL[key] ?? null;
}

export async function applyCanonicalChildScopedRelationships(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        assignments: ChildScopedContactAssignment[];
    },
): Promise<{ relationships_written: number; roles_written: number; skipped: number }> {
    let relationshipsWritten = 0;
    let rolesWritten = 0;
    let skipped = 0;

    const edgeOps = new Map<string, Set<string>>();

    for (const assignment of input.assignments) {
        const memberId = assignment.customer_member_id.trim();
        const personId = assignment.person_id.trim();
        const operationalRole = mapMemberContactRoleToOperational(assignment.role_key);
        if (!memberId || !personId || !operationalRole) {
            skipped += 1;
            continue;
        }
        const edgeKey = `${memberId}:${personId}`;
        const roles = edgeOps.get(edgeKey) ?? new Set<string>();
        roles.add(operationalRole);
        edgeOps.set(edgeKey, roles);
    }

    for (const [edgeKey, roles] of edgeOps.entries()) {
        const [memberId, personId] = edgeKey.split(":");
        const { data: existing } = await supabase
            .from("person_child_relationships")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("customer_member_id", memberId)
            .eq("person_id", personId)
            .maybeSingle();

        let relationshipId = existing?.id ? String((existing as { id: string }).id) : null;

        if (!relationshipId) {
            const created = await createPersonChildRelationship(supabase, {
                orgId: input.orgId,
                customerId: input.customerId,
                customerMemberId: memberId!,
                personId: personId!,
                operationalRoles: [...roles],
            });
            if (!created.ok) {
                skipped += 1;
                continue;
            }
            relationshipId = created.relationship.id;
            relationshipsWritten += 1;
            rolesWritten += roles.size;
            continue;
        }

        for (const role of roles) {
            const added = await addPersonChildRelationshipRole(
                supabase,
                input.orgId,
                relationshipId,
                role,
            );
            if (added.ok) rolesWritten += 1;
        }
        await getPersonChildRelationshipById(supabase, input.orgId, relationshipId);
    }

    return { relationships_written: relationshipsWritten, roles_written: rolesWritten, skipped };
}
