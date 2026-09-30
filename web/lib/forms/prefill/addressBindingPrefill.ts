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
 * ## What the platform owns
 *
 * Measured, not assumed:
 *
 *   * The address is a `locations` row, `location_type = 'address'`, keyed by `customer_id`.
 *   * WHOSE it is comes from `person_locations`, the live org-scoped person↔location junction. A row
 *     with no person link is the household's shared address.
 *   * WHAT IT IS FOR is `locations.address_role` ('home' | 'mailing'). NULL means not stated.
 *
 * All three reads live in `@/lib/location/canonicalAddressReads`. Forms consumes that; it does not
 * own an address model and does not query `locations` itself.
 *
 * ## The binding names a PERSON, and the purpose is policy
 *
 * `{subject: "person", role: "guardian"}` says whose address it is. It does NOT say whether that is
 * a home or a mailing address — the artifact never states a purpose, and the only place the purpose
 * appears is the group's label, which is operator prose this runtime refuses to pattern-match.
 *
 * So the pairing is declared here, once, as platform policy rather than inferred per form: a
 * guardian's address is where they live, and a billing contact's is where post goes. A role this
 * table does not name resolves to nothing, so an unknown role fails closed instead of borrowing
 * somebody else's address.
 *
 * ## Who the person is
 *
 *   * `guardian` — the participant this link was sent to. The link's `recipient_person_id` is the
 *     adult in the conversation, validated at mint; it is the same identity the payment view treats
 *     as the payer. "Some guardian in the household" is not a person, and picking the first adult
 *     would be the fallback this file exists to avoid.
 *   * `billing_contact` — `resolveBillingContactPerson`, the Financials projection over
 *     `financial_responsibility_shares`. Forms never reads a responsibility table itself, and an
 *     arrangement that splits equally between two parties comes back ambiguous rather than guessed.
 *
 * ## Household fallback is per role, and never for billing
 *
 * A guardian may fall back to the household's shared address, including a legacy row whose purpose
 * was never stated: that is the one address a family recorded and the platform has always offered it
 * as theirs. A billing contact may not. The billing contact can be someone outside the household —
 * a grandparent paying the fees — and the family's own address is not evidence about where they
 * want post. Blank is the honest answer.
 *
 * Read-only. Address groups carry `address_binding`, not `collection_binding`, and only
 * collection-bound groups produce canonical proposals, so an address a family types stays form
 * evidence and no canonical record is mutated from here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import {
    readHouseholdSharedAddress,
    readPersonOwnedAddress,
    type AddressRole,
    type CanonicalAddress,
} from "@/lib/location/canonicalAddressReads";
import { resolveBillingContactPerson } from "@/lib/financials/responsibility/resolveBillingContactPerson";

/** The address leaves the canonical household address can answer. */

export const ADDRESS_LEAF_KEYS = ["address_line1", "address_line2", "city", "state", "postal_code"] as const;
export type AddressLeafKey = (typeof ADDRESS_LEAF_KEYS)[number];

/**
 * Role policy: whose address, which purpose, and whether the household may answer for them.
 *
 * Declared rather than inferred. The pairing of a person role with an address purpose is a product
 * decision — a guardian's address is where they live, a billing contact's is where post goes — and
 * an authored form states only the person role. A role absent from this table resolves to nothing.
 */
const ROLE_POLICY: Readonly<Record<string, {
    readonly addressRole: AddressRole;
    readonly subject: "participant_person" | "billing_contact";
    readonly householdFallback: boolean;
}>> = {
    guardian: { addressRole: "home", subject: "participant_person", householdFallback: true },
    billing_contact: { addressRole: "mailing", subject: "billing_contact", householdFallback: false },
};

export type AddressBindingOutcome =
    /** Answered from an address the resolved person owns. */
    | "person_owned_address"
    /** Answered from the household's shared address, which policy permits for this role. */
    | "household_shared_address"
    /** Authority resolved, but no address is on file for it. An empty answerable control. */
    | "no_address_on_file"
    /** The responsibility model splits equally; the model does not say who receives post. */
    | "billing_contact_ambiguous"
    /** No canonical authority names a person for this role. */
    | "no_canonical_subject"
    /** No policy pairs this role with an address purpose. */
    | "role_not_in_policy"
    /** The binding names a subject the platform does not resolve addresses for. */
    | "unsupported_subject"
    /** The group carries a binding but no child claims an address leaf. */
    | "no_address_leaves"
    /** The canonical model could not be read. Never reported as "nothing on file". */
    | "unavailable";

export type AddressBindingPlanEntry = {
    readonly groupId: string;
    readonly subject: string;
    readonly role: string;
    /** Address leaf key → the form field id that holds it. */
    readonly leaves: Readonly<Partial<Record<AddressLeafKey, string>>>;
    readonly outcome: AddressBindingOutcome;
    /** The person the binding resolved to, when one was found. Never rendered to a participant. */
    readonly resolvedPersonId?: string | null;
};

