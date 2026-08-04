/**
 * Shared ID resolution + count planning for demo/runtime cleanup scripts.
 * @see docs/platform/governance/demo-runtime-cleanup-schema-audit.md
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import {
    chunk,
    ENROLLMENT_RUNTIME_RESET_MODE,
    PROTECTED_LOCATIONS_TABLE_KEY,
    type DemoCleanupScope,
    type ResolvedDemoIds,
} from "./demoRuntimeCleanupScope";
import { buildEnrollmentResetSelection } from "./enrollmentRuntimeResetSelection";
import { resolveEnrollmentResetSharedReferences } from "./enrollmentRuntimeResetSharedGuard";
import { countProcessingGraph, resolveCertificationBaseline } from "./certificationBaselineResolver";
import { resolveCertificationResidue } from "./certificationResidueResolver";

export { buildEnrollmentResetSelection } from "./enrollmentRuntimeResetSelection";
export type { EnrollmentResetSelection, EnrollmentResetOpportunityRow } from "./enrollmentRuntimeResetSelection";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function selectIds(
    supabase: SupabaseAdmin,
    table: string,
    orgId: string,
    orFilter: string,
    idColumn = "id"
): Promise<string[]> {
    const all: string[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from(table)
            .select(idColumn)
            .eq("org_id", orgId)
            .or(orFilter)
            .order(idColumn, { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[${table} select] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as unknown as Record<string, string | undefined>;
            const id = row[idColumn];
            if (id) all.push(id);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return all;
}

async function countByIn(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
        if (orgId) q = q.eq("org_id", orgId);
        const { count, error } = await q;
        if (error) throw new Error(`[${table} count ${column}] ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

async function countOrgScopedAll(supabase: SupabaseAdmin, table: string, orgId: string): Promise<number> {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("org_id", orgId);
    if (error) throw new Error(`[${table} count org] ${error.message}`);
    return count ?? 0;
}

/** Process runtime instances linked to selected opportunities (context) or customer members (subject). */
async function collectProcessInstanceIdsForTargets(
    supabase: SupabaseAdmin,
    orgId: string,
    opportunityIds: string[],
    customerMemberIds: string[]
): Promise<string[]> {
    const piIds = new Set<string>();
    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase
            .from("process_instances")
            .select("id")
            .eq("org_id", orgId)
            .in("context_id", part);
        if (error) throw new Error(`[process_instances select context_id] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) piIds.add(id);
        }
    }
    for (const part of chunk(customerMemberIds, 200)) {
        const { data, error } = await supabase
            .from("process_instances")
            .select("id")
            .eq("org_id", orgId)
            .in("subject_id", part);
        if (error) throw new Error(`[process_instances select subject_id] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) piIds.add(id);
        }
    }
    return [...piIds];
}

export async function countProcessInstancesForCleanup(
    supabase: SupabaseAdmin,
    orgId: string,
    opportunityIds: string[],
    customerMemberIds: string[],
    idsOnly: boolean
): Promise<number> {
    if (idsOnly) return countOrgScopedAll(supabase, "process_instances", orgId);
    const piIds = await collectProcessInstanceIdsForTargets(supabase, orgId, opportunityIds, customerMemberIds);
    return piIds.length;
}

export async function deleteProcessInstancesForCleanup(
    supabase: SupabaseAdmin,
    orgId: string,
    opportunityIds: string[],
    customerMemberIds: string[],
    idsOnly: boolean
): Promise<number> {
    if (idsOnly) {
        const { data, error } = await supabase.from("process_instances").delete().eq("org_id", orgId).select("id");
        if (error) throw new Error(`[process_instances delete org] ${error.message}`);
        return (data ?? []).length;
    }
    const piIds = await collectProcessInstanceIdsForTargets(supabase, orgId, opportunityIds, customerMemberIds);
    if (!piIds.length) return 0;
    let total = 0;
    for (const part of chunk(piIds, 200)) {
        const { data, error } = await supabase
            .from("process_instances")
            .delete()
            .eq("org_id", orgId)
            .in("id", part)
            .select("id");
        if (error) throw new Error(`[process_instances delete id] ${error.message}`);
        total += (data ?? []).length;
    }
    return total;
}

