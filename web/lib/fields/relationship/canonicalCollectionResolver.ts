/**
 * Canonical collection runtime resolver — consumer-neutral read resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CUSTOMER_CANONICAL_ADMIN_SELECT,
    PERSON_CANONICAL_IDENTITY_SELECT,
} from "@/lib/fields/canonicalEntitySelectColumns";
import {
    loadRelationshipResolutionDataBag,
} from "@/lib/fields/relationship/canonicalRelationshipResolver";
import type { RelationshipResolutionDataBag } from "@/lib/fields/relationship/canonicalRelationshipContext";
import type {
    CanonicalCollectionItem,
    CanonicalCollectionResolution,
} from "@/lib/fields/relationship/canonicalCollectionResolution";
import {
    collectParentRoleRefsByPersonId,
    collectRolePersonCandidates,
} from "@/lib/fields/relationship/relationshipRoleCandidateAdapters";
import { resolvePrimaryContactAuthority } from "@/lib/fields/relationship/primaryContactAuthority";
import { findCanonicalCollectionProvider } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";

export type CanonicalCollectionResolveContext = {
    orgId: string;
    collectionProviderRef: string;
    customerId: string | null;
    opportunityId?: string | null;
    customerMemberId?: string | null;
};

function trim(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function baseResolution(
    status: CanonicalCollectionResolution["status"],
    extra: { reason?: string; items?: CanonicalCollectionItem[] } = {},
): CanonicalCollectionResolution {
    if (status === "resolved") {
        return { status: "resolved", items: extra.items ?? [] };
    }
    if (status === "empty") return { status: "empty", items: [] };
    return { status, reason: extra.reason, items: [] };
}

function sortByDisplayName<T extends Record<string, unknown>>(
    items: CanonicalCollectionItem<T>[],
    nameKey: string,
): CanonicalCollectionItem<T>[] {
    return [...items].sort((a, b) => {
        const an = trim(a.record[nameKey]) ?? "";
        const bn = trim(b.record[nameKey]) ?? "";
        return an.localeCompare(bn, undefined, { sensitivity: "base" });
    });
}

async function resolveChildrenCollection(
    supabase: SupabaseClient,
    context: CanonicalCollectionResolveContext,
): Promise<CanonicalCollectionResolution> {
    const customerId = trim(context.customerId);
    if (!customerId) {
        return baseResolution("invalid_context", {
            reason: "Children collection requires household (customer_id) context.",
        });
    }

    const { data: rows, error } = await supabase
        .from("customer_members")
        .select("id, customer_id, person_id, first_name, last_name, full_name, display_name, dob, is_active, created_at")
        .eq("org_id", context.orgId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });

    if (error) {
        return baseResolution("unavailable", { reason: "Unable to load household children." });
    }

    const seen = new Set<string>();
    const items: CanonicalCollectionItem[] = [];
    for (const row of rows ?? []) {
        const rec = row as Record<string, unknown>;
        if (rec.is_active === false) continue;
        const itemId = trim(rec.id);
        if (!itemId || seen.has(itemId)) continue;
        seen.add(itemId);
        items.push({
            item_id: itemId,
            item_entity_type: "customer_member",
            record: rec,
        });
    }

    if (items.length === 0) return baseResolution("empty");
    return baseResolution("resolved", {
        items: sortByDisplayName(items, "display_name"),
    });
}

async function resolveParentsGuardiansCollection(
    supabase: SupabaseClient,
    context: CanonicalCollectionResolveContext,
    dataBag: RelationshipResolutionDataBag,
): Promise<CanonicalCollectionResolution> {
    const customerId = trim(context.customerId);
    if (!customerId) {
        return baseResolution("invalid_context", {
            reason: "Parents/Guardians collection requires household (customer_id) context.",
        });
    }

    const primaryAuthority = resolvePrimaryContactAuthority({
        data: dataBag,
        customerId,
        preferOpportunityPointer: Boolean(trim(context.opportunityId)),
    });
    const excludePrimary =
        primaryAuthority.status === "resolved" ? primaryAuthority.target_person_id : null;

    const personIds = collectRolePersonCandidates("parents", {
        customerId,
        customerMemberId: trim(context.customerMemberId),
        data: dataBag,
        excludePrimaryPersonId: excludePrimary,
    });

    if (personIds.length === 0) return baseResolution("empty");

    const { data: personRows, error } = await supabase
        .from("persons")
        .select(PERSON_CANONICAL_IDENTITY_SELECT)
        .eq("org_id", context.orgId)
        .in("id", personIds);

    if (error) {
        return baseResolution("unavailable", { reason: "Unable to load parent/guardian contacts." });
    }

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of personRows ?? []) {
        const rec = row as Record<string, unknown>;
        const id = trim(rec.id);
        if (id) byId.set(id, rec);
    }

    const roleRefsByPerson = collectParentRoleRefsByPersonId({
        customerId,
        data: dataBag,
        excludePrimaryPersonId: excludePrimary,
    });

    const items: CanonicalCollectionItem[] = [];
    const seen = new Set<string>();
    for (const personId of personIds) {
        if (seen.has(personId)) continue;
        seen.add(personId);
        const rec = byId.get(personId);
        if (!rec) continue;
        const roleRefs = roleRefsByPerson.get(personId);
        items.push({
            item_id: personId,
            item_entity_type: "person",
            record: rec,
            ...(roleRefs?.length ? { relationship_role_refs: roleRefs } : {}),
        });
    }

    if (items.length === 0) return baseResolution("empty");
    return baseResolution("resolved", {
        items: sortByDisplayName(items, "display_name"),
    });
}

/**
 * LEGACY forms-role filter map: roles whose read-resolution goes through the legacy candidate adapter
 * (customer_persons / opportunity links) for byte-identical existing behavior. Roles NOT in this map
 * (authorized_pickup, and any future configured role) resolve GENERICALLY from the canonical
 * `person_child_relationship_roles` store — see resolveViaCanonicalPersonChildRoles.
 */
