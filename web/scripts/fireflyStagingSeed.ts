#!/usr/bin/env npx tsx
/**
 * Firefly staging seed — the one command (ALY-14 E2). Run from `web/`:
 *
 *   npm run staging:seed:firefly -- plan                         what would be written (default; no connection)
 *   npm run staging:seed:firefly -- render                       regenerate the committed SQL files
 *   npm run staging:seed:firefly -- check                        committed SQL == renderer, and audit passes
 *   npm run staging:seed:firefly -- apply  --target local        seed the shared local stack
 *   npm run staging:seed:firefly -- verify --target local        read-only census; exit 1 on any FAIL
 *   npm run staging:seed:firefly -- census --target local        read-only TENANT census (before any apply):
 *                                                                expected vs observed; exit 1 on a blocking FAIL
 *
 *   staging (both apply and verify):
 *     ALLOY_ENVIRONMENT=staging FIREFLY_STAGING_SEED_DATABASE_URL=… \
 *       npm run staging:seed:firefly -- apply --target staging --confirm-project-ref ikaxilmwmrmbagoidedu
 *   census takes the same staging arguments, writes nothing, and runs in a read-only session.
 *
 * Targets and refusals: lib/staging/fireflyStagingSeed/targets.ts. The SQL proves its own write
 * scope in-database (the fence); this command refuses before connecting if the target, the
 * committed file, or its audit is wrong. See docs/platform/governance/firefly-staging-seed.md.
 */

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { auditFireflyStagingSeedSql } from "@/lib/staging/fireflyStagingSeed/auditSql";
import { expectedSeedCounts } from "@/lib/staging/fireflyStagingSeed/dataset";
import { FIREFLY_ORG_ID } from "@/lib/staging/fireflyStagingSeed/ids";
import { renderFireflyStagingSeedSql } from "@/lib/staging/fireflyStagingSeed/renderSql";
import {
    LOCAL_STACK_DB_CONTAINER,
    redactDatabaseUrl,
    resolveSeedTarget,
    type ResolvedSeedTarget,
} from "@/lib/staging/fireflyStagingSeed/targets";
import {
    formatTenantCensusReport,
    parseTenantCensusOutput,
    renderFireflyStagingTenantCensusSql,
    summarizeTenantCensus,
} from "@/lib/staging/fireflyStagingSeed/tenantCensusSql";
import { parseVerificationOutput, renderFireflyStagingVerifySql } from "@/lib/staging/fireflyStagingSeed/verifySql";

