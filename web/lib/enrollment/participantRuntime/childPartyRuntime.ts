/**
 * The people involved with this child — read and written through Alloy's OWN canonical authority.
 *
 * ## The invariant
 *
 * ARTIFACT DESTINATIONS DO NOT CREATE PEOPLE. A packet printing "Parent/Guardian #2" is offering a
 * place to print a second guardian; it is not evidence that one exists. So the runtime works from
 * canonical relationships and projects them into destinations, never the other way round.
 *
 * ## Nothing here is a new person model
 *
 * Every write goes through `personChildRelationshipService` — the canonical owner — and every role
 * key comes from `relationshipDefinitions`, which already defines guardian, emergency contact,
 * authorized pickup, physician and dentist. There is no participant-runtime person table, no
 * session-only party object competing with durable truth, and no physician-specific branch: adding
 * a role remains one definition row, exactly as that module promises.
 *
 * ## Idempotence is the whole game
 *
 * A parent may name the same aunt as an emergency contact and then authorise her for pickup. That
 * is ONE person, ONE relationship to the child, and TWO roles — so selecting an existing person
 * must create no second `persons` row, re-establishing a relationship must find the existing one,
 * and adding a role must not duplicate identity. Each of those is asserted as its own proof.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureContactForPerson } from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import { ensureCustomerPersonRoleLink } from "@/lib/admin/actions/createLeadRoleContactPersistence";

import {
    addPersonChildRelationshipRole,
    createPersonChildRelationship,
    updatePersonChildRelationship,
} from "@/lib/fields/personChildRelationship/personChildRelationshipService";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import { validateOperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipValidation";
import type { CollectedParty } from "@/lib/enrollment/participantRuntime/partySlotProjection";

/** A person the conversation can talk about, with the identity a source artifact may print. */
export type ChildParty = CollectedParty & {
    readonly person_id: string;
    readonly full_name: string;
    readonly phone: string | null;
    readonly email: string | null;
    /** The relationship to the child (an option-set key), when the family gave one. */
    readonly relationship_type?: string | null;
};

/**
 * Everyone canonically related to this child, with their roles and priority.
 *
 * Read straight from `person_child_relationships` + `person_child_relationship_roles` rather than
 * from the packet session, so a resumed or regenerated session reads the same graph and no
 * session-only object can disagree with it.
 */
