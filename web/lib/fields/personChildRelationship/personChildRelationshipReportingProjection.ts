/**
 * Reporting projection at relationship-instance grain.
 */

import type { PersonChildRelationshipInstance } from "./personChildRelationshipEntity";

export type PersonChildRelationshipReportingRow = {
    relationship_id: string;
    org_id: string;
    customer_id: string;
    customer_member_id: string;
    person_id: string;
    person_display_name: string | null;
    operational_roles: readonly string[];
    relationship_type: string | null;
    priority: number | null;
    status: string;
    native_fields: Record<string, unknown>;
    custom_fields: Record<string, unknown>;
};

export function projectRelationshipInstancesForReporting(
    items: readonly PersonChildRelationshipInstance[],
): PersonChildRelationshipReportingRow[] {
    return items.map((item) => ({
        relationship_id: item.id,
        org_id: item.org_id,
        customer_id: item.customer_id,
        customer_member_id: item.customer_member_id,
        person_id: item.person_id,
        person_display_name:
            (item.person?.display_name as string | undefined) ??
            (item.person?.full_name as string | undefined) ??
            null,
        operational_roles: item.operational_roles,
        relationship_type: item.relationship_type,
        priority: item.priority,
        status: item.status,
        native_fields: {
            relationship_type: item.relationship_type,
            priority: item.priority,
            status: item.status,
        },
        custom_fields: item.custom_field_values ?? {},
    }));
}

export function filterReportingRowsByRelationshipType(
    rows: readonly PersonChildRelationshipReportingRow[],
    relationshipType: string,
): PersonChildRelationshipReportingRow[] {
    const key = relationshipType.trim().toLowerCase();
    return rows.filter((r) => (r.relationship_type ?? "").trim().toLowerCase() === key);
}

export function filterReportingRowsByOperationalRole(
    rows: readonly PersonChildRelationshipReportingRow[],
    roleKey: string,
): PersonChildRelationshipReportingRow[] {
    const key = roleKey.trim().toLowerCase();
    return rows.filter((r) => r.operational_roles.map((x) => x.toLowerCase()).includes(key));
}
