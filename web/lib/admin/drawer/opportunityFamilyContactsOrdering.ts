/**
 * Lead Summary Family & contacts ordering.
 *
 * Canonical primary contact for an opportunity drawer:
 * - `opportunities.primary_person_id` when set (should match household primary contact on `customer_id`)
 * - Fallback: `customer_persons` row with `role_type = primary_contact` and `is_primary` for opportunity.customer_id
 * - Fallback: first linked `opportunity_persons` row with primary-contact role when FK unset
 *
 * Primary contact is household/customer-scoped — not a global person flag.
 */

import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { resolveHouseholdPrimaryContactPersonIdFromRows } from "@/lib/admin/person/householdPrimaryContact";

export type OpportunityFamilyContactRow = {
    person_id: string;
    role_type: string;
    name: string | null;
};

const PRIMARY_CONTACT_ROLE_KEYS = new Set(["primary_contact", "primary", "parent"]);
const HOUSEHOLD_GUARDIAN_ROLE_KEYS = new Set(["primary_contact", "primary", "parent", "guardian"]);

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function normRoleKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

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

    const customerId = String(record.customer_id ?? "").trim();
    if (customerId) {
        const fromHousehold = resolveHouseholdPrimaryContactPersonIdFromRows(
            (record._customer_persons as { person_id?: string | null; customer_id?: string | null; role_type?: string | null; is_primary?: boolean | null }[]) ??
                [],
            customerId
        );
        if (fromHousehold) return fromHousehold;
    }

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

export type OpportunityFamilyContactRowExtended = OpportunityFamilyContactRow & {
    id: string;
    phone?: string | null;
    email?: string | null;
};

/** Merge opportunity_persons with household customer_persons guardians (deduped, primary excluded later). */
export function buildOpportunityFamilyContactRows(
    record: Record<string, unknown>
): OpportunityFamilyContactRowExtended[] {
    const customerId = trimOrNull(record.customer_id);
    const byPersonId = new Map<string, OpportunityFamilyContactRowExtended>();

    const rawOpp = (record._opportunity_persons as unknown[]) ?? [];
    if (Array.isArray(rawOpp)) {
        for (const item of rawOpp) {
            const row = item as Record<string, unknown>;
            const personId = trimOrNull(row.person_id);
            if (!personId) continue;
            const id = trimOrNull(row.id) ?? `opp-person:${personId}`;
            byPersonId.set(personId, {
                id,
                person_id: personId,
                role_type: String(row.role_type ?? "—"),
                name: row.name != null ? String(row.name) : null,
                phone: row.phone != null ? String(row.phone) : null,
                email: row.email != null ? String(row.email) : null,
            });
        }
    }

    const cpRows =
        (record._customer_persons as {
            customer_id?: string | null;
            person_id?: string | null;
            role_type?: string | null;
            is_primary?: boolean | null;
            name?: string | null;
            phone?: string | null;
            email?: string | null;
        }[]) ?? [];

    for (const row of cpRows) {
        if (customerId && trimOrNull(row.customer_id) !== customerId) continue;
        const personId = trimOrNull(row.person_id);
        if (!personId || byPersonId.has(personId)) continue;
        const role = normRoleKey(row.role_type);
        if (!HOUSEHOLD_GUARDIAN_ROLE_KEYS.has(role)) continue;
        byPersonId.set(personId, {
            id: `household-cp:${personId}`,
            person_id: personId,
            role_type: trimOrNull(row.role_type) ?? "guardian",
            name: trimOrNull(row.name),
            phone: trimOrNull(row.phone),
            email: trimOrNull(row.email),
        });
    }

    return [...byPersonId.values()];
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
