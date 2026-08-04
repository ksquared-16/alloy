#!/usr/bin/env npx tsx
/**
 * Reset Operational State — delete business INSTANCES, keep the operating SYSTEM.
 *
 * Keeps ALL configuration: Business Processes, Stages, Work Views, Surfaces, Layouts,
 * Cards, Fields, Status Vocabulary, Action Catalog, Readiness/Attention rules, Work
 * templates, Document templates, Programs, Locations, Rooms, Tuition config, Staff.
 * Deletes operational instances: leads/opportunities, families/parents/children/persons,
 * enrollment participation (OCM), tasks/work, notes, communications, timeline/activity,
 * attention rows, queue/runtime projections, process runtime instances, generated documents,
 * draft/demo artifacts.
 *
 * SAFETY: dry-run by default. Delegates deletion to the vetted, config-preserving
 * `enrollment_runtime_reset` cleanup (scripts/demoRuntimeCleanupExecute.ts): it preserves
 * departments/work_units (BP + Work View config), preserves persons/customers linked to
 * non-target records, scopes field_values deletion to operational entity types only, and
 * never deletes locations. This wrapper adds the required guards + a config-preservation
 * verification that FAILS the run if any configuration was lost or operational core remains.
 *
 * Env:
 *   CONFIRM_RESET_OPERATIONAL_STATE=true   (required for --execute)
 *   RESET_ORG_ID=<uuid>                    (required)
 *   SUPABASE_SERVICE_ROLE_KEY=<key>        (required)
 *   RESET_SUPABASE_PROJECT_REF=<ref>       (optional; when set, the connection MUST be that project)
 *
 * Flags:
 *   --execute                        actually delete (also needs CONFIRM_RESET_OPERATIONAL_STATE)
 *   --include-closed-opportunities   widen selection to every opportunity in the org, open AND
 *                                    closed. Without it, selection stays open-only — which leaves
 *                                    closed opportunities behind, and with them the families and
 *                                    children the shared-reference guard correctly refuses to
 *                                    delete while those survivors still point at them.
 *   --certification-baseline         WIDEST. Adds two anchors the opportunity graph cannot reach:
 *                                    operational identities no preserved record references, and the
 *                                    Processing operational graph. Also replaces the four-table
 *                                    emptiness check with the full product-facing contract, because
 *                                    those four can all read zero while most of the tenant remains.
 *                                    Implies --include-closed-opportunities. Refuses on any
 *                                    identity it cannot classify as target or protected.
 *                                    @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * Breadth composes; it does not fork:
 *   default → open opportunity graphs
 *   +closed → open + closed opportunity graphs
 *   +cert   → all opportunity graphs + unlinked identities + Processing + full verification
 *
 * Usage (from web/):
 *   npm run dev:reset:operational-state            # dry-run (plan + counts, no deletes)
 *   npm run dev:reset:operational-state -- --include-closed-opportunities
 *   npm run dev:reset:operational-state -- --certification-baseline
 *   CONFIRM_RESET_OPERATIONAL_STATE=true RESET_ORG_ID=<uuid> \
 *     npm run dev:reset:operational-state -- --execute --certification-baseline
 */

import { spawnSync } from "child_process";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    CERTIFICATION_BASELINE_ENV,
    DEMO_CLEANUP_CONFIRM_VALUE,
    ENROLLMENT_RUNTIME_RESET_MODE,
    INCLUDE_CLOSED_OPPORTUNITIES_ENV,
} from "./lib/demoRuntimeCleanupScope";
import { assertResetTargetIdentity } from "./lib/resetOperationalStateIdentity";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type Client = ReturnType<typeof createAdminClient>;

/** Configuration tables that MUST survive a reset (the operating system). */
const CONFIG_MUST_REMAIN = [
    "departments",
    "work_units",
    "status_definitions",
    "field_definitions",
    "field_section_definitions",
    "action_definitions",
    "action_placements",
    "entity_layouts",
    "locations",
    "location_program_categories",
    "schedule_patterns",
    "option_sets",
    "form_definitions",
] as const;

/** Enrollment-core operational tables that MUST be empty (org-scoped) after reset. */
const OPERATIONAL_MUST_BE_EMPTY = [
    "opportunities",
    "opportunity_customer_members",
    "operational_tasks",
    "process_instances",
] as const;

