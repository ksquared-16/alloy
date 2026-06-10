#!/usr/bin/env npx tsx
/**
 * Safe developer delete for one demo-gate family (by run id or family key).
 * Dry-run by default; pass --execute for destructive delete.
 *
 * Env:
 *   DEMO_RESET_ORG_ID or DEV_QUEUE_ORG_ID (required)
 *
 * Flags:
 *   --run-id=<uuid>       Delete rows tagged metadata.demo_seed_run_id
 *   --family-key=<key>    Delete rows tagged metadata.demo_seed_family_key
 *   --execute             Perform deletes (default: dry-run counts only)
 *
 * Run from `web/`:
 *   npm run demo:delete:one-family -- --run-id=<uuid>
 *   npm run demo:delete:one-family -- --run-id=<uuid> --execute
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { DEMO_ONE_FAMILY_GATE_PACKAGE } from "./lib/stagingDemoMarkers";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type DeleteScope = {
    orgId: string;
    runId: string | null;
    familyKey: string | null;
};

function requireOrgId(): string {
    const v = process.env.DEMO_RESET_ORG_ID?.trim() || process.env.DEV_QUEUE_ORG_ID?.trim();
    if (!v) {
        console.error("Missing required env: DEMO_RESET_ORG_ID or DEV_QUEUE_ORG_ID");
        process.exit(1);
    }
    return v;
}

function parseArgs(): { scope: DeleteScope; execute: boolean } {
    const argv = process.argv.slice(2);
    let runId: string | null = null;
    let familyKey: string | null = null;
    let execute = false;
    for (const arg of argv) {
        if (arg === "--execute") execute = true;
        else if (arg.startsWith("--run-id=")) runId = arg.slice("--run-id=".length).trim() || null;
        else if (arg.startsWith("--family-key=")) familyKey = arg.slice("--family-key=".length).trim() || null;
    }
    if (!runId && !familyKey) {
        console.error("Provide --run-id=<uuid> or --family-key=<key>");
        process.exit(1);
    }
    return {
        scope: {
            orgId: requireOrgId(),
            runId,
            familyKey,
        },
        execute,
    };
}

function metaFilter(scope: DeleteScope): { column: string; value: string } {
    if (scope.runId) return { column: "demo_seed_run_id", value: scope.runId };
    return { column: "demo_seed_family_key", value: scope.familyKey! };
}

async function countTagged(supabase: SupabaseAdmin, table: string, scope: DeleteScope): Promise<number> {
    const { column, value } = metaFilter(scope);
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", scope.orgId)
        .eq(`metadata->>${column}`, value);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return count ?? 0;
}

async function selectOppIdsForScope(supabase: SupabaseAdmin, scope: DeleteScope): Promise<string[]> {
    const { column, value } = metaFilter(scope);
    const { data, error } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", scope.orgId)
        .eq(`metadata->>${column}`, value);
    if (error) throw new Error(`select opportunities: ${error.message}`);
    return (data ?? []).map((r) => (r as { id: string }).id);
}

async function countByOppIds(
    supabase: SupabaseAdmin,
    table: string,
    orgId: string,
    oppIds: string[],
    oppColumn = "opportunity_id"
): Promise<number> {
    if (!oppIds.length) return 0;
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .in(oppColumn, oppIds);
    if (error) {
        console.warn(`[skip] count ${table} by opp: ${error.message}`);
        return 0;
    }
    return count ?? 0;
}

async function deleteByOppIds(
    supabase: SupabaseAdmin,
    table: string,
    orgId: string,
    oppIds: string[],
    oppColumn = "opportunity_id"
): Promise<number> {
    if (!oppIds.length) return 0;
    const { data, error } = await supabase
        .from(table)
        .delete()
        .eq("org_id", orgId)
        .in(oppColumn, oppIds)
        .select("id");
    if (error) {
        console.warn(`[skip] delete ${table}: ${error.message}`);
        return 0;
    }
    return (data ?? []).length;
}

async function deleteTagged(supabase: SupabaseAdmin, table: string, scope: DeleteScope): Promise<number> {
    const { column, value } = metaFilter(scope);
    const { data, error } = await supabase
        .from(table)
        .delete()
        .eq("org_id", scope.orgId)
        .eq(`metadata->>${column}`, value)
        .select("id");
    if (error) throw new Error(`delete ${table}: ${error.message}`);
    return (data ?? []).length;
}

async function planDelete(supabase: SupabaseAdmin, scope: DeleteScope): Promise<Record<string, number>> {
    const oppIds = await selectOppIdsForScope(supabase, scope);
    const ocmIds = oppIds.length
        ? (
              await supabase
                  .from("opportunity_customer_members")
                  .select("id")
                  .eq("org_id", scope.orgId)
                  .in("opportunity_id", oppIds)
          ).data?.map((r) => (r as { id: string }).id) ?? []
        : [];

    const plan: Record<string, number> = {};
    plan.placement_candidates = oppIds.length
        ? await countByOppIds(supabase, "placement_candidates", scope.orgId, oppIds)
        : 0;
    plan.quotes = await countByOppIds(supabase, "quotes", scope.orgId, oppIds);
    plan.communication_threads = await countByOppIds(supabase, "communication_threads", scope.orgId, oppIds);
    plan.opportunity_customer_members = ocmIds.length;
    plan.opportunities = oppIds.length;
    plan.customer_members = await countTagged(supabase, "customer_members", scope);
    plan.customer_persons = await countTagged(supabase, "customer_persons", scope);
    plan.customers = await countTagged(supabase, "customers", scope);
    plan.persons = await countTagged(supabase, "persons", scope);
    return plan;
}

async function executeDelete(supabase: SupabaseAdmin, scope: DeleteScope): Promise<Record<string, number>> {
    const oppIds = await selectOppIdsForScope(supabase, scope);
    const deleted: Record<string, number> = {};

    deleted.placement_candidates = await deleteByOppIds(supabase, "placement_candidates", scope.orgId, oppIds);
    deleted.quotes = await deleteByOppIds(supabase, "quotes", scope.orgId, oppIds);
    deleted.communication_threads = await deleteByOppIds(supabase, "communication_threads", scope.orgId, oppIds);
    deleted.opportunity_customer_members = await deleteByOppIds(
        supabase,
        "opportunity_customer_members",
        scope.orgId,
        oppIds
    );
    deleted.opportunities = await deleteTagged(supabase, "opportunities", scope);
    deleted.customer_members = await deleteTagged(supabase, "customer_members", scope);
    deleted.customer_persons = await deleteTagged(supabase, "customer_persons", scope);
    deleted.customers = await deleteTagged(supabase, "customers", scope);
    deleted.persons = await deleteTagged(supabase, "persons", scope);

    return deleted;
}

async function verifyOrphans(supabase: SupabaseAdmin, scope: DeleteScope): Promise<Record<string, number>> {
    const { column, value } = metaFilter(scope);
    const tables = [
        "persons",
        "customers",
        "customer_members",
        "customer_persons",
        "opportunities",
        "opportunity_customer_members",
        "placement_candidates",
    ] as const;
    const orphans: Record<string, number> = {};
    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("org_id", scope.orgId)
            .eq(`metadata->>${column}`, value);
        if (error) throw new Error(`orphan check ${table}: ${error.message}`);
        orphans[table] = count ?? 0;
    }
    return orphans;
}

async function main(): Promise<void> {
    const { scope, execute } = parseArgs();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { column, value } = metaFilter(scope);

    console.log(`\n=== deleteDemoSeedFamily: ${execute ? "EXECUTE" : "DRY-RUN"} ===\n`);
    console.log(`org_id: ${scope.orgId}`);
    console.log(`filter: metadata.${column} = ${value}`);
    console.log(`package: ${DEMO_ONE_FAMILY_GATE_PACKAGE}`);
    if (!execute) console.log("\nNo rows deleted. Pass --execute to delete.\n");

    const counts = execute ? await executeDelete(supabase, scope) : await planDelete(supabase, scope);

    console.log(execute ? "--- Deleted row counts ---" : "--- Rows that would be deleted ---");
    for (const [table, n] of Object.entries(counts)) {
        console.log(`${table}: ${n}`);
    }

    if (execute) {
        const orphans = await verifyOrphans(supabase, scope);
        console.log("\n--- Orphan verification (must be 0) ---");
        for (const [table, n] of Object.entries(orphans)) {
            console.log(`${table}: ${n}`);
        }
        const orphanTotal = Object.values(orphans).reduce((s, n) => s + n, 0);
        if (orphanTotal > 0) {
            console.error("\nOrphan rows remain for this run_id/family_key.");
            process.exit(1);
        }
        console.log("\nDelete complete — no tagged orphans remain.\n");
    } else {
        console.log("\nDry-run complete.\n");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
