/**
 * Reporting / metric source registration for relationship-instance grain.
 */

import {
    filterReportingRowsByOperationalRole,
    filterReportingRowsByRelationshipType,
    projectRelationshipInstancesForReporting,
    type PersonChildRelationshipReportingRow,
} from "./personChildRelationshipReportingProjection";
import type { PersonChildRelationshipInstance } from "./personChildRelationshipEntity";

export const PERSON_CHILD_RELATIONSHIP_REPORTING_SOURCE_KEY = "person_child_relationships" as const;

export function buildPersonChildRelationshipReportingSource(
    instances: readonly PersonChildRelationshipInstance[],
): PersonChildRelationshipReportingRow[] {
    return projectRelationshipInstancesForReporting(instances);
}

export const personChildRelationshipReportingQueries = {
    emergencyContactsByRelationshipType: (
        rows: readonly PersonChildRelationshipReportingRow[],
        type: string,
    ) => filterReportingRowsByRelationshipType(
        filterReportingRowsByOperationalRole(rows, "emergency_contact"),
        type,
    ),
    childrenWithoutEmergencyContact: (
        childMemberIds: readonly string[],
        rows: readonly PersonChildRelationshipReportingRow[],
    ) => {
        const withEmergency = new Set(
            filterReportingRowsByOperationalRole(rows, "emergency_contact").map((r) => r.customer_member_id),
        );
        return childMemberIds.filter((id) => !withEmergency.has(id));
    },
    auntsAuthorizedForPickup: (rows: readonly PersonChildRelationshipReportingRow[]) =>
        rows.filter(
            (r) =>
                (r.relationship_type ?? "").toLowerCase() === "aunt"
                && r.operational_roles.map((x) => x.toLowerCase()).includes("authorized_pickup"),
        ),
};
