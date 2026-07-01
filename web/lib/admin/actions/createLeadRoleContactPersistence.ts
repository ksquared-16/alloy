/**
 * Create Lead → explicit opportunity / household role contacts (Phase D).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    buildGuardianRowsFromCommitSelection,
    classifyParentContactRole,
    type ParentContactClassification,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import { includedCommitRecords } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function normRoleKey(raw: unknown): string {
    return trim(raw).toLowerCase().replace(/\s+/g, "_");
}

const CUSTOMER_PERSON_ROLE_BY_CLASSIFICATION: Record<Exclude<ParentContactClassification, "guardian">, string[]> = {
    emergency: ["emergency_contact", "emergency"],
    billing: ["billing_contact", "payer", "billing"],
};

const OPPORTUNITY_PERSON_ROLE_BY_CLASSIFICATION: Record<Exclude<ParentContactClassification, "guardian">, string[]> = {
    emergency: ["emergency_contact", "emergency"],
    billing: ["billing_contact", "payer", "billing"],
};

function pickCustomerPersonRoleType(classification: Exclude<ParentContactClassification, "guardian">): string {
    return CUSTOMER_PERSON_ROLE_BY_CLASSIFICATION[classification][0]!;
}

function pickOpportunityPersonRoleType(classification: Exclude<ParentContactClassification, "guardian">): string {
    return OPPORTUNITY_PERSON_ROLE_BY_CLASSIFICATION[classification][0]!;
}

export async function ensureCustomerPersonRoleLink(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        personId: string;
        roleType: string;
        isPrimary?: boolean;
    },
): Promise<void> {
    const { data: existing } = await supabase
        .from("customer_persons")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("person_id", input.personId)
        .eq("role_type", input.roleType)
        .maybeSingle();

    if (existing?.id) return;

    const { error } = await supabase.from("customer_persons").insert({
        org_id: input.orgId,
        customer_id: input.customerId,
        person_id: input.personId,
        role_type: input.roleType,
        is_primary: Boolean(input.isPrimary),
        metadata: { source: "create_lead" },
    });
    if (error?.code === "23505") return;
    if (error) {
        throw new Error(error.message ?? "Could not ensure customer_persons role link.");
    }
}

export async function ensureOpportunityPersonExplicitRole(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        opportunityId: string;
        personId: string;
        roleType: string;
        metadata?: Record<string, unknown>;
    },
): Promise<void> {
    const { data: existing } = await supabase
        .from("opportunity_persons")
        .select("id, role_type, metadata")
        .eq("org_id", input.orgId)
        .eq("opportunity_id", input.opportunityId)
        .eq("person_id", input.personId)
        .maybeSingle();

    if (!existing?.id) {
        const { error } = await supabase.from("opportunity_persons").insert({
            org_id: input.orgId,
            opportunity_id: input.opportunityId,
            person_id: input.personId,
            role_type: input.roleType,
            metadata: { source: "create_lead", ...(input.metadata ?? {}) },
        });
        if (error?.code === "23505") return;
        if (error) throw new Error(error.message ?? "Could not link opportunity person role.");
        return;
    }

    const currentRole = normRoleKey((existing as { role_type?: string }).role_type);
    const targetRole = normRoleKey(input.roleType);
    if (currentRole === targetRole) return;

    const { error: updateErr } = await supabase
        .from("opportunity_persons")
        .update({
            role_type: input.roleType,
            metadata: {
                ...(((existing as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>),
                source: "create_lead",
                ...(input.metadata ?? {}),
            },
        })
        .eq("id", (existing as { id: string }).id);
    if (updateErr) {
        throw new Error(updateErr.message ?? "Could not update opportunity person role.");
    }
}

export async function persistCreateLeadRoleContacts(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        opportunityId: string;
        primaryPersonId: string;
        selection?: CreateLeadCommitSelection | null;
    },
): Promise<{ customer_person_roles: string[]; opportunity_person_roles: string[] }> {
    const guardians = buildGuardianRowsFromCommitSelection({
        selection: input.selection ?? null,
        primaryPersonId: input.primaryPersonId,
    });

    const customerPersonRoles: string[] = [];
    const opportunityPersonRoles: string[] = [];

    for (const guardian of guardians) {
        const record = guardian.commit_record;
        if (!record) continue;
        const classification = classifyParentContactRole(record);
        if (classification === "guardian") continue;

        const customerRole = pickCustomerPersonRoleType(classification);
        const opportunityRole = pickOpportunityPersonRoleType(classification);

        await ensureCustomerPersonRoleLink(supabase, {
            orgId: input.orgId,
            customerId: input.customerId,
            personId: guardian.person_id,
            roleType: customerRole,
            isPrimary: false,
        });
        customerPersonRoles.push(`${guardian.person_id}:${customerRole}`);

        await ensureOpportunityPersonExplicitRole(supabase, {
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            personId: guardian.person_id,
            roleType: opportunityRole,
            metadata: { contact_classification: classification },
        });
        opportunityPersonRoles.push(`${guardian.person_id}:${opportunityRole}`);
    }

    // Secondary guardian opportunity metadata (unchanged primary_person_id behavior).
    if (input.selection) {
        for (const parent of includedCommitRecords(input.selection).parents) {
            if (parent.primary) continue;
            if (classifyParentContactRole(parent) !== "guardian") continue;
            const personId = linkedPersonIdFromCommitRecord(parent);
            if (!personId || personId === input.primaryPersonId) continue;
            await ensureOpportunityPersonExplicitRole(supabase, {
                orgId: input.orgId,
                opportunityId: input.opportunityId,
                personId,
                roleType: "family_member",
                metadata: { source: "create_lead", role: "secondary_guardian" },
            });
        }
    }

    return {
        customer_person_roles: customerPersonRoles,
        opportunity_person_roles: opportunityPersonRoles,
    };
}
