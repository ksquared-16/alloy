import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminAudit } from "@/lib/adminAuth";
import {
    chunkIds,
    deleteByIn,
    deleteByInHeadCount,
    deleteFieldValuesForEntities,
    selectIdsByIn,
} from "@/lib/admin/opportunity/opportunityLeadDeletionDb";
import {
    previewOpportunityLeadDeletion,
    resolveOpportunityLeadDeletionGraph,
    type OpportunityLeadDeletionGraph,
    type OpportunityLeadDeletionPreview,
} from "@/lib/admin/opportunity/opportunityLeadDeletionGraph";

export type { OpportunityLeadDeletionPreview } from "@/lib/admin/opportunity/opportunityLeadDeletionGraph";

export type OpportunityLeadDeletionResult = {
    deleted: Record<string, number>;
    orphans: Record<string, number>;
    audit_logged: boolean;
};

export { previewOpportunityLeadDeletion };

async function selectMessageIdsForThreads(
    supabase: SupabaseClient,
    orgId: string,
    threadIds: readonly string[]
): Promise<string[]> {
    if (!threadIds.length) return [];
    const out: string[] = [];
    for (const part of chunkIds(threadIds)) {
        const { data, error } = await supabase
            .from("communication_messages")
            .select("id")
            .eq("org_id", orgId)
            .in("thread_id", part);
        if (error) throw new Error(`select communication_messages: ${error.message}`);
        for (const row of data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) out.push(id);
        }
    }
    return out;
}

async function selectPlacementCandidateIds(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<string[]> {
    return selectIdsByIn(supabase, "placement_candidates", "opportunity_id", [opportunityId], orgId);
}

async function deleteWorkflowEventsForEntities(
    supabase: SupabaseClient,
    orgId: string,
    entityIds: readonly string[]
): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {
        workflow_events: 0,
        workflow_runs: 0,
        workflow_action_runs: 0,
        messages_outbox: 0,
    };
    if (!entityIds.length) return deleted;

    const eventIds = new Set<string>();
    for (const part of chunkIds(entityIds)) {
        const { data, error } = await supabase
            .from("workflow_events")
            .select("id")
            .eq("org_id", orgId)
            .in("entity_id", part);
        if (error) throw new Error(`select workflow_events: ${error.message}`);
        for (const row of data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) eventIds.add(id);
        }
    }

    const runIds = new Set<string>();
    for (const part of chunkIds([...eventIds])) {
        const { data, error } = await supabase
            .from("workflow_runs")
            .select("id")
            .eq("org_id", orgId)
            .in("event_id", part);
        if (error) throw new Error(`select workflow_runs: ${error.message}`);
        for (const row of data ?? []) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) runIds.add(id);
        }
    }

    deleted.workflow_action_runs = await deleteByIn(
        supabase,
        "workflow_action_runs",
        "workflow_run_id",
        [...runIds],
        orgId
    );
    deleted.messages_outbox = await deleteByIn(supabase, "messages_outbox", "workflow_run_id", [...runIds], orgId);
    deleted.workflow_runs = await deleteByIn(supabase, "workflow_runs", "id", [...runIds], orgId);
    deleted.workflow_events = await deleteByIn(supabase, "workflow_events", "id", [...eventIds], orgId);
    return deleted;
}

async function deleteFormSubmissionsGraph(
    supabase: SupabaseClient,
    orgId: string,
    formSubmissionIds: readonly string[]
): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {
        form_packet_session_items: 0,
        form_packet_sessions: 0,
        form_submission_signatures: 0,
        form_submission_documents: 0,
        form_submissions: 0,
    };
    if (!formSubmissionIds.length) return deleted;

    const sessionIds = new Set<string>();
    for (const part of chunkIds(formSubmissionIds)) {
        const { data, error } = await supabase
            .from("form_packet_session_items")
            .select("packet_session_id")
            .eq("org_id", orgId)
            .in("form_submission_id", part);
        if (error) throw new Error(`select form_packet_session_items: ${error.message}`);
        for (const row of data ?? []) {
            const id =
                typeof (row as { packet_session_id?: string }).packet_session_id === "string"
                    ? (row as { packet_session_id: string }).packet_session_id.trim()
                    : "";
            if (id) sessionIds.add(id);
        }
    }

    deleted.form_packet_session_items = await deleteByIn(
        supabase,
        "form_packet_session_items",
        "form_submission_id",
        formSubmissionIds,
        orgId
    );
    deleted.form_packet_sessions = await deleteByIn(
        supabase,
        "form_packet_sessions",
        "id",
        [...sessionIds],
        orgId
    );
    deleted.form_submission_signatures = await deleteByIn(
        supabase,
        "form_submission_signatures",
        "form_submission_id",
        formSubmissionIds,
        orgId
    );
    deleted.form_submission_documents = await deleteByIn(
        supabase,
        "form_submission_documents",
        "form_submission_id",
        formSubmissionIds,
        orgId
    );
    deleted.form_submissions = await deleteByIn(supabase, "form_submissions", "id", formSubmissionIds, orgId);
    return deleted;
}

