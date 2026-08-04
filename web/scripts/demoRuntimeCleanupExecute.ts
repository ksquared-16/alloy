#!/usr/bin/env npx tsx
/**
 * Phase 2 — demo/runtime cleanup EXECUTE (destructive).
 *
 * Deletes org-scoped demo/runtime rows in FK-safe order with per-table logging.
 * Refuses without confirmation env. Use TypeScript demo:cleanup:* only (no SQL execute).
 *
 * Env:
 *   DEMO_RESET_ORG_ID (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA (required)
 *   DEMO_SEED_PACKAGE | DEMO_SEED_RUN_ID | DEMO_SEED_FAMILY_KEY (optional narrow filters)
 *
 * Usage (from `web/`):
 *   npm run demo:cleanup:dry
 *   DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA npm run demo:cleanup:execute
 *
 * @see docs/platform/governance/demo-runtime-cleanup-workflow.md
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER,
    COMMUNICATIONS_ORPHAN_RESET_MODE,
    DEMO_CLEANUP_CONFIRM_VALUE,
    DEMO_CLEANUP_TABLE_ORDER,
    ENROLLMENT_RUNTIME_RESET_MODE,
    PROTECTED_LOCATIONS_TABLE_KEY,
    demoMetadataOrFilter,
    chunk,
    parseDemoCleanupScopeFromEnv,
    type DemoCleanupScope,
    type ResolvedDemoIds,
} from "./lib/demoRuntimeCleanupScope";
import { PROCESSING_LINK_COLUMN } from "./lib/certificationBaselineSelection";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import {
    buildCertificationPlan,
    computePlanIdentity,
    validateStorageManifest,
    type StorageManifest,
} from "./lib/certificationPlanIdentity";
import {
    executeCertificationReset,
    supabaseStorageClient,
} from "./lib/certificationResetOrchestrator";
import { buildCommunicationsOrphanSelection } from "./lib/communicationsOrphanResetSelection";
import {
    executeCommunicationsOrphanDeletes,
    printCommunicationsOrphanReport,
} from "./lib/communicationsOrphanResetExecute";
import {
    buildDemoCleanupCounts,
    buildEnrollmentResetSelection,
    deleteProcessInstancesForCleanup,
    resolveDemoIds,
} from "./lib/demoRuntimeCleanupPlan";
import type { EnrollmentResetOpportunityRow } from "./lib/demoRuntimeCleanupPlan";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** Post-commit emptiness check. Storage may only begin once every one of these reads zero. */
const CERTIFICATION_VERIFY_EMPTY = [
    "opportunities", "customers", "persons", "customer_persons", "customer_members", "contacts",
    "operational_tasks", "process_instances", "tour_bookings", "communication_threads",
    "communication_messages", "form_submissions", "form_packet_sessions", "documents",
    "processing_cases", "processing_case_sources", "processing_facts", "processing_resolutions",
    "processing_commit_plans", "processing_plan_operations", "processing_commit_attempts",
    "processing_approvals", "processing_exceptions",
] as const;

function errMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err && typeof (err as { message: string }).message === "string") {
        return (err as { message: string }).message;
    }
    return String(err);
}

function printEnrollmentResetReport(selection: {
    selected: EnrollmentResetOpportunityRow[];
    excludedGoldenPath: EnrollmentResetOpportunityRow[];
    enrollmentWorkUnitIds: string[];
}): void {
    console.log("--- enrollment_runtime_reset opportunity selection ---\n");
    console.log(`enrollment_work_unit_ids: ${selection.enrollmentWorkUnitIds.length ? selection.enrollmentWorkUnitIds.join(", ") : "(none)"}`);
    console.log(`selected_opportunities: ${selection.selected.length}`);
    console.log(`excluded_golden_path_opportunities: ${selection.excludedGoldenPath.length}\n`);

    if (selection.selected.length) {
        console.log("Selected (would delete):");
        for (const row of selection.selected) {
            console.log(
                `  - ${row.name ?? "(unnamed)"} | status=${row.status_key ?? "—"} | work_unit_id=${row.work_unit_id ?? "—"} | id=${row.id}`
            );
        }
        console.log("");
    }

    if (selection.excludedGoldenPath.length) {
        console.log("Excluded golden-path (protected):");
        for (const row of selection.excludedGoldenPath) {
            console.log(
                `  - ${row.name ?? "(unnamed)"} | status=${row.status_key ?? "—"} | work_unit_id=${row.work_unit_id ?? "—"} | id=${row.id}`
            );
        }
        console.log("");
    }
}

