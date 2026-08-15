import "server-only";

/**
 * DURABLE HOUSEHOLD SUBJECT — the server composition.
 *
 * Opens a family from `customers` + `customer_persons` + `customer_members` alone. No Opportunity, no
 * `process_instances` row, no active Work Unit — and none of them is created as a side effect. The
 * cases that must all work:
 *
 *   1. the family's enrollment completed and its case left the active queue → household still there
 *   2. a household that never entered an enrollment process at all          → household still there
 *   3. an active enrollment                                                 → household still there
 *
 * The `customers` row is the invariant, which is why it is the identity of record. The previous
 * behaviour resolved a household THROUGH its case (`operationalHostForHousehold`) and returned
 * nothing when no active unit held one — so cases 1 and 2 had no household surface at all.
 *
 * ── IT COMPOSES NOTHING OF ITS OWN ──
 *
 * The `truth` record is shaped to the keys the CONFIGURED Household card already reads —
 * `customer_id`, `_customer_persons`, `_customer_members` — so `buildHouseholdCardModel` and
 * `buildOpportunityFamilyContactRows` do the composing, exactly as they do on a case panel. Nothing
 * here decides what a contact row looks like or what the card says.
 *
 * ── ONE READ PER EDGE, AND NO CASE READ AT ALL ──
 *
 * Three queries, all scoped by `org_id`. `opportunities` is never touched: a case is not part of what
 * a household IS, and reading one here is how a family surface starts quietly depending on an
 * enrollment existing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isPrimaryContactRoleType } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import type {
    DurableHouseholdChild,
    DurableHouseholdContact,
    DurableHouseholdSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableHouseholdSubjectModel";

export type ComposeDurableHouseholdSubjectResult =
    | { ok: true; subject: DurableHouseholdSubject }
    | { ok: false; reason: "not_found" };

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

type CustomerRow = { id?: string | null; name?: string | null };

type CustomerPersonRow = {
    person_id?: string | null;
    customer_id?: string | null;
    role_type?: string | null;
    is_primary?: boolean | null;
    persons?: { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null } | null;
};

type CustomerMemberRow = {
    id?: string | null;
    person_id?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    is_active?: boolean | null;
};

export async function composeDurableHouseholdSubject(
    supabase: SupabaseClient,
    orgId: string,
    householdId: string,
): Promise<ComposeDurableHouseholdSubjectResult> {
    const id = householdId.trim();
    if (!id) return { ok: false, reason: "not_found" };

    const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("id", id)
        .limit(1);
    if (customerError) throw new Error(customerError.message);

    const customer = (customerData ?? [])[0] as CustomerRow | undefined;
    if (!customer?.id) return { ok: false, reason: "not_found" };

    // The two edges, in parallel. Adults carry their identity on `persons`; children carry theirs on
    // the member row itself (`customer_members.person_id` is nullable, so the member row is the only
    // source that is always there).
    const [contactsResult, childrenResult] = await Promise.all([
        supabase
            .from("customer_persons")
            .select("person_id, customer_id, role_type, is_primary, persons(first_name, last_name, phone, email)")
            .eq("org_id", orgId)
            .eq("customer_id", id),
        supabase
            .from("customer_members")
            .select("id, person_id, display_name, first_name, last_name, dob, is_active")
            .eq("org_id", orgId)
            .eq("customer_id", id),
    ]);
    if (contactsResult.error) throw new Error(contactsResult.error.message);
    if (childrenResult.error) throw new Error(childrenResult.error.message);

    const contacts = ((contactsResult.data ?? []) as CustomerPersonRow[])
        .map((row): DurableHouseholdContact | null => {
            const personId = trimOrNull(row.person_id);
            if (!personId) return null;
            const person = row.persons ?? null;
            const name =
                trimOrNull(
                    [trimOrNull(person?.first_name), trimOrNull(person?.last_name)]
                        .filter(Boolean)
                        .join(" "),
                ) ?? null;
            return {
                person_id: personId,
                role_type: trimOrNull(row.role_type),
                is_primary: row.is_primary === true,
                name,
                phone: trimOrNull(person?.phone),
                email: trimOrNull(person?.email),
            };
        })
        .filter((c): c is DurableHouseholdContact => c !== null)
        // Primary contact first — the same ordering the case panel applies, by the same predicate, so
        // an operator does not meet two different "first" guardians on two surfaces.
        .sort((a, b) => primaryRank(a) - primaryRank(b));

    const children = ((childrenResult.data ?? []) as CustomerMemberRow[])
        .map((row): DurableHouseholdChild | null => {
            const memberId = trimOrNull(row.id);
            if (!memberId) return null;
            return {
                member_id: memberId,
                person_id: trimOrNull(row.person_id),
                display_name:
                    trimOrNull(row.display_name)
                    ?? trimOrNull(
                        [trimOrNull(row.first_name), trimOrNull(row.last_name)].filter(Boolean).join(" "),
                    ),
                dob: trimOrNull(row.dob),
                is_active: row.is_active !== false,
            };
        })
        .filter((c): c is DurableHouseholdChild => c !== null)
        .sort((a, b) => Number(b.is_active) - Number(a.is_active));

    const label = trimOrNull(customer.name) ?? "Household";

    /*
     * The keys the CONFIGURED card reads, and only those.
     *
     * `_customer_persons` is carried in the shape `buildOpportunityFamilyContactRows` already
     * destructures (`customer_id`/`person_id`/`role_type`/`is_primary`/`name`/`phone`/`email`), and
     * `customer_id` is set so its household filter matches. `_opportunity_persons` is deliberately
     * ABSENT rather than empty: the builder treats it as the first of two sources and skips it when
     * missing, which is exactly the self-sufficient household branch.
     */
    const [primary, secondary] = contacts;
    const truth: Record<string, unknown> = {
        id: String(customer.id),
        customer_id: String(customer.id),
        name: label,
        _household_name: label,
        /*
         * The FLAT contact keys `householdProfileFields` reads.
         *
         * They are supplied here — from the canonical `customer_persons` edge — precisely so the
         * SHARED `buildHouseholdCardModel` fills its own profile rows. The alternative was a
         * household card model written for this surface, which is the copied card this sprint exists
         * to avoid: the tenant configures one Household card, and it must be the one that renders.
         */
        "person.primary_contact_name": primary?.name ?? null,
        "person.primary_phone": primary?.phone ?? null,
        "person.primary_email": primary?.email ?? null,
        "person.secondary_contact_name": secondary?.name ?? null,
        "person.secondary_phone": secondary?.phone ?? null,
        "person.secondary_email": secondary?.email ?? null,
        _customer_persons: contacts.map((c) => ({
            customer_id: String(customer.id),
            person_id: c.person_id,
            role_type: c.role_type,
            is_primary: c.is_primary,
            name: c.name,
            phone: c.phone,
            email: c.email,
        })),
        _customer_members: children.map((c) => ({
            id: c.member_id,
            customer_id: String(customer.id),
            person_id: c.person_id,
            display_name: c.display_name,
            dob: c.dob,
            is_active: c.is_active,
        })),
    };

    return {
        ok: true,
        subject: { householdId: String(customer.id), label, contacts, children, truth },
    };
}

/** Primary contact first, by the SAME predicate the case panel ranks with. */
function primaryRank(contact: DurableHouseholdContact): number {
    if (contact.is_primary) return 0;
    return isPrimaryContactRoleType(contact.role_type) ? 1 : 2;
}
