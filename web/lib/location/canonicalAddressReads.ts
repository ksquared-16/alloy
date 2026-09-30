/**
 * Reading a canonical address: whose it is, and what it is for.
 *
 * The model, measured rather than invented:
 *
 *   * The address is a `locations` row, `location_type = 'address'`, carrying `customer_id` and the
 *     lines. `is_primary` orders several.
 *   * WHOSE it is comes from `person_locations` — the live, org-scoped person↔location junction.
 *     A row with no person link is the HOUSEHOLD's shared address.
 *   * WHAT IT IS FOR is `locations.address_role` ('home' | 'mailing'), added by
 *     20261111120000. NULL means not stated, which is every address recorded before that column
 *     existed, and it is never read as 'home'.
 *
 * Everything here is a read, and everything is scoped by BOTH `org_id` and `customer_id`. The
 * customer scope is not decoration: a person can sit in more than one household, and an address
 * belonging to them under a different account must never surface on this one. That is the account
 * boundary, enforced in the query rather than checked afterwards.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const ADDRESS_ROLES = ["home", "mailing"] as const;
export type AddressRole = (typeof ADDRESS_ROLES)[number];

export type CanonicalAddress = {
    readonly locationId: string;
    readonly addressRole: AddressRole | null;
    readonly ownerPersonId: string | null;
    readonly address_line1?: string;
    readonly address_line2?: string;
    readonly city?: string;
    readonly state?: string;
    readonly postal_code?: string;
};

const ADDRESS_COLUMNS = "id, address1, address2, city, state, postal_code, is_primary, address_role";

type AddressRow = {
    id: string;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    address_role?: string | null;
};

function trimmed(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** null when the row holds no line, city or postcode — that is not an address anyone can be shown. */
function toCanonical(row: AddressRow, ownerPersonId: string | null): CanonicalAddress | null {
    const out: Record<string, unknown> = {
        locationId: String(row.id),
        addressRole: (ADDRESS_ROLES as readonly string[]).includes(String(row.address_role))
            ? (row.address_role as AddressRole)
            : null,
        ownerPersonId,
    };
    let any = false;
    for (const [leaf, value] of [
        ["address_line1", row.address1],
        ["address_line2", row.address2],
        ["city", row.city],
        ["state", row.state],
        ["postal_code", row.postal_code],
    ] as const) {
        const v = trimmed(value);
        if (v) {
            out[leaf] = v;
            any = true;
        }
    }
    return any ? (out as CanonicalAddress) : null;
}

/** Location ids in this org that are associated with a person at all. */
async function personLinkedLocationIds(
    supabase: SupabaseClient,
    orgId: string,
    locationIds: readonly string[],
): Promise<Set<string>> {
    if (!locationIds.length) return new Set();
    const { data } = await supabase
        .from("person_locations")
        .select("location_id")
        .eq("org_id", orgId)
        .in("location_id", [...locationIds]);
    return new Set(((data ?? []) as { location_id: string }[]).map((r) => String(r.location_id)));
}

/**
 * The address a specific PERSON owns for this purpose, within this household.
 *
 * Scoped to `customerId` as well as the person: an address of theirs under another account is
 * deliberately invisible here.
 */
export async function readPersonOwnedAddress(
    supabase: SupabaseClient,
    args: { readonly orgId: string; readonly customerId: string; readonly personId: string; readonly role: AddressRole },
): Promise<CanonicalAddress | null> {
    const { data: links } = await supabase
        .from("person_locations")
        .select("location_id, is_primary")
        .eq("org_id", args.orgId)
        .eq("person_id", args.personId);
    const linkedIds = ((links ?? []) as { location_id: string }[]).map((r) => String(r.location_id));
    if (!linkedIds.length) return null;

    const { data, error } = await supabase
        .from("locations")
        .select(ADDRESS_COLUMNS)
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("location_type", "address")
        .eq("is_active", true)
        .eq("address_role", args.role)
        .in("id", linkedIds)
        .order("is_primary", { ascending: false })
        .limit(1);
    if (error) return null;
    const row = (data ?? [])[0] as AddressRow | undefined;
    return row ? toCanonical(row, args.personId) : null;
}

/**
 * The HOUSEHOLD's shared address for this purpose — one nobody owns privately.
 *
 * `acceptUnstatedRole` admits the legacy row whose `address_role` is NULL. That is the single
 * address a household recorded before purposes existed, and the platform has always offered it as
 * the family's address, so a Home binding may use it. A Mailing binding may not: the caller decides,
 * because "the family's address" is not evidence about where a billing contact wants post.
 */
export async function readHouseholdSharedAddress(
    supabase: SupabaseClient,
    args: {
        readonly orgId: string;
        readonly customerId: string;
        readonly role: AddressRole;
        readonly acceptUnstatedRole: boolean;
    },
): Promise<CanonicalAddress | null> {
    const { data, error } = await supabase
        .from("locations")
        .select(ADDRESS_COLUMNS)
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .eq("location_type", "address")
        .eq("is_active", true)
        .order("is_primary", { ascending: false });
    if (error) return null;
    const rows = (data ?? []) as AddressRow[];
    if (!rows.length) return null;

    const eligible = rows.filter((r) => {
        const role = trimmed(r.address_role);
        if (role === args.role) return true;
        return role === null && args.acceptUnstatedRole;
    });
    if (!eligible.length) return null;

    // A person's own address is theirs, not the household's, even inside the right household.
    const owned = await personLinkedLocationIds(
        supabase,
        args.orgId,
        eligible.map((r) => String(r.id)),
    );
    // An explicitly-roled row beats a legacy unstated one; within each, is_primary order is kept.
    const shared = eligible.filter((r) => !owned.has(String(r.id)));
    const exact = shared.find((r) => trimmed(r.address_role) === args.role);
    const chosen = exact ?? shared[0];
    return chosen ? toCanonical(chosen, null) : null;
}
