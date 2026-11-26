/**
 * Canonical Person ↔ Child relationship-instance resolver.
 * Returns one item per relationship instance — never collapses to Person grain.
 */

import type {
    PersonChildRelationshipWarning,
    PersonChildRelationshipCollectionResult,
    PersonChildRelationshipInstance,
    PersonChildRelationshipRecord,
    PersonChildRelationshipRoleAssignment,
} from "./personChildRelationshipEntity";

export type PersonChildRelationshipResolveInput = {
    orgId: string;
    customerId: string;
    customerMemberId: string;
    relationships: readonly PersonChildRelationshipRecord[];
    roleAssignments: readonly PersonChildRelationshipRoleAssignment[];
    personsById: ReadonlyMap<string, Record<string, unknown>>;
    customValuesByRelationshipId?: ReadonlyMap<string, Record<string, unknown>>;
    requiredOperationalRole?: string | null;
    includeInactive?: boolean;
};

function rolesForRelationship(
    relationshipId: string,
    assignments: readonly PersonChildRelationshipRoleAssignment[],
): string[] {
    const roles: string[] = [];
    for (const row of assignments) {
        if (row.relationship_id !== relationshipId || !row.is_active) continue;
        roles.push(row.role_key);
    }
    return roles;
}

function buildInstance(
    rec: PersonChildRelationshipRecord,
    roles: readonly string[],
    personsById: ReadonlyMap<string, Record<string, unknown>>,
    customValues?: Record<string, unknown>,
): PersonChildRelationshipInstance {
    return {
        ...rec,
        operational_roles: roles,
        person: personsById.get(rec.person_id) ?? null,
        custom_field_values: customValues ?? {},
    };
}

/** Pure resolver — canonical read path for relationship instances on a child. */
export function resolvePersonChildRelationshipsForCustomerMember(
    input: PersonChildRelationshipResolveInput,
): PersonChildRelationshipCollectionResult {
    const customerMemberId = input.customerMemberId.trim();
    const customerId = input.customerId.trim();
    if (!input.orgId.trim() || !customerId || !customerMemberId) {
        return { status: "invalid_context", items: [], reason: "Missing org, customer, or child context." };
    }

    const requiredRole = input.requiredOperationalRole?.trim().toLowerCase() || null;
    const includeInactive = input.includeInactive === true;

    const scoped = input.relationships.filter(
        (r) =>
            r.org_id === input.orgId &&
            r.customer_id === customerId &&
            r.customer_member_id === customerMemberId,
    );

    if (scoped.length === 0) {
        return { status: "empty", items: [] };
    }

    const items: PersonChildRelationshipInstance[] = [];
    const warnings: PersonChildRelationshipWarning[] = [];
    for (const rec of scoped) {
        if (!includeInactive && rec.status === "inactive") continue;
        const roles = rolesForRelationship(rec.id, input.roleAssignments);
        if (requiredRole && !roles.map((r) => r.toLowerCase()).includes(requiredRole)) continue;
        if (!input.personsById.has(rec.person_id)) {
            // ONE unresolvable row must not erase a child's whole relationship set. Skip just this
            // row and report it. A Person invisible here is either orphaned or outside the caller's
            // organization/visibility — either way it is never partially returned, which is what
            // keeps tenant isolation intact while the rest of the family still renders.
            warnings.push({
                relationship_id: rec.id,
                person_id: rec.person_id,
                reason: `Person ${rec.person_id} is not visible for relationship ${rec.id}.`,
                recoverable: true,
                source: "person_child_relationships",
            });
            continue;
        }
        items.push(
            buildInstance(
                rec,
                roles,
                input.personsById,
                input.customValuesByRelationshipId?.get(rec.id),
            ),
        );
    }

    if (items.length === 0) {
        // Every row skipped is NOT the same as no rows: callers must be able to tell a genuinely
        // empty child from one whose relationships could not be resolved.
        if (warnings.length > 0) {
            return { status: "missing_person", items: [], warnings, reason: warnings[0]!.reason };
        }
        return { status: requiredRole ? "empty" : "inactive", items: [] };
    }

    items.sort((a, b) => {
        const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        // persons has no display_name column; full_name is the canonical display source.
        const an = String(a.person?.full_name ?? "");
        const bn = String(b.person?.full_name ?? "");
        return an.localeCompare(bn, undefined, { sensitivity: "base" });
    });

    return warnings.length > 0
        ? { status: "resolved_with_warnings", items, warnings }
        : { status: "resolved", items };
}

export function relationshipInstancesGroupedByPerson(
    items: readonly PersonChildRelationshipInstance[],
): Map<string, PersonChildRelationshipInstance[]> {
    const map = new Map<string, PersonChildRelationshipInstance[]>();
    for (const item of items) {
        const list = map.get(item.person_id) ?? [];
        list.push(item);
        map.set(item.person_id, list);
    }
    return map;
}
