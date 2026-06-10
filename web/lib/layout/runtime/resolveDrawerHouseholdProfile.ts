/**
 * Household profile presentation — read-only projection from layout runtime record fields.
 */

import { resolveTemplate } from "@/lib/layout/resolveItemValue";
import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function pickLine(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

export type DrawerHouseholdProfileProjection = {
    householdName: string | null;
    location: string | null;
    status: string | null;
    primaryPersonId: string | null;
    primaryName: string | null;
    primaryRole: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    secondaryName: string | null;
    address: string | null;
    relationshipLabel: string | null;
};

export function resolveLeadDrawerHouseholdProfile(record: ProofRuntimeRecord): DrawerHouseholdProfileProjection {
    const householdName =
        pickLine(
            record.last_name ? resolveTemplate(record, "{last_name} Household") : null,
            record["customer.household_name"],
            record.household_name,
        ) ?? null;

    return {
        householdName,
        location: pickLine(record["opportunity.location"], record.location_name, record.location),
        status: pickLine(record["opportunity.status_key"], record.status_key, record.status),
        primaryPersonId:
            resolveLeadSummaryPrimaryPersonId(record)
            || pickLine(record["person.id"], record.person_id, record.primary_person_id),
        primaryName: pickLine(record["person.primary_contact_name"], record.primary_contact_name),
        primaryRole: pickLine(record["person.household_role"], record["person.relationship"], "Primary contact"),
        primaryEmail: pickLine(record["person.primary_email"], record.primary_email),
        primaryPhone: pickLine(record["person.primary_phone"], record.primary_phone),
        secondaryName: pickLine(record["person.secondary_contact_name"], record.secondary_contact_name),
        address: null,
        relationshipLabel: null,
    };
}

export function resolvePersonDrawerHouseholdProfile(record: ProofRuntimeRecord): DrawerHouseholdProfileProjection {
    const householdName = pickLine(
        record["customer.household_name"],
        record._household_name,
        record.household_name,
        (record._household_context as { customer_name?: string | null }[] | undefined)?.map(
            (row) => row.customer_name,
        ),
    );

    return {
        householdName,
        location: null,
        address: pickLine(record["location.household_address"], record.household_address),
        relationshipLabel: pickLine(record["person.relationship"], record.relationship_type, record.role_type),
        status: null,
        primaryPersonId: pickLine(record["person.id"], record.person_id, record.id),
        primaryName: pickLine(record["person.primary_contact_name"], record.display_name, record.name),
        primaryRole: pickLine(record["person.relationship"], record.relationship_type, record.role_type),
        primaryEmail: pickLine(record["person.primary_email"], record.email, record._primary_email),
        primaryPhone: pickLine(record["person.primary_phone"], record.phone, record._primary_phone),
        secondaryName: null,
    };
}
