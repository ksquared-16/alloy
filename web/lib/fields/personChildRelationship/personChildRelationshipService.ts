/**
 * Canonical write authority for Person ↔ Child relationship instances.
 * All admin APIs and future Processing commits must use this service.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPersonChildRelationshipMutationPatch } from "./personChildRelationshipPatch";
import type {
    PersonChildRelationshipInstance,
    PersonChildRelationshipRecord,
    PersonChildRelationshipRoleAssignment,
} from "./personChildRelationshipEntity";
import {
    validateOperationalRoleKey,
    validateRelationshipStatus,
    validateRelationshipTypeAgainstOptionSet,
    type OptionSetItemRow,
} from "./personChildRelationshipValidation";
import { resolvePersonChildRelationshipsForCustomerMember } from "./personChildRelationshipResolver";
import {
    projectLegacyCustomerMemberContactsToRelationshipInstances,
    type LegacyCustomerMemberContactRow,
} from "./personChildRelationshipLegacyReadAdapter";
import { loadPersonChildRelationshipOptionSetItems } from "./personChildRelationshipRepository";

export type CreatePersonChildRelationshipInput = {
    orgId: string;
    customerId: string;
    customerMemberId: string;
    personId: string;
    relationshipType?: string | null;
    priority?: number | null;
    operationalRoles?: readonly string[];
    customFields?: Record<string, unknown>;
};

async function loadRolesForRelationships(
    supabase: SupabaseClient,
    orgId: string,
    relationshipIds: readonly string[],
): Promise<PersonChildRelationshipRoleAssignment[]> {
    if (relationshipIds.length === 0) return [];
    const { data } = await supabase
        .from("person_child_relationship_roles")
        .select("id, org_id, relationship_id, role_key, is_active")
        .eq("org_id", orgId)
        .in("relationship_id", relationshipIds);
    return (data ?? []) as PersonChildRelationshipRoleAssignment[];
}

async function loadPersonsMap(
    supabase: SupabaseClient,
    orgId: string,
    personIds: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    if (personIds.length === 0) return map;
    // `persons` has NO display_name column. Selecting it made PostgREST reject the whole query
    // (42703), and because the error was discarded the map came back EMPTY — which made the
    // resolver report missing_person and drop every relationship for every child in every org.
    // Consumers derive display from full_name / first+last; there is no parallel naming rule here.
    const { data, error } = await supabase
        .from("persons")
        .select("id, full_name, first_name, last_name, email, phone")
        .eq("org_id", orgId)
        .in("id", personIds);
    if (error) {
        // Fail loudly. A schema/select fault must never masquerade as "this child has no family".
        throw new Error(
            `[personChildRelationship] person hydration failed (table=persons op=select code=${error.code ?? "?"} requested=${personIds.length}): ${error.message}`,
        );
    }
    for (const row of data ?? []) {
        const rec = row as Record<string, unknown>;
        map.set(String(rec.id), rec);
    }
    return map;
}

async function toInstance(
    supabase: SupabaseClient,
    orgId: string,
    rec: PersonChildRelationshipRecord,
    roles: readonly PersonChildRelationshipRoleAssignment[],
    personsById: Map<string, Record<string, unknown>>,
): Promise<PersonChildRelationshipInstance> {
    const resolved = resolvePersonChildRelationshipsForCustomerMember({
        orgId,
        customerId: rec.customer_id,
        customerMemberId: rec.customer_member_id,
        relationships: [rec],
        roleAssignments: roles,
        personsById,
    });
    return resolved.items[0] ?? { ...rec, operational_roles: [], person: personsById.get(rec.person_id) ?? null };
}

export async function getPersonChildRelationshipById(
    supabase: SupabaseClient,
    orgId: string,
    relationshipId: string,
): Promise<PersonChildRelationshipInstance | null> {
    const { data, error } = await supabase
        .from("person_child_relationships")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", relationshipId)
        .maybeSingle();
    if (error || !data) return null;
    const rec = data as PersonChildRelationshipRecord;
    const roles = await loadRolesForRelationships(supabase, orgId, [relationshipId]);
    const persons = await loadPersonsMap(supabase, orgId, [rec.person_id]);
    return toInstance(supabase, orgId, rec, roles, persons);
}


/**
 * Load the legacy child-scoped contact rows for these members and normalize them into canonical
 * relationship instances.
 *
 * This is the READ half of the compatibility boundary: writers may persist to different
 * destinations (guardian -> customer_member_contacts, emergency/pickup ->
 * person_child_relationships), and this hides that from every consumer. Without it a caller would
 * have to query both tables and branch on physical storage, which the architecture forbids.
 *
 * Persistence is unchanged — this adds no dual write and migrates nothing.
 * @see docs/platform/core/data/relationship-model.md
 */