async function deleteByIn(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string,
    selectShape: "*" | "id" = "id"
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        let q = supabase.from(table).delete().in(column, part).select(selectShape);
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) throw new Error(`[${table} delete ${column}] ${error.message}`);
        n += (data ?? []).length;
    }
    return n;
}

/** Delete by column filter without selecting `id` (tables with composite PK / no id column). */
async function deleteByInColumnFilter(
    supabase: SupabaseAdmin,
    table: string,
    column: string,
    ids: string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let n = 0;
    for (const part of chunk(ids, 200)) {
        let countQuery = supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
        if (orgId) countQuery = countQuery.eq("org_id", orgId);
        const { count, error: countError } = await countQuery;
        if (countError) throw new Error(`[${table} count ${column}] ${countError.message}`);
        if (!count) continue;

        let deleteQuery = supabase.from(table).delete().in(column, part);
        if (orgId) deleteQuery = deleteQuery.eq("org_id", orgId);
        const { error } = await deleteQuery;
        if (error) throw new Error(`[${table} delete ${column}] ${error.message}`);
        n += count;
    }
    return n;
}

async function deleteByOr(supabase: SupabaseAdmin, table: string, orgId: string, orFilter: string): Promise<number> {
    const { data, error } = await supabase.from(table).delete().eq("org_id", orgId).or(orFilter).select("id");
    if (error) throw new Error(`[${table} delete or] ${error.message}`);
    return (data ?? []).length;
}

