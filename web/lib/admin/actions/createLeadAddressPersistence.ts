/**
 * Create Lead → household + person address persistence for layout runtime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { primaryIncludedParent } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { ensureCustomerAddressLocation } from "@/lib/bookingLocations";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";

import type { StructuredPostalAddress } from "@/lib/admin/actions/createLeadAddressParse";
import { parseAddressLines } from "@/lib/admin/actions/createLeadAddressParse";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

const PERSON_ADDRESS_FIELD_KEYS = [
    "address_line1",
    "address_line2",
    "city",
    "state",
    "postal_code",
] as const;

export type { StructuredPostalAddress } from "@/lib/admin/actions/createLeadAddressParse";
export { parseAddressLines } from "@/lib/admin/actions/createLeadAddressParse";

export function readHouseholdAddressFromCommitSelection(
    selection: CreateLeadCommitSelection | null,
): StructuredPostalAddress | null {
    if (!selection?.household_address) return null;
    const addr = selection.household_address;
    const line1 = trim(addr.address_line1);
    if (line1) {
        return {
            address_line1: line1,
            address_line2: trim(addr.address_line2) || null,
            city: trim(addr.city) || null,
            state: trim(addr.state) || null,
            postal_code: trim(addr.postal_code) || null,
        };
    }
    if (addr.lines?.length) {
        return parseAddressLines(addr.lines);
    }
    return null;
}

/** Flat execute payload keys — never treat location_id / child_location_id as mailing address. */
export function readHouseholdAddressFromMerged(merged: Record<string, unknown>): StructuredPostalAddress | null {
    const line1 = trim(merged.household_address_line1) || trim(merged.household_address1);
    if (!line1) return null;
    return {
        address_line1: line1,
        address_line2: trim(merged.household_address_line2) || trim(merged.household_address2) || null,
        city: trim(merged.household_address_city) || trim(merged.household_city) || null,
        state: trim(merged.household_address_state) || trim(merged.household_state) || null,
        postal_code: trim(merged.household_address_postal_code) || trim(merged.household_postal_code) || null,
    };
}

export function readPersonAddressFromMerged(merged: Record<string, unknown>): Partial<StructuredPostalAddress> {
    const out: Partial<StructuredPostalAddress> = {};
    const line1 = trim(merged.address_line1);
    if (line1) out.address_line1 = line1;
    const line2 = trim(merged.address_line2);
    if (line2) out.address_line2 = line2;
    const city = trim(merged.city);
    if (city) out.city = city;
    const state = trim(merged.state);
    if (state) out.state = state;
    const postal = trim(merged.postal_code);
    if (postal) out.postal_code = postal;
    return out;
}

export function readPersonAddressFromCommitSelection(
    selection: CreateLeadCommitSelection | null,
): Partial<StructuredPostalAddress> {
    const parent = selection ? primaryIncludedParent(selection) : null;
    if (!parent?.extra_payload_values) return {};
    const out: Partial<StructuredPostalAddress> = {};
    for (const key of PERSON_ADDRESS_FIELD_KEYS) {
        const value = trim(parent.extra_payload_values[key]);
        if (value) out[key] = value;
    }
    return out;
}

export async function persistCreateLeadHouseholdAddress(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        selection?: CreateLeadCommitSelection | null;
        merged: Record<string, unknown>;
    },
): Promise<{ path: "locations" | "none"; location_id: string | null }> {
    const structured =
        readHouseholdAddressFromCommitSelection(input.selection ?? null)
        ?? readHouseholdAddressFromMerged(input.merged);
    if (!structured?.address_line1) {
        return { path: "none", location_id: null };
    }

    const locationId = await ensureCustomerAddressLocation(supabase, {
        org_id: input.orgId,
        customer_id: input.customerId,
        address_line1: structured.address_line1,
        city: structured.city ?? null,
        state: structured.state ?? null,
        postal_code: structured.postal_code ?? null,
    });

    return {
        path: locationId ? "locations" : "none",
        location_id: locationId,
    };
}

export async function persistCreateLeadPersonAddressFieldValues(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        personId: string;
        selection?: CreateLeadCommitSelection | null;
        merged: Record<string, unknown>;
    },
): Promise<{ path: "field_values" | "none"; keys_written: string[] }> {
    const fromCommit = readPersonAddressFromCommitSelection(input.selection ?? null);
    const fromMerged = readPersonAddressFromMerged(input.merged);
    const body: Record<string, unknown> = {};
    for (const key of PERSON_ADDRESS_FIELD_KEYS) {
        const value = trim(fromCommit[key]) || trim(fromMerged[key]);
        if (value) body[key] = value;
    }
    if (Object.keys(body).length === 0) {
        return { path: "none", keys_written: [] };
    }

    await upsertFieldValuesFromBody(supabase, input.orgId, "person", input.personId, body, []);
    return { path: "field_values", keys_written: Object.keys(body) };
}

export async function persistCreateLeadAddressFromIntake(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        primaryPersonId: string;
        selection?: CreateLeadCommitSelection | null;
        merged: Record<string, unknown>;
    },
): Promise<{
    household: { path: "locations" | "none"; location_id: string | null };
    person: { path: "field_values" | "none"; keys_written: string[] };
}> {
    const [household, person] = await Promise.all([
        persistCreateLeadHouseholdAddress(supabase, {
            orgId: input.orgId,
            customerId: input.customerId,
            selection: input.selection,
            merged: input.merged,
        }),
        persistCreateLeadPersonAddressFieldValues(supabase, {
            orgId: input.orgId,
            personId: input.primaryPersonId,
            selection: input.selection,
            merged: input.merged,
        }),
    ]);
    return { household, person };
}
