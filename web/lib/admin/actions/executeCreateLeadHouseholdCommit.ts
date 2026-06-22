import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyCreateLeadChildParticipationFromIdentity,
    type CreateLeadChildOcmFields,
} from "@/lib/admin/actions/createLeadChildOcmPersistence";
import type { CreateLeadCommitRecord, CreateLeadCommitSelection } from "@/lib/intake/commit/createLeadCommitSelection";
import { includedCommitRecords } from "@/lib/intake/commit/createLeadCommitSelection";
import {
    ENROLLMENT_INTAKE_PERSON_STATUS_KEY,
    enrollmentIntakePersonStatusFields,
} from "@/lib/admin/person/enrollmentPersonDefaultStatus";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

async function findOrCreateGuardianPersonInOrg(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        customerId: string;
    },
): Promise<string | null> {
    const email = trim(input.email) || null;
    const phone = trim(input.phone) || null;

    if (email || phone) {
        const found = await findOrCreatePersonInOrgWithMeta(supabase, {
            org_id: input.orgId,
            first_name: input.firstName,
            last_name: input.lastName,
            email,
            phone,
            default_status_key_on_create: ENROLLMENT_INTAKE_PERSON_STATUS_KEY,
        });
        if (found?.id) return found.id;
    }

    const { data: existingLinks } = await supabase
        .from("customer_persons")
        .select("person_id, persons!inner(first_name, last_name)")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId);

    for (const raw of existingLinks ?? []) {
        const row = raw as { person_id?: string; persons?: { first_name?: string; last_name?: string } };
        const personId = trim(row.person_id);
        const person = row.persons;
        if (!personId || !person) continue;
        if (
            trim(person.first_name).toLowerCase() === input.firstName.toLowerCase() &&
            trim(person.last_name).toLowerCase() === input.lastName.toLowerCase()
        ) {
            return personId;
        }
    }

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: input.orgId,
            first_name: input.firstName,
            last_name: input.lastName,
            email,
            phone,
            ...enrollmentIntakePersonStatusFields(),
        })
        .select("id")
        .single();

    if (error || !created) return null;
    return trim((created as { id?: string }).id) || null;
}

async function linkGuardianToHouseholdAndOpportunity(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        opportunityId: string;
        personId: string;
        isPrimary: boolean;
    },
): Promise<void> {
    const roleType = input.isPrimary ? "primary_contact" : "guardian";
    const { data: existingCp } = await supabase
        .from("customer_persons")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("person_id", input.personId)
        .maybeSingle();

    if (!existingCp?.id) {
        await supabase.from("customer_persons").insert({
            org_id: input.orgId,
            customer_id: input.customerId,
            person_id: input.personId,
            role_type: roleType,
            is_primary: input.isPrimary,
            metadata: { source: "create_lead" },
        });
    }

    const { data: existingOp } = await supabase
        .from("opportunity_persons")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("opportunity_id", input.opportunityId)
        .eq("person_id", input.personId)
        .maybeSingle();

    if (!existingOp?.id) {
        await supabase.from("opportunity_persons").insert({
            org_id: input.orgId,
            opportunity_id: input.opportunityId,
            person_id: input.personId,
            role_type: "family_member",
            metadata: {
                source: "create_lead",
                role: input.isPrimary ? "primary_guardian" : "secondary_guardian",
            },
        });
    }
}

function childOcmFromRecord(record: CreateLeadCommitRecord, merged: Record<string, unknown>): CreateLeadChildOcmFields {
    return {
        location_id: trim(merged.child_location_id) || null,
        desired_program_type: trim(record.program_interest) || trim(merged.child_program) || null,
        desired_program_category_id: trim(merged.child_program_category_id) || null,
        desired_schedule_type: trim(merged.child_desired_schedule_type) || null,
        desired_start_date: trim(record.desired_start_date) || trim(merged.child_desired_start_date) || null,
        program_room_cohort_key: trim(merged.child_program_room_cohort_key) || null,
        notes: trim(merged.child_notes) || trim(merged.intake_notes) || null,
    };
}

/** Persist additional approved guardians and children after primary create_lead writes. */
export async function applyCreateLeadHouseholdMemberCommit(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        opportunityId: string;
        merged: Record<string, unknown>;
        selection: CreateLeadCommitSelection;
        primaryPersonId: string;
    },
): Promise<void> {
    const { parents, children } = includedCommitRecords(input.selection);
    const additionalParents = parents.filter((p) => !p.primary);

    for (const parent of additionalParents) {
        const personId = await findOrCreateGuardianPersonInOrg(supabase, {
            orgId: input.orgId,
            firstName: parent.first_name,
            lastName: parent.last_name,
            email: trim(parent.email) || null,
            phone: trim(parent.phone) || null,
            customerId: input.customerId,
        });
        if (!personId || personId === input.primaryPersonId) continue;
        await linkGuardianToHouseholdAndOpportunity(supabase, {
            orgId: input.orgId,
            customerId: input.customerId,
            opportunityId: input.opportunityId,
            personId,
            isPrimary: false,
        });
    }

    const childRecords = children.filter((c) => !c.primary);
    for (const child of childRecords) {
        await applyCreateLeadChildParticipationFromIdentity(supabase, {
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            customerId: input.customerId,
            identity: {
                first_name: child.first_name,
                last_name: child.last_name,
                dob: child.dob,
                display_name: [child.first_name, child.last_name].filter(Boolean).join(" ").trim(),
            },
            ocm: childOcmFromRecord(child, input.merged),
        });
    }
}
