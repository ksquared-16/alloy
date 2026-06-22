/**
 * Create Lead → inquiry child participation (customer_member + OCM).
 * Stores stable keys/IDs only — never display labels.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { findOrCreateChildPersonInOrg } from "@/lib/admin/person/findOrCreateChildPersonInOrg";
import { enrichOcmProgramCategoryFields } from "@/lib/locations/resolveOcmProgramCategoryFields";

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
    desired_program_type: string | null;
    desired_program_category_id: string | null;
    desired_schedule_type: string | null;
    desired_start_date: string | null;
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
        // Lead-level location_id belongs on the opportunity — never infer child participation from it.
        location_id: trimUuid(merged.child_location_id),
        desired_program_type:
            trimStableKey(merged.child_program) ?? trimStableKey(merged.desired_program_type),
        desired_program_category_id:
            trimUuid(merged.child_program_category_id) ??
            trimUuid(merged.desired_program_category_id),
        desired_schedule_type:
            trimStableKey(merged.child_desired_schedule_type) ?? trimStableKey(merged.desired_schedule_type),
        desired_start_date:
            trimDateOnly(merged.child_desired_start_date) ?? trimDateOnly(merged.desired_start_date),
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
        outcome_status_key: NEW_LEAD_STATUS_KEY,
        metadata: { source: "create_lead" },
        ...(ocm.location_id ? { location_id: ocm.location_id } : {}),
        ...(ocm.desired_program_type ? { desired_program_type: ocm.desired_program_type } : {}),
        ...(ocm.desired_program_category_id
            ? { desired_program_category_id: ocm.desired_program_category_id }
            : {}),
        ...(ocm.desired_schedule_type ? { desired_schedule_type: ocm.desired_schedule_type } : {}),
        ...(ocm.desired_start_date ? { desired_start_date: ocm.desired_start_date } : {}),
        ...(ocm.program_room_cohort_key ? { program_room_cohort_key: ocm.program_room_cohort_key } : {}),
        ...(ocm.notes ? { notes: ocm.notes } : {}),
    };
}

export type ApplyCreateLeadChildParticipationResult = {
    customer_member_id: string;
    ocm_id: string;
};

export async function applyCreateLeadChildParticipationFromIdentity(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityId: string;
        customerId: string;
        identity: CreateLeadChildIdentity;
        ocm: CreateLeadChildOcmFields;
    },
): Promise<ApplyCreateLeadChildParticipationResult> {
    const firstName = params.identity.first_name ?? "";
    const lastName = params.identity.last_name ?? "";
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

    const cmPayload: Record<string, unknown> = {
        org_id: params.orgId,
        customer_id: params.customerId,
        person_id: childPerson.person_id,
        display_name: params.identity.display_name,
        first_name: params.identity.first_name,
        last_name: params.identity.last_name,
        dob: params.identity.dob,
        relationship: "child",
        is_active: true,
        metadata: { source: "create_lead" },
    };

    const { data: cm, error: cmErr } = await supabase
        .from("customer_members")
        .insert(cmPayload)
        .select("id")
        .single();
    if (cmErr || !cm) {
        throw new Error(cmErr?.message ?? "Could not create child record for lead.");
    }
    const customerMemberId = String((cm as { id: string }).id);

    const enrichedProgram = await enrichOcmProgramCategoryFields(supabase, {
        orgId: params.orgId,
        locationId: params.ocm.location_id,
        desiredProgramType: params.ocm.desired_program_type,
        desiredProgramCategoryId: params.ocm.desired_program_category_id,
    });
    const ocmRow = buildCreateLeadOcmInsertRow({
        orgId: params.orgId,
        opportunityId: params.opportunityId,
        customerMemberId,
        ocm: {
            ...params.ocm,
            desired_program_type: enrichedProgram.desired_program_type,
            desired_program_category_id: enrichedProgram.desired_program_category_id,
        },
    });

    const { data: ocmData, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .insert(ocmRow)
        .select("id")
        .single();
    if (ocmErr || !ocmData) {
        throw new Error(ocmErr?.message ?? "Could not link child participation to lead.");
    }

    return {
        customer_member_id: customerMemberId,
        ocm_id: String((ocmData as { id: string }).id),
    };
}

export async function applyCreateLeadChildParticipation(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityId: string;
        customerId: string;
        merged: Record<string, unknown>;
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
    });
}
