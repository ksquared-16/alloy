/**
 * OPERATOR INTENT → ATTENTION TARGET (server half).
 *
 * A caller states WHAT the operator wants to look at — a record id and, optionally, a card. This
 * resolves the SUBJECT, and separately the operational context that subject is currently worked in:
 *
 *     record id  →  attention subject          (durable — exists because the record exists)
 *                +  operational host, if any   (enrichment — exists only while a queue holds it)
 *
 * ── WHY THE TWO ARE SEPARATE ──
 *
 * This module used to answer one question — "which Work Unit hosts this record?" — and typed its
 * answer as the literal `"opportunities"`. That made an active Work Unit the EXISTENCE AUTHORITY for
 * attention: a canonically-created staff member (Person + Employment, no household, no case) had no
 * representable target at all, and an enrolled child whose case had left the active queue became
 * unopenable while remaining fully enrolled. Both returned `null`, which callers correctly propagated
 * as "nowhere to send the operator" — so the gap was invisible for as long as it existed.
 *
 * Durable record attention is SUBJECT-FIRST. A Work Unit says where a subject is being *worked*; it
 * does not say whether the subject *exists*. Resolution therefore runs:
 *
 *     resolve subject first  →  then resolve optional operational host
 *
 * never `find operational host, or the subject does not exist`.
 *
 * ── INTENT IS DECLARED, NEVER INFERRED ──
 *
 * The two questions have different right answers when no queue holds the record, so the caller says
 * which one it is asking (see {@link AttentionIntent}). An operational surface asking "where do I work
 * this?" must still receive `null` when the honest answer is nowhere. A Records surface asking "open
 * this durable record" must not be refused for the same reason. Inferring the difference from the
 * entity type would silently give one caller the other's answer.
 *
 * ── WHAT THIS STILL DELIBERATELY DOES NOT DO ──
 *
 * It never infers a Work Unit from a Business Process key (different namespace; resolves to
 * `work_unit_not_found` and composes nothing — see `hostWorkUnitResolver`). It never invents a route.
 * It never fabricates an Opportunity to give a durable subject a host. `operational_host: null` is a
 * real answer and stays one.
 *
 * ── ACCESS ──
 *
 * Filtered through the same envelope Search resolves, so a record outside the operator's reach is
 * indistinguishable from a record no queue holds. Navigation does not grant access — the destination
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

/**
 * What the operator is asking for. Declared by the caller; never inferred.
 *
 *   operational    — "where do I WORK this record?" Answers null when no active Work Unit holds it.
 *                    This is the historical behaviour and remains the default for every operational
 *                    surface (Roster, Attendance, Inbox, Tasks, Search, right rails).
 *   durable_record — "OPEN this record." Answers a subject whenever the record exists and the operator
 *                    may reach it, carrying operational context when there happens to be some.
 */
export type AttentionIntent = "operational" | "durable_record";

/** The grains a durable subject can take. Matches `OperationalSubjectType` at the panel. */
export type AttentionSubjectType = "opportunity" | "person" | "child" | "household";

/**
 * The record the operator pointed at, as a durable identity.
 *
 * `id` is that grain's own canonical id — `opportunities.id`, `persons.id`, `customer_members.id`.
 * The relational fields are carried because the resolver already had to read them; a consumer that
 * needs the family link should not re-query for it (R6, `SECOND-SURFACE-INVENTORY.md`).
 */
export type AttentionSubjectRef = {
    type: AttentionSubjectType;
    id: string;
    /** Person identity behind a `child` subject, when the member row carries one. */
    person_id: string | null;
    /** Household this subject belongs to, when it has one. Null for unaffiliated staff. */
    household_id: string | null;
};

/**
 * Where the subject is currently WORKED. Present only while an active Work Unit pages its case.
 *
 * Still typed `"opportunities"` on purpose: a *host* genuinely is always a case. What changed is that
 * a host is no longer required for a subject to exist.
 */
export type OperationalHostRef = {
    host_entity_type: "opportunities";
    host_entity_id: string;
    /** Active Work Unit key holding that case, or null when no active unit holds it. */
    host_work_unit_key: string | null;
};

/** The full answer: a durable subject, plus optional operational context. */
export type AttentionResolution = {
    subject: AttentionSubjectRef;
    operational_host: OperationalHostRef | null;
};

/**
 * Is there somewhere to MOVE to — i.e. a case AND an active unit paging it?
 *
 * `operational_host` and `host_work_unit_key` are two separate facts and both must hold. A case whose
 * unit went inactive yields a host with a null key: the case still exists (so the field is not a lie)
 * but nothing active pages it (so it is not a destination). Every consumer needs that same two-field
 * rule, and a rule re-derived at each call site is one edit away from disagreeing — so it lives here.
 */
export function hasOperationalDestination(
    resolution: AttentionResolution | null | undefined
): boolean {
    const host = resolution?.operational_host;
    return Boolean(host?.host_entity_id && host?.host_work_unit_key);
}

