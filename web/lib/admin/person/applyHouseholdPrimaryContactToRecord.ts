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

function demotePrimaryContactRole(roleType: unknown): string {
    const key = String(roleType ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    // Only demote the household primary role — do not rewrite parent/guardian relationships.
    if (key === HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE || key === "primary") {
        return "guardian";
    }
    return trimOrNull(roleType) ?? "guardian";
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
            // Demote prior primary role so flip-back evidence does not keep two primary_contact adults.
            role_type: isTarget
                ? HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE
                : demotePrimaryContactRole(link.role_type),
        };
    });
    next._household_adult_links = adultLinks;

    const cpRows = (next._customer_persons as Record<string, unknown>[] | undefined) ?? [];
    if (cpRows.length > 0) {
        const targetHasPrimaryRoleRow = cpRows.some((row) => {
            if (trimOrNull(row.customer_id) !== cid) return false;
            if (trimOrNull(row.person_id) !== pid) return false;
            const key = String(row.role_type ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, "_");
            return key === HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE || key === "primary";
        });

        let promotedGuardianFallback = false;
        next._customer_persons = cpRows.map((row) => {
            if (trimOrNull(row.customer_id) !== cid) return row;
            const rowPid = trimOrNull(row.person_id);
            const isTarget = rowPid === pid;
            const roleIsPrimary = (() => {
                const key = String(row.role_type ?? "")
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, "_");
                return key === HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE || key === "primary";
            })();

            if (isTarget) {
                const shouldPromoteRow =
                    roleIsPrimary
                    || (!targetHasPrimaryRoleRow && !promotedGuardianFallback);
                if (shouldPromoteRow) {
                    if (!roleIsPrimary) promotedGuardianFallback = true;
                    const role_type = HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE;
                    const is_primary = true;
                    return {
                        ...row,
                        role_type,
                        is_primary,
                        _is_household_primary: customerPersonRowIsHouseholdPrimaryContact({
                            role_type,
                            is_primary,
                        }),
                    };
                }
                return {
                    ...row,
                    is_primary: false,
                    _is_household_primary: false,
                };
            }

            if (roleIsPrimary) {
                const role_type = "guardian";
                const is_primary = false;
                return {
                    ...row,
                    role_type,
                    is_primary,
                    _is_household_primary: false,
                };
            }

            return {
                ...row,
                is_primary: false,
                _is_household_primary: false,
            };
        });
    }

    return next;
}
