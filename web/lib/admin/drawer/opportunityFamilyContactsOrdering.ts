/**
 * Lead Summary Family & contacts ordering.
 *
 * Canonical primary contact for an opportunity drawer:
 * - `opportunities.primary_person_id` (authoritative)
 * - Fallback: first linked `opportunity_persons` row with primary-contact role when FK unset
 *
 * Account-level primary (`customer_persons.is_primary`) is separate; opportunity FK wins here.
 */

import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";

export type OpportunityFamilyContactRow = {
    person_id: string;
    role_type: string;
    name: string | null;
};

const PRIMARY_CONTACT_ROLE_KEYS = new Set(["primary_contact", "primary", "parent"]);

export function isPrimaryContactRoleType(roleType: string | null | undefined): boolean {
    const key = String(roleType ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    return PRIMARY_CONTACT_ROLE_KEYS.has(key);
}

export function resolveLeadSummaryPrimaryPersonId(record: Record<string, unknown>): string | null {
    const fromFk = primaryPersonIdFromOpportunityRecord(record);
    if (fromFk) return fromFk;

    const raw = (record._opportunity_persons as unknown[]) ?? [];
    if (!Array.isArray(raw)) return null;
    for (const item of raw) {
        const row = item as Record<string, unknown>;
        const personId = String(row.person_id ?? "").trim();
        if (!personId) continue;
        if (isPrimaryContactRoleType(String(row.role_type ?? ""))) return personId;
    }
    return null;
}

export function rankOpportunityFamilyContactRole(roleType: string | null | undefined): number {
    if (isPrimaryContactRoleType(roleType)) return 0;
    return 1;
}

export function sortOpportunityFamilyContactRows<T extends OpportunityFamilyContactRow>(
    rows: T[],
    primaryPersonId: string | null
): T[] {
    const primaryId = primaryPersonId?.trim() ?? "";
    const filtered = primaryId ? rows.filter((r) => String(r.person_id).trim() !== primaryId) : rows;
    return [...filtered].sort((a, b) => {
        const rankA = rankOpportunityFamilyContactRole(a.role_type);
        const rankB = rankOpportunityFamilyContactRole(b.role_type);
        if (rankA !== rankB) return rankA - rankB;
        const ra = String(a.role_type ?? "");
        const rb = String(b.role_type ?? "");
        if (ra !== rb) return ra.localeCompare(rb);
        return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}