const OPERATIONAL_TO_FORMS_ROLE: Record<string, "parents" | "emergency" | "billing"> = {
    parents: "parents",
    parent: "parents",
    guardian: "parents",
    emergency_contact: "emergency",
    billing_contact: "billing",
};

/**
 * Read a relationship-role collection directly from the CANONICAL operational store
 * (`person_child_relationships` + `person_child_relationship_roles`) by operational role key.
 * Generic for ANY configured role (authorized_pickup, physician, …) — no per-role code, no legacy
 * forms-role filter. Household-scoped (customer_id), person items, deterministic ordering.
 */
async function resolveViaCanonicalPersonChildRoles(
    supabase: SupabaseClient,
    context: CanonicalCollectionResolveContext,
    provider: NonNullable<ReturnType<typeof findCanonicalCollectionProvider>>,
    operationalRoleKey: string,
): Promise<CanonicalCollectionResolution> {
    const customerId = trim(context.customerId);
    if (!customerId) return baseResolution("invalid_context", { reason: `${provider.label} requires household (customer_id) context.` });
    if (!operationalRoleKey) return baseResolution("empty");

    const { data: rels, error: relErr } = await supabase
        .from("person_child_relationships")
        .select("id, person_id, status")
        .eq("org_id", context.orgId)
        .eq("customer_id", customerId);
    if (relErr) return baseResolution("unavailable", { reason: `Unable to load ${provider.label}.` });
    const activeRels = (rels ?? []).filter((r) => (r as { status?: string }).status !== "inactive");
    if (activeRels.length === 0) return baseResolution("empty");

    const relIds = activeRels.map((r) => trim((r as { id?: string }).id)).filter((x): x is string => !!x);
    const { data: roleRows, error: roleErr } = await supabase
        .from("person_child_relationship_roles")
        .select("relationship_id, role_key, is_active")
        .eq("org_id", context.orgId)
        .in("relationship_id", relIds)
        .eq("role_key", operationalRoleKey)
        .eq("is_active", true);
    if (roleErr) return baseResolution("unavailable", { reason: `Unable to load ${provider.label} roles.` });

    const matchedRelIds = new Set((roleRows ?? []).map((r) => trim((r as { relationship_id?: string }).relationship_id)).filter(Boolean));
    const personIds = [
        ...new Set(
            activeRels
                .filter((r) => matchedRelIds.has(trim((r as { id?: string }).id)))
                .map((r) => trim((r as { person_id?: string }).person_id))
                .filter((x): x is string => !!x),
        ),
    ];
    if (personIds.length === 0) return baseResolution("empty");

    const { data: personRows, error } = await supabase
        .from("persons")
        .select(PERSON_CANONICAL_IDENTITY_SELECT)
        .eq("org_id", context.orgId)
        .in("id", personIds);
    if (error) return baseResolution("unavailable", { reason: `Unable to load ${provider.label}.` });

    const items: CanonicalCollectionItem[] = [];
    const seen = new Set<string>();
    for (const row of personRows ?? []) {
        const rec = row as Record<string, unknown>;
        const id = trim(rec.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({ item_id: id, item_entity_type: "person", record: rec });
    }
    if (items.length === 0) return baseResolution("empty");
    return baseResolution("resolved", { items: sortByDisplayName(items, "display_name") });
}

/**
 * Generic relationship-role collection resolution (emergency contacts, and any future registered
 * role with a forms-role filter). Household-scoped, person items. Reuses the same candidate adapter
 * as parents/guardians so there is one resolution path, not a per-role copy.
 */
async function resolveRelationshipRoleCollectionGeneric(
    supabase: SupabaseClient,
    context: CanonicalCollectionResolveContext,
    provider: NonNullable<ReturnType<typeof findCanonicalCollectionProvider>>,
): Promise<CanonicalCollectionResolution> {
    const customerId = trim(context.customerId);
    if (!customerId) {
        return baseResolution("invalid_context", { reason: `${provider.label} collection requires household (customer_id) context.` });
    }
    const formsRole = OPERATIONAL_TO_FORMS_ROLE[provider.relationshipRoleKey ?? ""];
    if (!formsRole) {
        // No legacy forms-role filter (authorized_pickup and any future configured role) → resolve
        // GENERICALLY from the canonical operational store `person_child_relationship_roles` by role
        // key. The provider's relationshipRoleKey IS the operational role key for these definitions.
        return resolveViaCanonicalPersonChildRoles(supabase, context, provider, provider.relationshipRoleKey ?? "");
    }
    const dataBag = await loadRelationshipResolutionDataBag(
        supabase,
        context.orgId,
        {
            organizationId: context.orgId,
            relationshipId: provider.refKey,
            source: { entityType: "customer", recordId: customerId },
            customerMemberId: trim(context.customerMemberId) ?? null,
        },
        customerId,
    );
    const personIds = collectRolePersonCandidates(formsRole, {
        customerId,
        customerMemberId: trim(context.customerMemberId),
        data: dataBag,
        excludePrimaryPersonId: null,
    });
    if (personIds.length === 0) return baseResolution("empty");

    const { data: personRows, error } = await supabase
        .from("persons")
        .select(PERSON_CANONICAL_IDENTITY_SELECT)
        .eq("org_id", context.orgId)
        .in("id", personIds);
    if (error) return baseResolution("unavailable", { reason: `Unable to load ${provider.label}.` });

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of personRows ?? []) {
        const rec = row as Record<string, unknown>;
        const id = trim(rec.id);
        if (id) byId.set(id, rec);
    }
    const items: CanonicalCollectionItem[] = [];
    const seen = new Set<string>();
    for (const personId of personIds) {
        if (seen.has(personId)) continue;
        seen.add(personId);
        const rec = byId.get(personId);
        if (rec) items.push({ item_id: personId, item_entity_type: "person", record: rec });
    }
    if (items.length === 0) return baseResolution("empty");
    return baseResolution("resolved", { items: sortByDisplayName(items, "display_name") });
}