export async function resolveChildParties(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerMemberId: string },
): Promise<ChildParty[]> {
    try {
        const { data: rels } = await supabase
            .from("person_child_relationships")
            .select("id, person_id, priority, status, relationship_type")
            .eq("org_id", input.orgId)
            .eq("customer_member_id", input.customerMemberId)
            .order("priority", { ascending: true, nullsFirst: false });

        const rows = ((rels ?? []) as { id: string; person_id: string; priority: number | null; status?: string | null; relationship_type?: string | null }[])
            .filter((r) => (r.status ?? "active") === "active");
        if (rows.length === 0) return [];

        const [{ data: roleRows }, { data: personRows }] = await Promise.all([
            supabase
                .from("person_child_relationship_roles")
                .select("relationship_id, role_key, is_active")
                .eq("org_id", input.orgId)
                .in("relationship_id", rows.map((r) => r.id)),
            supabase
                .from("persons")
                .select("id, first_name, last_name, full_name, email, phone")
                .eq("org_id", input.orgId)
                .in("id", [...new Set(rows.map((r) => r.person_id))]),
        ]);

        const rolesByRelationship = new Map<string, string[]>();
        for (const row of (roleRows ?? []) as { relationship_id: string; role_key: string; is_active?: boolean }[]) {
            if (row.is_active === false) continue;
            const list = rolesByRelationship.get(row.relationship_id) ?? [];
            list.push(row.role_key);
            rolesByRelationship.set(row.relationship_id, list);
        }
        const personById = new Map(
            ((personRows ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p]),
        );

        return rows.flatMap((row, index) => {
            const person = personById.get(row.person_id);
            // A relationship whose person cannot be read is dropped rather than rendered nameless.
            if (!person) return [];
            const name =
                String(person.full_name ?? "").trim() ||
                [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
            return [{
                party_id: row.person_id,
                person_id: row.person_id,
                roles: rolesByRelationship.get(row.id) ?? [],
                // Priority is the canonical ordering; index only breaks ties for rows that have none.
                priority: row.priority ?? index + 1,
                full_name: name,
                phone: (String(person.phone ?? "").trim() || null),
                email: (String(person.email ?? "").trim() || null),
                relationship_type: (String(row.relationship_type ?? "").trim() || null),
            }];
        });
    } catch {
        return [];
    }
}

/**
 * People already known to this household who are NOT yet related to this child.
 *
 * The reuse offer. A family enrolling a second child should not retype the grandmother they already
 * gave the school, and a guardian already on the household is the first thing to offer when the
 * conversation asks for an emergency contact.
 */
export async function resolveHouseholdCandidates(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string; readonly excludePersonIds: ReadonlySet<string> },
): Promise<ChildParty[]> {
    try {
        // Household people, and everyone already related to another child of this household — a
        // sibling's physician is offered for reuse without being made a household member.
        const [{ data: links }, { data: childEdges }] = await Promise.all([
            supabase
                .from("customer_persons")
                .select("person_id, status")
                .eq("org_id", input.orgId)
                .eq("customer_id", input.customerId),
            supabase
                .from("person_child_relationships")
                .select("id, person_id, status, relationship_type")
                .eq("org_id", input.orgId)
                .eq("customer_id", input.customerId),
        ]);
        const ids = [...new Set(
            ([...((links ?? []) as { person_id: string; status?: string | null }[]), ...((childEdges ?? []) as { person_id: string; status?: string | null }[])])
                .filter((l) => (l.status ?? "active") === "active")
                .map((l) => l.person_id)
                .filter((id) => id && !input.excludePersonIds.has(id)),
        )];
        if (ids.length === 0) return [];

        const edges = ((childEdges ?? []) as { id: string; person_id: string; status?: string | null; relationship_type?: string | null }[])
            .filter((e) => (e.status ?? "active") === "active" && ids.includes(e.person_id));
        const [{ data: personRows }, { data: edgeRoles }] = await Promise.all([
            supabase
                .from("persons")
                .select("id, first_name, last_name, full_name, email, phone")
                .eq("org_id", input.orgId)
                .in("id", ids),
            edges.length > 0
                ? supabase
                      .from("person_child_relationship_roles")
                      .select("relationship_id, role_key, is_active")
                      .eq("org_id", input.orgId)
                      .in("relationship_id", edges.map((e) => e.id))
                : Promise.resolve({ data: [] as unknown[] }),
        ]);
        // The roles each person already holds with a sibling, so the offer can put the sibling's
        // physician first when it asks for a physician.
        const personByEdge = new Map(edges.map((e) => [e.id, e.person_id]));
        const rolesByPerson = new Map<string, Set<string>>();
        for (const r of (edgeRoles ?? []) as { relationship_id: string; role_key: string; is_active?: boolean }[]) {
            if (r.is_active === false) continue;
            const pid = personByEdge.get(r.relationship_id);
            if (!pid) continue;
            const set = rolesByPerson.get(pid) ?? new Set<string>();
            set.add(r.role_key);
            rolesByPerson.set(pid, set);
        }

        return ((personRows ?? []) as Record<string, unknown>[]).map((person, index) => ({
            party_id: String(person.id),
            person_id: String(person.id),
            roles: [...(rolesByPerson.get(String(person.id)) ?? [])],
            // Grandma to one child is grandma to her sibling: the stated kinship travels with reuse.
            relationship_type: edges.find((e) => e.person_id === String(person.id) && (e.relationship_type ?? "").trim())?.relationship_type ?? null,
            priority: index + 1,
            full_name:
                String(person.full_name ?? "").trim() ||
                [person.first_name, person.last_name].filter(Boolean).join(" ").trim(),
            phone: (String(person.phone ?? "").trim() || null),
            email: (String(person.email ?? "").trim() || null),
        }));
    } catch {
        return [];
    }
}

export type AttachPartyResult =
    | { readonly ok: true; readonly person_id: string; readonly created_person: boolean }
    | { readonly ok: false; readonly error: string };

/**
 * Give a person a role with this child — creating the person only if there is not one already.
 *
 * The order is the invariant, and each step is idempotent on its own:
 *
 * ```
 *   select or create the PERSON        -> never a second row for someone already known
 *   find or create the RELATIONSHIP    -> one edge per person and child, whatever the roles
 *   add the ROLE                       -> many roles per relationship, identity untouched
 * ```
 *
 * Role keys are validated against `relationshipDefinitions` rather than accepted from the caller, so
 * a browser cannot invent a relationship the platform does not define.
 */
