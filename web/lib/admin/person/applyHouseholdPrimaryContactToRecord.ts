import {
    customerPersonRowIsHouseholdPrimaryContact,
    HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
} from "@/lib/admin/person/householdPrimaryContact";
import type {
    PersonHouseholdAdultLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/** Optimistic local update after PATCH household primary contact. */
export function applyHouseholdPrimaryContactToRecord(
    record: Record<string, unknown>,
    customerId: string,
    personId: string
): Record<string, unknown> {
    const cid = trimOrNull(customerId);
    const pid = trimOrNull(personId);
    if (!cid || !pid) return record;

    const next = { ...record };

    const adultLinks = (
        (next._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? []
    ).map((link) => {
        if (link.customer_id !== cid) return link;
        const isTarget = link.person_id === pid;
        return {
            ...link,
            is_primary: isTarget,
            is_household_primary_contact: isTarget,
            role_type: isTarget ? HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE : link.role_type,
        };
    });
    next._household_adult_links = adultLinks;

    const cpRows = (next._customer_persons as Record<string, unknown>[] | undefined) ?? [];
    if (cpRows.length > 0) {
        next._customer_persons = cpRows.map((row) => {
            if (trimOrNull(row.customer_id) !== cid) return row;
            const rowPid = trimOrNull(row.person_id);
            const isTarget = rowPid === pid;
            const role_type = isTarget
                ? HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE
                : trimOrNull(row.role_type);
            const is_primary = isTarget;
            return {
                ...row,
                role_type,
                is_primary,
                _is_household_primary: customerPersonRowIsHouseholdPrimaryContact({
                    role_type,
                    is_primary,
                }),
            };
        });
    }

    return next;
}