async function executeDeletes(
    supabase: SupabaseAdmin,
    scope: DemoCleanupScope,
    ids: ResolvedDemoIds,
    orDemo: string
): Promise<Record<string, number>> {
    const { orgId } = scope;
    const idsOnly = scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE;

    // Belt and braces: certification never reaches here, and if a future edit routes it here it
    // must fail loudly rather than silently resurrect the sequential path that caused the incident.
    if (scope.certificationBaseline) {
        throw new Error(
            "Sequential deletion is not permitted in certification mode — use the atomic reset authority."
        );
    }
    const opp = ids.opportunityIds;
    const cust = ids.customerIds;
    const persons = ids.personIds;
    const members = ids.customerMemberIds;
    const jobs = ids.jobIds;
    const schedules = ids.scheduleIds;
    const threads = ids.threadIds;
    const formSubs = ids.formSubmissionIds;
    const entityIdsForWorkflow = [...new Set([...opp, ...cust, ...jobs])];
    const deleted: Record<string, number> = {};

    // --- Communications (deepest children first) ---
    const msgIds: string[] = [];
    for (const part of chunk(threads, 150)) {
        const { data, error } = await supabase.from("communication_messages").select("id").eq("org_id", orgId).in("thread_id", part);
        if (error) throw new Error(`[communication_messages select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { id?: string }).id;
            if (id) msgIds.push(id);
        }
    }
    deleted.communication_message_reads = await deleteByInColumnFilter(
        supabase,
        "communication_message_reads",
        "message_id",
        msgIds
    );
    deleted.communication_messages = await deleteByIn(supabase, "communication_messages", "thread_id", threads, orgId);
    deleted.communication_scheduled_sends =
        (await deleteByIn(supabase, "communication_scheduled_sends", "entity_id", opp, orgId)) +
        (await deleteByIn(supabase, "communication_scheduled_sends", "recipient_person_id", persons, orgId));
    deleted.communication_threads = await deleteByIn(supabase, "communication_threads", "id", threads, orgId);
    if (!idsOnly) {
        deleted.communication_threads += await deleteByOr(supabase, "communication_threads", orgId, orDemo);
    }

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
    deleted.discount_redemptions =
        (await deleteByIn(supabase, "discount_redemptions", "opportunity_id", opp)) +
        (await deleteByIn(supabase, "discount_redemptions", "job_id", jobs));
    deleted.discount_applications = await deleteByIn(supabase, "discount_applications", "opportunity_id", opp, orgId);

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
    deleted.payments = await deleteByIn(supabase, "payments", "job_id", jobs, orgId);
    deleted.assignments = await deleteByIn(supabase, "assignments", "job_id", jobs, orgId);
    deleted.schedules = await deleteByIn(supabase, "schedules", "job_id", jobs, orgId);
    deleted.jobs = await deleteByIn(supabase, "jobs", "id", jobs, orgId);

    const sessionIds = new Set<string>();
    for (const part of chunk(formSubs, 150)) {
        const { data, error } = await supabase
            .from("form_packet_session_items")
            .select("packet_session_id")
            .eq("org_id", orgId)
            .in("form_submission_id", part);
        if (error) throw new Error(`[form_packet_session_items select] ${error.message}`);
        for (const r of data ?? []) {
            const id = (r as { packet_session_id?: string }).packet_session_id;
            if (id) sessionIds.add(id);
        }
    }
    deleted.form_packet_session_items = await deleteByIn(supabase, "form_packet_session_items", "form_submission_id", formSubs, orgId);
    deleted.form_packet_sessions = await deleteByIn(supabase, "form_packet_sessions", "id", [...sessionIds], orgId);
    if (!idsOnly) {
        deleted.form_packet_sessions += await deleteByOr(supabase, "form_packet_sessions", orgId, orDemo);
    }

    deleted.form_submission_signatures = await deleteByIn(supabase, "form_submission_signatures", "form_submission_id", formSubs, orgId);
    deleted.form_submission_documents = await deleteByIn(supabase, "form_submission_documents", "form_submission_id", formSubs, orgId);
    deleted.form_submissions = await deleteByIn(supabase, "form_submissions", "id", formSubs, orgId);
    if (!idsOnly) {
        deleted.form_submissions += await deleteByOr(supabase, "form_submissions", orgId, orDemo);
    }

    const docIds = [...ids.documentIds];
    deleted.document_field_values = await deleteByIn(supabase, "document_field_values", "document_id", docIds, orgId);
    deleted.document_versions = await deleteByIn(supabase, "document_versions", "document_id", docIds, orgId);
    deleted.documents = await deleteByIn(supabase, "documents", "id", docIds, orgId);
    if (!idsOnly) {
        deleted.documents += await deleteByOr(supabase, "documents", orgId, orDemo);
    }

    const fvEntitySets: Array<{ type: string; ids: string[] }> = [
        { type: "opportunity", ids: opp },
        { type: "person", ids: persons },
        { type: "customer", ids: cust },
    ];
    if (!idsOnly) {
        const { data: locRows, error: locErr } = await supabase.from("locations").select("id").eq("org_id", orgId).or(orDemo);
        if (locErr) throw new Error(`[locations select for field_values] ${locErr.message}`);
        const locationIds: string[] = [];
        for (const r of locRows ?? []) {
            const id = (r as { id?: string }).id;
            if (id) locationIds.push(id);
        }
        if (locationIds.length) fvEntitySets.push({ type: "location", ids: locationIds });
    }
    deleted.field_values = 0;
    for (const { type, ids: eids } of fvEntitySets) {
        for (const part of chunk(eids, 150)) {
            const { data, error } = await supabase
                .from("field_values")
                .delete()
                .eq("org_id", orgId)
                .eq("entity_type", type)
                .in("entity_id", part)
                .select("id");
            if (error) throw new Error(`[field_values delete ${type}] ${error.message}`);
            deleted.field_values += (data ?? []).length;
        }
    }

    /**
     * PROCESSING GRAPH (certification baseline, anchor A3).
     *
     * Deleted BEFORE opportunities, because a case can name one as `primary_opportunity_id`.
     * The ids come from the same `resolveDemoIds` the dry run used — dry-run and execute resolve
     * one graph, so what was reported is exactly what is removed.
     */
    if (scope.certificationBaseline && ids.processingCaseIds?.length) {
        const caseIds = ids.processingCaseIds;
        deleted.processing_plan_operations = await deleteByIn(
            supabase,
            "processing_plan_operations",
            "plan_id",
            ids.processingPlanIds ?? [],
            orgId
        );
        for (const table of [
            "processing_commit_attempts",
            "processing_approvals",
            "processing_exceptions",
            "processing_resolutions",
            "processing_facts",
            "processing_case_sources",
            "processing_commit_plans",
        ] as const) {
            // The link column is NOT uniform — processing_case_sources uses processing_case_id.
            deleted[table] = await deleteByIn(supabase, table, PROCESSING_LINK_COLUMN[table], caseIds, orgId);
        }
        deleted.processing_cases = await deleteByIn(supabase, "processing_cases", "id", caseIds, orgId);
    }

    deleted.process_instances = await deleteProcessInstancesForCleanup(supabase, orgId, opp, members, idsOnly);
    deleted.opportunities = await deleteByIn(supabase, "opportunities", "id", opp, orgId);

    deleted.customer_member_contacts =
        (await deleteByIn(supabase, "customer_member_contacts", "customer_member_id", members, orgId)) +
        (await deleteByIn(supabase, "customer_member_contacts", "customer_id", cust, orgId));
    deleted.customer_tags = await deleteByIn(supabase, "customer_tags", "customer_id", cust, undefined, "*");
    deleted.customer_subscriptions = await deleteByIn(supabase, "customer_subscriptions", "customer_id", cust, orgId);
    deleted.customer_payment_methods = await deleteByIn(supabase, "customer_payment_methods", "customer_id", cust, undefined, "*");

    deleted.customer_members = await deleteByIn(supabase, "customer_members", "customer_id", cust, orgId);
    if (!idsOnly) {
        deleted.customer_members += await deleteByOr(supabase, "customer_members", orgId, orDemo);
    }
    deleted.customer_persons = await deleteByIn(supabase, "customer_persons", "customer_id", cust, orgId);
    if (!idsOnly) {
        deleted.customer_persons += await deleteByOr(supabase, "customer_persons", orgId, orDemo);
    }
    deleted.contacts = idsOnly ? 0 : await deleteByOr(supabase, "contacts", orgId, orDemo);

    if (!idsOnly) {
        deleted.person_locations = await deleteByOr(supabase, "person_locations", orgId, orDemo);
    } else {
        deleted.person_locations = 0;
    }
    deleted.person_locations += await deleteByIn(supabase, "person_locations", "person_id", persons, orgId);
    deleted.person_relationships =
        (await deleteByIn(supabase, "person_relationships", "from_person_id", persons, orgId)) +
        (await deleteByIn(supabase, "person_relationships", "to_person_id", persons, orgId));

    if (idsOnly) {
        deleted.customers = await deleteByIn(supabase, "customers", "id", cust, orgId);
        deleted.persons = await deleteByIn(supabase, "persons", "id", persons, orgId);
    } else {
        deleted.customers = await deleteByOr(supabase, "customers", orgId, orDemo);
        deleted.persons = await deleteByOr(supabase, "persons", orgId, orDemo);
    }

    /**
     * A4 + subject fixes (§4ter). After identities are gone, before the configuration tail.
     *
     * Storage objects are removed alongside the document rows: leaving 53 orphaned PDFs in
     * `org_documents` would be residue of exactly the kind this contract exists to eliminate, just
     * one layer down where nothing counts it. Failures are collected and reported, never swallowed.
     */
    if (scope.certificationBaseline && ids.residue) {
        const r = ids.residue;
        deleted.contacts = (deleted.contacts ?? 0) + (await deleteByIn(supabase, "contacts", "id", r.contactIds, orgId));
        deleted.operational_tasks =
            (deleted.operational_tasks ?? 0) +
            (await deleteByIn(supabase, "operational_tasks", "id", r.operationalTaskIds, orgId));
        deleted.form_packet_session_items = await deleteByIn(
            supabase,
            "form_packet_session_items",
            "session_id",
            r.formPacketSessionIds,
            orgId
        );
        deleted.form_packet_sessions = await deleteByIn(
            supabase,
            "form_packet_sessions",
            "id",
            r.formPacketSessionIds,
            orgId
        );
        deleted.workflow_events =
            (deleted.workflow_events ?? 0) +
            (await deleteByIn(supabase, "workflow_events", "id", r.workflowEventIds, orgId));

        let storageRemoved = 0;
        const storageFailures: string[] = [];
        const byBucket = new Map<string, string[]>();
        for (const o of r.storageObjects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.path]);
        for (const [bucket, paths] of byBucket) {
            for (const part of chunk(paths, 100)) {
                const { data, error } = await supabase.storage.from(bucket).remove(part);
                if (error) storageFailures.push(`${bucket}: ${error.message}`);
                else storageRemoved += (data ?? []).length;
            }
        }
        deleted.storage_objects = storageRemoved;
        if (storageFailures.length) {
            console.error(`\nSTORAGE CLEANUP FAILURES (${storageFailures.length}):`);
            for (const f of storageFailures.slice(0, 10)) console.error(`  - ${f}`);
            throw new Error(
                `Storage cleanup failed for ${storageFailures.length} batch(es). Database rows were deleted but ` +
                    `objects remain — reconcile before treating this tenant as a clean baseline.`
            );
        }
    }

    deleted[PROTECTED_LOCATIONS_TABLE_KEY] = 0;
    // Configuration is preserved in enrollment_runtime_reset — work_units / departments are only
    // removed by the default demo-metadata cleanup, never by the runtime enrollment reset.
    deleted.work_units = idsOnly ? 0 : await deleteByOr(supabase, "work_units", orgId, orDemo);
    deleted.departments = idsOnly ? 0 : await deleteByOr(supabase, "departments", orgId, orDemo);

    return deleted;
}

async function main(): Promise<void> {
    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run: VERCEL_ENV=production");
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }
    if (process.env.DEMO_CLEANUP_CONFIRM?.trim() !== DEMO_CLEANUP_CONFIRM_VALUE) {
        console.error(`Refusing execute: set DEMO_CLEANUP_CONFIRM=${DEMO_CLEANUP_CONFIRM_VALUE}`);
        process.exit(1);
    }

    const scope = parseDemoCleanupScopeFromEnv();
    const orDemo = demoMetadataOrFilter(scope);
    const supabase = createAdminClient();

    console.log("\n=== demoRuntimeCleanupExecute (DESTRUCTIVE) ===\n");
    console.log(`org_id: ${scope.orgId}`);
    console.log(`cleanup_mode: ${scope.cleanupMode}`);
    if (scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE) {
        console.log("mode: enrollment_runtime_reset — deletes lead/enrollment queue runtime (not demo-metadata default)");
    }
    if (scope.cleanupMode === COMMUNICATIONS_ORPHAN_RESET_MODE) {
        console.log("mode: communications_orphan_reset — deletes unlinked communication threads/messages only");
    }
    if (scope.demoSeedPackage) console.log(`filter: demo_seed_package = ${scope.demoSeedPackage}`);
    if (scope.demoSeedRunId) console.log(`filter: demo_seed_run_id = ${scope.demoSeedRunId}`);
    if (scope.demoSeedFamilyKey) console.log(`filter: demo_seed_family_key = ${scope.demoSeedFamilyKey}`);
    console.log("");

    if (scope.cleanupMode === COMMUNICATIONS_ORPHAN_RESET_MODE) {
        const selection = await buildCommunicationsOrphanSelection(supabase, scope.orgId);
        printCommunicationsOrphanReport(selection);

        console.log("--- Pre-delete counts ---\n");
        for (const table of COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER) {
            console.log(`${table}: ${selection.counts[table as keyof typeof selection.counts] ?? 0}`);
        }

        const deleted = await executeCommunicationsOrphanDeletes(supabase, scope.orgId, selection);

        console.log("\n--- Deleted row counts ---\n");
        for (const table of COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER) {
            console.log(`${table}: ${deleted[table] ?? 0}`);
        }
        console.log("\nExecute complete.\n");
        return;
    }

    if (scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE) {
        const selection = await buildEnrollmentResetSelection(supabase, scope.orgId);
        printEnrollmentResetReport(selection);
    }

    const ids = await resolveDemoIds(supabase, scope, orDemo);

    if (scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE) {
        console.log("--- enrollment_runtime_reset shared-reference guard ---\n");
        console.log(`deletable_persons: ${ids.personIds.length}`);
        console.log(`deletable_customers: ${ids.customerIds.length}`);
        console.log(`preserved_shared_persons (linked to non-target records): ${ids.sharedPersonIds.length}`);
        console.log(`preserved_shared_customers (linked to non-target records): ${ids.sharedCustomerIds.length}\n`);
    }

    const before = await buildDemoCleanupCounts(supabase, scope, ids, orDemo);

    console.log("--- Pre-delete counts ---\n");
    for (const table of DEMO_CLEANUP_TABLE_ORDER) {
        const n = before[table] ?? 0;
        if (table === PROTECTED_LOCATIONS_TABLE_KEY) {
            console.log(`${table}: ${n} (protected — not deleted)`);
        } else {
            console.log(`${table}: ${n}`);
        }
    }

    /**
     * CERTIFICATION MODE TAKES THE ATOMIC PATH — AND ONLY THAT PATH.
     *
     * The sequential deleter below committed documents, communications and bookings, then hit an
     * append-only guard on a root table and left the tenant half-deleted. It is unreachable in
     * certification mode now, by an early return rather than a flag, so there is no switch to get
     * wrong. Non-certification cleanup modes keep their existing behaviour deliberately: they never
     * touch the immutable Processing ledger and their failure mode is not this one.
     */
    if (scope.certificationBaseline) {
        const authorized = process.env.DEMO_CLEANUP_AUTHORIZED_PLAN_ID?.trim() ?? "";
        if (!authorized) {
            throw new Error(
                "Refusing certification execute — no authorized plan identity. Run the dry run and pass " +
                    "--authorized-plan-id=<hash>."
            );
        }

        // Recompute the identity from the FRESHLY RESOLVED plan. If the tenant moved since the
        // dry run, this differs and the run aborts before the RPC — a changed tenant needs a new
        // authorization, and there is deliberately no override.
        const manifestPath = resolve(
            process.cwd(),
            "../certification/bp-config-integrity/evidence/firefly-storage-recovery-manifest.json"
        );
        const manifest = existsSync(manifestPath)
            ? (JSON.parse(readFileSync(manifestPath, "utf8")) as StorageManifest)
            : null;
        if (!manifest) throw new Error("Refusing certification execute — storage recovery manifest is missing.");
        const storagePaths = validateStorageManifest(manifest, scope.orgId).ok ? manifest.objects : [];

        const { data: deptRows } = await supabase.from("departments").select("metadata").eq("org_id", scope.orgId);
        const lifecycle = (deptRows ?? [])
            .map((d) => (d as { metadata?: Record<string, unknown> }).metadata?.lifecycle_builder_v1)
            .filter(Boolean);
        const configurationFingerprint = createHash("sha256").update(JSON.stringify(lifecycle)).digest("hex");

        const currentPlanId = computePlanIdentity(
            buildCertificationPlan({
                orgId: scope.orgId,
                databaseIds: {
                    opportunities: ids.opportunityIds,
                    customers: ids.customerIds,
                    persons: ids.personIds,
                    customer_members: ids.customerMemberIds,
                    communication_threads: ids.threadIds,
                    documents: ids.documentIds,
                    form_submissions: ids.formSubmissionIds,
                    form_packet_sessions: ids.residue?.formPacketSessionIds ?? [],
                    contacts: ids.residue?.contactIds ?? [],
                    operational_tasks: ids.residue?.operationalTaskIds ?? [],
                    processing_cases: ids.processingCaseIds ?? [],
                    processing_commit_plans: ids.processingPlanIds ?? [],
                },
                workflowEventIds: ids.residue?.workflowEventIds ?? [],
                protectedWorkflowEventIds: (ids.residue?.preservedWorkflowEvents ?? []).map((p) => p.id),
                storagePaths,
                configurationFingerprint,
            })
        );

        const outcome = await executeCertificationReset({
            supabase,
            scope,
            ids,
            authorizedPlanId: authorized,
            currentPlanId,
            manifest,
            storageClient: supabaseStorageClient(supabase),
            verifyDatabase: async (client, orgId) => {
                const problems: string[] = [];
                for (const table of CERTIFICATION_VERIFY_EMPTY) {
                    const { count, error } = await client
                        .from(table)
                        .select("*", { count: "exact", head: true })
                        .eq("org_id", orgId);
                    if (error) problems.push(`${table}: ${error.message}`);
                    else if ((count ?? 0) > 0) problems.push(`${table} still has ${count} rows`);
                }
                return problems;
            },
            log: (m) => console.log(m),
        });

        console.log("\n--- ACTUAL committed deletion counts (from the transaction) ---\n");
        for (const [table, n] of Object.entries(outcome.database.deleted).sort()) {
            if (n > 0) console.log(`${table}: ${n}`);
        }
        console.log(`\nTOTAL rows actually deleted: ${outcome.database.totalDeleted}`);
        console.log(`database verified: ${outcome.database.verified}`);
        for (const p of outcome.database.verificationProblems) console.log(`  - ${p}`);

        if (outcome.storage) {
            console.log("\n--- storage cleanup ---\n");
            console.log(`planned:        ${outcome.storage.plannedCount}`);
            console.log(`attempted:      ${outcome.storage.attempted.length}`);
            console.log(`deleted:        ${outcome.storage.deleted.length}`);
            console.log(`already absent: ${outcome.storage.alreadyMissing.length}`);
            console.log(`FAILED:         ${outcome.storage.failed.length}`);
            for (const f of outcome.storage.unexpectedRemaining) console.log(`  remaining: ${f}`);
        } else {
            console.log("\nstorage cleanup did NOT run (database verification failed).");
        }

        console.log(`\nbaselineEstablished: ${outcome.baselineEstablished}\n`);
        if (!outcome.baselineEstablished) {
            process.exitCode = 1;
        }
        return;
    }

    const deleted = await executeDeletes(supabase, scope, ids, orDemo);

    console.log("\n--- Deleted row counts ---\n");
    for (const table of DEMO_CLEANUP_TABLE_ORDER) {
        if (table === PROTECTED_LOCATIONS_TABLE_KEY) {
            console.log(`${table}: skipped (locations never deleted)`);
        } else {
            console.log(`${table}: ${deleted[table] ?? 0}`);
        }
    }
    console.log("\nExecute complete.\n");
}

main().catch((e) => {
    console.error(errMessage(e));
    process.exit(1);
});
