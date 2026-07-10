/**
 * Canonical Primary Contact authority resolution.
 *
 * Repository evidence (P3A audit):
 * - Write authority: customer_persons (role_type=primary_contact, is_primary=true)
 * - Opportunity projection: opportunities.primary_person_id
 * - Legacy compatibility: customers.primary_contact_id → contacts
 */

import {
    resolveHouseholdPrimaryContactPersonIdFromRows,
} from "@/lib/admin/person/householdPrimaryContact";
import type { RelationshipResolutionDataBag } from "@/lib/fields/relationship/canonicalRelationshipContext";
import type { RelationshipResolutionStatus } from "@/lib/fields/relationship/canonicalRelationshipResolution";
import type {
    RelationshipResolutionDiagnostic,
    RelationshipResolutionSource,
} from "@/lib/fields/relationship/relationshipResolutionMetadata";

export type PrimaryContactAuthorityResult = {
    status: RelationshipResolutionStatus;
    target_person_id: string | null;
    resolution_source?: RelationshipResolutionSource;
    diagnostics: RelationshipResolutionDiagnostic[];
    candidate_count: number;
    reason?: string;
};

function trim(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function normRole(raw: unknown): string {
    return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function isPrimaryRole(roleType: string): boolean {
    const key = normRole(roleType);
    return key === "primary_contact" || key === "primary";
}

export function householdPrimaryPointerPersonId(
    data: RelationshipResolutionDataBag,
    customerId: string | null,
): string | null {
    if (!customerId) return null;
    return resolveHouseholdPrimaryContactPersonIdFromRows(
        (data.customerPersonRows ?? []) as Parameters<typeof resolveHouseholdPrimaryContactPersonIdFromRows>[0],
        customerId,
    );
}

export function legacyCustomerPrimaryContactPersonId(data: RelationshipResolutionDataBag): string | null {
    return trim(data.contactRow?.person_id);
}

export function opportunityPrimaryPointerPersonId(data: RelationshipResolutionDataBag): string | null {
    return trim(data.opportunityRow?.primary_person_id);
}

export function legacyPrimaryRoleAssignmentCandidates(
    data: RelationshipResolutionDataBag,
    customerId: string | null,
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const legacyFk = legacyCustomerPrimaryContactPersonId(data);
    if (legacyFk) {
        seen.add(legacyFk);
        out.push(legacyFk);
    }
    for (const row of data.customerPersonRows ?? []) {
        if (customerId && trim(row.customer_id) !== customerId) continue;
        if (!isPrimaryRole(normRole(row.role_type))) continue;
        const personId = trim(row.person_id);
        if (!personId || seen.has(personId)) continue;
        seen.add(personId);
        out.push(personId);
    }
    for (const row of data.opportunityPersonRows ?? []) {
        if (!isPrimaryRole(normRole(row.role_type))) continue;
        const personId = trim(row.person_id);
        if (!personId || seen.has(personId)) continue;
        seen.add(personId);
        out.push(personId);
    }
    return out;
}

export function resolvePrimaryContactAuthority(args: {
    data: RelationshipResolutionDataBag;
    customerId: string | null;
    preferOpportunityPointer?: boolean;
}): PrimaryContactAuthorityResult {
    const { data, customerId, preferOpportunityPointer = false } = args;
    const diagnostics: RelationshipResolutionDiagnostic[] = [];
    const householdPointer = householdPrimaryPointerPersonId(data, customerId);
    const legacyFkPerson = legacyCustomerPrimaryContactPersonId(data);
    const opportunityPointer = opportunityPrimaryPointerPersonId(data);
    const canonicalPointer = preferOpportunityPointer && opportunityPointer
        ? opportunityPointer
        : householdPointer ?? opportunityPointer;

    if (canonicalPointer) {
        if (legacyFkPerson && legacyFkPerson !== canonicalPointer) {
            diagnostics.push("relationship_data_conflict");
        }
        if (householdPointer && opportunityPointer && householdPointer !== opportunityPointer) {
            diagnostics.push("relationship_data_conflict");
        }
        return {
            status: "resolved",
            target_person_id: canonicalPointer,
            resolution_source: "canonical_pointer",
            diagnostics,
            candidate_count: 1,
        };
    }

    const legacyCandidates = legacyPrimaryRoleAssignmentCandidates(data, customerId);
    if (legacyCandidates.length === 1) {
        diagnostics.push("legacy_reconciliation_required");
        return {
            status: "resolved",
            target_person_id: legacyCandidates[0]!,
            resolution_source: "legacy_fallback",
            diagnostics,
            candidate_count: 1,
            reason: "Canonical primary pointer absent; resolved via legacy compatibility fallback.",
        };
    }
    if (legacyCandidates.length === 0) {
        return {
            status: "missing",
            target_person_id: null,
            diagnostics,
            candidate_count: 0,
            reason: "No primary contact found for source record.",
        };
    }
    return {
        status: "ambiguous",
        target_person_id: null,
        diagnostics,
        candidate_count: legacyCandidates.length,
        reason: "Multiple legacy primary candidates; no canonical pointer.",
    };
}

export function relationshipDataBagFromTruthRecord(
    record: Record<string, unknown>,
    customerId: string | null,
): RelationshipResolutionDataBag {
    return {
        customerRow: customerId
            ? { id: customerId, primary_contact_id: record.primary_contact_id ?? record["customer.primary_contact_id"] }
            : null,
        contactRow: {
            person_id: record._primary_person_id ?? record.primary_person_id ?? record["opportunity.primary_person_id"],
            email: record["person.primary_email"],
            phone: record["person.primary_phone"],
            full_name: record["person.primary_contact_name"],
        },
        customerPersonRows: (record._customer_persons as Record<string, unknown>[]) ?? [],
        opportunityPersonRows: (record._opportunity_persons as Record<string, unknown>[]) ?? [],
        opportunityRow: {
            primary_person_id: record._primary_person_id ?? record.primary_person_id ?? record["opportunity.primary_person_id"],
        },
        customerMemberContactLinks: (record._child_scoped_contact_links as Record<string, unknown>[]) ?? [],
    };
}