async function loadLegacyRelationshipInstances(args: {
    supabase: SupabaseClient;
    orgId: string;
    customerMemberIds: readonly string[];
    customerIdByMember: ReadonlyMap<string, string>;
    personsById: ReadonlyMap<string, Record<string, unknown>>;
}): Promise<PersonChildRelationshipInstance[]> {
    const memberIds = args.customerMemberIds.filter((id) => id.trim());
    if (memberIds.length === 0) return [];

    // customer_member_contacts carries contact_id; the canonical person id comes through contacts.
    const { data: cmcRows, error } = await args.supabase
        .from("customer_member_contacts")
        .select("id, org_id, customer_id, customer_member_id, contact_id, role_key, is_active")
        .eq("org_id", args.orgId)
        .in("customer_member_id", memberIds);
    if (error || !cmcRows || cmcRows.length === 0) return [];

    const contactIds = [...new Set((cmcRows as Array<{ contact_id?: string }>).map((r) => r.contact_id).filter(Boolean))] as string[];
    if (contactIds.length === 0) return [];
    const { data: contactRows } = await args.supabase
        .from("contacts")
        .select("id, person_id")
        .eq("org_id", args.orgId)
        .in("id", contactIds);
    const personByContact = new Map<string, string>();
    for (const c of (contactRows ?? []) as Array<{ id: string; person_id?: string | null }>) {
        if (c.person_id) personByContact.set(c.id, c.person_id);
    }

    const rows: LegacyCustomerMemberContactRow[] = (cmcRows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        org_id: String(r.org_id),
        customer_id: String(r.customer_id ?? ""),
        customer_member_id: String(r.customer_member_id),
        contact_id: String(r.contact_id ?? ""),
        role_key: String(r.role_key ?? ""),
        is_active: r.is_active !== false,
        person_id: personByContact.get(String(r.contact_id ?? "")) ?? null,
    }));

    // Persons referenced only by the legacy side still need their identity hydrated.
    const legacyPersonIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))] as string[];
    const missing = legacyPersonIds.filter((id) => !args.personsById.has(id));
    const hydrated = new Map(args.personsById);
    if (missing.length > 0) {
        const extra = await loadPersonsMap(args.supabase, args.orgId, missing);
        for (const [k, v] of extra) hydrated.set(k, v);
    }

    const out: PersonChildRelationshipInstance[] = [];
    for (const memberId of memberIds) {
        const result = projectLegacyCustomerMemberContactsToRelationshipInstances({
            orgId: args.orgId,
            customerId: args.customerIdByMember.get(memberId) ?? "",
            customerMemberId: memberId,
            rows: rows.filter((r) => r.customer_member_id === memberId),
            personsById: hydrated,
        });
        out.push(...result.items);
    }
    return out;
}

/**
 * Merge canonical and legacy-normalized instances into ONE result per (member, person).
 *
 * The same semantic relationship appearing in both stores is deduplicated rather than listed twice,
 * and its roles are unioned — so a Person who is a guardian (legacy) and an authorized pickup
 * (canonical) is one normalized person carrying both roles, not two people.
 */
function mergeRelationshipInstances(
    canonical: readonly PersonChildRelationshipInstance[],
    legacy: readonly PersonChildRelationshipInstance[],
): PersonChildRelationshipInstance[] {
    const byKey = new Map<string, PersonChildRelationshipInstance>();
    const keyFor = (i: PersonChildRelationshipInstance) => `${i.customer_member_id}::${i.person_id}`;

    for (const item of canonical) byKey.set(keyFor(item), item);

    for (const item of legacy) {
        const key = keyFor(item);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, item);
            continue;
        }
        const roles = [...new Set([...(existing.operational_roles ?? []), ...(item.operational_roles ?? [])])];
        byKey.set(key, {
            ...existing,
            operational_roles: roles,
            // Provenance for developer diagnostics only — never a product-level distinction.
            metadata: {
                ...(existing.metadata ?? {}),
                merged_sources: ["person_child_relationships", "customer_member_contacts"],
            },
        });
    }

    // Deterministic: by member, then person, then id.
    return [...byKey.values()].sort(
        (a, b) =>
            a.customer_member_id.localeCompare(b.customer_member_id) ||
            String(a.person_id).localeCompare(String(b.person_id)) ||
            String(a.id).localeCompare(String(b.id)),
    );
}