async function deleteDocumentsGraph(
    supabase: SupabaseClient,
    orgId: string,
    documentIds: readonly string[]
): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {
        document_field_values: 0,
        document_versions: 0,
        documents: 0,
    };
    if (!documentIds.length) return deleted;

    deleted.document_field_values = await deleteByIn(
        supabase,
        "document_field_values",
        "document_id",
        documentIds,
        orgId
    );
    deleted.document_versions = await deleteByIn(supabase, "document_versions", "document_id", documentIds, orgId);
    deleted.documents = await deleteByIn(supabase, "documents", "id", documentIds, orgId);
    return deleted;
}

/**
 * FK-safe single-opportunity deletion order (aligned with enrollment runtime reset idsOnly path).
 * Never touches locations, work_units, departments, or config/layout/form definitions.
 */
export async function executeOpportunityLeadDeletionGraph(
    supabase: SupabaseClient,
    graph: OpportunityLeadDeletionGraph
): Promise<Record<string, number>> {
    const { orgId, opportunityId } = graph;
    const deleted: Record<string, number> = {};
    const opp = [opportunityId];
    const deletablePersons = graph.deletablePersonIds;
    const deletableCustomer = graph.deletableCustomerId ? [graph.deletableCustomerId] : [];
    const deletableMembers = graph.deletableCustomerMemberIds;
    const entityIdsForWorkflow = [...new Set([...opp, ...deletableCustomer])];

    // 1. Communications (deepest children first)
    const messageIds = await selectMessageIdsForThreads(supabase, orgId, graph.threadIds);
    deleted.communication_message_reads = await deleteByInHeadCount(
        supabase,
        "communication_message_reads",
        "message_id",
        messageIds
    );
    deleted.communication_messages = await deleteByIn(
        supabase,
        "communication_messages",
        "thread_id",
        graph.threadIds,
        orgId
    );
    deleted.communication_scheduled_sends =
        (await deleteByIn(supabase, "communication_scheduled_sends", "entity_id", opp, orgId)) +
        (await deleteByIn(
            supabase,
            "communication_scheduled_sends",
            "recipient_person_id",
            deletablePersons,
            orgId
        ));
    deleted.communication_threads = await deleteByIn(supabase, "communication_threads", "id", graph.threadIds, orgId);

    // 2. Tasks
    deleted.task_assist_proposals = await deleteByIn(supabase, "task_assist_proposals", "entity_id", opp, orgId);
    deleted.operational_tasks = await deleteByIn(supabase, "operational_tasks", "entity_id", opp, orgId);

    // 3. Placement / tours
    const pcIds = await selectPlacementCandidateIds(supabase, orgId, opportunityId);
    deleted.placement_overrides = await deleteByIn(
        supabase,
        "placement_overrides",
        "placement_candidate_id",
        pcIds,
        orgId
    );
    deleted.placement_link_group_members = await deleteByIn(
        supabase,
        "placement_link_group_members",
        "placement_candidate_id",
        pcIds,
        orgId
    );
    deleted.placement_link_groups = await deleteByIn(
        supabase,
        "placement_link_groups",
        "opportunity_id",
        opp,
        orgId
    );
    deleted.placement_candidates = await deleteByIn(
        supabase,
        "placement_candidates",
        "opportunity_id",
        opp,
        orgId
    );
    deleted.tour_public_booking_links = await deleteByIn(
        supabase,
        "tour_public_booking_links",
        "opportunity_id",
        opp,
        orgId
    );
    deleted.tour_bookings = await deleteByIn(supabase, "tour_bookings", "opportunity_id", opp, orgId);

    // 4. Opportunity joins (explicit — cascades on delete but keeps counts accurate)
    deleted.opportunity_tags = await deleteByInHeadCount(supabase, "opportunity_tags", "opportunity_id", opp);
    deleted.opportunity_persons = await deleteByIn(supabase, "opportunity_persons", "opportunity_id", opp, orgId);
    deleted.opportunity_customer_members = await deleteByIn(
        supabase,
        "opportunity_customer_members",
        "opportunity_id",
        opp,
        orgId
    );

    // 5. Quotes / discount applications (redemptions blocked in preview)
    deleted.quotes = await deleteByIn(supabase, "quotes", "opportunity_id", opp, orgId);
    deleted.discount_applications = await deleteByIn(supabase, "discount_applications", "opportunity_id", opp, orgId);
    deleted.messages = await deleteByIn(supabase, "messages", "opportunity_id", opp);

    // 6. Workflow / action links
    Object.assign(deleted, await deleteWorkflowEventsForEntities(supabase, orgId, entityIdsForWorkflow));
    deleted.action_links = await deleteByIn(supabase, "action_links", "entity_id", entityIdsForWorkflow, orgId);

    // 7. Forms
    Object.assign(deleted, await deleteFormSubmissionsGraph(supabase, orgId, graph.formSubmissionIds));

    // 8. Documents
    Object.assign(deleted, await deleteDocumentsGraph(supabase, orgId, graph.documentIds));

    // 9. Field values (opportunity + deletable household entities)
    deleted.field_values = 0;
    deleted.field_values += await deleteFieldValuesForEntities(supabase, orgId, "opportunity", opp);
    deleted.field_values += await deleteFieldValuesForEntities(supabase, orgId, "opportunities", opp);
    if (graph.deletableCustomerId) {
        deleted.field_values += await deleteFieldValuesForEntities(supabase, orgId, "customer", deletableCustomer);
        deleted.field_values += await deleteFieldValuesForEntities(supabase, orgId, "customers", deletableCustomer);
    }
    deleted.field_values += await deleteFieldValuesForEntities(supabase, orgId, "person", deletablePersons);
    deleted.field_values += await deleteFieldValuesForEntities(supabase, orgId, "persons", deletablePersons);

    // 10. Opportunity row
    const { data: oppDeleted, error: oppErr } = await supabase
        .from("opportunities")
        .delete()
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .select("id");
    if (oppErr) throw new Error(`delete opportunity: ${oppErr.message}`);
    if (!(oppDeleted ?? []).length) {
        throw new Error("Opportunity could not be deleted. It may have linked records blocking removal.");
    }
    deleted.opportunities = oppDeleted.length;

    // 11. Household — members / customer_persons before persons / customer
    deleted.customer_member_contacts =
        (await deleteByIn(supabase, "customer_member_contacts", "customer_member_id", deletableMembers, orgId)) +
        (await deleteByIn(supabase, "customer_member_contacts", "customer_id", deletableCustomer, orgId));
    deleted.customer_tags = await deleteByInHeadCount(
        supabase,
        "customer_tags",
        "customer_id",
        deletableCustomer
    );
    deleted.customer_subscriptions = await deleteByIn(
        supabase,
        "customer_subscriptions",
        "customer_id",
        deletableCustomer,
        orgId
    );
    deleted.customer_payment_methods = await deleteByInHeadCount(
        supabase,
        "customer_payment_methods",
        "customer_id",
        deletableCustomer
    );
    deleted.customer_members = await deleteByIn(supabase, "customer_members", "id", deletableMembers, orgId);
    deleted.customer_persons = await deleteByIn(
        supabase,
        "customer_persons",
        "customer_id",
        deletableCustomer,
        orgId
    );

    if (deletablePersons.length) {
        deleted.contacts_by_person = await deleteByIn(supabase, "contacts", "person_id", deletablePersons, orgId);
    } else {
        deleted.contacts_by_person = 0;
    }
    if (deletableCustomer.length) {
        deleted.contacts_by_customer = await deleteByIn(
            supabase,
            "contacts",
            "customer_id",
            deletableCustomer,
            orgId
        );
    } else {
        deleted.contacts_by_customer = 0;
    }

    deleted.person_locations = await deleteByIn(supabase, "person_locations", "person_id", deletablePersons, orgId);
    deleted.person_relationships =
        (await deleteByIn(supabase, "person_relationships", "from_person_id", deletablePersons, orgId)) +
        (await deleteByIn(supabase, "person_relationships", "to_person_id", deletablePersons, orgId));
    deleted.persons = await deleteByIn(supabase, "persons", "id", deletablePersons, orgId);
    deleted.customers = await deleteByIn(supabase, "customers", "id", deletableCustomer, orgId);

    return deleted;
}

