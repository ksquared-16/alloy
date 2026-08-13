/**
 * OPERATOR INTENT → ATTENTION TARGET (server half).
 *
 * A caller states WHAT the operator wants to look at — a record id and, optionally, a card. This
 * resolves WHERE that is worked:
 *
 *     record id  →  host record  →  the Work Unit that actually holds it
 *
 * Configuration says which relationship and which card. The platform says which unit, which host
 * record, and whether this operator may be told at all. That split is the whole point: without it,
 * every caller grows its own destination logic and they drift.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──
 *
 * It never infers a Work Unit from a Business Process key (different namespace; resolves to
 * `work_unit_not_found` and composes nothing — see `hostWorkUnitResolver`). It never invents a route.
 * It returns `null` when no active unit holds the record, and `null` is a real answer that callers
 * must propagate rather than paper over.
 *
 * ── ACCESS ──
 *
 * Filtered through the same envelope Search resolves, so a record outside the operator's reach is
 * indistinguishable from a record no queue holds. Navigation does not grant access — the Work Unit
 * surface and the record payload each enforce it again on arrival.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    allowListIsImpossible,
    resolveSearchAccessEnvelope,
    type SearchAccessEnvelope,
} from "@/lib/search/searchAccessEnvelope";
import {
    fetchHostWorkUnitKeys,
    fetchHouseholdCaseHosts,
} from "@/lib/workUnits/hostWorkUnitResolver";

/** Where an operator gesture should land. `null` from the resolver means "nowhere honest". */
export type OperatorFocusTarget = {
    /** The record whose Focus Panel hosts the subject. */
    host_entity_type: "opportunities";
    host_entity_id: string;
    /** Active Work Unit key holding that record, or null when no queue holds it. */
    host_work_unit_key: string | null;
};

/** Entity types a client may ask about. Anything else has no operational host to resolve. */
const RESOLVABLE_ENTITY_TYPES = new Set([
    "opportunities",
    "opportunity",
    "customers",
    "customer",
    "households",
    "household",
    "persons",
    "person",
]);

export function isResolvableFocusEntityType(entityType: string): boolean {
    return RESOLVABLE_ENTITY_TYPES.has(entityType.trim().toLowerCase());
}

function allowed(allowList: string[] | null, id: string): boolean {
    if (allowList === null) return true; // unrestricted dimension
    return allowList.includes(id);
}

/**
 * A person's household — from EITHER table that can hold one.
 *
 * ⚠ `customer_persons` is the ADULT contact edge. A child is linked through `customer_members`,
 * and nothing writes them into `customer_persons`. Reading only the first table therefore returned
 * null for every child — a FALSE null, not the honest "nowhere" this resolver promises: the child's
 * family case sat in an active queue the whole time. It was invisible because null is a legitimate
 * answer here, so callers propagated it exactly as designed and simply stopped offering the gesture.
 *
 * Certified live: the seeded child `…050000011` has no `customer_persons` row, one
 * `customer_members` row, and that household owns an `enrollment_pipeline` case on an active unit.
 *
 * The member lookup runs only when the contact lookup misses, so the adult path costs nothing.
 */
async function householdIdForPerson(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as { customer_id?: string | null } | undefined;
    const id = typeof row?.customer_id === "string" ? row.customer_id.trim() : "";
    if (id) return id;

    const { data: memberData, error: memberError } = await supabase
        .from("customer_members")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .limit(1);
    if (memberError) throw new Error(memberError.message);
    const memberRow = (memberData ?? [])[0] as { customer_id?: string | null } | undefined;
    const memberId = typeof memberRow?.customer_id === "string" ? memberRow.customer_id.trim() : "";
    return memberId || null;
}

async function opportunityIsVisible(
    supabase: SupabaseClient,
    orgId: string,
    envelope: SearchAccessEnvelope,
    opportunityId: string
): Promise<boolean> {
    if (!envelope.restricted) return true;
    if (allowListIsImpossible(envelope.allowedCustomerIds)) return false;
    const { data, error } = await supabase
        .from("opportunities")
        .select("id, customer_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as { customer_id?: string | null } | undefined;
    if (!row) return false;
    const customerId = typeof row.customer_id === "string" ? row.customer_id.trim() : "";
    return Boolean(customerId) && allowed(envelope.allowedCustomerIds, customerId);
}

/**
 * Resolve one record into the attention target that hosts it.
 *
 * `persons` and `customers` resolve THROUGH the household's own case: only children participate in a
 * process, so a parent, a person or a household has no host Work Unit of its own — its case is the
 * panel it is worked in, and the same one its children land on.
 */
export async function resolveOperatorFocusTarget(args: {
    supabase: SupabaseClient;
    orgId: string;
    dimensions: AdminAccessScopeDimensions;
    entityType: string;
    entityId: string;
}): Promise<OperatorFocusTarget | null> {
    const { supabase, orgId, entityId } = args;
    const entityType = args.entityType.trim().toLowerCase();
    const id = entityId.trim();
    if (!id || !isResolvableFocusEntityType(entityType)) return null;

    const envelope = await resolveSearchAccessEnvelope(supabase, orgId, args.dimensions);
    if (envelope.impossible) return null;

    if (entityType === "opportunities" || entityType === "opportunity") {
        if (!(await opportunityIsVisible(supabase, orgId, envelope, id))) return null;
        const keys = await fetchHostWorkUnitKeys(supabase, orgId, [id]);
        return {
            host_entity_type: "opportunities",
            host_entity_id: id,
            host_work_unit_key: keys.get(id) ?? null,
        };
    }

    let householdId: string | null = null;
    if (entityType === "persons" || entityType === "person") {
        if (envelope.restricted && !allowed(envelope.allowedPersonIds, id)) return null;
        householdId = await householdIdForPerson(supabase, orgId, id);
    } else {
        householdId = id;
    }
    if (!householdId) return null;
    if (envelope.restricted && !allowed(envelope.allowedCustomerIds, householdId)) return null;

    const cases = await fetchHouseholdCaseHosts(supabase, orgId, [householdId]);
    const hit = cases.get(householdId);
    if (!hit) return null;
    return {
        host_entity_type: "opportunities",
        host_entity_id: hit.opportunityId,
        host_work_unit_key: hit.workUnitKey,
    };
}