export async function listPersonChildRelationships(args: {
    supabase: SupabaseClient;
    orgId: string;
    customerMemberId?: string;
    personId?: string;
    customerId?: string;
    requiredOperationalRole?: string;
}): Promise<PersonChildRelationshipInstance[]> {
    let query = args.supabase.from("person_child_relationships").select("*").eq("org_id", args.orgId);
    if (args.customerMemberId) query = query.eq("customer_member_id", args.customerMemberId);
    if (args.personId) query = query.eq("person_id", args.personId);
    if (args.customerId) query = query.eq("customer_id", args.customerId);
    const { data, error } = await query.order("priority", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    const records = (data ?? []) as PersonChildRelationshipRecord[];
    const ids = records.map((r) => r.id);
    const roles = await loadRolesForRelationships(args.supabase, args.orgId, ids);
    const personIds = [...new Set(records.map((r) => r.person_id))];
    const persons = await loadPersonsMap(args.supabase, args.orgId, personIds);
    if (args.customerMemberId) {
        const result = resolvePersonChildRelationshipsForCustomerMember({
            orgId: args.orgId,
            customerId: args.customerId ?? records[0]?.customer_id ?? "",
            customerMemberId: args.customerMemberId,
            relationships: records,
            roleAssignments: roles,
            personsById: persons,
            requiredOperationalRole: args.requiredOperationalRole ?? null,
        });
        const legacy = await loadLegacyRelationshipInstances({
            supabase: args.supabase,
            orgId: args.orgId,
            customerMemberIds: [args.customerMemberId],
            customerIdByMember: new Map([[args.customerMemberId, args.customerId ?? records[0]?.customer_id ?? ""]]),
            personsById: persons,
        });
        const merged = mergeRelationshipInstances(result.items, legacy);
        return args.requiredOperationalRole
            ? merged.filter((i) => (i.operational_roles ?? []).includes(args.requiredOperationalRole!))
            : merged;
    }
    const byMember = new Map<string, PersonChildRelationshipRecord[]>();
    for (const rec of records) {
        const list = byMember.get(rec.customer_member_id) ?? [];
        list.push(rec);
        byMember.set(rec.customer_member_id, list);
    }
    const all: PersonChildRelationshipInstance[] = [];
    for (const [memberId, memberRecords] of byMember.entries()) {
        const result = resolvePersonChildRelationshipsForCustomerMember({
            orgId: args.orgId,
            customerId: memberRecords[0]?.customer_id ?? "",
            customerMemberId: memberId,
            relationships: memberRecords,
            roleAssignments: roles,
            personsById: persons,
            requiredOperationalRole: args.requiredOperationalRole ?? null,
        });
        all.push(...result.items);
    }
    const customerIdByMember = new Map<string, string>();
    for (const rec of records) customerIdByMember.set(rec.customer_member_id, rec.customer_id);
    const legacy = await loadLegacyRelationshipInstances({
        supabase: args.supabase,
        orgId: args.orgId,
        customerMemberIds: [...customerIdByMember.keys()],
        customerIdByMember,
        personsById: persons,
    });
    const merged = mergeRelationshipInstances(all, legacy);
    return args.requiredOperationalRole
        ? merged.filter((i) => (i.operational_roles ?? []).includes(args.requiredOperationalRole!))
        : merged;
}

export async function createPersonChildRelationship(
    supabase: SupabaseClient,
    input: CreatePersonChildRelationshipInput,
): Promise<{ ok: true; relationship: PersonChildRelationshipInstance } | { ok: false; error: string }> {
    const optionItems = await loadPersonChildRelationshipOptionSetItems(supabase, input.orgId);
    if (input.relationshipType) {
        const validated = validateRelationshipTypeAgainstOptionSet(input.relationshipType, optionItems);
        if (!validated.ok) return { ok: false, error: validated.reason };
    }

    const { data: existing } = await supabase
        .from("person_child_relationships")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_member_id", input.customerMemberId)
        .eq("person_id", input.personId)
        .maybeSingle();
    if (existing) {
        return { ok: false, error: "Relationship already exists for this Person and Child." };
    }

    const { data: inserted, error } = await supabase
        .from("person_child_relationships")
        .insert({
            org_id: input.orgId,
            customer_id: input.customerId,
            customer_member_id: input.customerMemberId,
            person_id: input.personId,
            relationship_type: input.relationshipType ?? null,
            priority: input.priority ?? null,
            status: "active",
        })
        .select("*")
        .single();
    if (error || !inserted) return { ok: false, error: error?.message ?? "Insert failed" };

    const rec = inserted as PersonChildRelationshipRecord;
    for (const role of input.operationalRoles ?? []) {
        const v = validateOperationalRoleKey(role);
        if (!v.ok) return { ok: false, error: v.reason };
        await supabase.from("person_child_relationship_roles").insert({
            org_id: input.orgId,
            relationship_id: rec.id,
            role_key: v.value,
            is_active: true,
        });
    }

    if (input.customFields && Object.keys(input.customFields).length > 0) {
        const patch = await applyPersonChildRelationshipMutationPatch({
            supabase,
            orgId: input.orgId,
            relationshipId: rec.id,
            body: input.customFields,
        });
        if (!patch.ok) return { ok: false, error: patch.error };
    }

    const rel = await getPersonChildRelationshipById(supabase, input.orgId, rec.id);
    if (!rel) return { ok: false, error: "Created relationship could not be loaded." };
    return { ok: true, relationship: rel };
}

export async function updatePersonChildRelationship(
    supabase: SupabaseClient,
    orgId: string,
    relationshipId: string,
    body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const optionItems = await loadPersonChildRelationshipOptionSetItems(supabase, orgId);
    if (Object.prototype.hasOwnProperty.call(body, "relationship_type")) {
        const validated = validateRelationshipTypeAgainstOptionSet(body.relationship_type, optionItems);
        if (!validated.ok) return { ok: false, error: validated.reason };
        body = { ...body, relationship_type: validated.value || null };
    }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
        const status = validateRelationshipStatus(body.status);
        if (!status) return { ok: false, error: "Invalid status." };
        body = { ...body, status };
    }
    return applyPersonChildRelationshipMutationPatch({ supabase, orgId, relationshipId, body });
}