const REPO_ROOT = resolve(__dirname, "../..");
export const SEED_SQL_PATH = resolve(REPO_ROOT, "supabase/seed/firefly_staging_seed.sql");
export const VERIFY_SQL_PATH = resolve(REPO_ROOT, "supabase/seed/firefly_staging_verify.sql");
export const TENANT_CENSUS_SQL_PATH = resolve(REPO_ROOT, "supabase/seed/firefly_staging_tenant_census.sql");

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function arg(name: string): string | null {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function fail(message: string, code = 1): never {
    console.error(`✗ ${message}`);
    process.exit(code);
}

/** The committed files must be exactly what the renderer produces, and must pass the audit. */
function committedScripts(): { seed: string; verify: string; census: string } {
    const seed = readFileSync(SEED_SQL_PATH, "utf8");
    const verify = readFileSync(VERIFY_SQL_PATH, "utf8");
    const census = readFileSync(TENANT_CENSUS_SQL_PATH, "utf8");
    if (seed !== renderFireflyStagingSeedSql()) fail(`${SEED_SQL_PATH} is stale — run: npm run staging:seed:firefly -- render`);
    if (verify !== renderFireflyStagingVerifySql()) fail(`${VERIFY_SQL_PATH} is stale — run: npm run staging:seed:firefly -- render`);
    if (census !== renderFireflyStagingTenantCensusSql()) fail(`${TENANT_CENSUS_SQL_PATH} is stale — run: npm run staging:seed:firefly -- render`);
    const audit = auditFireflyStagingSeedSql(seed);
    if (!audit.ok) fail(`seed SQL failed its audit:\n  - ${audit.failures.join("\n  - ")}`);
    return { seed, verify, census };
}

function hostHasPsql(): boolean {
    return spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0;
}

/**
 * Run a script on stdin. Host psql when present; for the LOCAL target only, the stack's own
 * container psql otherwise (the same fallback certification/alloy-certify uses). A staging run
 * never goes through a container.
 */
/** Forces every transaction in the session read-only, beneath the script's own BEGIN READ ONLY. */
const READ_ONLY_PGOPTIONS = "-c default_transaction_read_only=on";

function runPsql(
    target: ResolvedSeedTarget,
    script: string,
    vars: Record<string, string>,
    opts: { extraArgs?: string[]; readOnly?: boolean } = {},
): { status: number; stdout: string; stderr: string } {
    const varArgs = Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]);
    const extra = opts.extraArgs ?? [];
    let cmd: string;
    let args: string[];
    let env: NodeJS.ProcessEnv = process.env;
    if (hostHasPsql()) {
        cmd = "psql";
        args = [target.databaseUrl, "-X", "-q", ...extra, ...varArgs, "-f", "-"];
        if (opts.readOnly) env = { ...process.env, PGOPTIONS: READ_ONLY_PGOPTIONS };
    } else if (target.target === "local") {
        const inContainer = target.databaseUrl.replace(/^(postgres(?:ql)?:\/\/[^@]+@)[^/]+(\/.*)$/, "$1127.0.0.1:5432$2");
        cmd = "docker";
        const envArgs = opts.readOnly ? ["-e", `PGOPTIONS=${READ_ONLY_PGOPTIONS}`] : [];
        args = ["exec", "-i", ...envArgs, LOCAL_STACK_DB_CONTAINER, "psql", inContainer, "-X", "-q", ...extra, ...varArgs, "-f", "-"];
    } else {
        fail("no host psql — a staging run needs one (the local container fallback is local-only)", 2);
    }
    const res = spawnSync(cmd, args, { input: script, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
    // EPIPE: psql stopped reading because the script refused (ON_ERROR_STOP) — its own exit says why.
    const epipe = (res.error as NodeJS.ErrnoException | undefined)?.code === "EPIPE" && res.status !== null;
    if (res.error && !epipe) fail(`could not start ${cmd}: ${res.error.message} (environment problem)`, 2);
    return { status: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function resolveFromArgs(): ResolvedSeedTarget {
    const resolved = resolveSeedTarget({
        target: arg("target"),
        databaseUrl: process.env.FIREFLY_STAGING_SEED_DATABASE_URL ?? null,
        confirmProjectRef: arg("confirm-project-ref"),
        alloyEnvironment: process.env.ALLOY_ENVIRONMENT ?? null,
    });
    if (!resolved.ok) fail(`refused (${resolved.code}): ${resolved.detail}`, 3);
    return resolved;
}

function plan(): void {
    const seed = renderFireflyStagingSeedSql();
    const audit = auditFireflyStagingSeedSql(seed);
    const counts = expectedSeedCounts();
    console.log(`Firefly staging seed — into the existing Firefly org ${FIREFLY_ORG_ID} (creates no org)`);
    console.log(`  seed sql sha256   ${sha256(seed)}`);
    console.log(`  audit             ${audit.ok ? "pass" : `FAIL: ${audit.failures.join("; ")}`}`);
    console.log(`  write set         ${[...new Set(audit.insertTargets)].join(", ")}`);
    console.log(`  rows              ${JSON.stringify(counts)}`);
    console.log("                    configuration rows only where the org has none of its own (see the gates)");
    console.log("  no connection was made; apply needs --target");
}

function render(): void {
    writeFileSync(SEED_SQL_PATH, renderFireflyStagingSeedSql());
    writeFileSync(VERIFY_SQL_PATH, renderFireflyStagingVerifySql());
    writeFileSync(TENANT_CENSUS_SQL_PATH, renderFireflyStagingTenantCensusSql());
    console.log(`✓ wrote ${SEED_SQL_PATH}\n✓ wrote ${VERIFY_SQL_PATH}\n✓ wrote ${TENANT_CENSUS_SQL_PATH}`);
}

/** The tenant census, read-only: the committed file, in a read-only session; prints expected vs observed. */
function census(target: ResolvedSeedTarget, scripts: { census: string }): boolean {
    const res = runPsql(target, scripts.census, {}, { extraArgs: ["-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "|"], readOnly: true });
    if (res.status !== 0) fail(`tenant census failed (nothing was written):\n${res.stderr.trim()}`);
    const rows = parseTenantCensusOutput(res.stdout);
    if (rows.length === 0) fail("tenant census printed no rows");
    console.log(formatTenantCensusReport(rows, target));
    return summarizeTenantCensus(rows).seedMayProceed;
}

function check(): void {
    const { seed } = committedScripts();
    console.log(`✓ committed seed matches the renderer and passes its audit (sha256 ${sha256(seed)})`);
}

function verify(target: ResolvedSeedTarget, scripts: { verify: string }): boolean {
    const res = runPsql(target, scripts.verify, {});
    if (res.status !== 0) fail(`verification query failed:\n${res.stderr.trim()}`);
    const lines = parseVerificationOutput(res.stdout);
    const checks = lines.filter((l) => l.kind === "check");
    if (checks.length === 0) fail("verification printed no checks");
    let ok = true;
    for (const l of checks) {
        if (l.kind !== "check") continue;
        if (!l.pass) ok = false;
        console.log(`  ${l.pass ? "PASS" : "FAIL"}  ${l.name.padEnd(36)} expected ${l.expected}  actual ${l.actual}`);
    }
    const fp = lines.find((l) => l.kind === "fingerprint");
    console.log(`  fingerprint ${fp && fp.kind === "fingerprint" ? fp.value : "<none>"}`);
    return ok;
}

function main(): void {
    const mode = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "plan";
    if (mode === "plan") return plan();
    if (mode === "render") return render();
    if (mode === "check") return check();
    if (mode !== "apply" && mode !== "verify" && mode !== "census") {
        fail(`unknown mode ${mode} (plan | render | check | census | apply | verify)`);
    }

    const scripts = committedScripts();
    const target = resolveFromArgs();
    console.log(`Firefly staging seed → ${target.target} (${redactDatabaseUrl(target.databaseUrl)})`);

    if (mode === "census") {
        if (!census(target, scripts)) fail("tenant census: STOP (see the stop rule above)");
        return;
    }

    if (mode === "apply") {
        const res = runPsql(target, scripts.seed, { seed_target: target.target });
        process.stdout.write(res.stdout);
        if (res.status !== 0) fail(`seed failed and rolled back:\n${res.stderr.trim()}`);
        const fence = /fence held — [^\n]*/.exec(res.stderr)?.[0];
        console.log(fence ? `✓ ${fence}` : "✓ seed committed");
    }
    if (!verify(target, scripts)) fail("verification FAILED");
    console.log("✓ verification passed");
}

if (require.main === module) main();