export async function executeDeleteOpportunityLead(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actorUserId: string;
    actorRole: string;
}): Promise<OpportunityLeadDeletionResult> {
    const { supabase, orgId, opportunityId, actorUserId, actorRole } = params;

    const graph = await resolveOpportunityLeadDeletionGraph(supabase, orgId, opportunityId);
    if (!graph) throw new Error("Opportunity not found");
    if (graph.blocked) throw new Error(graph.blockReason ?? "Deletion blocked");

    const deleted = await executeOpportunityLeadDeletionGraph(supabase, graph);
    const orphans = await verifyOpportunityLeadDeletionOrphans(supabase, orgId, opportunityId, graph);

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
    opportunityId: string,
    graph?: OpportunityLeadDeletionGraph | null
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

    if (graph) {
        for (const personId of graph.deletablePersonIds) {
            const { count, error } = await supabase
                .from("persons")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("id", personId);
            if (error) throw new Error(`orphan check persons: ${error.message}`);
            if ((count ?? 0) > 0) orphans[`person:${personId}`] = count ?? 0;
        }
        if (graph.deletableCustomerId) {
            const { count, error } = await supabase
                .from("customers")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("id", graph.deletableCustomerId);
            if (error) throw new Error(`orphan check customers: ${error.message}`);
            if ((count ?? 0) > 0) orphans[`customer:${graph.deletableCustomerId}`] = count ?? 0;
        }
    }

    return orphans;
}