/** Resolve a canonical whole-collection provider to stable items. */
export async function resolveCanonicalCollection(
    supabase: SupabaseClient,
    context: CanonicalCollectionResolveContext,
): Promise<CanonicalCollectionResolution> {
    const ref = context.collectionProviderRef.trim();

    if (ref === "children") {
        return resolveChildrenCollection(supabase, context);
    }

    if (ref === "person.contact_role.parents") {
        const customerId = trim(context.customerId);
        if (!customerId) {
            return baseResolution("invalid_context", {
                reason: "Parents/Guardians collection requires household context.",
            });
        }
        const dataBag = await loadRelationshipResolutionDataBag(
            supabase,
            context.orgId,
            {
                organizationId: context.orgId,
                relationshipId: "person.contact_role.parents",
                source: { entityType: "customer", recordId: customerId },
                customerMemberId: trim(context.customerMemberId) ?? null,
            },
            customerId,
        );
        return resolveParentsGuardiansCollection(supabase, context, dataBag);
    }

    if (ref === "household.members") {
        const customerId = trim(context.customerId);
        if (!customerId) {
            return baseResolution("invalid_context", {
                reason: "Household members collection requires household context.",
            });
        }
        const { data: rows, error } = await supabase
            .from("customer_members")
            .select("id, customer_id, person_id, first_name, last_name, full_name, display_name, dob, is_active, created_at")
            .eq("org_id", context.orgId)
            .eq("customer_id", customerId)
            .order("created_at", { ascending: true });
        if (error) {
            return baseResolution("unavailable", { reason: "Unable to load household members." });
        }
        const seen = new Set<string>();
        const items: CanonicalCollectionItem[] = [];
        for (const row of rows ?? []) {
            const rec = row as Record<string, unknown>;
            if (rec.is_active === false) continue;
            const itemId = trim(rec.id);
            if (!itemId || seen.has(itemId)) continue;
            seen.add(itemId);
            items.push({ item_id: itemId, item_entity_type: "customer_member", record: rec });
        }
        if (items.length === 0) return baseResolution("empty");
        return baseResolution("resolved", { items: sortByDisplayName(items, "display_name") });
    }

    // Generic relationship-role providers (emergency contacts, authorized pickups, …) — one path.
    const provider = findCanonicalCollectionProvider(ref);
    if (provider?.providerKind === "relationship_role") {
        return resolveRelationshipRoleCollectionGeneric(supabase, context, provider);
    }

    return baseResolution("unsupported", {
        reason: `Collection provider "${ref}" is not registered for resolution.`,
    });
}

/** Verify resolved collection items belong to the organization boundary. */
export async function verifyCollectionOrgBoundary(
    supabase: SupabaseClient,
    orgId: string,
    resolution: CanonicalCollectionResolution,
): Promise<boolean> {
    if (resolution.status !== "resolved") return true;
    for (const item of resolution.items) {
        if (item.item_entity_type === "customer_member") {
            const { data } = await supabase
                .from("customer_members")
                .select("id")
                .eq("org_id", orgId)
                .eq("id", item.item_id)
                .maybeSingle();
            if (!data) return false;
        } else if (item.item_entity_type === "person") {
            const { data } = await supabase
                .from("persons")
                .select("id")
                .eq("org_id", orgId)
                .eq("id", item.item_id)
                .maybeSingle();
            if (!data) return false;
        }
    }
    return true;
}

/** Load customer row for collection context validation. */
export async function loadCustomerForCollectionContext(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<Record<string, unknown> | null> {
    const { data } = await supabase
        .from("customers")
        .select(CUSTOMER_CANONICAL_ADMIN_SELECT)
        .eq("org_id", orgId)
        .eq("id", customerId)
        .maybeSingle();
    return (data as Record<string, unknown>) ?? null;
}
