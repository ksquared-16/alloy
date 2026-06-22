/**
 * Household address relationship projections for drawer layout runtime records.
 *
 * Read-only display fields — no save adapter yet.
 */

import type { PersonHouseholdCustomerAddressRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { isOpaqueIdValue } from "./proofRecordContext";

export const HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS = [
    "location.household_address",
    "location.household_address_line1",
    "location.household_address_line2",
    "location.household_address_city",
    "location.household_address_state",
    "location.household_address_postal_code",
] as const;

export type HouseholdAddressFieldRef = (typeof HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS)[number];

export type HouseholdAddressFieldValues = Partial<Record<HouseholdAddressFieldRef, string>>;

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function primaryAddressRow(vmRecord: Record<string, unknown>): PersonHouseholdCustomerAddressRow | null {
    const rows = vmRecord._household_customer_addresses as PersonHouseholdCustomerAddressRow[] | undefined;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] ?? null;
}

/** Resolve formatted + component household address values for layout field refKeys. */
export function resolveHouseholdAddressFieldValues(vmRecord: Record<string, unknown>): HouseholdAddressFieldValues {
    const formatted = pickDisplay(
        vmRecord["location.household_address"],
        vmRecord["location.formatted_address"],
        vmRecord._household_address,
        vmRecord.household_address,
    );
    const row = primaryAddressRow(vmRecord);
    const line1 = pickDisplay(row?.address_line1);
    const line2 = pickDisplay(row?.address_line2);
    const city = pickDisplay(row?.city);
    const state = pickDisplay(row?.state);
    const postalCode = pickDisplay(row?.postal_code);

    const composedFormatted =
        formatted
        ?? (() => {
            const cityState = [city, state].filter(Boolean).join(", ");
            const tail = [cityState, postalCode].filter(Boolean).join(" ");
            const parts = [line1, line2, tail].filter(Boolean);
            return parts.length > 0 ? parts.join(" · ") : null;
        })();

    const out: HouseholdAddressFieldValues = {};
    if (composedFormatted) out["location.household_address"] = composedFormatted;
    if (line1) out["location.household_address_line1"] = line1;
    if (line2) out["location.household_address_line2"] = line2;
    if (city) out["location.household_address_city"] = city;
    if (state) out["location.household_address_state"] = state;
    if (postalCode) out["location.household_address_postal_code"] = postalCode;
    return out;
}