/**
 * Certification baseline verification — the product-facing emptiness contract.
 *
 * The four tables above were never a sufficient check: they can all read zero while 51 households,
 * 61 Processing cases and 417 workflow events remain, which is exactly how a baseline gets believed
 * clean when it is not. Certification mode asserts the whole operational surface instead.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md §4.6
 */
const CERTIFICATION_MUST_BE_EMPTY = [
    "opportunities",
    "opportunity_persons",
    "opportunity_customer_members",
    "customers",
    "persons",
    "customer_persons",
    "customer_members",
    "contacts",
    "operational_tasks",
    "process_instances",
    "tour_bookings",
    "placement_candidates",
    "communication_threads",
    "communication_messages",
    "form_submissions",
    "form_packet_sessions",
    "documents",
    "processing_cases",
    "processing_case_sources",
    "processing_facts",
    "processing_resolutions",
    "processing_commit_plans",
    "processing_plan_operations",
    "processing_commit_attempts",
    "processing_approvals",
    "processing_exceptions",
] as const;

async function countOrg(client: Client, table: string, orgId: string): Promise<number> {
    const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
    if (error) throw new Error(`[count ${table}] ${error.message}`);
    return count ?? 0;
}

async function snapshot(
    client: Client,
    orgId: string,
    certification: boolean,
): Promise<{ config: Record<string, number>; operational: Record<string, number> }> {
    const config: Record<string, number> = {};
    for (const t of CONFIG_MUST_REMAIN) config[t] = await countOrg(client, t, orgId);
    const operational: Record<string, number> = {};
    for (const t of certification ? CERTIFICATION_MUST_BE_EMPTY : OPERATIONAL_MUST_BE_EMPTY) {
        operational[t] = await countOrg(client, t, orgId);
    }
    return { config, operational };
}

