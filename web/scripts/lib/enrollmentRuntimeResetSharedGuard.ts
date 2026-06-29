/**
 * Shared-reference guard for DEMO_CLEANUP_MODE=enrollment_runtime_reset.
 *
 * The enrollment reset resolves persons/customers by FK-expanding the selected
 * (target) opportunities. Those persons/customers must only be deleted when they
 * are linked *exclusively* to the target opportunities. Any person/customer also
 * referenced by a non-target record (another opportunity, or a customer we are not
 * deleting) is treated as SHARED and preserved.
 *
 * `partitionSharedReferences` is the pure, unit-tested core. The async resolver
 * gathers the cross-reference rows from Supabase and delegates to it.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import { chunk } from "./demoRuntimeCleanupScope";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type SharedReferenceInput = {
    /** Opportunities selected for deletion (the only "in-scope" references). */
    targetOpportunityIds: string[];
    /** Persons resolved by FK-expanding the target opportunities. */
    candidatePersonIds: string[];
    /** Customers resolved by FK-expanding the target opportunities. */
    candidateCustomerIds: string[];
    /** Opportunities (target or not) that reference a candidate person/customer. */
    opportunityRefs: Array<{ id: string; customer_id: string | null; primary_person_id: string | null }>;
    /** opportunity_persons join rows referencing a candidate person. */
    opportunityPersonRefs: Array<{ opportunity_id: string; person_id: string }>;
    /** customer_members + customer_persons rows linking a candidate person to any customer. */
    personCustomerLinks: Array<{ customer_id: string; person_id: string }>;
};

export type SharedReferencePartition = {
    deletablePersonIds: string[];
    deletableCustomerIds: string[];
    sharedPersonIds: string[];
    sharedCustomerIds: string[];
};

/**
 * Partition candidate persons/customers into deletable vs shared.
 *
 * A customer is SHARED if any opportunity outside the target set references it.
 * A person is SHARED if any of these hold:
 *   - a non-target opportunity references it (primary_person_id or opportunity_persons), or
 *   - it is linked to a customer we are NOT deleting (shared customer, or a customer
 *     entirely outside the candidate set).
 */
export function partitionSharedReferences(input: SharedReferenceInput): SharedReferencePartition {
    const targetOpps = new Set(input.targetOpportunityIds);
    const candidateCustomers = new Set(input.candidateCustomerIds);
    const candidatePersons = new Set(input.candidatePersonIds);

    const sharedCustomers = new Set<string>();
    for (const o of input.opportunityRefs) {
        if (o.customer_id && candidateCustomers.has(o.customer_id) && !targetOpps.has(o.id)) {
            sharedCustomers.add(o.customer_id);
        }
    }
    const deletableCustomers = new Set([...candidateCustomers].filter((c) => !sharedCustomers.has(c)));

    const sharedPersons = new Set<string>();
    for (const o of input.opportunityRefs) {
        if (o.primary_person_id && candidatePersons.has(o.primary_person_id) && !targetOpps.has(o.id)) {
            sharedPersons.add(o.primary_person_id);
        }
    }
    for (const op of input.opportunityPersonRefs) {
        if (candidatePersons.has(op.person_id) && !targetOpps.has(op.opportunity_id)) {
            sharedPersons.add(op.person_id);
        }
    }
    for (const link of input.personCustomerLinks) {
        // Linked to a customer that is not being deleted → person is shared.
        if (candidatePersons.has(link.person_id) && !deletableCustomers.has(link.customer_id)) {
            sharedPersons.add(link.person_id);
        }
    }
    const deletablePersons = new Set([...candidatePersons].filter((p) => !sharedPersons.has(p)));

    return {
        deletablePersonIds: [...deletablePersons],
        deletableCustomerIds: [...deletableCustomers],
        sharedPersonIds: [...sharedPersons],
        sharedCustomerIds: [...sharedCustomers],
    };
}

