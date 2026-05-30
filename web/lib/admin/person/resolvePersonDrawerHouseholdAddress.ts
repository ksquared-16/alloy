import type { PersonHouseholdCustomerAddressRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

export type PersonDrawerHouseholdAddressModel = {
    source: "customer_location" | "person_interim" | "none";
    /** When `customer_location`, household/account owns address truth. */
    customer_id: string | null;
    location_id: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    label: string | null;
    interim_note: string | null;
};

function addressRowHasContent(row: PersonHouseholdCustomerAddressRow): boolean {
    return Boolean(
        row.address_line1 ||
            row.address_line2 ||
            row.city ||
            row.state ||
            row.postal_code
    );
}

/**
 * Address ownership: `customers` have no native address columns; canonical household
 * mailing address lives on `locations` rows (`location_type = address`, `customer_id` set).
 * Person `field_values` address keys are interim only when no customer location exists.
 */
export function resolvePersonDrawerHouseholdAddressModel(
    record: Record<string, unknown>,
    options?: { primary_customer_id?: string | null }
): PersonDrawerHouseholdAddressModel {
    const addresses =
        (record._household_customer_addresses as PersonHouseholdCustomerAddressRow[] | undefined) ?? [];
    const preferredCustomerId = trimOrNull(options?.primary_customer_id);
    const householdRow =
        (preferredCustomerId
            ? addresses.find((row) => row.customer_id === preferredCustomerId)
            : null) ??
        addresses.find(addressRowHasContent) ??
        null;

    if (householdRow && addressRowHasContent(householdRow)) {
        return {
            source: "customer_location",
            customer_id: householdRow.customer_id,
            location_id: householdRow.location_id,
            address_line1: householdRow.address_line1,
            address_line2: householdRow.address_line2,
            city: householdRow.city,
            state: householdRow.state,
            postal_code: householdRow.postal_code,
            label: householdRow.label,
            interim_note: null,
        };
    }

    const hasPersonAddressFieldDefs = (
        (record._field_definitions as { field_key?: string }[] | undefined) ?? []
    ).some((def) =>
        ["address_line1", "address_line2", "city", "state", "postal_code"].includes(
            String(def.field_key ?? "")
        )
    );
    const hasPersonAddressValues = ["address_line1", "address_line2", "city", "state", "postal_code"].some(
        (key) => record[key] != null && String(record[key]).trim() !== ""
    );

    if (hasPersonAddressFieldDefs || hasPersonAddressValues) {
        return {
            source: "person_interim",
            customer_id: null,
            location_id: null,
            address_line1: trimOrNull(record.address_line1),
            address_line2: trimOrNull(record.address_line2),
            city: trimOrNull(record.city),
            state: trimOrNull(record.state),
            postal_code: trimOrNull(record.postal_code),
            label: null,
            interim_note:
                "Household mailing address is not on file for this account. Showing interim person mailing fields until customer location address is added.",
        };
    }

    return {
        source: "none",
        customer_id: null,
        location_id: null,
        address_line1: null,
        address_line2: null,
        city: null,
        state: null,
        postal_code: null,
        label: null,
        interim_note: null,
    };
}

export function personDrawerHouseholdAddressHasContent(model: PersonDrawerHouseholdAddressModel): boolean {
    return (
        model.source !== "none" &&
        Boolean(
            model.address_line1 ||
                model.address_line2 ||
                model.city ||
                model.state ||
                model.postal_code
        )
    );
}