function isProduction(): boolean {
    return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/**
 * Look up the org in the connected database. Null when it is not there at all.
 *
 * The table is `orgs`, not `organizations` — the latter does not exist in this schema, though
 * three call sites elsewhere in the codebase still ask for it.
 */
async function findOrgId(client: Client, orgId: string): Promise<{ id: string; name: string | null } | null> {
    const { data, error } = await client.from("orgs").select("id, name").eq("id", orgId).maybeSingle();
    if (error) throw new Error(`[organizations lookup] ${error.message}`);
    if (!data) return null;
    const row = data as { id?: string; name?: string | null };
    return row.id ? { id: row.id, name: row.name ?? null } : null;
}

async function main(): Promise<void> {
    const execute = process.argv.includes("--execute");
    const certificationBaseline = process.argv.includes("--certification-baseline");
    // The plan the operator actually reviewed. Execute refuses without it; there is no force.
    const authorizedPlanId = process.argv.find((a) => a.startsWith("--authorized-plan-id="))?.split("=")[1]?.trim() ?? "";
    // Certification is a superset — it cannot mean "widest breadth, but skip the closed ones".
    const includeClosedOpportunities =
        certificationBaseline || process.argv.includes("--include-closed-opportunities");
    const orgId = process.env.RESET_ORG_ID?.trim();

    console.log("\n=== resetOperationalState (delete instances, keep configuration) ===\n");

    if (isProduction()) {
        console.error("Refusing to run against production (VERCEL_ENV/NODE_ENV=production).");
        process.exit(1);
    }
    if (!orgId) {
        console.error("Missing RESET_ORG_ID=<uuid>.");
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
        process.exit(1);
    }
    if (execute && process.env.CONFIRM_RESET_OPERATIONAL_STATE?.trim() !== "true") {
        console.error("Refusing --execute: set CONFIRM_RESET_OPERATIONAL_STATE=true.");
        process.exit(1);
    }
    if (execute && certificationBaseline && !authorizedPlanId) {
        console.error(
            "Refusing --execute --certification-baseline: --authorized-plan-id=<hash> is required.\n" +
                "Run the dry run first and pass the printed 'Authorization plan identity'."
        );
        process.exit(1);
    }

    const client = createAdminClient();

    // Identity gate — prove WHICH database and WHICH organization before reading a single count.
    // A dry run is the evidence a delete gets authorised from; it has to have run on the target.
    const found = await findOrgId(client, orgId);
    const identity = assertResetTargetIdentity({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        expectedProjectRef: process.env.RESET_SUPABASE_PROJECT_REF,
        orgId,
        foundOrgId: found?.id ?? null,
        foundOrgName: found?.name ?? null,
    });

    console.log(`database:     ${identity.projectRef ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)"}`);
    console.log(`org_id:       ${orgId}`);
    console.log(`organization: ${found?.name ?? "(not found)"}`);
    if (!identity.ok) {
        console.error("\nRefusing: target identity check failed.");
        for (const p of identity.problems) console.error(`  - ${p}`);
        process.exit(1);
    }

    console.log(
        `selection:    ${
            certificationBaseline
                ? "CERTIFICATION BASELINE — all opportunity graphs + unlinked operational identities + Processing"
                : includeClosedOpportunities
                  ? "EXPANDED — open AND closed opportunities"
                  : "default — open only"
        }`
    );
    console.log(`mode:         ${execute ? "EXECUTE (destructive)" : "DRY-RUN (no deletes)"}\n`);

    const before = await snapshot(client, orgId, certificationBaseline);
    console.log("--- Before ---");
    console.log("config (must remain > 0):");
    for (const [t, n] of Object.entries(before.config)) console.log(`  ${t}: ${n}`);
    console.log("operational-core (target -> 0):");
    for (const [t, n] of Object.entries(before.operational)) console.log(`  ${t}: ${n}`);
    console.log("");

    // Delegate to the vetted, config-preserving enrollment_runtime_reset cleanup.
    const child = execute ? "scripts/demoRuntimeCleanupExecute.ts" : "scripts/demoRuntimeCleanupDryRun.ts";
    console.log(`Delegating ${execute ? "deletion" : "dry-run plan"} to ${child} (mode=${ENROLLMENT_RUNTIME_RESET_MODE})...\n`);
    const res = spawnSync("npx", ["tsx", child], {
        stdio: "inherit",
        env: {
            ...process.env,
            DEMO_CLEANUP_MODE: ENROLLMENT_RUNTIME_RESET_MODE,
            DEMO_RESET_ORG_ID: orgId,
            DEMO_CLEANUP_CONFIRM: DEMO_CLEANUP_CONFIRM_VALUE,
            // Passed explicitly, never inherited: the widened scope is a decision made on this
            // invocation's command line, not something an ambient env var can switch on.
            [INCLUDE_CLOSED_OPPORTUNITIES_ENV]: includeClosedOpportunities ? "true" : "false",
            [CERTIFICATION_BASELINE_ENV]: certificationBaseline ? "true" : "false",
            DEMO_CLEANUP_AUTHORIZED_PLAN_ID: authorizedPlanId,
        },
    });
    if (res.status !== 0) {
        console.error(`\nDelegated cleanup failed (exit ${res.status}). Aborting without verification.`);
        process.exit(res.status ?? 1);
    }

    if (!execute) {
        const flags = certificationBaseline
            ? "--execute --certification-baseline"
            : includeClosedOpportunities
              ? "--execute --include-closed-opportunities"
              : "--execute";
        console.log(
            `\nDry-run complete against ${identity.projectRef ?? "the connected database"} / ${found?.name ?? orgId}.` +
                `\nSelection was ${includeClosedOpportunities ? "EXPANDED (open + closed opportunities)" : "default (open only)"}.` +
                `\nRe-run with CONFIRM_RESET_OPERATIONAL_STATE=true ... -- ${flags} to delete.\n`
        );
        return;
    }

    // Verify: configuration preserved + operational core empty.
    const after = await snapshot(client, orgId, certificationBaseline);
    console.log("\n--- After (verification) ---");
    const problems: string[] = [];
    console.log("config (must remain):");
    for (const [t, n] of Object.entries(after.config)) {
        const kept = before.config[t] > 0 ? n > 0 : true; // if it had rows, it must still have rows
        console.log(`  ${t}: ${before.config[t]} -> ${n} ${kept ? "OK" : "*** LOST CONFIG ***"}`);
        if (!kept) problems.push(`config table ${t} lost all rows (${before.config[t]} -> 0)`);
    }
    console.log("operational-core (must be 0):");
    for (const [t, n] of Object.entries(after.operational)) {
        console.log(`  ${t}: ${before.operational[t]} -> ${n} ${n === 0 ? "OK" : "*** NOT EMPTY ***"}`);
        if (n !== 0) problems.push(`operational table ${t} still has ${n} rows`);
    }

    if (problems.length) {
        console.error("\nVERIFICATION FAILED:");
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
    }
    console.log("\nVERIFICATION PASSED: configuration preserved, operational core empty. Reset complete.\n");
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