/**
 * Legacy shape. Structurally identical to {@link OperationalHostRef} and derived from it, so every
 * pre-existing caller keeps receiving exactly what it received before.
 *
 * @deprecated Read `AttentionResolution.operational_host` (and `.subject`) instead.
 */
export type OperatorFocusTarget = OperationalHostRef;

/**
 * Entity types a client may ask about.
 *
 * `customer_members` / `child` are new: the child grain previously had no arm at all and had to be
 * asked for as its `person_id`, which silently reframed the question as "this person" and lost the
 * member identity the enrollment subject is actually keyed by.
 */
const RESOLVABLE_ENTITY_TYPES = new Set([
    "opportunities",
    "opportunity",
    "customers",
    "customer",
    "households",
    "household",
    "persons",
    "person",
    "customer_members",
    "child",
]);

export function isResolvableFocusEntityType(entityType: string): boolean {
    return RESOLVABLE_ENTITY_TYPES.has(entityType.trim().toLowerCase());
}

function normalizeEntityType(entityType: string): string {
    return entityType.trim().toLowerCase();
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
 * A staff person legitimately has NEITHER edge — `staff.add` writes `persons` + `employments` only.
 * Null here is therefore ordinary for staff, and no longer terminates resolution.
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

/** Does this `persons` row exist in this org? Existence is the durable subject's only precondition. */
async function personExistsInOrg(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", personId)
        .limit(1);
    if (error) throw new Error(error.message);
    return Boolean((data ?? [])[0]);
}

/**
 * Does this `customers` row exist in this org?
 *
 * The household's ONLY precondition, exactly as for a person. It replaces the previous test — "does
 * an active Work Unit hold a case for this household" — which made a queue the existence authority
 * for a family.
 */
async function householdExistsInOrg(
    supabase: SupabaseClient,
    orgId: string,
    householdId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", householdId)
        .limit(1);
    if (error) throw new Error(error.message);
    return Boolean((data ?? [])[0]);
}

/** The member row behind a `child` subject — its own id is the enrollment subject key. */
async function loadChildMember(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string
): Promise<{ person_id: string | null; customer_id: string | null } | null> {
    const { data, error } = await supabase
        .from("customer_members")
        .select("id, person_id, customer_id")
        .eq("org_id", orgId)
        .eq("id", memberId)
        .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as
        | { person_id?: string | null; customer_id?: string | null }
        | undefined;
    if (!row) return null;
    return {
        person_id: typeof row.person_id === "string" ? row.person_id.trim() || null : null,
        customer_id: typeof row.customer_id === "string" ? row.customer_id.trim() || null : null,
    };
}

/**
 * Is this opportunity BOTH in this org and reachable by this operator?
 *
 * The org read is unconditional now. It used to run only on the restricted path (`if
 * (!envelope.restricted) return true`), which meant an unrestricted operator's cross-tenant
 * opportunity id was never checked here at all — it survived as a target whose `host_work_unit_key`
 * happened to be null because the work-unit lookup IS org-scoped. That was safe only downstream, by
 * accident: `useOperatorRecordFocus` requires a key, so the gesture did nothing. A durable subject has
 * no such second gate, so tenancy is enforced where it belongs. Cost is one indexed read on a path
 * that already reads `opportunities` immediately afterwards.
 */
async function opportunityIsVisible(
    supabase: SupabaseClient,
    orgId: string,
    envelope: SearchAccessEnvelope,
    opportunityId: string
): Promise<boolean> {
    if (envelope.restricted && allowListIsImpossible(envelope.allowedCustomerIds)) return false;
    const { data, error } = await supabase
        .from("opportunities")
        .select("id, customer_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as { customer_id?: string | null } | undefined;
    if (!row) return false;
    if (!envelope.restricted) return true;
    const customerId = typeof row.customer_id === "string" ? row.customer_id.trim() : "";
    return Boolean(customerId) && allowed(envelope.allowedCustomerIds, customerId);
}

/** The case hosting a household, when an active Work Unit pages one. Pure enrichment. */
async function operationalHostForHousehold(
    supabase: SupabaseClient,
    orgId: string,
    householdId: string
): Promise<OperationalHostRef | null> {
    const cases = await fetchHouseholdCaseHosts(supabase, orgId, [householdId]);
    const hit = cases.get(householdId);
    if (!hit) return null;
    return {
        host_entity_type: "opportunities",
        host_entity_id: hit.opportunityId,
        host_work_unit_key: hit.workUnitKey,
    };
}

/**
 * Resolve one record into its durable attention subject plus optional operational context.
 *
 * Returns null only when the record genuinely cannot be attended: unknown entity type, no such record
 * in this org, or the operator may not reach it. **Not** when it merely sits outside every queue.
 */
export async function resolveAttentionTarget(args: {
    supabase: SupabaseClient;
    orgId: string;
    dimensions: AdminAccessScopeDimensions;
    entityType: string;
    entityId: string;
}): Promise<AttentionResolution | null> {
    const { supabase, orgId } = args;
    const entityType = normalizeEntityType(args.entityType);
    const id = args.entityId.trim();
    if (!id || !isResolvableFocusEntityType(entityType)) return null;

    const envelope = await resolveSearchAccessEnvelope(supabase, orgId, args.dimensions);
    if (envelope.impossible) return null;

    // ── OPPORTUNITY — its own subject, and its own host ──────────────────────────────
    if (entityType === "opportunities" || entityType === "opportunity") {
        if (!(await opportunityIsVisible(supabase, orgId, envelope, id))) return null;
        const keys = await fetchHostWorkUnitKeys(supabase, orgId, [id]);
        return {
            subject: { type: "opportunity", id, person_id: null, household_id: null },
            operational_host: {
                host_entity_type: "opportunities",
                host_entity_id: id,
                host_work_unit_key: keys.get(id) ?? null,
            },
        };
    }

    // ── CHILD — the member row is the subject; the family case is context ────────────
    if (entityType === "customer_members" || entityType === "child") {
        const member = await loadChildMember(supabase, orgId, id);
        if (!member) return null;
        const householdId = member.customer_id;
        if (envelope.restricted && householdId && !allowed(envelope.allowedCustomerIds, householdId)) {
            return null;
        }
        return {
            subject: { type: "child", id, person_id: member.person_id, household_id: householdId },
            operational_host: householdId
                ? await operationalHostForHousehold(supabase, orgId, householdId)
                : null,
        };
    }

    // ── HOUSEHOLD — a subject of its own; its case is context ────────────────────────
    //
    // This arm used to answer with the household's CASE (`type: "opportunity"`) and to return null
    // when no active unit held one. The reasoning was that "a household IS the case grain, so
    // promoting it to a durable subject would create a second surface for the same thing." Both
    // halves turned out to be wrong, and the second half was a real defect:
    //
    //   • A case is ONE ENROLLMENT'S view of a family. The family is `customers` +
    //     `customer_persons` + `customer_members`, it can carry several cases or none, and it
    //     outlives all of them. Answering with a case picks one of those views and calls it the
    //     family.
    //   • Returning null without a host made an ACTIVE QUEUE the existence authority for a
    //     household — precisely the mistake this resolver's own header records having removed for
    //     every other grain. A family whose enrollment completed could not be opened at all.
    //
    // So the household is now its own subject and the case rides along as `operational_host`, which
    // is the same shape every other durable grain already uses. `resolveOperatorFocusTarget` reads
    // ONLY `operational_host`, so every operational caller keeps its exact previous answer — null
    // when no unit holds the case, the host when one does.
    if (
        entityType === "customers"
        || entityType === "customer"
        || entityType === "households"
        || entityType === "household"
    ) {
        if (envelope.restricted && !allowed(envelope.allowedCustomerIds, id)) return null;
        if (!(await householdExistsInOrg(supabase, orgId, id))) return null;
        return {
            subject: { type: "household", id, person_id: null, household_id: id },
            operational_host: await operationalHostForHousehold(supabase, orgId, id),
        };
    }

    // ── PERSON — durable on its own. A household case is context when one exists ─────
    if (envelope.restricted && !allowed(envelope.allowedPersonIds, id)) return null;

    const householdId = await householdIdForPerson(supabase, orgId, id);
    // A household edge proves the person row exists, so the existence read runs ONLY for the
    // unaffiliated case (staff). The affiliated path keeps exactly its original query count.
    if (!householdId && !(await personExistsInOrg(supabase, orgId, id))) return null;

    if (householdId && envelope.restricted && !allowed(envelope.allowedCustomerIds, householdId)) {
        // The person is reachable but their household is not; carry the subject without the context
        // rather than refusing the record.
        return {
            subject: { type: "person", id, person_id: id, household_id: null },
            operational_host: null,
        };
    }

    return {
        subject: { type: "person", id, person_id: id, household_id: householdId },
        operational_host: householdId
            ? await operationalHostForHousehold(supabase, orgId, householdId)
            : null,
    };
}

/**
 * Resolve one record into the attention target that hosts it — OPERATIONAL intent.
 *
 * Behaviour-preserving wrapper over {@link resolveAttentionTarget}: it answers the question
 * "where is this worked?", so it still returns null when no active Work Unit holds the record. Every
 * operational caller keeps the answer it had.
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
    // `customer_members` / `child` are deliberately NOT operational-resolvable: no caller asked for
    // them under this intent before, and answering one now would change a surface nobody migrated.
    const entityType = normalizeEntityType(args.entityType);
    if (entityType === "customer_members" || entityType === "child") return null;

    const resolution = await resolveAttentionTarget(args);
    return resolution?.operational_host ?? null;
}
