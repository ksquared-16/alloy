/**
 * Create Lead → layout runtime persistence orchestrator (Phases A, C, D).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { persistCreateLeadAddressFromIntake } from "@/lib/admin/actions/createLeadAddressPersistence";
import { persistCreateLeadChildScopedContacts } from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import { persistCreateLeadRoleContacts } from "@/lib/admin/actions/createLeadRoleContactPersistence";

export type ApplyCreateLeadLayoutRuntimePersistenceInput = {
    orgId: string;
    customerId: string;
    opportunityId: string;
    primaryPersonId: string;
    merged: Record<string, unknown>;
    selection?: CreateLeadCommitSelection | null;
};

export type ApplyCreateLeadLayoutRuntimePersistenceResult = {
    child_scoped_contacts: {
        links_written: number;
        links_skipped_invalid_role: number;
        assignment_count: number;
    };
    address: {
        household: { path: "locations" | "none"; location_id: string | null };
        person: { path: "field_values" | "none"; keys_written: string[] };
    };
    role_contacts: {
        customer_person_roles: string[];
        opportunity_person_roles: string[];
    };
};

/** Persist layout-runtime durable rows after core create_lead graph writes. */
export async function applyCreateLeadLayoutRuntimePersistence(
    supabase: SupabaseClient,
    input: ApplyCreateLeadLayoutRuntimePersistenceInput,
): Promise<ApplyCreateLeadLayoutRuntimePersistenceResult> {
    const roleContacts = await persistCreateLeadRoleContacts(supabase, {
        orgId: input.orgId,
        customerId: input.customerId,
        opportunityId: input.opportunityId,
        primaryPersonId: input.primaryPersonId,
        selection: input.selection,
    });

    const childScopedContacts = await persistCreateLeadChildScopedContacts(supabase, {
        orgId: input.orgId,
        customerId: input.customerId,
        opportunityId: input.opportunityId,
        primaryPersonId: input.primaryPersonId,
        selection: input.selection,
    });

    const address = await persistCreateLeadAddressFromIntake(supabase, {
        orgId: input.orgId,
        customerId: input.customerId,
        primaryPersonId: input.primaryPersonId,
        selection: input.selection,
        merged: input.merged,
    });

    return {
        child_scoped_contacts: childScopedContacts,
        address,
        role_contacts: roleContacts,
    };
}
