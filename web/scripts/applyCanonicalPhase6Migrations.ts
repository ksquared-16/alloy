/**
 * Apply Canonical Data System Phase 6 migrations when supabase db push is blocked by history drift.
 *
 * Usage:
 *   cd web && npx tsx scripts/applyCanonicalPhase6Migrations.ts
 *   CANONICAL_PHASE6_MIGRATION_CONFIRM=APPLY cd web && npx tsx scripts/applyCanonicalPhase6Migrations.ts --apply
 *
 * Uses psql + DATABASE_URL (session port 5432, pgbouncer param stripped).
 */

import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.env.CANONICAL_PHASE6_MIGRATION_CONFIRM === "APPLY";

const MIGRATIONS = [
    "20260625140000_canonical_legacy_status_write_guards.sql",
    "20260625140100_canonical_drop_legacy_status_columns.sql",
] as const;

function resolveDatabaseUrl(): string {
    const raw = process.env.DATABASE_URL?.trim() || process.env.DIRECT_DATABASE_URL?.trim();
    if (!raw) {
        console.error("Missing DATABASE_URL or DIRECT_DATABASE_URL");
        process.exit(1);
    }
    const url = new URL(raw.replace(/^postgresql:/, "postgres:"));
    url.searchParams.delete("pgbouncer");
    if (url.port === "6543") url.port = "5432";
    return url.toString();
}

function psql(sql: string): string {
    return execFileSync("psql", [resolveDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-c", sql], {
        encoding: "utf8",
    });
}

function psqlFile(relPath: string): void {
    execFileSync("psql", [resolveDatabaseUrl(), "-v", "ON_ERROR_STOP=1", "-f", relPath], {
        stdio: "inherit",
    });
}

function migrationStatus(): { guard: boolean; legacyColumn: boolean } {
    const guard = psql(
        `SELECT COUNT(*) FROM pg_proc WHERE proname = 'reject_legacy_crm_text_status_write';`
    ).includes("1");
    const col = psql(
        `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='status';`
    ).includes("1");
    return { guard, legacyColumn: col };
}

async function main(): Promise<void> {
    const before = migrationStatus();
    console.log("\n=== Canonical Phase 6 migration status ===\n");
    console.log(`write guard function: ${before.guard ? "present" : "absent"}`);
    console.log(`opportunities.status column: ${before.legacyColumn ? "present" : "dropped"}`);

    if (!APPLY) {
        console.log("\nDry run. To apply:");
        console.log(
            "  CANONICAL_PHASE6_MIGRATION_CONFIRM=APPLY npx tsx scripts/applyCanonicalPhase6Migrations.ts --apply\n"
        );
        return;
    }

    if (!CONFIRM) {
        console.error("Refusing apply: set CANONICAL_PHASE6_MIGRATION_CONFIRM=APPLY");
        process.exit(1);
    }

    for (const file of MIGRATIONS) {
        const path = resolve(process.cwd(), "..", "supabase/migrations", file);
        console.log(`Applying ${file}...`);
        psqlFile(path);
        const version = file.split("_")[0]!;
        psql(
            `INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('${version}', '${file.replace(".sql", "")}', ARRAY[]::text[]) ON CONFLICT (version) DO NOTHING;`
        );
    }

    const after = migrationStatus();
    console.log(`\nPost-apply opportunities.status: ${after.legacyColumn ? "still present" : "dropped"}`);
    console.log("Phase 6 migrations applied.\n");
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
