/**
 * Certification baseline — database side of anchors A2 and A3.
 *
 * Gathers the rows the pure classifier needs and returns the additional identities and Processing
 * graph the certification reset must remove. All reads are org-scoped and paged; the classification
 * itself lives in `certificationBaselineSelection.ts` so it can be tested without a database.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import { chunk } from "./demoRuntimeCleanupScope";
import {
    PROCESSING_CLEANUP_TABLE_ORDER,
    PROCESSING_LINK_COLUMN,
    classifyCertificationIdentities,
    selectProcessingCaseIds,
    type CertificationClassification,
    type IdentityVerdict,
} from "./certificationBaselineSelection";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const PAGE = 1000;

/** Read a whole org-scoped table, paged — a truncated read here understates a delete. */
async function readAll(
    supabase: SupabaseAdmin,
    table: string,
    columns: string,
    orgId: string,
): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from(table)
            .select(columns)
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`[certification read ${table}] ${error.message}`);
        const page = (data ?? []) as unknown as Array<Record<string, unknown>>;
        out.push(...page);
        if (page.length < PAGE) break;
    }
    return out;
}

export type CertificationBaselineResolution = {
    classification: CertificationClassification;
    /** Customers A2 adds beyond what the opportunity graph already resolved. */
    additionalCustomerIds: string[];
    /** Persons A2 adds beyond what the opportunity graph already resolved. */
    additionalPersonIds: string[];
    /** customer_members rows belonging to A2 customers. */
    additionalCustomerMemberIds: string[];
    /** Processing cases selected by A3. */
    processingCaseIds: string[];
    processingPlanIds: string[];
    preservedProcessingCases: Array<{ id: string; reason: string }>;
    /** Non-empty means the run must refuse before deleting anything. */
    ambiguous: IdentityVerdict[];
};