export async function addPersonChildRelationshipRole(
    supabase: SupabaseClient,
    orgId: string,
    relationshipId: string,
    roleKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const v = validateOperationalRoleKey(roleKey);
    if (!v.ok) return { ok: false, error: v.reason };
    const { data: rel } = await supabase
        .from("person_child_relationships")
        .select("status")
        .eq("org_id", orgId)
        .eq("id", relationshipId)
        .maybeSingle();
    if (!rel) return { ok: false, error: "Relationship not found." };
    if ((rel as { status: string }).status === "inactive") {
        return { ok: false, error: "Cannot add role to inactive relationship." };
    }
    const { error } = await supabase.from("person_child_relationship_roles").upsert(
        {
            org_id: orgId,
            relationship_id: relationshipId,
            role_key: v.value,
            is_active: true,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,relationship_id,role_key" },
    );
    if (error) return { ok: false, error: error.message };
    await deactivateRelationshipWhenNoActiveRoles(supabase, orgId, relationshipId);
    return { ok: true };
}


async function deactivateRelationshipWhenNoActiveRoles(
    supabase: SupabaseClient,
    orgId: string,
    relationshipId: string,
): Promise<void> {
    const { data: activeRoles } = await supabase
        .from("person_child_relationship_roles")
        .select("role_key")
        .eq("org_id", orgId)
        .eq("relationship_id", relationshipId)
        .eq("is_active", true);
    if ((activeRoles ?? []).length > 0) return;
    await supabase
        .from("person_child_relationships")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", relationshipId);
}

export async function removePersonChildRelationshipRole(
    supabase: SupabaseClient,
    orgId: string,
    relationshipId: string,
    roleKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const key = roleKey.trim().toLowerCase();
    const { error } = await supabase
        .from("person_child_relationship_roles")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("relationship_id", relationshipId)
        .eq("role_key", key);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}
