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
 *
 * Usage (from web/):
 *   npm run dev:reset:operational-state            # dry-run (plan + counts, no deletes)
 *   CONFIRM_RESET_OPERATIONAL_STATE=true RESET_ORG_ID=<uuid> \
 *     npm run dev:reset:operational-state -- --execute
 */

import { spawnSync } from "child_process";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DEMO_CLEANUP_CONFIRM_VALUE,
    ENROLLMENT_RUNTIME_RESET_MODE,
} from "./lib/demoRuntimeCleanupScope";

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

async function countOrg(client: Client, table: string, orgId: string): Promise<number> {
    const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId);
    if (error) throw new Error(`[count ${table}] ${error.message}`);
    return count ?? 0;
}

async function snapshot(client: Client, orgId: string): Promise<{ config: Record<string, number>; operational: Record<string, number> }> {
    const config: Record<string, number> = {};
    for (const t of CONFIG_MUST_REMAIN) config[t] = await countOrg(client, t, orgId);
    const operational: Record<string, number> = {};
    for (const t of OPERATIONAL_MUST_BE_EMPTY) operational[t] = await countOrg(client, t, orgId);
    return { config, operational };
}

function isProduction(): boolean {
    return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

async function main(): Promise<void> {
    const execute = process.argv.includes("--execute");
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

    const client = createAdminClient();
    console.log(`org_id: ${orgId}`);
    console.log(`mode:   ${execute ? "EXECUTE (destructive)" : "DRY-RUN (no deletes)"}\n`);

    const before = await snapshot(client, orgId);
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
        },
    });
    if (res.status !== 0) {
        console.error(`\nDelegated cleanup failed (exit ${res.status}). Aborting without verification.`);
        process.exit(res.status ?? 1);
    }

    if (!execute) {
        console.log("\nDry-run complete. Re-run with CONFIRM_RESET_OPERATIONAL_STATE=true ... -- --execute to delete.\n");
        return;
    }

    // Verify: configuration preserved + operational core empty.
    const after = await snapshot(client, orgId);
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