function trimmed(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addressLeafKeyFor(child: FormField): AddressLeafKey | null {
    const key = trimmed(child.field_source?.field_key)?.toLowerCase();
    return key && (ADDRESS_LEAF_KEYS as readonly string[]).includes(key) ? (key as AddressLeafKey) : null;
}

/** One `address_binding` group, as authored: whose address, and which fields hold it. */
export type AddressBindingSite = {
    readonly groupId: string;
    readonly subject: string;
    readonly role: string;
    readonly leaves: Readonly<Partial<Record<AddressLeafKey, string>>>;
};

/** Pure: every `address_binding` group in authored order, with its address leaves. No I/O. */
export function planAddressBindingSites(schema: Pick<FormSchemaV1, "fields">): AddressBindingSite[] {
    const sites: AddressBindingSite[] = [];
    for (const field of schema.fields) {
        if (field.type !== "group") continue;
        const binding = field.address_binding;
        if (!binding) continue;
        const leaves: Partial<Record<AddressLeafKey, string>> = {};
        for (const child of field.fields ?? []) {
            const leaf = addressLeafKeyFor(child);
            // First child wins a leaf: a duplicated leaf inside one group is the author's ambiguity.
            if (leaf && !leaves[leaf]) leaves[leaf] = child.id;
        }
        sites.push({
            groupId: field.id,
            subject: binding.subject.trim().toLowerCase(),
            role: binding.role.trim().toLowerCase(),
            leaves,
        });
    }
    return sites;
}

/**
 * Pure: what each group can resolve BEFORE any data is read.
 *
 * Separated from the read so the static half — is this subject supported, is this role in policy, does
 * the group even hold an address — is testable without a database and cannot differ from what the
 * resolver then does.
 */
export function planAddressBindingPrefill(
    schema: Pick<FormSchemaV1, "fields">,
): AddressBindingPlanEntry[] {
    return planAddressBindingSites(schema).map((site) => {
        let outcome: AddressBindingOutcome;
        if (!Object.keys(site.leaves).length) outcome = "no_address_leaves";
        else if (site.subject !== "person") outcome = "unsupported_subject";
        else if (!ROLE_POLICY[site.role]) outcome = "role_not_in_policy";
        // Everything beyond this point needs canonical data; the resolver decides it.
        else outcome = "no_address_on_file";
        return { ...site, outcome };
    });
}

/**
 * Is this role one the relationship model even knows?
 *
 * Kept as a guard on the `participant_person` path: the participant is the person the link was sent
 * to, and offering their address for a role the relationship model does not define would be asserting
 * a relationship nobody recorded.
 */
function relationshipModelKnowsRole(role: string): boolean {
    return Boolean(relationshipDefinitionForRole(role));
}

export type AddressBindingContext = {
    readonly orgId: string;
    readonly customerId: string | null;
    readonly customerMemberId?: string | null;
    /** The adult this link was sent to — `form_public_links.metadata.recipient_person_id`. */
    readonly participantPersonId?: string | null;
};

export type AddressBindingPrefillResult = {
    /** form field id → canonical value, ready to merge with the other prefill resolvers. */
    readonly values: Record<string, string>;
    readonly plan: readonly AddressBindingPlanEntry[];
};

/** Resolve every `address_binding` group against canonical data. */
export async function resolveAddressBindingPrefill(
    supabase: SupabaseClient,
    schema: Pick<FormSchemaV1, "fields">,
    context: AddressBindingContext,
): Promise<AddressBindingPrefillResult> {
    const sites = planAddressBindingSites(schema);
    const plan: AddressBindingPlanEntry[] = [];
    const values: Record<string, string> = {};

    // One resolution per role, however many groups reference it.
    const billingOnce = new Map<string, Awaited<ReturnType<typeof resolveBillingContactPerson>>>();

    for (const site of sites) {
        const fill = (address: CanonicalAddress, outcome: AddressBindingOutcome, personId: string | null) => {
            for (const leaf of ADDRESS_LEAF_KEYS) {
                const fieldId = site.leaves[leaf];
                const value = address[leaf];
                if (fieldId && value) values[fieldId] = value;
            }
            plan.push({ ...site, outcome, resolvedPersonId: personId });
        };
        const stop = (outcome: AddressBindingOutcome, personId: string | null = null) =>
            plan.push({ ...site, outcome, resolvedPersonId: personId });

        if (!Object.keys(site.leaves).length) {
            stop("no_address_leaves");
            continue;
        }
        if (site.subject !== "person") {
            stop("unsupported_subject");
            continue;
        }
        const policy = ROLE_POLICY[site.role];
        if (!policy) {
            stop("role_not_in_policy");
            continue;
        }
        if (!context.customerId) {
            // Without a household there is no account to scope a read to, and an unscoped address
            // read is exactly the cross-account leak this module must not have.
            stop("no_canonical_subject");
            continue;
        }

        let personId: string | null = null;
        if (policy.subject === "participant_person") {
            personId = relationshipModelKnowsRole(site.role) ? trimmed(context.participantPersonId) : null;
        } else {
            let resolution = billingOnce.get(site.role);
            if (!resolution) {
                resolution = await resolveBillingContactPerson(supabase, {
                    orgId: context.orgId,
                    customerId: context.customerId,
                    customerMemberId: context.customerMemberId ?? null,
                });
                billingOnce.set(site.role, resolution);
            }
            if (resolution.kind === "ambiguous") {
                stop("billing_contact_ambiguous");
                continue;
            }
            if (resolution.kind === "unavailable") {
                stop("unavailable");
                continue;
            }
            personId = resolution.kind === "resolved" ? resolution.personId : null;
        }

        if (personId) {
            const owned = await readPersonOwnedAddress(supabase, {
                orgId: context.orgId,
                customerId: context.customerId,
                personId,
                role: policy.addressRole,
            });
            if (owned) {
                fill(owned, "person_owned_address", personId);
                continue;
            }
        }

        if (!policy.householdFallback) {
            stop(personId ? "no_address_on_file" : "no_canonical_subject", personId);
            continue;
        }

        const shared = await readHouseholdSharedAddress(supabase, {
            orgId: context.orgId,
            customerId: context.customerId,
            role: policy.addressRole,
            // The legacy row with no stated purpose is the family's one address.
            acceptUnstatedRole: true,
        });
        if (shared) {
            fill(shared, "household_shared_address", personId);
            continue;
        }
        stop("no_address_on_file", personId);
    }

    return { values, plan };
}
