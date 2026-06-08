import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";
import type { PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 ? s : null;
}

function normRoleKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

const PARENT_ROLE_KEYS = new Set(["parent", "primary_contact", "primary"]);

function rolePrecedence(roleType: string | null): number {
    const role = normRoleKey(roleType);
    if (role === "primary_contact" || role === "primary") return 0;
    if (PARENT_ROLE_KEYS.has(role) || role === "parent") return 1;
    if (role === "guardian") return 2;
    return 3;
}

function mergeRoleLabels(left: string | null, right: string | null): string | null {
    const labels = new Set<string>();
    for (const raw of [left, right]) {
        const label = trimOrNull(raw);
        if (label) labels.add(label);
    }
    if (!labels.size) return null;
    return [...labels].join(" · ");
}

/** Collapse duplicate customer_persons adult rows (same person, multiple role_type rows). */
export function mergeHouseholdAdultLinks(rows: PersonHouseholdAdultLinkRow[]): PersonHouseholdAdultLinkRow[] {
    const byKey = new Map<string, PersonHouseholdAdultLinkRow>();

    for (const row of rows) {
        const personId = trimOrNull(row.person_id);
        const customerId = trimOrNull(row.customer_id);
        if (!personId || !customerId) continue;

        const key = `${customerId}:${personId}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, {
                ...row,
                is_household_primary_contact:
                    row.is_household_primary_contact ??
                    customerPersonRowIsHouseholdPrimaryContact(row),
            });
            continue;
        }

        const preferIncomingPrimary = Boolean(row.is_primary) && !existing.is_primary;
        const incomingRole = trimOrNull(row.role_type);
        const existingRole = trimOrNull(existing.role_type);
        const preferredRole =
            preferIncomingPrimary ||
            (Boolean(row.is_primary) === Boolean(existing.is_primary) &&
                rolePrecedence(incomingRole) < rolePrecedence(existingRole))
                ? row
                : existing;

        byKey.set(key, {
            person_id: personId,
            customer_id: customerId,
            display_name: trimOrNull(preferredRole.display_name) ?? trimOrNull(existing.display_name),
            role_type: trimOrNull(preferredRole.role_type) ?? existingRole,
            role_label: mergeRoleLabels(existing.role_label, row.role_label),
            is_primary: Boolean(existing.is_primary || row.is_primary),
            is_household_primary_contact:
                Boolean(existing.is_household_primary_contact) ||
                Boolean(row.is_household_primary_contact) ||
                customerPersonRowIsHouseholdPrimaryContact(preferredRole) ||
                customerPersonRowIsHouseholdPrimaryContact(row),
        });
    }

    return [...byKey.values()];
}