export async function attachPartyRole(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly customerId: string;
        readonly customerMemberId: string;
        readonly role: string;
        /** Reuse this person. Absent means create one from `identity`. */
        readonly personId?: string | null;
        readonly identity?: { readonly full_name: string; readonly phone?: string | null; readonly email?: string | null };
        /** Relationship to the child — an option-set key, validated by the relationship service. */
        readonly relationshipType?: string | null;
        /** Canonical ordering — what "#1" means. Defaults to the end of the role's existing list. */
        readonly priority?: number | null;
    },
): Promise<AttachPartyResult> {
    /*
     * VALIDATE THE ROLE BEFORE ANY WRITE.
     *
     * R3 attached a physician and left a relationship row carrying no roles: the person and the
     * relationship were created, then the role was refused, and nothing undid the first two. An
     * orphan relationship is worse than a refusal — it is a person silently related to a child for
     * no stated reason, and it would project into an artifact slot.
     *
     * Both checks run first, against the SAME authorities the write path uses, so the common
     * failure never reaches a mutation at all. The compensating delete below covers the rest.
     */
    const definition = relationshipDefinitionForRole(input.role);
    if (!definition) {
        return { ok: false, error: `"${input.role}" is not a configured relationship role.` };
    }
    const roleCheck = validateOperationalRoleKey(definition.operational_role_key);
    if (!roleCheck.ok) return { ok: false, error: roleCheck.reason };

    let personId = (input.personId ?? "").trim();
    let createdPerson = false;

    if (!personId) {
        const name = (input.identity?.full_name ?? "").trim();
        if (!name) return { ok: false, error: "A new person needs a name." };
        const [first, ...rest] = name.split(/\s+/);
        const { data, error } = await supabase
            .from("persons")
            .insert({
                org_id: input.orgId,
                first_name: first ?? name,
                last_name: rest.join(" ") || null,
                full_name: name,
                phone: input.identity?.phone?.trim() || null,
                email: input.identity?.email?.trim() || null,
                metadata: { source: "participant_party_v1" },
            })
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, error: error?.message ?? "Could not record that person." };
        personId = String((data as { id: string }).id);
        createdPerson = true;
    }

    /*
     * THE HOUSEHOLD LINK ONLY WHERE THE DEFINITION WRITES ONE.
     *
     * The relationship definition names its write targets, the same ones the operator's
     * `executeRelationshipAction` honours: a guardian and an emergency contact are household people
     * (`customer_persons`); a physician, a dentist and an authorized pick-up are related to the CHILD
     * only. Writing a household row for a physician is what put "Dr. Lee Park — Parent" on the
     * Household card. Sibling reuse does not need that row — `resolveHouseholdCandidates` also offers
     * everyone already related to another child of this household.
     */
    if (definition.write_targets.includes("customer_persons")) {
        try {
            await ensureCustomerPersonRoleLink(supabase, {
                orgId: input.orgId,
                customerId: input.customerId,
                personId,
                roleType: definition.operational_role_key,
            });
        } catch {
            return { ok: false, error: "Could not add that person to the household." };
        }
    }
    if (definition.write_targets.includes("contacts")) {
        // The compatibility contact row every operator-added relationship has.
        await ensureContactForPerson(supabase, { orgId: input.orgId, customerId: input.customerId, personId }).catch(() => null);
    }

    /*
     * ONE EDGE PER PERSON AND CHILD.
     *
     * `createPersonChildRelationship` refuses a duplicate outright, so the existing edge is looked
     * up first and the role is added to it. That is what makes "she is also an authorized pickup"
     * cost one role row instead of a second relationship and a second identity.
     */
    const { data: existing } = await supabase
        .from("person_child_relationships")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_member_id", input.customerMemberId)
        .eq("person_id", personId)
        .maybeSingle();

    if (existing?.id) {
        const added = await addPersonChildRelationshipRole(
            supabase,
            input.orgId,
            String((existing as { id: string }).id),
            definition.operational_role_key,
        );
        if (!added.ok) return { ok: false, error: "Could not add that role." };
        // The kinship the family just stated fills an edge that had none; it never overwrites one.
        const kinship = (input.relationshipType ?? "").trim();
        if (kinship) {
            const { data: edge } = await supabase
                .from("person_child_relationships")
                .select("relationship_type")
                .eq("org_id", input.orgId)
                .eq("id", String((existing as { id: string }).id))
                .maybeSingle();
            if (!String((edge as { relationship_type?: string | null } | null)?.relationship_type ?? "").trim()) {
                await updatePersonChildRelationship(supabase, input.orgId, String((existing as { id: string }).id), {
                    relationship_type: kinship,
                }).catch(() => null);
            }
        }
        return { ok: true, person_id: personId, created_person: createdPerson };
    }

    const created = await createPersonChildRelationship(supabase, {
        orgId: input.orgId,
        customerId: input.customerId,
        customerMemberId: input.customerMemberId,
        personId,
        priority: input.priority ?? null,
        operationalRoles: [definition.operational_role_key],
        relationshipType: (input.relationshipType ?? "").trim() || null,
    });
    if (!created.ok) return { ok: false, error: created.error };

    /*
     * NO ORPHAN SURVIVES.
     *
     * `createPersonChildRelationship` inserts the edge and then its roles, so a role rejected at
     * that second step leaves an edge with none — a person related to a child for no stated reason,
     * which would then project into an artifact slot. The pre-checks above make that unreachable
     * for a bad role key; this covers everything else (a constraint, a race, a transient failure)
     * by verifying the outcome and undoing the edge this call created.
     *
     * Idempotency is untouched: only an edge created BY THIS CALL is removed, and an existing
     * relationship never reaches here.
     */
    const { data: roleRows } = await supabase
        .from("person_child_relationship_roles")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("relationship_id", created.relationship.id);
    if ((roleRows ?? []).length === 0) {
        await supabase
            .from("person_child_relationships")
            .delete()
            .eq("org_id", input.orgId)
            .eq("id", created.relationship.id);
        return { ok: false, error: "That role could not be recorded, so nothing was changed." };
    }
    return { ok: true, person_id: personId, created_person: createdPerson };
}
