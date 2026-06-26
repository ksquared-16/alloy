/**
 * Retire a tenant organization — audit + delete operational data.
 *
 * Usage (from web/):
 *   npx tsx scripts/retireOrganization.ts --org-id=<uuid>              # audit only
 *   RETIRE_ORG_CONFIRM=RETIRE_ORGANIZATION npx tsx scripts/retireOrganization.ts --org-id=<uuid> --execute
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Default org when --org-id omitted: 7803388d-cdee-4afb-89cf-23a137f39423 (legacy Alloy Bend demo)
 *
 * Preserves tenant configuration tables (field_definitions, status_definitions, layouts, etc.).
 * Deletes operational CRM/runtime rows and marks org status retired when org row cannot be removed.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { chunk } from "./lib/demoRuntimeCleanupScope";
import type { ResolvedDemoIds } from "./lib/demoRuntimeCleanupScope";
import {
    DEFAULT_RETIRED_ORG_ID,
    RETIRE_ORG_AUDIT_TABLES,
    RETIRE_ORG_CONFIG_TABLES_PRESERVED,
    RETIRE_ORG_CONFIRM_VALUE,
    RETIRE_ORG_TAIL_DELETE_ORDER,
} from "./lib/retireOrganizationScope";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

function parseOrgId(): string {
    const arg = process.argv.find((a) => a.startsWith("--org-id="));
    const fromArg = arg?.slice("--org-id=".length).trim();
    const fromEnv = process.env.RETIRE_ORG_ID?.trim();
    return fromArg || fromEnv || DEFAULT_RETIRED_ORG_ID;
}

const EXECUTE = process.argv.includes("--execute");

async function countOrgRows(supabase: SupabaseAdmin, table: string, orgId: string): Promise<number | null> {
    const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
    if (error) {
        if (error.message.includes("does not exist") || error.code === "42P01") return null;
        throw new Error(`[${table} count] ${error.message}`);
    }
    return count ?? 0;
}

async function selectAllOrgIds(supabase: SupabaseAdmin, table: string, orgId: string): Promise<string[]> {
    const all: string[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from(table)
            .select("id")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[${table} select ids] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) all.push(id);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return all;
}

async function resolveAllOrgOperationalIds(supabase: SupabaseAdmin, orgId: string): Promise<ResolvedDemoIds> {
    const opportunityIds = await selectAllOrgIds(supabase, "opportunities", orgId);
    const customerIds = new Set(await selectAllOrgIds(supabase, "customers", orgId));
    const personIds = new Set(await selectAllOrgIds(supabase, "persons", orgId));
    const customerMemberIds = new Set(await selectAllOrgIds(supabase, "customer_members", orgId));

    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("customer_id, primary_person_id")
            .eq("org_id", orgId)
            .in("id", part);
        if (error) throw new Error(`[opportunities expand] ${error.message}`);
        for (const r of data ?? []) {
            const row = r as { customer_id?: string | null; primary_person_id?: string | null };
            if (row.customer_id) customerIds.add(row.customer_id);
            if (row.primary_person_id) personIds.add(row.primary_person_id);
        }
    }

    for (const part of chunk([...customerIds], 200)) {
        const { data: members, error: mErr } = await supabase
            .from("customer_members")
            .select("id, person_id")
            .eq("org_id", orgId)
            .in("customer_id", part);
        if (mErr) throw new Error(`[customer_members expand] ${mErr.message}`);
        for (const r of members ?? []) {
            const row = r as { id?: string; person_id?: string | null };
            if (row.id) customerMemberIds.add(row.id);
            if (row.person_id) personIds.add(row.person_id);
        }
        const { data: cps, error: cpErr } = await supabase
            .from("customer_persons")
            .select("person_id")
            .eq("org_id", orgId)
            .in("customer_id", part);
        if (cpErr) throw new Error(`[customer_persons expand] ${cpErr.message}`);
        for (const r of cps ?? []) {
            const pid = (r as { person_id?: string }).person_id;
            if (pid) personIds.add(pid);
        }
    }

    const jobIds = new Set<string>();
    for (const part of chunk(opportunityIds, 200)) {
        const { data, error } = await supabase.from("jobs").select("id").eq("org_id", orgId).in("opportunity_id", part);
        if (error) throw new Error(`[jobs by opp] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) jobIds.add(id);
        }
    }
    const { data: allJobs } = await supabase.from("jobs").select("id").eq("org_id", orgId);
    for (const r of allJobs ?? []) {
        const id = (r as { id?: string }).id;
        if (id) jobIds.add(id);
    }

    const scheduleIds = new Set<string>();
    for (const part of chunk([...jobIds], 200)) {
        const { data, error } = await supabase.from("schedules").select("id").eq("org_id", orgId).in("job_id", part);
        if (error) throw new Error(`[schedules by job] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) scheduleIds.add(id);
        }
    }

    const threadIds = new Set<string>();
    const { data: allThreads, error: threadErr } = await supabase
        .from("communication_threads")
        .select("id")
        .eq("org_id", orgId);
    if (threadErr) throw new Error(`[communication_threads select] ${threadErr.message}`);
    for (const r of allThreads ?? []) {
        const id = (r as { id?: string }).id;
        if (id) threadIds.add(id);
    }

    const formSubmissionIds = new Set<string>();
    const { data: allSubs, error: subErr } = await supabase.from("form_submissions").select("id").eq("org_id", orgId);
    if (subErr) throw new Error(`[form_submissions select] ${subErr.message}`);
    for (const r of allSubs ?? []) {
        const id = (r as { id?: string }).id;
        if (id) formSubmissionIds.add(id);
    }

    const documentIds = new Set<string>();
    const { data: allDocs, error: docErr } = await supabase.from("documents").select("id").eq("org_id", orgId);
    if (docErr) throw new Error(`[documents select] ${docErr.message}`);
    for (const r of allDocs ?? []) {
        const id = (r as { id?: string }).id;
        if (id) documentIds.add(id);
    }

    return {
        opportunityIds,
        customerIds: [...customerIds],
        personIds: [...personIds],
        customerMemberIds: [...customerMemberIds],
        jobIds: [...jobIds],
        scheduleIds: [...scheduleIds],
        threadIds: [...threadIds],
        formSubmissionIds: [...formSubmissionIds],
        documentIds: [...documentIds],
    };
}

async function deleteByIn(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string,
    selectShape: "id" | "*" = "id"
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).delete().in(column, part).select(selectShape);
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) {
            if (error.message.includes("does not exist") && selectShape === "id") {
                let countQuery = supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
                if (orgId) countQuery = countQuery.eq("org_id", orgId);
                const { count, error: countErr } = await countQuery;
                if (countErr) throw new Error(`[${table} delete ${column}] ${countErr.message}`);
                if (!count) continue;
                let deleteQuery = supabase.from(table).delete().in(column, part);
                if (orgId) deleteQuery = deleteQuery.eq("org_id", orgId);
                const { error: delErr } = await deleteQuery;
                if (delErr) throw new Error(`[${table} delete ${column}] ${delErr.message}`);
                n += count;
                continue;
            }
            throw new Error(`[${table} delete ${column}] ${error.message}`);
        }
        n += (data ?? []).length;
    }
    return n;
}

async function deleteOrgRows(supabase: SupabaseAdmin, table: string, orgId: string): Promise<number> {
    const { data, error } = await supabase.from(table).delete().eq("org_id", orgId).select("id");
    if (error) {
        if (error.message.includes("does not exist") || error.code === "42P01") return 0;
        throw new Error(`[${table} delete org_id] ${error.message}`);
    }
    return (data ?? []).length;
}

async function deleteCrmGraph(supabase: SupabaseAdmin, orgId: string, ids: ResolvedDemoIds): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};
    const opp = ids.opportunityIds;
    const cust = ids.customerIds;
    const persons = ids.personIds;
    const members = ids.customerMemberIds;
    const jobs = ids.jobIds;
    const schedules = ids.scheduleIds;
    const threads = ids.threadIds;
    const formSubs = ids.formSubmissionIds;
    const docIds = ids.documentIds;
    const entityIdsForWorkflow = [...new Set([...opp, ...cust, ...jobs])];

    const msgIds: string[] = [];
    for (const part of chunk(threads, 150)) {
        const { data, error } = await supabase.from("communication_messages").select("id").eq("org_id", orgId).in("thread_id", part);
        if (error) throw new Error(`[communication_messages select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) msgIds.push(id);
        }
    }
    deleted.communication_message_reads = await deleteByIn(supabase, "communication_message_reads", "message_id", msgIds);
    deleted.communication_messages = await deleteByIn(supabase, "communication_messages", "thread_id", threads, orgId);
    deleted.communication_scheduled_sends =
        (await deleteByIn(supabase, "communication_scheduled_sends", "entity_id", opp, orgId)) +
        (await deleteByIn(supabase, "communication_scheduled_sends", "recipient_person_id", persons, orgId));
    deleted.communication_threads = await deleteByIn(supabase, "communication_threads", "id", threads, orgId);

    deleted.task_assist_proposals = await deleteByIn(supabase, "task_assist_proposals", "entity_id", opp, orgId);
    deleted.operational_tasks = await deleteByIn(supabase, "operational_tasks", "entity_id", opp, orgId);

    const pcIds: string[] = [];
    for (const part of chunk(opp, 200)) {
        const { data } = await supabase.from("placement_candidates").select("id").eq("org_id", orgId).in("opportunity_id", part);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) pcIds.push(id);
        }
    }
    deleted.placement_overrides = await deleteByIn(supabase, "placement_overrides", "placement_candidate_id", pcIds, orgId);
    deleted.placement_link_group_members = await deleteByIn(supabase, "placement_link_group_members", "placement_candidate_id", pcIds, orgId);
    deleted.placement_link_groups = await deleteByIn(supabase, "placement_link_groups", "opportunity_id", opp, orgId);
    deleted.placement_candidates = await deleteByIn(supabase, "placement_candidates", "opportunity_id", opp, orgId);

    deleted.tour_public_booking_links = await deleteByIn(supabase, "tour_public_booking_links", "opportunity_id", opp, orgId);
    deleted.tour_bookings = await deleteByIn(supabase, "tour_bookings", "opportunity_id", opp, orgId);
    deleted.opportunity_tags = await deleteByIn(supabase, "opportunity_tags", "opportunity_id", opp, undefined, "*");
    deleted.opportunity_persons = await deleteByIn(supabase, "opportunity_persons", "opportunity_id", opp, orgId);
    deleted.opportunity_customer_members = await deleteByIn(supabase, "opportunity_customer_members", "opportunity_id", opp, orgId);

    deleted.quotes = await deleteByIn(supabase, "quotes", "opportunity_id", opp, orgId);
    deleted.messages =
        (await deleteByIn(supabase, "messages", "opportunity_id", opp)) + (await deleteByIn(supabase, "messages", "job_id", jobs));

    const eventIds = new Set<string>();
    for (const part of chunk(entityIdsForWorkflow, 150)) {
        const { data, error } = await supabase.from("workflow_events").select("id").eq("org_id", orgId).in("entity_id", part);
        if (error) throw new Error(`[workflow_events select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) eventIds.add(id);
        }
    }
    const runIds = new Set<string>();
    for (const part of chunk([...eventIds], 150)) {
        const { data, error } = await supabase.from("workflow_runs").select("id").eq("org_id", orgId).in("event_id", part);
        if (error) throw new Error(`[workflow_runs select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) runIds.add(id);
        }
    }
    deleted.workflow_action_runs = await deleteByIn(supabase, "workflow_action_runs", "workflow_run_id", [...runIds], orgId);
    deleted.messages_outbox = await deleteByIn(supabase, "messages_outbox", "workflow_run_id", [...runIds], orgId);
    deleted.workflow_runs = await deleteByIn(supabase, "workflow_runs", "id", [...runIds], orgId);
    deleted.workflow_events = await deleteByIn(supabase, "workflow_events", "id", [...eventIds], orgId);
    deleted.action_links = await deleteByIn(supabase, "action_links", "entity_id", entityIdsForWorkflow, orgId);

    deleted.schedule_tags = await deleteByIn(supabase, "schedule_tags", "schedule_id", schedules, undefined, "*");
    const paymentIds: string[] = [];
    for (const part of chunk(jobs, 200)) {
        const { data, error } = await supabase.from("payments").select("id").eq("org_id", orgId).in("job_id", part);
        if (error) throw new Error(`[payments select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) paymentIds.push(id);
        }
    }
    deleted.payment_allocations = await deleteByIn(supabase, "payment_allocations", "payment_id", paymentIds, orgId);
    deleted.payments = await deleteByIn(supabase, "payments", "job_id", jobs, orgId);
    const chargeIds: string[] = [];
    for (const part of chunk(jobs, 200)) {
        const { data, error } = await supabase.from("charges").select("id").eq("org_id", orgId).in("job_id", part);
        if (error) throw new Error(`[charges select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) chargeIds.push(id);
        }
    }
    deleted.charge_line_items = await deleteByIn(supabase, "charge_line_items", "charge_id", chargeIds, orgId);
    deleted.charges = await deleteByIn(supabase, "charges", "job_id", jobs, orgId);
    deleted.discount_redemptions =
        (await deleteByIn(supabase, "discount_redemptions", "job_id", jobs)) +
        (await deleteByIn(supabase, "discount_redemptions", "opportunity_id", opp));
    deleted.assignments = await deleteByIn(supabase, "assignments", "job_id", jobs, orgId);
    deleted.schedules = await deleteByIn(supabase, "schedules", "job_id", jobs, orgId);
    deleted.jobs = await deleteByIn(supabase, "jobs", "id", jobs, orgId);

    deleted.form_packet_session_items = await deleteByIn(supabase, "form_packet_session_items", "form_submission_id", formSubs, orgId);
    deleted.form_submission_signatures = await deleteByIn(supabase, "form_submission_signatures", "form_submission_id", formSubs, orgId);
    deleted.form_submission_documents = await deleteByIn(supabase, "form_submission_documents", "form_submission_id", formSubs, orgId);
    deleted.form_submissions = await deleteByIn(supabase, "form_submissions", "id", formSubs, orgId);

    deleted.document_field_values = await deleteByIn(supabase, "document_field_values", "document_id", docIds, orgId);
    deleted.document_versions = await deleteByIn(supabase, "document_versions", "document_id", docIds, orgId);
    deleted.documents = await deleteByIn(supabase, "documents", "id", docIds, orgId);

    deleted.field_values = await deleteOrgRows(supabase, "field_values", orgId);

    deleted.opportunities = await deleteByIn(supabase, "opportunities", "id", opp, orgId);
    deleted.customer_member_contacts =
        (await deleteByIn(supabase, "customer_member_contacts", "customer_member_id", members, orgId)) +
        (await deleteByIn(supabase, "customer_member_contacts", "customer_id", cust, orgId));
    deleted.customer_tags = await deleteByIn(supabase, "customer_tags", "customer_id", cust, undefined, "*");
    deleted.customer_subscriptions = await deleteByIn(supabase, "customer_subscriptions", "customer_id", cust, orgId);
    deleted.customer_payment_methods = await deleteByIn(
        supabase,
        "customer_payment_methods",
        "customer_id",
        cust,
        undefined,
        "*"
    );
    deleted.customer_members = await deleteByIn(supabase, "customer_members", "customer_id", cust, orgId);
    deleted.customer_persons = await deleteByIn(supabase, "customer_persons", "customer_id", cust, orgId);
    deleted.contacts = await deleteOrgRows(supabase, "contacts", orgId);
    deleted.person_locations = await deleteOrgRows(supabase, "person_locations", orgId);
    deleted.person_relationships =
        (await deleteByIn(supabase, "person_relationships", "from_person_id", persons, orgId)) +
        (await deleteByIn(supabase, "person_relationships", "to_person_id", persons, orgId));
    deleted.customers = await deleteByIn(supabase, "customers", "id", cust, orgId);
    deleted.persons = await deleteByIn(supabase, "persons", "id", persons, orgId);

    return deleted;
}

async function auditOrg(supabase: SupabaseAdmin, orgId: string): Promise<Record<string, number | null>> {
    const counts: Record<string, number | null> = {};
    for (const table of RETIRE_ORG_AUDIT_TABLES) {
        counts[table] = await countOrgRows(supabase, table, orgId);
    }
    return counts;
}

async function main(): Promise<void> {
    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run: VERCEL_ENV=production");
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY (service role required)");
        process.exit(1);
    }

    const orgId = parseOrgId();
    const supabase = createAdminClient();

    const { data: orgRow, error: orgErr } = await supabase.from("orgs").select("id, name, slug, status").eq("id", orgId).maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    if (!orgRow) {
        console.error(`Org not found: ${orgId}`);
        process.exit(1);
    }

    console.log("\n=== retireOrganization ===\n");
    console.log(`org_id: ${orgId}`);
    console.log(`name: ${(orgRow as { name?: string }).name ?? "—"}`);
    console.log(`slug: ${(orgRow as { slug?: string }).slug ?? "—"}`);
    console.log(`mode: ${EXECUTE ? "EXECUTE (destructive)" : "audit only"}`);
    console.log("");

    const before = await auditOrg(supabase, orgId);
    console.log("--- Audit counts (operational tables) ---\n");
    let operationalTotal = 0;
    for (const [table, count] of Object.entries(before)) {
        if (count == null) {
            console.log(`${table}: (table unavailable)`);
            continue;
        }
        console.log(`${table}: ${count}`);
        operationalTotal += count;
    }
    console.log(`\noperational_row_total (sum of audit tables): ${operationalTotal}`);

    console.log("\n--- Configuration preserved (not deleted) ---\n");
    for (const table of RETIRE_ORG_CONFIG_TABLES_PRESERVED.slice(0, 12)) {
        const n = await countOrgRows(supabase, table, orgId);
        if (n != null && n > 0) console.log(`${table}: ${n} (preserved)`);
    }
    console.log(`… and ${RETIRE_ORG_CONFIG_TABLES_PRESERVED.length} config table types total`);

    if (!EXECUTE) {
        console.log("\nDry run complete. To execute:");
        console.log(`  RETIRE_ORG_CONFIRM=${RETIRE_ORG_CONFIRM_VALUE} npx tsx scripts/retireOrganization.ts --org-id=${orgId} --execute`);
        return;
    }

    if (process.env.RETIRE_ORG_CONFIRM?.trim() !== RETIRE_ORG_CONFIRM_VALUE) {
        console.error(`Refusing execute: set RETIRE_ORG_CONFIRM=${RETIRE_ORG_CONFIRM_VALUE}`);
        process.exit(1);
    }

    const ids = await resolveAllOrgOperationalIds(supabase, orgId);
    console.log("\n--- Resolved CRM graph ---\n");
    console.log(`opportunities: ${ids.opportunityIds.length}`);
    console.log(`customers: ${ids.customerIds.length}`);
    console.log(`persons: ${ids.personIds.length}`);
    console.log(`customer_members: ${ids.customerMemberIds.length}`);

    const crmDeleted = await deleteCrmGraph(supabase, orgId, ids);
    console.log("\n--- CRM graph deleted ---\n");
    for (const [table, n] of Object.entries(crmDeleted).sort(([a], [b]) => a.localeCompare(b))) {
        if (n > 0) console.log(`${table}: ${n}`);
    }

    const tailDeleted: Record<string, number> = {};
    for (const table of RETIRE_ORG_TAIL_DELETE_ORDER) {
        const n = await deleteOrgRows(supabase, table, orgId);
        if (n > 0) tailDeleted[table] = n;
    }

    console.log("\n--- Tail org_id deletes ---\n");
    for (const [table, n] of Object.entries(tailDeleted).sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`${table}: ${n}`);
    }

    const after = await auditOrg(supabase, orgId);
    console.log("\n--- Post-delete audit (should be 0 for operational tables) ---\n");
    for (const table of RETIRE_ORG_AUDIT_TABLES) {
        const n = after[table];
        if (n == null) continue;
        if (n > 0) console.log(`${table}: ${n} REMAINING`);
    }

    const { error: delOrgErr } = await supabase.from("orgs").delete().eq("id", orgId);
    if (delOrgErr) {
        console.log("\nOrg row not removed (FK to preserved config). Marking status=retired.");
        await supabase.from("orgs").update({ status: "retired" }).eq("id", orgId);
    } else {
        console.log("\nOrg row deleted.");
    }

    console.log("\nRetire complete.\n");
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
