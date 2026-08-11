#!/usr/bin/env node
/**
 * Migration preflight — the smallest guard that would have caught every
 * staging-ledger break we have had.
 *
 * Repo-only checks (no DB, safe in CI):
 *   1. version uniqueness   — two files may not share a version prefix
 *   2. filename shape       — <14-digit-version>_<name>.sql
 *   3. monotonic ordering   — versions sort ascending with no duplicates
 *
 * Ledger checks (only when a DB URL is supplied):
 *   4. no remote-only versions (orphans)  <- the thing that blocks `db push`
 *   5. no local-only versions unless --allow-pending
 *
 * Usage:
 *   node scripts/migration-preflight.mjs
 *   node scripts/migration-preflight.mjs --db-url "$STAGING_DB_URL"
 *   node scripts/migration-preflight.mjs --db-url "$URL" --allow-pending
 *
 * Exit 0 = promotable. Non-zero = do not push.
 *
 * The repo-only scan is EXPORTED as {@link checkMigrationRepo} so a certification
 * test can drive it over fixtures. That export exists because this file was
 * already correct and already detected the 2026-08-07 duplicate-version
 * collision — it simply was not wired to anything that could fail a merge. The
 * answer was a second caller, not a second parser: a re-implementation would be
 * one more thing to keep in agreement with this one, and the first time they
 * disagreed the laxer one would be the one guarding the merge.
 */

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

const args = process.argv.slice(2);
const dbUrl = args.includes("--db-url") ? args[args.indexOf("--db-url") + 1] : null;
const allowPending = args.includes("--allow-pending");

/**
 * The repo-only scan. Pure: reads a directory, returns findings, exits nothing.
 *
 * Returns `{ files, versions, failures }` so a caller can decide what a finding
 * means. The CLI turns a non-empty `failures` into exit 1; the certification
 * test asserts on the array directly.
 */
export function checkMigrationRepo(migrationsDir) {
    const failures = [];
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    const byVersion = new Map();

    for (const file of files) {
        const match = /^(\d{14})_(.+)\.sql$/.exec(file);
        if (!match) {
            failures.push(`filename shape: ${file} is not <14-digit-version>_<name>.sql`);
            continue;
        }
        const version = match[1];
        if (byVersion.has(version)) {
            // The collision that matters: `supabase_migrations.schema_migrations`
            // is PRIMARY KEY (version), so two files sharing a version can never
            // both be recorded. `supabase db push` does not check this before it
            // starts executing, so the failure lands mid-chain on a live database.
            failures.push(`duplicate version ${version}: ${byVersion.get(version)} and ${file}`);
            continue;
        }
        byVersion.set(version, file);
    }

    const versions = [...byVersion.keys()].sort();
    for (let i = 1; i < versions.length; i++) {
        if (versions[i] <= versions[i - 1]) {
            failures.push(`ordering: ${versions[i]} does not follow ${versions[i - 1]}`);
        }
    }

    return { files, versions, failures };
}

// Same guard idiom as scripts/docs-lint.mjs: importing this module must run
// nothing. Without it, a test that imports `checkMigrationRepo` would execute
// the CLI — including its `process.exit`.
if (import.meta.url === `file://${process.argv[1]}`) {
    runCli();
}

function runCli() {
const repoScan = checkMigrationRepo(MIGRATIONS);
const failures = [...repoScan.failures];
const fail = (msg) => failures.push(msg);
const local = repoScan.versions;

console.log(`repo: ${repoScan.files.length} files, ${local.length} unique versions`);

// --- ledger ----------------------------------------------------------------

if (dbUrl) {
    let raw;
    try {
        raw = execFileSync(
            "psql",
            [dbUrl, "-q", "-t", "-A", "-c", "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
        );
    } catch (err) {
        // Never echo the URL — it carries credentials.
        console.error("preflight: could not read the migration ledger (connection failed)");
        process.exit(2);
    }

    const remote = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const localSet = new Set(local);
    const remoteSet = new Set(remote);

    const orphans = remote.filter((v) => !localSet.has(v));
    const pending = local.filter((v) => !remoteSet.has(v));

    console.log(`ledger: ${remote.length} versions`);

    if (orphans.length) {
        fail(
            `remote-only version(s) with no repository file: ${orphans.join(", ")}\n` +
            `  This blocks \`supabase db push\` entirely.\n` +
            `  Cause is almost always a migration applied outside the repo (dashboard or raw SQL).\n` +
            `  Reconcile to the canonical repo version before pushing — do NOT simply revert the row\n` +
            `  if the SQL is non-idempotent, or the owning branch will fail when it merges.`
        );
    }
    if (pending.length && !allowPending) {
        fail(`local-only version(s) not applied: ${pending.join(", ")} (pass --allow-pending if this is expected)`);
    }
}

// --- result ----------------------------------------------------------------

if (failures.length) {
    console.error(`\npreflight FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
}
console.log("preflight OK — migration history is consistent");
}
