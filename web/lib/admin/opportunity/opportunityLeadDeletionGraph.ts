import type { SupabaseClient } from "@supabase/supabase-js";

import {
    chunkIds,
    countByEq,
    countByIn,
    selectIdsByIn,
} from "@/lib/admin/opportunity/opportunityLeadDeletionDb";

export type OpportunityLeadDeletionPreview = {
    opportunity_id: string;
    opportunity_name: string | null;
    blocked: boolean;
    block_reason: string | null;
    will_delete: {
        opportunities: number;
        enrollment_records: number;
        adults: number;
        children: number;
        customer_members: number;
        customers: number;
        persons: number;
        tasks: number;
        communication_threads: number;
        communication_messages: number;
        communication_scheduled_sends: number;
        documents: number;
        form_submissions: number;
        placement_candidates: number;
        field_values: number;
    };
    will_retain: {
        customers: number;
        persons: number;
        customer_members: number;
    };
    /** @deprecated Use will_delete — kept for modal compatibility. */
    counts: {
        opportunities: number;
        enrollment_records: number;
        parents: number;
        children: number;
        customer_members: number;
        customers: number;
        placement_candidates: number;
    };
    /** @deprecated Use will_delete — kept for modal compatibility. */
    deletable: {
        persons: number;
        customers: number;
        customer_members: number;
    };
};

export type OpportunityLeadDeletionGraph = {
    orgId: string;
    opportunityId: string;
    opportunityName: string | null;
    customerId: string | null;
    scopedCustomerMemberIds: string[];
    scopedPersonIds: string[];
    adultPersonIds: string[];
    childPersonIds: string[];
    deletableCustomerId: string | null;
    deletableCustomerMemberIds: string[];
    deletablePersonIds: string[];
    threadIds: string[];
    formSubmissionIds: string[];
    documentIds: string[];
    blocked: boolean;
    blockReason: string | null;
};

