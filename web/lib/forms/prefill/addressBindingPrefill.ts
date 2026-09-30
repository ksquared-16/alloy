/**
 * `address_binding` — whose address a structured address group holds, at runtime.
 *
 * ## The problem the authored binding states
 *
 * An address group's children say WHAT they hold through `field_source` (`person.address_line1`,
 * `person.city`, …). They cannot say WHICH person. Admissions v12 has two of them — a Home address
 * bound to `guardian` and a Mailing address bound to `billing_contact` — and without the binding
 * both resolve `entity_type: "person"` and would fill from whichever person the launch stamped.
 *
 * ## What the platform actually owns
 *
 * Measured, not assumed:
 *
 *   - An address is a `locations` row with `location_type = "address"`, keyed by `customer_id`,
 *     ordered by `is_primary`. The canonical field catalog names it "Shared household mailing
 *     address" (`location.household_address`), and the context picker says in as many words that it
 *     is "Shared household identity and optional shared mailing address — NOT individual contact
 *     addresses".
 *   - `persons` carries no address column, and `locations` carries no `person_id`. There is no
 *     person-grain address anywhere.
 *
 * So the address-owning entity is the HOUSEHOLD. A role does not select an address; it selects a
 * person, and that person's household owns the only address there is.
 *
 * ## The contract
 *
 * A role earns the household's address when the relationship model says the role is held INSIDE the
 * household — `source_entity_type: "customer"` on its relationship definition. That is read from
 * `RELATIONSHIP_DEFINITIONS`, so a role added to the relationship model later works here without
 * this file changing, and a role the relationship model does not know earns nothing. No form id, no
 * label matching, no "first adult in the household".
 *
 * And the household's one address is claimed ONCE, in authored order. Two address groups that both
 * resolve to the same household would otherwise show the same address twice, which tells a family
 * Alloy knows a separate mailing address when it does not. The later group is left empty and
 * answerable, with the reason recorded.
 *
 * Read-only. Prefill offers a value; it never writes one back. Address groups carry
 * `address_binding` rather than `collection_binding`, and only `collection_binding` groups produce
 * canonical proposals, so an address a family types stays form evidence and no canonical record is
 * mutated from here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";

/** The address leaves the canonical household address can answer. */
export const ADDRESS_LEAF_KEYS = ["address_line1", "address_line2", "city", "state", "postal_code"] as const;
export type AddressLeafKey = (typeof ADDRESS_LEAF_KEYS)[number];

/** The canonical household address, in the leaf vocabulary the form's children use. */
export type CanonicalHouseholdAddress = Partial<Record<AddressLeafKey, string>> & { readonly locationId: string };

export type AddressBindingOutcome =
    /** The household owns the address and this group is the one that claims it. */
    | "household_address"
    /** The household's single shared address is already answered by an earlier group. */
    | "household_address_already_claimed"
    /**
     * No canonical authority can answer this role with an address: either the relationship model
     * does not know the role at all, or it holds the role's own address on the relationship, or the
     * role is a third party the household merely names.
     */
    | "no_canonical_address_authority"
    /** The binding names a subject the platform does not resolve addresses for. */
    | "unsupported_subject"
    /** The group carries a binding but no child claims an address leaf. */
    | "no_address_leaves";

export type AddressBindingPlanEntry = {
    readonly groupId: string;
    readonly subject: string;
    readonly role: string;
    /** Address leaf key → the form field id that holds it. */
    readonly leaves: Readonly<Partial<Record<AddressLeafKey, string>>>;
    readonly outcome: AddressBindingOutcome;
};

