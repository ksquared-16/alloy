/**
 * Verify status_key backfill before legacy status column drops (Phase 6).
 *
 * Usage (from web/):
 *   cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts
 *   cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts --org-id=<uuid>
 *   CANONICAL_VERIFY_ORG_ID=<uuid> cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts
 *
 * Env (loaded from web/.env.local then web/.env; existing process env wins):
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role required (cross-org read, bypasses RLS)
 *   CANONICAL_VERIFY_ORG_ID — optional; limits verification to one org (recommended for active dev tenant)
 *   ALLOY_PUBLIC_ORG_ID — used when --org-id and CANONICAL_VERIFY_ORG_ID are unset (single-org verify)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const USAGE = `
Usage:
  cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts
  cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts --org-id=<uuid>

Optional scope (recommended — verify active dev tenant only):
  CANONICAL_VERIFY_ORG_ID=<uuid>
  --org-id=<uuid>
  Falls back to ALLOY_PUBLIC_ORG_ID when set; otherwise checks all orgs.

Loads env from web/.env.local and web/.env (does not override variables already set in the shell).

Required:
  NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY — service role key required for this verification script
`.trim();

function assertScriptEnv(): void {
    const missing: string[] = [];
    const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        missing.push("SUPABASE_SERVICE_ROLE_KEY (service role — required for cross-org backfill read)");
    }
    if (missing.length === 0) return;

    console.error("Missing required environment variables:");
    for (const name of missing) console.error(`  - ${name}`);
    console.error("");
    console.error(USAGE);
    process.exit(1);
}

function parseVerifyOrgId(): string | null {
    const arg = process.argv.find((a) => a.startsWith("--org-id="));
    const fromArg = arg?.slice("--org-id=".length).trim();
    const fromEnv =
        process.env.CANONICAL_VERIFY_ORG_ID?.trim() ||
        process.env.ALLOY_PUBLIC_ORG_ID?.trim() ||
        null;
    return fromArg || fromEnv || null;
}

type GapRow = { id: string; org_id?: string | null; legacy_status: string | null };

async function main() {
    assertScriptEnv();
    const supabase = createAdminClient();
    const orgId = parseVerifyOrgId();

    if (orgId) {
        const { data: orgRow, error: orgErr } = await supabase
            .from("orgs")
            .select("id, name, status")
            .eq("id", orgId)
            .maybeSingle();
        if (orgErr) {
            console.error(`[orgs] ${orgErr.message}`);
            process.exit(1);
        }
        if (!orgRow) {
            console.error(`Org not found: ${orgId}`);
            process.exit(1);
        }
        console.log(`Verifying org: ${orgId} (${(orgRow as { name?: string }).name ?? "unnamed"})`);
    } else {
        console.log("Verifying all orgs (set CANONICAL_VERIFY_ORG_ID or --org-id to scope one tenant).");
    }

    const tables = [
        { table: "opportunities", legacyCol: "status" },
        { table: "persons", legacyCol: "status" },
        { table: "customers", legacyCol: "status" },
    ] as const;

    let totalGaps = 0;
    for (const { table, legacyCol } of tables) {
        let query = supabase
            .from(table)
            .select(`id, org_id, status_key, ${legacyCol}`)
            .is("status_key", null)
            .not(legacyCol, "is", null)
            .limit(25);
        if (orgId) query = query.eq("org_id", orgId);

        const { data, error } = await query;
        if (error) {
            if (error.message.includes(`column ${table}.${legacyCol} does not exist`) || error.message.includes(`"${legacyCol}"`)) {
                console.log(`\n${table}: legacy ${legacyCol} column already dropped — skipping gap check.`);
                continue;
            }
            console.error(`[${table}] query error:`, error.message);
            process.exit(1);
        }
        const gaps = (data ?? []) as GapRow[];
        totalGaps += gaps.length;
        const scope = orgId ? `org ${orgId}` : "all orgs";
        console.log(`\n${table}: rows with legacy ${legacyCol} but null status_key (${scope}, sample max 25): ${gaps.length}`);
        for (const row of gaps) {
            const orgSuffix = orgId ? "" : ` org=${row.org_id ?? "?"}`;
            console.log(`  - ${row.id}${orgSuffix} legacy=${JSON.stringify((row as Record<string, unknown>)[legacyCol])}`);
        }
    }

    if (totalGaps > 0) {
        console.error("\nBackfill required before dropping legacy status columns.");
        process.exit(1);
    }
    console.log("\nOK — no sampled rows with legacy status and null status_key.");
}

main().catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    if (
        message.includes("Supabase URL is not set") ||
        message.includes("SUPABASE_SERVICE_ROLE_KEY environment variable is not set")
    ) {
        console.error(message);
        console.error("");
        console.error(USAGE);
    } else {
        console.error(message);
    }
    process.exit(1);
});