type HouseholdMemberRow = {
    id: string;
    person_id: string | null;
    relationship: string | null;
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

async function countLinkedJobs(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<number> {
    return countByEq(supabase, "jobs", { opportunity_id: opportunityId }, orgId);
}

async function countLinkedDiscountRedemptions(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<number> {
    return countByEq(supabase, "discount_redemptions", { opportunity_id: opportunityId });
}

async function loadScopedHousehold(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerId: string | null
): Promise<{
    customerMemberIds: string[];
    personIds: string[];
    adultPersonIds: string[];
    childPersonIds: string[];
    enrollmentRecordCount: number;
}> {
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

    const memberRows: HouseholdMemberRow[] = [];
    if (customerMemberIds.size > 0) {
        const { data: members, error } = await supabase
            .from("customer_members")
            .select("id, person_id, relationship")
            .eq("org_id", orgId)
            .in("id", [...customerMemberIds]);
        if (error) throw new Error(`load customer_members: ${error.message}`);
        for (const row of members ?? []) {
            memberRows.push({
                id: String(row.id),
                person_id: typeof row.person_id === "string" ? row.person_id.trim() : null,
                relationship: typeof row.relationship === "string" ? row.relationship.trim() : null,
            });
            const personId = typeof row.person_id === "string" ? row.person_id.trim() : "";
            if (personId) personIds.add(personId);
        }
    }

    if (customerId) {
        const { data: householdMembers, error } = await supabase
            .from("customer_members")
            .select("id, person_id, relationship")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        if (error) throw new Error(`load household members: ${error.message}`);
        for (const row of householdMembers ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) customerMemberIds.add(id);
            memberRows.push({
                id,
                person_id: typeof row.person_id === "string" ? row.person_id.trim() : null,
                relationship: typeof row.relationship === "string" ? row.relationship.trim() : null,
            });
            const personId = typeof row.person_id === "string" ? row.person_id.trim() : "";
            if (personId) personIds.add(personId);
        }
    }

    const childPersonIds = new Set<string>();
    const adultPersonIds = new Set<string>();
    for (const member of memberRows) {
        if (!member.person_id) continue;
        if (member.relationship === "child") childPersonIds.add(member.person_id);
        else adultPersonIds.add(member.person_id);
    }
    for (const pid of personIds) {
        if (!childPersonIds.has(pid)) adultPersonIds.add(pid);
    }

    return {
        customerMemberIds: [...customerMemberIds],
        personIds: [...personIds],
        adultPersonIds: [...adultPersonIds],
        childPersonIds: [...childPersonIds],
        enrollmentRecordCount: (ocmRes.data ?? []).length,
    };
}

export async function customerHasBlockingReferences(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    excludingOpportunityId: string
): Promise<boolean> {
    const [oppRes, jobRes] = await Promise.all([
        supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .neq("id", excludingOpportunityId),
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

export async function customerMemberHasBlockingOcmReferences(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    excludingOpportunityId: string
): Promise<boolean> {
    const { count, error } = await supabase
        .from("opportunity_customer_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .neq("opportunity_id", excludingOpportunityId);
    if (error) throw new Error(`customer_member OCM refs: ${error.message}`);
    return (count ?? 0) > 0;
}

export async function personHasBlockingReferences(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    ctx: {
        excludingOpportunityId: string;
        deletableCustomerIds: ReadonlySet<string>;
        deletableCustomerMemberIds: ReadonlySet<string>;
    }
): Promise<boolean> {
    const checks = await Promise.all([
        supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("primary_person_id", personId)
            .neq("id", ctx.excludingOpportunityId),
        supabase
            .from("opportunity_persons")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("person_id", personId)
            .neq("opportunity_id", ctx.excludingOpportunityId),
        supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("primary_person_id", personId),
        supabase
            .from("vendors")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("primary_person_id", personId),
    ]);

    for (const res of checks) {
        if (res.error) throw new Error(`person reference check: ${res.error.message}`);
        if ((res.count ?? 0) > 0) return true;
    }

    const { data: memberRows, error: memberErr } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("person_id", personId);
    if (memberErr) throw new Error(`person customer_members refs: ${memberErr.message}`);
    for (const row of memberRows ?? []) {
        const memberId = typeof row.id === "string" ? row.id.trim() : "";
        if (memberId && !ctx.deletableCustomerMemberIds.has(memberId)) return true;
    }

    const { data: cpRows, error: cpErr } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", personId);
    if (cpErr) throw new Error(`person customer_persons refs: ${cpErr.message}`);
    for (const row of cpRows ?? []) {
        const customerId = typeof row.customer_id === "string" ? row.customer_id.trim() : "";
        if (customerId && !ctx.deletableCustomerIds.has(customerId)) return true;
    }

    return false;
}

async function resolveCommunicationThreadIds(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    deletableCustomerId: string | null,
    deletablePersonIds: readonly string[]
): Promise<string[]> {
    const threadIds = new Set<string>();

    const oppThreads = await supabase
        .from("communication_threads")
        .select("id")
        .eq("org_id", orgId)
        .in("primary_entity_type", ["opportunities", "opportunity"])
        .eq("primary_entity_id", opportunityId);
    if (oppThreads.error) throw new Error(`load opp threads: ${oppThreads.error.message}`);
    for (const row of oppThreads.data ?? []) {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (id) threadIds.add(id);
    }

    if (deletableCustomerId) {
        const custThreads = await supabase
            .from("communication_threads")
            .select("id")
            .eq("org_id", orgId)
            .in("primary_entity_type", ["customers", "customer"])
            .eq("primary_entity_id", deletableCustomerId);
        if (custThreads.error) throw new Error(`load customer threads: ${custThreads.error.message}`);
        for (const row of custThreads.data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) threadIds.add(id);
        }
    }

    for (const part of chunkIds(deletablePersonIds)) {
        const personThreads = await supabase
            .from("communication_threads")
            .select("id")
            .eq("org_id", orgId)
            .in("primary_entity_type", ["persons", "person", "child"])
            .in("primary_entity_id", part);
        if (personThreads.error) throw new Error(`load person threads: ${personThreads.error.message}`);
        for (const row of personThreads.data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) threadIds.add(id);
        }
    }

    return [...threadIds];
}

async function resolveFormSubmissionIds(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    deletableCustomerId: string | null,
    deletablePersonIds: readonly string[]
): Promise<string[]> {
    const ids = new Set<string>();
    const oppSubs = await selectIdsByIn(supabase, "form_submissions", "opportunity_id", [opportunityId], orgId);
    for (const id of oppSubs) ids.add(id);

    if (deletableCustomerId) {
        const { data, error } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_id", deletableCustomerId);
        if (error) throw new Error(`load form_submissions by customer: ${error.message}`);
        for (const row of data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) ids.add(id);
        }
    }

    for (const part of chunkIds(deletablePersonIds)) {
        const { data, error } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("org_id", orgId)
            .in("person_id", part);
        if (error) throw new Error(`load form_submissions by person: ${error.message}`);
        for (const row of data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) ids.add(id);
        }
    }

    return [...ids];
}

async function resolveDocumentIds(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    deletableCustomerId: string | null,
    deletablePersonIds: readonly string[]
): Promise<string[]> {
    const entityIds = [opportunityId, ...deletablePersonIds];
    if (deletableCustomerId) entityIds.push(deletableCustomerId);
    return selectIdsByIn(supabase, "documents", "entity_id", entityIds, orgId);
}

export async function resolveOpportunityLeadDeletionGraph(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<OpportunityLeadDeletionGraph | null> {
    const opp = await loadOpportunityRow(supabase, orgId, opportunityId);
    if (!opp) return null;

    const household = await loadScopedHousehold(supabase, orgId, opportunityId, opp.customer_id);
    const [linkedJobs, linkedDiscountRedemptions] = await Promise.all([
        countLinkedJobs(supabase, orgId, opportunityId),
        countLinkedDiscountRedemptions(supabase, orgId, opportunityId),
    ]);

    const blocked = linkedJobs > 0 || linkedDiscountRedemptions > 0;
    const blockReason =
        linkedJobs > 0 ?
            "This lead has linked jobs. Financial and job record deletion is not supported in this workflow."
        : linkedDiscountRedemptions > 0 ?
            "This lead has discount redemptions. Remove or reassign them before deleting this record."
        :   null;

    let deletableCustomerId: string | null = null;
    if (opp.customer_id) {
        const hasRefs = await customerHasBlockingReferences(supabase, orgId, opp.customer_id, opportunityId);
        if (!hasRefs) deletableCustomerId = opp.customer_id;
    }

    const deletableCustomerMemberIds: string[] = [];
    for (const memberId of household.customerMemberIds) {
        const hasRefs = await customerMemberHasBlockingOcmReferences(supabase, orgId, memberId, opportunityId);
        if (!hasRefs) deletableCustomerMemberIds.push(memberId);
    }

    const deletableCustomerIds = new Set(deletableCustomerId ? [deletableCustomerId] : []);
    const deletableCustomerMemberIdSet = new Set(deletableCustomerMemberIds);

    const deletablePersonIds: string[] = [];
    for (const personId of household.personIds) {
        const hasRefs = await personHasBlockingReferences(supabase, orgId, personId, {
            excludingOpportunityId: opportunityId,
            deletableCustomerIds,
            deletableCustomerMemberIds: deletableCustomerMemberIdSet,
        });
        if (!hasRefs) deletablePersonIds.push(personId);
    }

    const [threadIds, formSubmissionIds, documentIds] = await Promise.all([
        resolveCommunicationThreadIds(supabase, orgId, opportunityId, deletableCustomerId, deletablePersonIds),
        resolveFormSubmissionIds(supabase, orgId, opportunityId, deletableCustomerId, deletablePersonIds),
        resolveDocumentIds(supabase, orgId, opportunityId, deletableCustomerId, deletablePersonIds),
    ]);

    return {
        orgId,
        opportunityId,
        opportunityName: opp.name,
        customerId: opp.customer_id,
        scopedCustomerMemberIds: household.customerMemberIds,
        scopedPersonIds: household.personIds,
        adultPersonIds: household.adultPersonIds,
        childPersonIds: household.childPersonIds,
        deletableCustomerId,
        deletableCustomerMemberIds,
        deletablePersonIds,
        threadIds,
        formSubmissionIds,
        documentIds,
        blocked,
        blockReason,
    };
}

async function countCommunicationMessagesForThreads(
    supabase: SupabaseClient,
    orgId: string,
    threadIds: readonly string[]
): Promise<number> {
    return countByIn(supabase, "communication_messages", "thread_id", threadIds, orgId);
}

async function countScheduledSendsForGraph(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    deletablePersonIds: readonly string[]
): Promise<number> {
    const byEntity = await countByEq(
        supabase,
        "communication_scheduled_sends",
        { entity_id: opportunityId },
        orgId
    );
    const byRecipient = deletablePersonIds.length
        ? await countByIn(supabase, "communication_scheduled_sends", "recipient_person_id", deletablePersonIds, orgId)
        : 0;
    return byEntity + byRecipient;
}

async function countFieldValuesForGraph(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    deletableCustomerId: string | null,
    deletablePersonIds: readonly string[]
): Promise<number> {
    let total = await countByEq(supabase, "field_values", { entity_type: "opportunity", entity_id: opportunityId }, orgId);
    total += await countByEq(supabase, "field_values", { entity_type: "opportunities", entity_id: opportunityId }, orgId);
    if (deletableCustomerId) {
        total += await countByEq(supabase, "field_values", { entity_type: "customer", entity_id: deletableCustomerId }, orgId);
        total += await countByEq(supabase, "field_values", { entity_type: "customers", entity_id: deletableCustomerId }, orgId);
    }
    for (const entityType of ["person", "persons"] as const) {
        for (const part of chunkIds(deletablePersonIds)) {
            let q = supabase
                .from("field_values")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("entity_type", entityType)
                .in("entity_id", part);
            const { count, error } = await q;
            if (error) throw new Error(`count field_values ${entityType}: ${error.message}`);
            total += count ?? 0;
        }
    }
    return total;
}

function buildPreviewShell(graph: OpportunityLeadDeletionGraph): OpportunityLeadDeletionPreview {
    const willDeleteCustomers = graph.deletableCustomerId ? 1 : 0;
    const willRetainCustomers = graph.customerId && !graph.deletableCustomerId ? 1 : 0;
    const deletableAdults = graph.adultPersonIds.filter((id) => graph.deletablePersonIds.includes(id)).length;
    const deletableChildren = graph.childPersonIds.filter((id) => graph.deletablePersonIds.includes(id)).length;

    return {
        opportunity_id: graph.opportunityId,
        opportunity_name: graph.opportunityName,
        blocked: graph.blocked,
        block_reason: graph.blockReason,
        will_delete: {
            opportunities: 1,
            enrollment_records: 0,
            adults: deletableAdults,
            children: deletableChildren,
            customer_members: graph.deletableCustomerMemberIds.length,
            customers: willDeleteCustomers,
            persons: graph.deletablePersonIds.length,
            tasks: 0,
            communication_threads: graph.threadIds.length,
            communication_messages: 0,
            communication_scheduled_sends: 0,
            documents: graph.documentIds.length,
            form_submissions: graph.formSubmissionIds.length,
            placement_candidates: 0,
            field_values: 0,
        },
        will_retain: {
            customers: willRetainCustomers,
            persons: graph.scopedPersonIds.length - graph.deletablePersonIds.length,
            customer_members: graph.scopedCustomerMemberIds.length - graph.deletableCustomerMemberIds.length,
        },
        counts: {
            opportunities: 1,
            enrollment_records: 0,
            parents: graph.adultPersonIds.length,
            children: graph.childPersonIds.length,
            customer_members: graph.scopedCustomerMemberIds.length,
            customers: graph.customerId ? 1 : 0,
            placement_candidates: 0,
        },
        deletable: {
            persons: graph.deletablePersonIds.length,
            customers: willDeleteCustomers,
            customer_members: graph.deletableCustomerMemberIds.length,
        },
    };
}

export async function previewOpportunityLeadDeletionFromGraph(
    supabase: SupabaseClient,
    graph: OpportunityLeadDeletionGraph
): Promise<OpportunityLeadDeletionPreview> {
    const household = await loadScopedHousehold(
        supabase,
        graph.orgId,
        graph.opportunityId,
        graph.customerId
    );

    const [tasks, placementCandidates, communicationMessages, communicationScheduledSends, fieldValues] =
        await Promise.all([
            countByEq(supabase, "operational_tasks", { entity_id: graph.opportunityId }, graph.orgId),
            countByEq(supabase, "placement_candidates", { opportunity_id: graph.opportunityId }, graph.orgId),
            countCommunicationMessagesForThreads(supabase, graph.orgId, graph.threadIds),
            countScheduledSendsForGraph(supabase, graph.orgId, graph.opportunityId, graph.deletablePersonIds),
            countFieldValuesForGraph(
                supabase,
                graph.orgId,
                graph.opportunityId,
                graph.deletableCustomerId,
                graph.deletablePersonIds
            ),
        ]);

    const preview = buildPreviewShell(graph);
    preview.will_delete.enrollment_records = household.enrollmentRecordCount;
    preview.will_delete.tasks = tasks;
    preview.will_delete.placement_candidates = placementCandidates;
    preview.will_delete.communication_messages = communicationMessages;
    preview.will_delete.communication_scheduled_sends = communicationScheduledSends;
    preview.will_delete.field_values = fieldValues;
    preview.counts.enrollment_records = household.enrollmentRecordCount;
    preview.counts.placement_candidates = placementCandidates;
    return preview;
}

export async function previewOpportunityLeadDeletion(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<OpportunityLeadDeletionPreview | null> {
    const graph = await resolveOpportunityLeadDeletionGraph(supabase, orgId, opportunityId);
    if (!graph) return null;
    return previewOpportunityLeadDeletionFromGraph(supabase, graph);
}