async function countByInNoOrg(supabase: SupabaseAdmin, table: string, column: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunk(ids, 200)) {
        const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
        if (error) throw new Error(`[${table} count ${column}] ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

async function countRows(supabase: SupabaseAdmin, table: string, orgId: string, orFilter: string): Promise<number> {
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .or(orFilter);
    if (error) throw new Error(`[${table} count] ${error.message}`);
    return count ?? 0;
}

async function countCommunicationScheduledSendsDemoScope(
    supabase: SupabaseAdmin,
    orgId: string,
    oppIds: string[],
    personIds: string[]
): Promise<number> {
    const ids = new Set<string>();
    for (const part of chunk(oppIds, 200)) {
        const { data, error } = await supabase
            .from("communication_scheduled_sends")
            .select("id")
            .eq("org_id", orgId)
            .in("entity_id", part);
        if (error) throw new Error(`[communication_scheduled_sends count entity_id] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
    }
    for (const part of chunk(personIds, 200)) {
        const { data, error } = await supabase
            .from("communication_scheduled_sends")
            .select("id")
            .eq("org_id", orgId)
            .in("recipient_person_id", part);
        if (error) throw new Error(`[communication_scheduled_sends count recipient_person_id] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
    }
    return ids.size;
}

async function countFieldValuesForEntities(
    supabase: SupabaseAdmin,
    orgId: string,
    entityType: string,
    entityIds: string[]
): Promise<number> {
    if (!entityIds.length) return 0;
    let total = 0;
    for (const part of chunk(entityIds, 150)) {
        const { count, error } = await supabase
            .from("field_values")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("entity_type", entityType)
            .in("entity_id", part);
        if (error) throw new Error(`[field_values count ${entityType}] ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

async function countDocumentsForEntities(
    supabase: SupabaseAdmin,
    orgId: string,
    entityIds: string[],
    orDemo: string,
    includeMetadataTagged = true
): Promise<number> {
    const ids = new Set<string>();
    for (const part of chunk(entityIds, 150)) {
        const { data, error } = await supabase
            .from("documents")
            .select("id")
            .eq("org_id", orgId)
            .in("entity_id", part);
        if (error) throw new Error(`[documents select entity_id] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) ids.add(id);
        }
    }
    const metaCount = includeMetadataTagged ? await countRows(supabase, "documents", orgId, orDemo) : 0;
    return ids.size + metaCount;
}

export async function resolveDemoIds(
    supabase: SupabaseAdmin,
    scope: DemoCleanupScope,
    orDemo: string
): Promise<ResolvedDemoIds> {
    const idsOnly = scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE;

    const enrollmentSelection = idsOnly
        ? await buildEnrollmentResetSelection(supabase, scope.orgId, {
              includeClosedOpportunities: scope.includeClosedOpportunities,
          })
        : null;
    const opportunityIds = enrollmentSelection
        ? enrollmentSelection.opportunityIds
        : await selectIds(supabase, "opportunities", scope.orgId, orDemo);

    const customerIds = new Set<string>(
        idsOnly ? [] : await selectIds(supabase, "customers", scope.orgId, orDemo)
    );
    const personIds = new Set<string>(idsOnly ? [] : await selectIds(supabase, "persons", scope.orgId, orDemo));
    const customerMemberIds = new Set<string>(
        idsOnly ? [] : await selectIds(supabase, "customer_members", scope.orgId, orDemo)
    );

    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("customer_id, primary_person_id")
            .eq("org_id", scope.orgId)
            .in("id", part);
        if (error) throw new Error(`[opportunities expand] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { customer_id?: string | null; primary_person_id?: string | null };
            if (row.customer_id) customerIds.add(row.customer_id);
            if (row.primary_person_id) personIds.add(row.primary_person_id);
        }
    }

    const custList = [...customerIds];
    const memberCustomerById = new Map<string, string>();
    for (const part of chunk(custList, 200)) {
        const { data: members, error: mErr } = await supabase
            .from("customer_members")
            .select("id, person_id, customer_id")
            .eq("org_id", scope.orgId)
            .in("customer_id", part);
        if (mErr) throw new Error(`[customer_members expand] ${mErr.message}`);
        for (const r of members ?? []) {
            const row = r as { id?: string; person_id?: string | null; customer_id?: string | null };
            if (row.id) {
                customerMemberIds.add(row.id);
                if (row.customer_id) memberCustomerById.set(row.id, row.customer_id);
            }
            if (row.person_id) personIds.add(row.person_id);
        }
        const { data: cps, error: cpErr } = await supabase
            .from("customer_persons")
            .select("person_id")
            .eq("org_id", scope.orgId)
            .in("customer_id", part);
        if (cpErr) throw new Error(`[customer_persons expand] ${cpErr.message}`);
        for (const r of cps ?? []) {
            const pid = (r as { person_id?: string }).person_id;
            if (pid) personIds.add(pid);
        }
    }

    // enrollment_runtime_reset safety: only delete persons/customers linked exclusively to the
    // target opportunities. Anything shared with a non-target record is preserved.
    let deletableCustomerIds = custList;
    let deletablePersonIds = [...personIds];
    let deletableMemberIds = [...customerMemberIds];
    let sharedPersonIds: string[] = [];
    let sharedCustomerIds: string[] = [];
    if (idsOnly) {
        const partition = await resolveEnrollmentResetSharedReferences(
            supabase,
            scope.orgId,
            opportunityIds,
            [...personIds],
            custList
        );
        const deletableCustSet = new Set(partition.deletableCustomerIds);
        deletableCustomerIds = partition.deletableCustomerIds;
        deletablePersonIds = partition.deletablePersonIds;
        deletableMemberIds = deletableMemberIds.filter((mid) => {
            const cid = memberCustomerById.get(mid);
            return cid != null && deletableCustSet.has(cid);
        });
        sharedPersonIds = partition.sharedPersonIds;
        sharedCustomerIds = partition.sharedCustomerIds;
    }

    /**
     * CERTIFICATION BASELINE (anchors A2 + A3).
     *
     * Folded in HERE, after the opportunity graph has resolved and the shared-reference guard has
     * run, and before the dependent sweeps below. That ordering matters: the additional identities
     * must be visible to the jobs/threads/documents traversal, or the certification reset would
     * delete households while stranding their documents and communications.
     */
    let certification: Awaited<ReturnType<typeof resolveCertificationBaseline>> | null = null;
    if (idsOnly && scope.certificationBaseline) {
        certification = await resolveCertificationBaseline(supabase, scope.orgId, {
            targetOpportunityIds: opportunityIds,
            protectedOpportunityIds: (enrollmentSelection?.excludedGoldenPath ?? []).map((r) => r.id),
            alreadyResolvedCustomerIds: deletableCustomerIds,
            alreadyResolvedPersonIds: deletablePersonIds,
        });

        if (certification.ambiguous.length) {
            const lines = certification.ambiguous
                .slice(0, 20)
                .map((v) => `  - ${v.id}: ${v.reason}`)
                .join("\n");
            throw new Error(
                `Certification baseline refuses to proceed: ${certification.ambiguous.length} identity/identities ` +
                    `could not be classified as target or protected.\n${lines}\n` +
                    `Ambiguity means this contract met a shape it does not model. That is a human decision, ` +
                    `not a default — see docs/handoffs/firefly-certification-deletion-contract.md §4.4.`,
            );
        }

        deletableCustomerIds = [...new Set([...deletableCustomerIds, ...certification.additionalCustomerIds])];
        deletablePersonIds = [...new Set([...deletablePersonIds, ...certification.additionalPersonIds])];
        deletableMemberIds = [...new Set([...deletableMemberIds, ...certification.additionalCustomerMemberIds])];
        // An identity promoted to target is no longer "preserved because shared".
        const targetCust = new Set(deletableCustomerIds);
        const targetPers = new Set(deletablePersonIds);
        sharedCustomerIds = sharedCustomerIds.filter((id) => !targetCust.has(id));
        sharedPersonIds = sharedPersonIds.filter((id) => !targetPers.has(id));
    }

    const jobIds = new Set<string>();
    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase.from("jobs").select("id").eq("org_id", scope.orgId).in("opportunity_id", part);
        if (error) throw new Error(`[jobs by opp] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) jobIds.add(id);
        }
    }
    const { data: metaJobs } = idsOnly
        ? { data: [] as Array<{ id?: string }> }
        : await supabase.from("jobs").select("id").eq("org_id", scope.orgId).or(orDemo);
    for (const r of metaJobs ?? []) {
        const id = (r as { id?: string }).id;
        if (id) jobIds.add(id);
    }

    const scheduleIds = new Set<string>();
    for (const part of chunk([...jobIds], 200)) {
        const { data, error } = await supabase.from("schedules").select("id").eq("org_id", scope.orgId).in("job_id", part);
        if (error) throw new Error(`[schedules by job] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) scheduleIds.add(id);
        }
    }

    const threadIds = new Set<string>();
    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase
            .from("communication_threads")
            .select("id")
            .eq("org_id", scope.orgId)
            .eq("primary_entity_type", "opportunities")
            .in("primary_entity_id", part);
        if (error) throw new Error(`[communication_threads by opp] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) threadIds.add(id);
        }
    }
    const threadMeta = idsOnly ? [] : await selectIds(supabase, "communication_threads", scope.orgId, orDemo);
    for (const id of threadMeta) threadIds.add(id);

    const formSubmissionIds = new Set<string>();
    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase
            .from("form_submissions")
            .select("id")
            .eq("org_id", scope.orgId)
            .in("opportunity_id", part);
        if (error) throw new Error(`[form_submissions by opp] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) formSubmissionIds.add(id);
        }
    }
    const fsMeta = idsOnly ? [] : await selectIds(supabase, "form_submissions", scope.orgId, orDemo);
    for (const id of fsMeta) formSubmissionIds.add(id);

    const documentIds = new Set<string>();
    const entityIdsForDocs = [...opportunityIds, ...deletablePersonIds, ...deletableCustomerIds];
    for (const part of chunk(entityIdsForDocs, 150)) {
        const { data, error } = await supabase.from("documents").select("id").eq("org_id", scope.orgId).in("entity_id", part);
        if (error) throw new Error(`[documents by entity] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) documentIds.add(id);
        }
    }

    /**
     * A4 + subject fixes (§4ter). Runs last, because every rule is expressed against the identities
     * and Processing cases already resolved above — and it can still abort the whole run.
     */
    let residue: Awaited<ReturnType<typeof resolveCertificationResidue>> | null = null;
    if (idsOnly && scope.certificationBaseline && certification) {
        residue = await resolveCertificationResidue(supabase, scope.orgId, {
            opportunityIds,
            personIds: deletablePersonIds,
            customerIds: deletableCustomerIds,
            customerMemberIds: deletableMemberIds,
            processingCaseIds: certification.processingCaseIds,
        });
        if (residue.ambiguous.length) {
            const lines = residue.ambiguous.slice(0, 20).map((v) => `  - ${v.id}: ${v.reason}`).join("\n");
            throw new Error(
                `Certification baseline refuses to proceed: ${residue.ambiguous.length} operational row(s) ` +
                    `could not be classified.\n${lines}\n` +
                    `An unclassified row is a missing traversal, not a deletion candidate — see ` +
                    `docs/handoffs/firefly-certification-deletion-contract.md §4ter.`,
            );
        }
    }

    return {
        opportunityIds,
        customerIds: deletableCustomerIds,
        personIds: deletablePersonIds,
        customerMemberIds: deletableMemberIds,
        jobIds: [...jobIds],
        scheduleIds: [...scheduleIds],
        formSubmissionIds: [...formSubmissionIds, ...(residue?.formSubmissionIds ?? [])].filter(
            (v, i, a) => a.indexOf(v) === i,
        ),
        documentIds: [...documentIds, ...(residue?.documentIds ?? [])].filter((v, i, a) => a.indexOf(v) === i),
        threadIds: [...threadIds, ...(residue?.threadIds ?? [])].filter((v, i, a) => a.indexOf(v) === i),
        sharedPersonIds,
        sharedCustomerIds,
        ...(residue
            ? {
                  residue: {
                      contactIds: residue.contactIds,
                      operationalTaskIds: residue.operationalTaskIds,
                      formPacketSessionIds: residue.formPacketSessionIds,
                      workflowEventIds: residue.workflowEventIds,
                      storageObjects: residue.storageObjects,
                      preserved: residue.preserved.map((p) => ({ id: p.id, reason: p.reason })),
                      preservedWorkflowEvents: residue.preservedWorkflowEvents.map((p) => ({
                          id: p.id,
                          reason: p.reason,
                      })),
                      report: residue.report,
                  },
              }
            : {}),
        ...(certification
            ? {
                  processingCaseIds: certification.processingCaseIds,
                  processingPlanIds: certification.processingPlanIds,
                  preservedProcessingCases: certification.preservedProcessingCases,
                  certificationSummary: {
                      targetCustomers: certification.classification.targetCustomerIds.length,
                      targetPersons: certification.classification.targetPersonIds.length,
                      protectedCustomers: certification.classification.customers
                          .filter((v) => v.class === "protected")
                          .map((v) => ({ id: v.id, reason: v.reason })),
                      protectedPersons: certification.classification.persons
                          .filter((v) => v.class === "protected")
                          .map((v) => ({ id: v.id, reason: v.reason })),
                  },
              }
            : {}),
    };
}

export async function buildDemoCleanupCounts(
    supabase: SupabaseAdmin,
    scope: DemoCleanupScope,
    ids: ResolvedDemoIds,
    orDemo: string
): Promise<Record<string, number>> {
    const { orgId } = scope;
    const idsOnly = scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE;
    const opp = ids.opportunityIds;
    const cust = ids.customerIds;
    const persons = ids.personIds;
    const members = ids.customerMemberIds;
    const jobs = ids.jobIds;
    const schedules = ids.scheduleIds;
    const threads = ids.threadIds;
    const formSubs = ids.formSubmissionIds;
    const entityIdsForWorkflow = [...new Set([...opp, ...cust, ...jobs])];

    const counts: Record<string, number> = {};

    counts.communication_messages = await countByIn(supabase, "communication_messages", "thread_id", threads, orgId);
    counts.communication_message_reads = 0;
    if (threads.length) {
        const msgIds: string[] = [];
        for (const part of chunk(threads, 150)) {
            const { data, error } = await supabase.from("communication_messages").select("id").eq("org_id", orgId).in("thread_id", part);
            if (error) throw new Error(`[communication_messages ids] ${error.message}`);
            for (const r of data ?? []) {
                const id = (r as { id?: string }).id;
                if (id) msgIds.push(id);
            }
        }
        counts.communication_message_reads = await countByInNoOrg(supabase, "communication_message_reads", "message_id", msgIds);
    }

    counts.communication_scheduled_sends = await countCommunicationScheduledSendsDemoScope(supabase, orgId, opp, persons);
    counts.communication_threads = threads.length;
    counts.task_assist_proposals = await countByIn(supabase, "task_assist_proposals", "entity_id", opp, orgId);
    counts.operational_tasks = await countByIn(supabase, "operational_tasks", "entity_id", opp, orgId);

    counts.placement_candidates = await countByIn(supabase, "placement_candidates", "opportunity_id", opp, orgId);
    const pcIds: string[] = [];
    for (const part of chunk(opp, 200)) {
        const { data } = await supabase.from("placement_candidates").select("id").eq("org_id", orgId).in("opportunity_id", part);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) pcIds.push(id);
        }
    }
    counts.placement_overrides = await countByIn(supabase, "placement_overrides", "placement_candidate_id", pcIds, orgId);
    counts.placement_link_group_members = await countByIn(supabase, "placement_link_group_members", "placement_candidate_id", pcIds, orgId);
    counts.placement_link_groups = await countByIn(supabase, "placement_link_groups", "opportunity_id", opp, orgId);

    counts.tour_public_booking_links = await countByIn(supabase, "tour_public_booking_links", "opportunity_id", opp, orgId);
    counts.tour_bookings = await countByIn(supabase, "tour_bookings", "opportunity_id", opp, orgId);

    counts.opportunity_tags = await countByIn(supabase, "opportunity_tags", "opportunity_id", opp);
    counts.opportunity_persons = await countByIn(supabase, "opportunity_persons", "opportunity_id", opp, orgId);
    counts.opportunity_customer_members = await countByIn(supabase, "opportunity_customer_members", "opportunity_id", opp, orgId);

    counts.quotes = await countByIn(supabase, "quotes", "opportunity_id", opp, orgId);
    counts.discount_redemptions =
        (await countByIn(supabase, "discount_redemptions", "opportunity_id", opp)) +
        (await countByIn(supabase, "discount_redemptions", "job_id", jobs));
    counts.discount_applications = await countByIn(supabase, "discount_applications", "opportunity_id", opp, orgId);

    counts.messages =
        (await countByIn(supabase, "messages", "opportunity_id", opp)) + (await countByIn(supabase, "messages", "job_id", jobs));

    const eventIds = new Set<string>();
    for (const part of chunk(entityIdsForWorkflow, 150)) {
        const { data, error } = await supabase.from("workflow_events").select("id").eq("org_id", orgId).in("entity_id", part);
        if (error) throw new Error(`[workflow_events] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) eventIds.add(id);
        }
    }
    const runIds = new Set<string>();
    for (const part of chunk([...eventIds], 150)) {
        const { data, error } = await supabase.from("workflow_runs").select("id").eq("org_id", orgId).in("event_id", part);
        if (error) throw new Error(`[workflow_runs] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) runIds.add(id);
        }
    }
    counts.workflow_events = eventIds.size;
    counts.workflow_runs = runIds.size;
    counts.workflow_action_runs = await countByIn(supabase, "workflow_action_runs", "workflow_run_id", [...runIds], orgId);
    counts.messages_outbox = await countByIn(supabase, "messages_outbox", "workflow_run_id", [...runIds], orgId);

    counts.action_links = await countByIn(supabase, "action_links", "entity_id", entityIdsForWorkflow, orgId);
    counts.schedule_tags = schedules.length ? await countByInNoOrg(supabase, "schedule_tags", "schedule_id", schedules) : 0;
    counts.payments = await countByIn(supabase, "payments", "job_id", jobs, orgId);
    counts.assignments = await countByIn(supabase, "assignments", "job_id", jobs, orgId);
    counts.schedules = await countByIn(supabase, "schedules", "job_id", jobs, orgId);
    counts.jobs = jobs.length;

    const sessionIds: string[] = [];
    for (const part of chunk(formSubs, 150)) {
        const { data, error } = await supabase
            .from("form_packet_session_items")
            .select("packet_session_id")
            .eq("org_id", orgId)
            .in("form_submission_id", part);
        if (error) throw new Error(`[form_packet_session_items] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { packet_session_id?: string }).packet_session_id;
            if (id) sessionIds.push(id);
        }
    }
    const uniqueSessions = [...new Set(sessionIds)];
    counts.form_packet_session_items = formSubs.length
        ? await countByIn(supabase, "form_packet_session_items", "form_submission_id", formSubs, orgId)
        : 0;
    counts.form_packet_sessions = uniqueSessions.length
        ? await countByIn(supabase, "form_packet_sessions", "id", uniqueSessions, orgId)
        : idsOnly
          ? 0
          : await countRows(supabase, "form_packet_sessions", orgId, orDemo);

    counts.form_submission_signatures = await countByIn(supabase, "form_submission_signatures", "form_submission_id", formSubs, orgId);
    counts.form_submission_documents = await countByIn(supabase, "form_submission_documents", "form_submission_id", formSubs, orgId);
    counts.form_submissions = formSubs.length;

    const docIds = [...ids.documentIds];
    counts.document_field_values = await countByIn(supabase, "document_field_values", "document_id", docIds, orgId);
    counts.document_versions = await countByIn(supabase, "document_versions", "document_id", docIds, orgId);
    counts.documents = await countDocumentsForEntities(
        supabase,
        orgId,
        [...opp, ...persons, ...cust],
        orDemo,
        !idsOnly
    );

    const locationIdsForFv = idsOnly
        ? []
        : await selectIds(supabase, "locations", orgId, orDemo);
    counts.field_values =
        (await countFieldValuesForEntities(supabase, orgId, "opportunity", opp)) +
        (await countFieldValuesForEntities(supabase, orgId, "person", persons)) +
        (await countFieldValuesForEntities(supabase, orgId, "customer", cust)) +
        (locationIdsForFv.length
            ? await countFieldValuesForEntities(supabase, orgId, "location", locationIdsForFv)
            : 0);

    counts.process_instances = await countProcessInstancesForCleanup(supabase, orgId, opp, members, idsOnly);
    counts.opportunities = opp.length;
    counts.customer_member_contacts =
        (await countByIn(supabase, "customer_member_contacts", "customer_member_id", members, orgId)) +
        (await countByIn(supabase, "customer_member_contacts", "customer_id", cust, orgId));
    counts.customer_tags = cust.length ? await countByInNoOrg(supabase, "customer_tags", "customer_id", cust) : 0;
    counts.customer_subscriptions = await countByIn(supabase, "customer_subscriptions", "customer_id", cust, orgId);
    counts.customer_payment_methods = cust.length ? await countByInNoOrg(supabase, "customer_payment_methods", "customer_id", cust) : 0;
    counts.customer_members =
        members.length + (idsOnly ? 0 : await countRows(supabase, "customer_members", orgId, orDemo));
    counts.customer_persons =
        (await countByIn(supabase, "customer_persons", "customer_id", cust, orgId)) +
        (idsOnly ? 0 : await countRows(supabase, "customer_persons", orgId, orDemo));
    counts.contacts = idsOnly ? 0 : await countRows(supabase, "contacts", orgId, orDemo);
    counts.person_locations =
        (idsOnly ? 0 : await countRows(supabase, "person_locations", orgId, orDemo)) +
        (await countByIn(supabase, "person_locations", "person_id", persons, orgId));
    counts.person_relationships =
        (await countByIn(supabase, "person_relationships", "from_person_id", persons, orgId)) +
        (await countByIn(supabase, "person_relationships", "to_person_id", persons, orgId));
    counts.customers = cust.length;
    counts.persons = persons.length + (idsOnly ? 0 : await countRows(supabase, "persons", orgId, orDemo));
    counts[PROTECTED_LOCATIONS_TABLE_KEY] = await countRows(supabase, "locations", orgId, orDemo);
    // A4 + subject fixes — counts come straight from the resolved id sets, so the report and the
    // delete cannot disagree.
    if (scope.certificationBaseline && ids.residue) {
        counts.contacts = ids.residue.contactIds.length;
        counts.operational_tasks = Math.max(counts.operational_tasks ?? 0, ids.residue.operationalTaskIds.length);
        counts.form_packet_sessions = ids.residue.formPacketSessionIds.length;
        counts.workflow_events = ids.residue.workflowEventIds.length;
        counts.documents = ids.documentIds.length;
        counts.form_submissions = ids.formSubmissionIds.length;
        counts.communication_threads = ids.threadIds.length;
    }

    // Processing graph (anchor A3) — its own root, not a dependent of the opportunity graph.
    if (scope.certificationBaseline && ids.processingCaseIds?.length) {
        Object.assign(
            counts,
            await countProcessingGraph(supabase, orgId, ids.processingCaseIds, ids.processingPlanIds ?? []),
        );
    }

    // Configuration is preserved in enrollment_runtime_reset — never count work_units / departments
    // for deletion in that mode (they are only removed by the default demo-metadata cleanup).
    counts.work_units = idsOnly ? 0 : await countRows(supabase, "work_units", orgId, orDemo);
    counts.departments = idsOnly ? 0 : await countRows(supabase, "departments", orgId, orDemo);

    return counts;
}
