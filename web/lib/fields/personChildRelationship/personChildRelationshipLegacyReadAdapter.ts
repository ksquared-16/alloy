/**
 * Legacy read compatibility — project legacy sources to canonical relationship instances (read-only).
 */

import type {
    PersonChildRelationshipInstance,
    PersonChildRelationshipRecord,
    PersonChildRelationshipRoleAssignment,
} from "./personChildRelationshipEntity";
import { isPersonChildOperationalRoleKey } from "./personChildRelationshipEntity";

export type LegacyCustomerMemberContactRow = {
    id: string;
    org_id: string;
    customer_id: string;
    customer_member_id: string;
    contact_id: string;
    role_key: string;
    is_active: boolean;
    person_id?: string | null;
};

export type LegacyReadProjectionResult = {
    classification: "deterministic" | "inferred" | "ambiguous" | "incompatible";
    items: readonly PersonChildRelationshipInstance[];
    notes?: string;
};

/** Group legacy child-scoped contact rows into relationship instances keyed by person_id. */
export function projectLegacyCustomerMemberContactsToRelationshipInstances(args: {
    orgId: string;
    customerId: string;
    customerMemberId: string;
    rows: readonly LegacyCustomerMemberContactRow[];
    personsById: ReadonlyMap<string, Record<string, unknown>>;
}): LegacyReadProjectionResult {
    const byPerson = new Map<string, { roles: string[]; legacyIds: string[] }>();
    for (const row of args.rows) {
        if (row.org_id !== args.orgId || row.customer_member_id !== args.customerMemberId) continue;
        if (!row.is_active) continue;
        const personId = row.person_id?.trim();
        if (!personId) {
            return {
                classification: "incompatible",
                items: [],
                notes: "Legacy contact row missing person_id bridge.",
            };
        }
        const role = row.role_key.trim().toLowerCase();
        if (!isPersonChildOperationalRoleKey(role) && !role.includes("guardian") && !role.includes("emergency") && !role.includes("pickup") && !role.includes("billing")) {
            continue;
        }
        const bucket = byPerson.get(personId) ?? { roles: [], legacyIds: [] };
        if (!bucket.roles.includes(role)) bucket.roles.push(role);
        bucket.legacyIds.push(row.id);
        byPerson.set(personId, bucket);
    }

    const items: PersonChildRelationshipInstance[] = [];
    let idx = 0;
    for (const [personId, bucket] of byPerson.entries()) {
        idx += 1;
        const rec: PersonChildRelationshipRecord = {
            id: `legacy:${args.customerMemberId}:${personId}`,
            org_id: args.orgId,
            customer_id: args.customerId,
            customer_member_id: args.customerMemberId,
            person_id: personId,
            relationship_type: null,
            priority: null,
            status: "active",
            metadata: { legacy_source: "customer_member_contacts", legacy_ids: bucket.legacyIds },
        };
        items.push({
            ...rec,
            operational_roles: bucket.roles,
            person: args.personsById.get(personId) ?? null,
            custom_field_values: {},
        });
    }

    if (items.length === 0) {
        return { classification: "deterministic", items: [], notes: "No legacy child-scoped contacts." };
    }
    return {
        classification: "inferred",
        items,
        notes: "Legacy projection; kinship unavailable until canonical rows exist.",
    };
}