async function collectOpportunityRefs(
    supabase: SupabaseAdmin,
    orgId: string,
    candidatePersonIds: string[],
    candidateCustomerIds: string[]
): Promise<SharedReferenceInput["opportunityRefs"]> {
    const byId = new Map<string, { id: string; customer_id: string | null; primary_person_id: string | null }>();
    const ingest = (rows: Array<Record<string, unknown>> | null) => {
        for (const r of rows ?? []) {
            const id = typeof r.id === "string" ? r.id : null;
            if (!id) continue;
            byId.set(id, {
                id,
                customer_id: typeof r.customer_id === "string" ? r.customer_id : null,
                primary_person_id: typeof r.primary_person_id === "string" ? r.primary_person_id : null,
            });
        }
    };

    for (const part of chunk(candidateCustomerIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, customer_id, primary_person_id")
            .eq("org_id", orgId)
            .in("customer_id", part);
        if (error) throw new Error(`[shared-guard opportunities by customer] ${error.message}`);
        ingest((data ?? []) as Array<Record<string, unknown>>);
    }
    for (const part of chunk(candidatePersonIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, customer_id, primary_person_id")
            .eq("org_id", orgId)
            .in("primary_person_id", part);
        if (error) throw new Error(`[shared-guard opportunities by primary_person] ${error.message}`);
        ingest((data ?? []) as Array<Record<string, unknown>>);
    }

    return [...byId.values()];
}

async function collectOpportunityPersonRefs(
    supabase: SupabaseAdmin,
    orgId: string,
    candidatePersonIds: string[]
): Promise<SharedReferenceInput["opportunityPersonRefs"]> {
    const out: SharedReferenceInput["opportunityPersonRefs"] = [];
    for (const part of chunk(candidatePersonIds, 200)) {
        const { data, error } = await supabase
            .from("opportunity_persons")
            .select("opportunity_id, person_id")
            .eq("org_id", orgId)
            .in("person_id", part);
        if (error) throw new Error(`[shared-guard opportunity_persons] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { opportunity_id?: string; person_id?: string };
            if (row.opportunity_id && row.person_id) {
                out.push({ opportunity_id: row.opportunity_id, person_id: row.person_id });
            }
        }
    }
    return out;
}

async function collectPersonCustomerLinks(
    supabase: SupabaseAdmin,
    orgId: string,
    candidatePersonIds: string[]
): Promise<SharedReferenceInput["personCustomerLinks"]> {
    const out: SharedReferenceInput["personCustomerLinks"] = [];
    for (const table of ["customer_members", "customer_persons"] as const) {
        for (const part of chunk(candidatePersonIds, 200)) {
            const { data, error } = await supabase
                .from(table)
                .select("customer_id, person_id")
                .eq("org_id", orgId)
                .in("person_id", part);
            if (error) throw new Error(`[shared-guard ${table}] ${error.message}`);
            for (const r of data ?? []) {
                const row = r as { customer_id?: string; person_id?: string };
                if (row.customer_id && row.person_id) {
                    out.push({ customer_id: row.customer_id, person_id: row.person_id });
                }
            }
        }
    }
    return out;
}

/**
 * Resolve which FK-expanded persons/customers are safe to delete (only linked to
 * the target opportunities) vs shared (linked to non-target records → preserve).
 */
export async function resolveEnrollmentResetSharedReferences(
    supabase: SupabaseAdmin,
    orgId: string,
    targetOpportunityIds: string[],
    candidatePersonIds: string[],
    candidateCustomerIds: string[]
): Promise<SharedReferencePartition> {
    if (!candidatePersonIds.length && !candidateCustomerIds.length) {
        return { deletablePersonIds: [], deletableCustomerIds: [], sharedPersonIds: [], sharedCustomerIds: [] };
    }

    const [opportunityRefs, opportunityPersonRefs, personCustomerLinks] = await Promise.all([
        collectOpportunityRefs(supabase, orgId, candidatePersonIds, candidateCustomerIds),
        collectOpportunityPersonRefs(supabase, orgId, candidatePersonIds),
        collectPersonCustomerLinks(supabase, orgId, candidatePersonIds),
    ]);

    return partitionSharedReferences({
        targetOpportunityIds,
        candidatePersonIds,
        candidateCustomerIds,
        opportunityRefs,
        opportunityPersonRefs,
        personCustomerLinks,
    });
}
