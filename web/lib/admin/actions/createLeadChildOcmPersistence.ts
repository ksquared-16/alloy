/**
 * Create Lead → inquiry child participation (customer_member + OCM).
 * Stores stable keys/IDs only — never display labels.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { findOrCreateChildPersonInOrg } from "@/lib/admin/person/findOrCreateChildPersonInOrg";
import { resolveProgramCategoryId } from "@/lib/locations/resolveOcmProgramCategoryFields";
import {
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
    createEnrollmentProcessInstance,
} from "@/lib/process/processInstances";
import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { createHouseholdChildMember } from "@/lib/records/childMemberAuthority";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimText(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function trimStableKey(v: unknown): string | null {
    const t = trimText(v);
    return t.length ? t : null;
}

function trimUuid(v: unknown): string | null {
    const t = trimText(v);
    return t && UUID_RE.test(t) ? t : null;
}

function trimDateOnly(v: unknown): string | null {
    const t = trimText(v);
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export type CreateLeadChildOcmFields = {
    location_id: string | null;
    /** Stable program key from intake (`child_program`) — resolved to `program_category_id`, never stored. */
    program_key: string | null;
    program_category_id: string | null;
    schedule_type: string | null;
    start_date: string | null;
    program_room_cohort_key: string | null;
    notes: string | null;
};

export type CreateLeadChildIdentity = {
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    display_name: string;
};

export type ParsedCreateLeadChildParticipation = {
    identity: CreateLeadChildIdentity;
    ocm: CreateLeadChildOcmFields;
};

/** Map create_lead execute payload keys → OCM columns (pure). */
export function parseCreateLeadChildParticipationPayload(
    merged: Record<string, unknown>
): ParsedCreateLeadChildParticipation | null {
    const firstName = trimStableKey(merged.child_first_name);
    const lastName = trimStableKey(merged.child_last_name);
    const dob = trimDateOnly(merged.child_date_of_birth);

    const ocm: CreateLeadChildOcmFields = {
        // Explicit child location wins; otherwise cascade Lead location so site participation
        // matches the Lead form Location (same inheritance as later add-child).
        location_id: trimUuid(merged.child_location_id) || trimUuid(merged.location_id),
        program_key: trimStableKey(merged.child_program),
        program_category_id:
            trimUuid(merged.child_program_category_id) ??
            trimUuid(merged.program_category_id),
        schedule_type:
            trimStableKey(merged.child_schedule_type) ?? trimStableKey(merged.schedule_type),
        start_date:
            trimDateOnly(merged.child_start_date) ?? trimDateOnly(merged.start_date),
        program_room_cohort_key:
            trimUuid(merged.child_program_room_cohort_key) ??
            trimUuid(merged.program_room_cohort_key),
        notes: trimStableKey(merged.child_notes) ?? trimStableKey(merged.notes),
    };

    // Child person creation requires durable first + last name (see findOrCreateChildPersonInOrg).
    if (!firstName || !lastName) return null;

    const hasOcmField = Object.values(ocm).some((v) => v != null);
    const display_name = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!display_name) return null;

    return {
        identity: {
            first_name: firstName,
            last_name: lastName,
            dob,
            display_name,
        },
        ocm,
    };
}

export function buildCreateLeadOcmInsertRow(args: {
    orgId: string;
    opportunityId: string;
    customerMemberId: string;
    ocm: CreateLeadChildOcmFields;
}): Record<string, unknown> {
    const { orgId, opportunityId, customerMemberId, ocm } = args;
    return {
        org_id: orgId,
        opportunity_id: opportunityId,
        customer_member_id: customerMemberId,
        // No child enrollment disposition at lead creation: the OCM status domain only defines real
        // enrollment outcomes (waitlisted/enrolling/enrolled/…), none of which a brand-new lead has.
        // Leave outcome_status_key null so the child badge is suppressed until enrollment starts —
        // do NOT write `new_inquiry` (which has no OCM definition and humanizes to "New Inquiry").
        outcome_status_key: null,
        // No child process stage at lead creation: the child rides the family track until a
        // decision creates the enrollment participation. Stage is a persisted column (S4) — leave
        // it null now; outcome execution writes it when the child enters waitlist/enrolling/etc.
        stage_key: null,
        metadata: { source: "create_lead" },
        ...(ocm.location_id ? { location_id: ocm.location_id } : {}),
        ...(ocm.program_category_id
            ? { program_category_id: ocm.program_category_id }
            : {}),
        ...(ocm.schedule_type ? { schedule_type: ocm.schedule_type } : {}),
        ...(ocm.start_date ? { start_date: ocm.start_date } : {}),
        ...(ocm.program_room_cohort_key ? { program_room_cohort_key: ocm.program_room_cohort_key } : {}),
        ...(ocm.notes ? { notes: ocm.notes } : {}),
    };
}

export type ApplyCreateLeadChildParticipationResult = {
    customer_member_id: string;
    /** Legacy OCM bridge id — no longer written at Create Lead (always null; kept for shape compatibility). */
    ocm_id: string | null;
    /** Enrollment process instance created for this child (runtime source of truth). */
    process_instance_id: string | null;
};