export async function resolveCertificationBaseline(
    supabase: SupabaseAdmin,
    orgId: string,
    input: {
        targetOpportunityIds: string[];
        /** Golden-path (or otherwise externally protected) opportunities, never targets. */
        protectedOpportunityIds: string[];
        /** Identities the opportunity graph already resolved. */
        alreadyResolvedCustomerIds: string[];
        alreadyResolvedPersonIds: string[];
    },
): Promise<CertificationBaselineResolution> {
    const [customers, persons, opportunities, cpLinks, cmLinks, contacts, oppPersons] = await Promise.all([
        readAll(supabase, "customers", "id, org_id, name", orgId),
        readAll(supabase, "persons", "id, org_id, full_name, is_employee", orgId),
        readAll(supabase, "opportunities", "id, org_id, customer_id, primary_person_id", orgId),
        readAll(supabase, "customer_persons", "id, org_id, customer_id, person_id", orgId),
        readAll(supabase, "customer_members", "id, org_id, customer_id, person_id", orgId),
        readAll(supabase, "contacts", "id, org_id, customer_id, person_id", orgId).catch(() => []),
        readAll(supabase, "opportunity_persons", "id, org_id, opportunity_id, person_id", orgId).catch(() => []),
    ]);

    // Golden-path opportunities protect whatever they reference — they are NOT targets even under
    // the widest breadth, so their families are genuinely shared.
    const protectedOpps = new Set(input.protectedOpportunityIds);
    const protectedCustomerIds = opportunities
        .filter((o) => protectedOpps.has(String(o.id)) && o.customer_id)
        .map((o) => String(o.customer_id));
    const protectedPersonIds = opportunities
        .filter((o) => protectedOpps.has(String(o.id)) && o.primary_person_id)
        .map((o) => String(o.primary_person_id));

    const classification = classifyCertificationIdentities({
        orgId,
        customers: customers.map((r) => ({ id: String(r.id), org_id: r.org_id as string, name: r.name as string })),
        persons: persons.map((r) => ({
            id: String(r.id),
            org_id: r.org_id as string,
            full_name: r.full_name as string,
            is_employee: (r.is_employee ?? null) as boolean | null,
        })),
        opportunities: opportunities.map((r) => ({
            id: String(r.id),
            customer_id: (r.customer_id ?? null) as string | null,
            primary_person_id: (r.primary_person_id ?? null) as string | null,
        })),
        targetOpportunityIds: input.targetOpportunityIds,
        opportunityPersonRefs: oppPersons
            .filter((r) => r.opportunity_id && r.person_id)
            .map((r) => ({ opportunity_id: String(r.opportunity_id), person_id: String(r.person_id) })),
        personCustomerLinks: [...cpLinks, ...cmLinks]
            .filter((r) => r.customer_id && r.person_id)
            .map((r) => ({ customer_id: String(r.customer_id), person_id: String(r.person_id) })),
        contactRefs: contacts.map((r) => ({
            customer_id: (r.customer_id ?? null) as string | null,
            person_id: (r.person_id ?? null) as string | null,
        })),
        protectedCustomerIds,
        protectedPersonIds,
    });

    const already = {
        customers: new Set(input.alreadyResolvedCustomerIds),
        persons: new Set(input.alreadyResolvedPersonIds),
    };
    const additionalCustomerIds = classification.targetCustomerIds.filter((id) => !already.customers.has(id));
    const additionalPersonIds = classification.targetPersonIds.filter((id) => !already.persons.has(id));

    const targetCustomerSet = new Set(classification.targetCustomerIds);
    const additionalCustomerMemberIds = cmLinks
        .filter((r) => r.customer_id && targetCustomerSet.has(String(r.customer_id)))
        .map((r) => String(r.id));

    // --- A3: Processing ---------------------------------------------------------------------
    const cases = await readAll(
        supabase,
        "processing_cases",
        "id, org_id, primary_opportunity_id, primary_customer_id",
        orgId,
    );
    const { targetCaseIds, preserved } = selectProcessingCaseIds({
        cases: cases.map((r) => ({
            id: String(r.id),
            primary_opportunity_id: (r.primary_opportunity_id ?? null) as string | null,
            primary_customer_id: (r.primary_customer_id ?? null) as string | null,
        })),
        targetOpportunityIds: input.targetOpportunityIds,
        targetCustomerIds: classification.targetCustomerIds,
        allOpportunityIds: opportunities.map((o) => String(o.id)),
        allCustomerIds: customers.map((k) => String(k.id)),
    });

    const processingPlanIds: string[] = [];
    for (const part of chunk(targetCaseIds, 200)) {
        const { data, error } = await supabase
            .from("processing_commit_plans")
            .select("id")
            .eq("org_id", orgId)
            .in("case_id", part);
        if (error) throw new Error(`[certification processing_commit_plans] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) processingPlanIds.push(id);
        }
    }

    return {
        classification,
        additionalCustomerIds,
        additionalPersonIds,
        additionalCustomerMemberIds,
        processingCaseIds: targetCaseIds,
        processingPlanIds,
        preservedProcessingCases: preserved,
        ambiguous: classification.ambiguous,
    };
}

/** Per-table counts for the Processing graph, in FK-safe order. */
export async function countProcessingGraph(
    supabase: SupabaseAdmin,
    orgId: string,
    caseIds: string[],
    planIds: string[],
): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of PROCESSING_CLEANUP_TABLE_ORDER) {
        counts[table] = 0;
    }
    if (!caseIds.length) return counts;

    for (const table of PROCESSING_CLEANUP_TABLE_ORDER) {
        if (table === "processing_cases") continue;
        const column = PROCESSING_LINK_COLUMN[table];
        const anchorIds = column === "plan_id" ? planIds : caseIds;
        let total = 0;
        for (const part of chunk(anchorIds, 200)) {
            const { count, error } = await supabase
                .from(table)
                .select("*", { count: "exact", head: true })
                .eq("org_id", orgId)
                .in(column, part);
            if (error) throw new Error(`[certification count ${table}.${column}] ${error.message}`);
            total += count ?? 0;
        }
        counts[table] = total;
    }
    counts.processing_cases = caseIds.length;
    return counts;
}