function trimmed(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addressLeafKeyFor(child: FormField): AddressLeafKey | null {
    const key = trimmed(child.field_source?.field_key)?.toLowerCase();
    return key && (ADDRESS_LEAF_KEYS as readonly string[]).includes(key) ? (key as AddressLeafKey) : null;
}

/**
 * May this role be answered with the HOUSEHOLD's shared address?
 *
 * Three statements the relationship model already makes, and none of them is a spelling this file
 * invents. `source_entity_type: "customer"` alone is not enough — it is true of all five definitions,
 * including the Physician — so on its own it would offer a family's address as their doctor's.
 *
 *   1. The role is anchored on the household (`source_entity_type: "customer"`).
 *   2. The model gives the role NO address of its own. `emergency_contacts` carries `"address"` in
 *      `nested_field_keys`: an emergency contact's address is theirs, held on the relationship, and
 *      the household's would be the wrong one.
 *   3. The role IS the household's responsible adults rather than a third party the household names.
 *      `responsibility_default: "all_guardians"` is that marker — every other definition says
 *      `"either_guardian"`, meaning a guardian is responsible FOR those people, not that they are
 *      the household.
 *
 * A Physician and a Dentist fail (3); an emergency contact fails (2) and (3); a guardian passes all
 * three, which is the only case the shared household address can honestly answer.
 */
function householdAddressAnswersRole(role: string): boolean {
    const def = relationshipDefinitionForRole(role);
    if (!def) return false;
    if (def.source_entity_type !== "customer") return false;
    if (def.nested_field_keys.some((k) => k.trim().toLowerCase() === "address")) return false;
    return def.responsibility_default === "all_guardians";
}

/** Pure: what each `address_binding` group resolves to, in authored order. No I/O. */
export function planAddressBindingPrefill(schema: Pick<FormSchemaV1, "fields">): AddressBindingPlanEntry[] {
    const plan: AddressBindingPlanEntry[] = [];
    let householdAddressClaimed = false;

    for (const field of schema.fields) {
        if (field.type !== "group") continue;
        const binding = field.address_binding;
        if (!binding) continue;

        const leaves: Partial<Record<AddressLeafKey, string>> = {};
        for (const child of field.fields ?? []) {
            const leaf = addressLeafKeyFor(child);
            // First child wins a leaf: a duplicated leaf inside one group is the author's ambiguity,
            // not something to resolve by guessing which copy they meant.
            if (leaf && !leaves[leaf]) leaves[leaf] = child.id;
        }

        const subject = binding.subject.trim().toLowerCase();
        const role = binding.role.trim().toLowerCase();

        let outcome: AddressBindingOutcome;
        if (!Object.keys(leaves).length) outcome = "no_address_leaves";
        else if (subject !== "person") outcome = "unsupported_subject";
        else if (!householdAddressAnswersRole(role)) outcome = "no_canonical_address_authority";
        else if (householdAddressClaimed) outcome = "household_address_already_claimed";
        else {
            outcome = "household_address";
            householdAddressClaimed = true;
        }

        plan.push({ groupId: field.id, subject, role, leaves, outcome });
    }

    return plan;
}

/**
 * The household's canonical address.
 *
 * Same read the person drawer and the opportunity context enrichment do — `location_type`
 * `"address"`, active, primary first — so Forms cannot disagree with the rest of the product about
 * which address a household has.
 */
export async function readHouseholdCanonicalAddress(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<CanonicalHouseholdAddress | null> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, address1, address2, city, state, postal_code, is_primary")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("location_type", "address")
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(1);
    if (error) return null;
    const row = (data ?? [])[0] as
        | { id: string; address1?: string | null; address2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null }
        | undefined;
    if (!row) return null;

    const out: CanonicalHouseholdAddress = { locationId: String(row.id) };
    const assign = (leaf: AddressLeafKey, value: unknown) => {
        const v = trimmed(value);
        if (v) (out as Record<string, unknown>)[leaf] = v;
    };
    assign("address_line1", row.address1);
    assign("address_line2", row.address2);
    assign("city", row.city);
    assign("state", row.state);
    assign("postal_code", row.postal_code);
    // An address row with no line, city or postcode is not an address anyone can be shown.
    return Object.keys(out).length > 1 ? out : null;
}

export type AddressBindingPrefillResult = {
    /** form field id → canonical value, ready to merge with the other prefill resolvers. */
    readonly values: Record<string, string>;
    readonly plan: readonly AddressBindingPlanEntry[];
};

/** Resolve every `address_binding` group against canonical data. */
export async function resolveAddressBindingPrefill(
    supabase: SupabaseClient,
    orgId: string,
    schema: Pick<FormSchemaV1, "fields">,
    launchFks: Pick<LaunchFkStamp, "customer_id">,
): Promise<AddressBindingPrefillResult> {
    const plan = planAddressBindingPrefill(schema);
    const claiming = plan.filter((p) => p.outcome === "household_address");
    if (!claiming.length || !launchFks.customer_id) return { values: {}, plan };

    const address = await readHouseholdCanonicalAddress(supabase, orgId, launchFks.customer_id);
    if (!address) return { values: {}, plan };

    const values: Record<string, string> = {};
    for (const entry of claiming) {
        for (const leaf of ADDRESS_LEAF_KEYS) {
            const fieldId = entry.leaves[leaf];
            const value = address[leaf];
            if (fieldId && value) values[fieldId] = value;
        }
    }
    return { values, plan };
}
