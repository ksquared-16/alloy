import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isFormsQaArtifactEmail,
    opportunityNameMatchesFormsQaFingerprint,
    submissionPayloadMatchesFormsQaFingerprint,
} from "@/lib/forms/formsQaArtifactFingerprints";

export type FormsQaArtifactPlan = {
    orgId: string;
    submissionIds: string[];
    opportunityIds: string[];
    personIds: string[];
    customerIds: string[];
    workflowEventIds: string[];
    opportunities: Array<{ id: string; name: string | null; status_key: string | null }>;
    submissions: Array<{ id: string; status: string; opportunity_id: string | null }>;
};

export type CleanupFormsQaArtifactsOptions = {
    orgId: string;
    /** When false, return plan only (default). */
    confirm?: boolean;
    /** Archive to lost instead of hard delete (default false — hard delete QA rows). */
    archiveOnly?: boolean;
    /** Restrict cleanup to explicit submission ids (post-QA-run). */
    submissionIds?: string[];
};

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function listOrgSubmissions(supabase: SupabaseClient, orgId: string): Promise<
    Array<{
        id: string;
        status: string;
        opportunity_id: string | null;
        person_id: string | null;
        customer_id: string | null;
        payload: unknown;
    }>
> {
    const rows: Array<{
        id: string;
        status: string;
        opportunity_id: string | null;
        person_id: string | null;
        customer_id: string | null;
        payload: unknown;
    }> = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from("form_submissions")
            .select("id,status,opportunity_id,person_id,customer_id,payload")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[form_submissions select] ${error.message}`);
        for (const row of data ?? []) {
            rows.push(row as (typeof rows)[number]);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return rows;
}

async function listQaOpportunitiesByName(supabase: SupabaseClient, orgId: string): Promise<
    Array<{ id: string; name: string | null; status_key: string | null; primary_person_id: string | null; customer_id: string | null }>
> {
    const { data, error } = await supabase
        .from("opportunities")
        .select("id,name,status_key,primary_person_id,customer_id")
        .eq("org_id", orgId)
        .in("status_key", ["new_inquiry", "new", "open"]);
    if (error) throw new Error(`[opportunities select] ${error.message}`);

    return (data ?? []).filter((row) =>
        opportunityNameMatchesFormsQaFingerprint((row as { name?: string | null }).name ?? null)
    ) as Array<{
        id: string;
        name: string | null;
        status_key: string | null;
        primary_person_id: string | null;
        customer_id: string | null;
    }>;
}

async function collectWorkflowEventIds(
    supabase: SupabaseClient,
    orgId: string,
    submissionIds: string[],
    opportunityIds: string[]
): Promise<string[]> {
    const ids = new Set<string>();
    const entityIds = [...new Set([...submissionIds, ...opportunityIds])];
    for (const part of chunk(entityIds, 100)) {
        const { data, error } = await supabase
            .from("workflow_events")
            .select("id,payload,entity_id")
            .eq("org_id", orgId)
            .in("entity_id", part);
        if (error) throw new Error(`[workflow_events select] ${error.message}`);
        for (const row of data ?? []) {
            const id = (row as { id?: string }).id;
            if (id) ids.add(id);
        }
    }

    // Also match payload.form_submission_id for events not keyed by entity_id
    const { data: recent, error: recentErr } = await supabase
        .from("workflow_events")
        .select("id,payload")
        .eq("org_id", orgId)
        .order("occurred_at", { ascending: false })
        .limit(500);
    if (recentErr) throw new Error(`[workflow_events recent] ${recentErr.message}`);
    const submissionSet = new Set(submissionIds);
    for (const row of recent ?? []) {
        const payload = (row as { payload?: Record<string, unknown> }).payload;
        const subId =
            payload && typeof payload.form_submission_id === "string" ? payload.form_submission_id : null;
        if (subId && submissionSet.has(subId)) {
            const id = (row as { id?: string }).id;
            if (id) ids.add(id);
        }
    }

    return [...ids];
}

async function personEmailIsQaOnly(supabase: SupabaseClient, orgId: string, personId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("persons")
        .select("id,email")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    if (error || !data) return false;
    return isFormsQaArtifactEmail((data as { email?: string | null }).email ?? null);
}

async function deleteByColumnIn(
    supabase: SupabaseClient,
    table: string,
    orgId: string | null,
    column: string,
    ids: string[]
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).delete().in(column, part).select("*");
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) throw new Error(`[${table} delete ${column}] ${error.message}`);
        n += (data ?? []).length;
    }
    return n;
}

async function deleteByIds(
    supabase: SupabaseClient,
    table: string,
    orgId: string | null,
    column: string,
    ids: string[]
): Promise<number> {
    return deleteByColumnIn(supabase, table, orgId, column, ids);
}

/** Discover QA artifacts for an org (dry-run plan). */
export async function planFormsQaArtifactCleanup(
    supabase: SupabaseClient,
    options: CleanupFormsQaArtifactsOptions
): Promise<FormsQaArtifactPlan> {
    const { orgId, submissionIds: restrictSubmissionIds } = options;
    const allSubmissions = await listOrgSubmissions(supabase, orgId);
    const restrict = restrictSubmissionIds?.length ? new Set(restrictSubmissionIds) : null;

    const matchedSubmissions = allSubmissions.filter((row) => {
        if (restrict && !restrict.has(row.id)) return false;
        return submissionPayloadMatchesFormsQaFingerprint(row.payload);
    });

    const opportunityIds = new Set<string>();
    const personIds = new Set<string>();
    const customerIds = new Set<string>();

    for (const row of matchedSubmissions) {
        if (row.opportunity_id) opportunityIds.add(row.opportunity_id);
        if (row.person_id) personIds.add(row.person_id);
        if (row.customer_id) customerIds.add(row.customer_id);
    }

    // Orphan QA opportunities (name fingerprint) without submission link
    const qaOpps = await listQaOpportunitiesByName(supabase, orgId);
    for (const opp of qaOpps) {
        opportunityIds.add(opp.id);
        if (opp.primary_person_id) personIds.add(opp.primary_person_id);
        if (opp.customer_id) customerIds.add(opp.customer_id);
    }

    const submissionIds = matchedSubmissions.map((s) => s.id);
    const workflowEventIds = await collectWorkflowEventIds(supabase, orgId, submissionIds, [...opportunityIds]);

    const { data: oppRows } = await supabase
        .from("opportunities")
        .select("id,name,status_key")
        .eq("org_id", orgId)
        .in("id", [...opportunityIds]);
    const opportunities = (oppRows ?? []) as FormsQaArtifactPlan["opportunities"];

    return {
        orgId,
        submissionIds,
        opportunityIds: [...opportunityIds],
        personIds: [...personIds],
        customerIds: [...customerIds],
        workflowEventIds,
        opportunities,
        submissions: matchedSubmissions.map((s) => ({
            id: s.id,
            status: s.status,
            opportunity_id: s.opportunity_id,
        })),
    };
}

export type CleanupFormsQaArtifactsResult = {
    plan: FormsQaArtifactPlan;
    dryRun: boolean;
    deleted: Record<string, number>;
};

/** Execute cleanup for QA artifacts (requires confirm: true). */
export async function cleanupFormsQaArtifacts(
    supabase: SupabaseClient,
    options: CleanupFormsQaArtifactsOptions
): Promise<CleanupFormsQaArtifactsResult> {
    const plan = await planFormsQaArtifactCleanup(supabase, options);
    const deleted: Record<string, number> = {};

    if (!options.confirm) {
        return { plan, dryRun: true, deleted };
    }

    if (options.archiveOnly) {
        for (const part of chunk(plan.opportunityIds, 200)) {
            const { data, error } = await supabase
                .from("opportunities")
                .update({
                    status_key: "lost",
                    metadata: { qa_artifact_cleanup: true, cleanup_reason: "forms_qa_script" },
                })
                .eq("org_id", options.orgId)
                .in("id", part)
                .select("id");
            if (error) throw new Error(`[opportunities archive] ${error.message}`);
            deleted.opportunities_archived = (deleted.opportunities_archived ?? 0) + (data ?? []).length;
        }
    } else {
        deleted.workflow_events = await deleteByIds(
            supabase,
            "workflow_events",
            options.orgId,
            "id",
            plan.workflowEventIds
        );
        deleted.opportunity_persons = await deleteByIds(
            supabase,
            "opportunity_persons",
            options.orgId,
            "opportunity_id",
            plan.opportunityIds
        );
        deleted.form_submissions = await deleteByIds(
            supabase,
            "form_submissions",
            options.orgId,
            "id",
            plan.submissionIds
        );
        deleted.opportunities = await deleteByIds(
            supabase,
            "opportunities",
            options.orgId,
            "id",
            plan.opportunityIds
        );

        // QA persons with @example.com only — skip if name matches but email doesn't (safety)
        const safePersonIds: string[] = [];
        for (const personId of plan.personIds) {
            if (await personEmailIsQaOnly(supabase, options.orgId, personId)) {
                safePersonIds.push(personId);
            }
        }
        deleted.persons = await deleteByIds(supabase, "persons", options.orgId, "id", safePersonIds);
    }

    return { plan, dryRun: false, deleted };
}

/** Convenience: cleanup artifacts from a single QA run submission. */
export async function cleanupFormsQaRunArtifacts(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string
): Promise<CleanupFormsQaArtifactsResult> {
    return cleanupFormsQaArtifacts(supabase, {
        orgId,
        confirm: true,
        submissionIds: [submissionId],
    });
}
