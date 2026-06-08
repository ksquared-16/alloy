import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

const PARENT_ROLE_KEYS = new Set(["parent", "primary_contact", "primary", "guardian"]);
const BILLING_ROLE_KEYS = new Set(["payer", "billing", "billing_responsible", "billing_contact"]);
const PICKUP_ROLE_KEYS = new Set(["authorized_pickup", "pickup"]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);

function normRole(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function roleDisplayLabel(role: string, isHouseholdPrimary: boolean): string {
    if (isHouseholdPrimary) {
        return "Primary contact";
    }
    if (PARENT_ROLE_KEYS.has(role) || role === "guardian") {
        return role === "guardian" ? "Guardian" : "Parent";
    }
    if (BILLING_ROLE_KEYS.has(role)) return "Billing responsible";
    if (PICKUP_ROLE_KEYS.has(role)) return "Authorized pickup";
    if (EMERGENCY_ROLE_KEYS.has(role)) return "Emergency contact";
    return role.replace(/_/g, " ");
}

export type PersonDrawerParentCustomerRole = {
    customer_id: string;
    customer_name: string | null;
    role_labels: string[];
    is_primary: boolean;
};

/**
 * Relationship role flags for the viewing adult on each household account.
 * Uses `customer_persons` only — not a separate entity.
 */
export function resolvePersonDrawerParentRelationshipRoles(
    record: Record<string, unknown>
): PersonDrawerParentCustomerRole[] {
    const contexts = (record._household_context as { customer_id: string; customer_name?: string | null }[]) ?? [];
    const nameByCustomer = new Map(
        contexts.map((c) => [String(c.customer_id), String(c.customer_name ?? "").trim() || null])
    );

    const rows =
        (record._customer_persons as {
            customer_id?: string;
            role_type?: string | null;
            is_primary?: boolean | null;
            _role_label?: string | null;
        }[]) ?? [];

    const byCustomer = new Map<string, { labels: Set<string>; is_primary: boolean }>();

    for (const row of rows) {
        const customer_id = String(row.customer_id ?? "").trim();
        if (!customer_id) continue;
        const role = normRole(row.role_type);
        const isHouseholdPrimary = customerPersonRowIsHouseholdPrimaryContact(row);
        const label =
            trimOrNull(row._role_label) ||
            (role ? roleDisplayLabel(role, isHouseholdPrimary) : isHouseholdPrimary ? "Primary contact" : null);
        if (!label) continue;

        const bucket = byCustomer.get(customer_id) ?? { labels: new Set<string>(), is_primary: false };
        bucket.labels.add(label);
        if (isHouseholdPrimary) bucket.is_primary = true;
        byCustomer.set(customer_id, bucket);
    }

    return [...byCustomer.entries()].map(([customer_id, bucket]) => ({
        customer_id,
        customer_name: nameByCustomer.get(customer_id) ?? null,
        role_labels: [...bucket.labels],
        is_primary: bucket.is_primary,
    }));
}

/** Deferred role metadata — document when flags are not on customer_persons. */
export const PERSON_DRAWER_PARENT_DEFERRED_ROLE_FIELDS = [
    "billing_responsible (use customer_persons.role_type payer/billing when seeded)",
    "authorized_pickup (use role_type authorized_pickup)",
    "emergency_contact module (display role only today)",
] as const;
