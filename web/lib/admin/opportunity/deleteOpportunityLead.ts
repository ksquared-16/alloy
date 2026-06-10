import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminAudit } from "@/lib/adminAuth";

export type OpportunityLeadDeletionPreview = {
    opportunity_id: string;
    opportunity_name: string | null;
    counts: {
        opportunities: number;
        enrollment_records: number;
        parents: number;
        children: number;
        customer_members: number;
        customers: number;
        placement_candidates: number;
    };
    deletable: {
        persons: number;
        customers: number;
        customer_members: number;
    };
    blocked: boolean;
    block_reason: string | null;
};

export type OpportunityLeadDeletionResult = {
    deleted: Record<string, number>;
    orphans: Record<string, number>;
    audit_logged: boolean;
};

type OpportunityLeadDeletionScope = {
    orgId: string;
    opportunityId: string;
    customerId: string | null;
    customerMemberIds: string[];
    personIds: string[];
};

async function loadOpportunityRow(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<{ id: string; name: string | null; customer_id: string | null } | null> {
    const { data, error } = await supabase
        .from("opportunities")
        .select("id, name, customer_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .maybeSingle();
    if (error) throw new Error(`load opportunity: ${error.message}`);
    if (!data) return null;
    return {
        id: String(data.id),
        name: typeof data.name === "string" ? data.name : null,
        customer_id: typeof data.customer_id === "string" ? data.customer_id : null,
    };
}

async function countByOpportunity(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    opportunityId: string
): Promise<number> {
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return count ?? 0;
}

async function loadDeletionScope(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerId: string | null
): Promise<OpportunityLeadDeletionScope> {
    const [ocmRes, oppPersonsRes, oppRow] = await Promise.all([
        supabase
            .from("opportunity_customer_members")
            .select("id, customer_member_id")
            .eq("org_id", orgId)
            .eq("opportunity_id", opportunityId),
        supabase
            .from("opportunity_persons")
            .select("person_id")
            .eq("org_id", orgId)
            .eq("opportunity_id", opportunityId),
        supabase
            .from("opportunities")
            .select("primary_person_id")
            .eq("org_id", orgId)
            .eq("id", opportunityId)
            .maybeSingle(),
    ]);

    if (ocmRes.error) throw new Error(`load OCM: ${ocmRes.error.message}`);
    if (oppPersonsRes.error) throw new Error(`load opportunity_persons: ${oppPersonsRes.error.message}`);
    if (oppRow.error) throw new Error(`load opportunity primary person: ${oppRow.error.message}`);

    const customerMemberIds = new Set<string>();
    for (const row of ocmRes.data ?? []) {
        const id = typeof row.customer_member_id === "string" ? row.customer_member_id.trim() : "";
        if (id) customerMemberIds.add(id);
    }

    const personIds = new Set<string>();
    const primaryPersonId =
        typeof oppRow.data?.primary_person_id === "string" ? oppRow.data.primary_person_id.trim() : "";
    if (primaryPersonId) personIds.add(primaryPersonId);
    for (const row of oppPersonsRes.data ?? []) {
        const id = typeof row.person_id === "string" ? row.person_id.trim() : "";
        if (id) personIds.add(id);
    }

    if (customerMemberIds.size > 0) {
        const { data: members, error } = await supabase
            .from("customer_members")
            .select("id, person_id, relationship")
            .eq("org_id", orgId)
            .in("id", [...customerMemberIds]);
        if (error) throw new Error(`load customer_members: ${error.message}`);
        for (const row of members ?? []) {
            const personId = typeof row.person_id === "string" ? row.person_id.trim() : "";
            if (personId) personIds.add(personId);
        }
    }

    if (customerId) {
        const { data: householdMembers, error } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        if (error) throw new Error(`load household members: ${error.message}`);
        for (const row of householdMembers ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) customerMemberIds.add(id);
        }
    }

    return {
        orgId,
        opportunityId,
        customerId,
        customerMemberIds: [...customerMemberIds],
        personIds: [...personIds],
    };
}

async function countChildMembers(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberIds: string[]
): Promise<number> {
    if (!customerMemberIds.length) return 0;
    const { count, error } = await supabase
        .from("customer_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .in("id", customerMemberIds)
        .eq("relationship", "child");
    if (error) throw new Error(`count child members: ${error.message}`);
    return count ?? 0;
}

async function countLinkedJobs(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<number> {
    const { count, error } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);
    if (error) throw new Error(`count jobs: ${error.message}`);
    return count ?? 0;
}

async function personHasRemainingReferences(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    excludeOpportunityId: string
): Promise<boolean> {
    const checks = await Promise.all([
        supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("primary_person_id", personId)
            .neq("id", excludeOpportunityId),
        supabase
            .from("opportunity_persons")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("person_id", personId)
            .neq("opportunity_id", excludeOpportunityId),
        supabase
            .from("customer_persons")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("person_id", personId),
        supabase
            .from("customer_members")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("person_id", personId),
    ]);

    for (const res of checks) {
        if (res.error) throw new Error(`person reference check: ${res.error.message}`);
        if ((res.count ?? 0) > 0) return true;
    }
    return false;
}

async function customerHasRemainingReferences(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    excludeOpportunityId: string
): Promise<boolean> {
    const [oppRes, jobRes] = await Promise.all([
        supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .neq("id", excludeOpportunityId),
        supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("customer_id", customerId),
    ]);
    if (oppRes.error) throw new Error(`customer opportunity refs: ${oppRes.error.message}`);
    if (jobRes.error) throw new Error(`customer job refs: ${jobRes.error.message}`);
    return (oppRes.count ?? 0) > 0 || (jobRes.count ?? 0) > 0;
}

async function customerMemberHasRemainingOcmReferences(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    excludeOpportunityId: string
): Promise<boolean> {
    const { count, error } = await supabase
        .from("opportunity_customer_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .neq("opportunity_id", excludeOpportunityId);
    if (error) throw new Error(`customer_member OCM refs: ${error.message}`);
    return (count ?? 0) > 0;
}

export async function previewOpportunityLeadDeletion(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<OpportunityLeadDeletionPreview | null> {
    const opp = await loadOpportunityRow(supabase, orgId, opportunityId);
    if (!opp) return null;

    const scope = await loadDeletionScope(supabase, orgId, opportunityId, opp.customer_id);
    const [enrollmentRecords, parents, children, placementCandidates, linkedJobs] = await Promise.all([
        countByOpportunity(supabase, "opportunity_customer_members", orgId, opportunityId),
        countByOpportunity(supabase, "opportunity_persons", orgId, opportunityId),
        countChildMembers(supabase, orgId, scope.customerMemberIds),
        countByOpportunity(supabase, "placement_candidates", orgId, opportunityId),
        countLinkedJobs(supabase, orgId, opportunityId),
    ]);

    let deletablePersons = 0;
    for (const personId of scope.personIds) {
        const hasRefs = await personHasRemainingReferences(supabase, orgId, personId, opportunityId);
        if (!hasRefs) deletablePersons += 1;
    }

    let deletableCustomerMembers = 0;
    for (const memberId of scope.customerMemberIds) {
        const hasRefs = await customerMemberHasRemainingOcmReferences(
            supabase,
            orgId,
            memberId,
            opportunityId
        );
        if (!hasRefs) deletableCustomerMembers += 1;
    }

    let deletableCustomers = 0;
    if (opp.customer_id) {
        const hasRefs = await customerHasRemainingReferences(supabase, orgId, opp.customer_id, opportunityId);
        if (!hasRefs) deletableCustomers = 1;
    }

    const blocked = linkedJobs > 0;
    const blockReason =
        blocked ?
            "This lead has linked jobs. Financial and job record deletion is not supported in this workflow."
        :   null;

    return {
        opportunity_id: opportunityId,
        opportunity_name: opp.name,
        counts: {
            opportunities: 1,
            enrollment_records: enrollmentRecords,
            parents,
            children,
            customer_members: scope.customerMemberIds.length,
            customers: opp.customer_id ? 1 : 0,
            placement_candidates: placementCandidates,
        },
        deletable: {
            persons: deletablePersons,
            customers: deletableCustomers,
            customer_members: deletableCustomerMembers,
        },
        blocked,
        block_reason: blockReason,
    };
}

async function deleteRowsByIds(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    ids: string[]
): Promise<number> {
    if (!ids.length) return 0;
    const { data, error } = await supabase.from(table).delete().eq("org_id", orgId).in("id", ids).select("id");
    if (error) throw new Error(`delete ${table}: ${error.message}`);
    return (data ?? []).length;
}

export async function executeDeleteOpportunityLead(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actorUserId: string;
    actorRole: string;
}): Promise<OpportunityLeadDeletionResult> {
    const { supabase, orgId, opportunityId, actorUserId, actorRole } = params;

    const preview = await previewOpportunityLeadDeletion(supabase, orgId, opportunityId);
    if (!preview) throw new Error("Opportunity not found");
    if (preview.blocked) throw new Error(preview.block_reason ?? "Deletion blocked");

    const opp = await loadOpportunityRow(supabase, orgId, opportunityId);
    if (!opp) throw new Error("Opportunity not found");

    const scopeWithCustomer = await loadDeletionScope(supabase, orgId, opportunityId, opp.customer_id);
    const deleted: Record<string, number> = {};

    deleted.placement_candidates = await countByOpportunity(
        supabase,
        "placement_candidates",
        orgId,
        opportunityId
    );
    const { error: pcErr } = await supabase
        .from("placement_candidates")
        .delete()
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);
    if (pcErr) throw new Error(`delete placement_candidates: ${pcErr.message}`);

    const { error: oppErr } = await supabase
        .from("opportunities")
        .delete()
        .eq("org_id", orgId)
        .eq("id", opportunityId);
    if (oppErr) throw new Error(`delete opportunity: ${oppErr.message}`);
    deleted.opportunities = 1;
    deleted.opportunity_customer_members = preview.counts.enrollment_records;
    deleted.opportunity_persons = preview.counts.parents;

    const memberIdsToDelete: string[] = [];
    for (const memberId of scopeWithCustomer.customerMemberIds) {
        const hasRefs = await customerMemberHasRemainingOcmReferences(supabase, orgId, memberId, opportunityId);
        if (!hasRefs) memberIdsToDelete.push(memberId);
    }
    deleted.customer_members = await deleteRowsByIds(supabase, "customer_members", orgId, memberIdsToDelete);

    const personIdsToDelete: string[] = [];
    for (const personId of scopeWithCustomer.personIds) {
        const hasRefs = await personHasRemainingReferences(supabase, orgId, personId, opportunityId);
        if (!hasRefs) personIdsToDelete.push(personId);
    }
    deleted.persons = await deleteRowsByIds(supabase, "persons", orgId, personIdsToDelete);

    if (opp.customer_id) {
        const hasRefs = await customerHasRemainingReferences(supabase, orgId, opp.customer_id, opportunityId);
        if (!hasRefs) {
            const { data, error } = await supabase
                .from("customers")
                .delete()
                .eq("org_id", orgId)
                .eq("id", opp.customer_id)
                .select("id");
            if (error) throw new Error(`delete customer: ${error.message}`);
            deleted.customers = (data ?? []).length;
        } else {
            deleted.customers = 0;
        }
    } else {
        deleted.customers = 0;
    }

    const orphans = await verifyOpportunityLeadDeletionOrphans(supabase, orgId, opportunityId);

    logAdminAudit({
        entity: "opportunities",
        id: opportunityId,
        changed_fields: ["deleted"],
        actor_user_id: actorUserId,
        role: actorRole,
    });

    return { deleted, orphans, audit_logged: true };
}

export async function verifyOpportunityLeadDeletionOrphans(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<Record<string, number>> {
    const scopedTables = [
        "opportunity_customer_members",
        "opportunity_persons",
        "placement_candidates",
    ] as const;
    const orphans: Record<string, number> = {};

    const { count: oppCount, error: oppErr } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("id", opportunityId);
    if (oppErr) throw new Error(`orphan check opportunities: ${oppErr.message}`);
    orphans.opportunities = oppCount ?? 0;

    for (const table of scopedTables) {
        const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("opportunity_id", opportunityId);
        if (error) throw new Error(`orphan check ${table}: ${error.message}`);
        orphans[table] = count ?? 0;
    }
    return orphans;
}