export async function applyCreateLeadChildParticipationFromIdentity(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityId: string;
        customerId: string;
        identity: CreateLeadChildIdentity;
        ocm: CreateLeadChildOcmFields;
        /** When set, skip find-or-create and use this durable child person row. */
        existingPersonId?: string | null;
    },
): Promise<ApplyCreateLeadChildParticipationResult> {
    const firstName = params.identity.first_name ?? "";
    const lastName = params.identity.last_name ?? "";
    let childPersonId = trimText(params.existingPersonId);
    if (!childPersonId) {
        const childPerson = await findOrCreateChildPersonInOrg(supabase, {
            orgId: params.orgId,
            customerId: params.customerId,
            firstName,
            lastName,
            dob: params.identity.dob,
        });
        if (!childPerson?.person_id) {
            throw new Error("Could not create or resolve child person identity for lead.");
        }
        childPersonId = childPerson.person_id;
    }

    // ONE child-member write authority. Create Lead still resolves the child's IDENTITY its own
    // way (from intake facts, above) — the authority owns the row, never who the child is.
    const { member } = await createHouseholdChildMember(supabase, {
        orgId: params.orgId,
        customerId: params.customerId,
        personId: childPersonId,
        displayName: params.identity.display_name,
        firstName: params.identity.first_name,
        lastName: params.identity.last_name,
        dob: params.identity.dob,
        source: "create_lead",
    });
    const customerMemberId = member.id;

    // FK-only program storage: resolve the intake program key against the child's site.
    const programCategoryId =
        trimUuid(params.ocm.program_category_id) ??
        (await resolveProgramCategoryId(supabase, {
            orgId: params.orgId,
            locationId: params.ocm.location_id,
            programKey: params.ocm.program_key,
        }));

    /*
     * ── THE ENROLLMENT PARTICIPATION IS ESTABLISHED HERE ──
     *
     * This deliberately REVERSES the earlier "OCM bridge write REMOVED" position, and it is worth
     * saying why rather than quietly editing it. That decision treated `process_instances` as the
     * sole runtime owner of child participation and OCM as legacy. REAL ENROLLMENT V1 settled the
     * opposite: `opportunity_customer_members` is the durable owner of a child's Enrollment state,
     * and a journey ANCHORS to it (`context_type = enrollment_participation`).
     *
     * Start Enrollment was converged to that model; this path was not. The consequence was provable
     * and not theoretical: a child arriving through acquisition got a journey anchored to the
     * OPPORTUNITY, so the canonical anchor never existed for them, and Start Enrollment later reused
     * that legacy-shaped journey rather than creating a canonical one. Two symptoms, one root.
     *
     * The participation is created through the canonical find-or-create the rest of Enrollment uses,
     * never a direct insert — so this makes exactly one OCM, carries the acquisition Opportunity on
     * it, and is idempotent under a repeated Create Lead.
     */
    const participation = await ensureOpportunityCustomerMemberParticipation({
        supabase,
        orgId: params.orgId,
        opportunityId: params.opportunityId,
        customerMemberId,
        source: "create_lead",
        outcomeStatusKey: NEW_LEAD_STATUS_KEY,
    });

    // The journey anchors to the PARTICIPATION. The Opportunity stays reachable through it, which is
    // what keeps acquisition context available without making it the child's Enrollment identity.
    const piResult = await createEnrollmentProcessInstance(supabase, {
        orgId: params.orgId,
        subjectId: customerMemberId,     // child = customer_member
        contextId: participation.ocmId,
        contextType: ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
        acquisitionOpportunityId: params.opportunityId,
        stageKey: null,                  // rides the family track until a decision creates the child journey
        state: null,                     // no enrollment outcome at intake
        participation: {
            start_date: params.ocm.start_date,
            schedule_type: params.ocm.schedule_type,
            program_category_id: programCategoryId,
            location_id: params.ocm.location_id,
            program_room_cohort_key: params.ocm.program_room_cohort_key,
            notes: params.ocm.notes,
        },
    });
    if (piResult.error) {
        throw new Error(`Could not create Enrollment process instance for child: ${piResult.error}`);
    }

    return {
        customer_member_id: customerMemberId,
        ocm_id: participation.ocmId,
        process_instance_id: piResult.id,
    };
}

export async function applyCreateLeadChildParticipation(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityId: string;
        customerId: string;
        merged: Record<string, unknown>;
        existingPersonId?: string | null;
    }
): Promise<ApplyCreateLeadChildParticipationResult | null> {
    const parsed = parseCreateLeadChildParticipationPayload(params.merged);
    if (!parsed) return null;

    return applyCreateLeadChildParticipationFromIdentity(supabase, {
        orgId: params.orgId,
        opportunityId: params.opportunityId,
        customerId: params.customerId,
        identity: parsed.identity,
        ocm: parsed.ocm,
        existingPersonId: params.existingPersonId,
    });
}
