#!/usr/bin/env npx tsx
/**
 * Firefly staging seed — the in-database proof (ALY-14 E2). Run from `web/`, against a throwaway database:
 *
 *   FIREFLY_STAGING_SEED_SCRATCH_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/firefly_seed_scratch \
 *     npm run staging:seed:firefly:prove
 *
 * Plants the ZZ Alloy QA fixtures (real registry ids) if absent, snapshots them, then drives the real
 * seed command: apply, apply, hand-edit a seeded row, verify (must fail), apply (must heal). Prints one
 * PASS/FAIL line per proof and exits 1 on any FAIL. Refuses anything but a loopback
 * `firefly_seed_scratch*` database. See docs/platform/governance/firefly-staging-seed.md.
 */

import { spawnSync } from "child_process";
import { resolve } from "path";

import {
    DRIFT_TARGET_SQL,
    driftEditSql,
    ORG_SCOPED_TABLES_SQL,
    plantZzFixturesSql,
    scratchCountChecks,
    scratchProofRefusal,
    scratchRelationshipChecks,
    ZZ_QA_ORGS,
    zzSnapshotSql,
} from "@/lib/staging/fireflyStagingSeed/scratchProof";
import { redactDatabaseUrl } from "@/lib/staging/fireflyStagingSeed/targets";

const WEB = resolve(__dirname, "..");
const URL_TEXT = process.env.FIREFLY_STAGING_SEED_SCRATCH_DATABASE_URL?.trim() ?? "";

function fail(message: string, code = 1): never {
    console.error(`✗ ${message}`);
    process.exit(code);
}

function psql(sql: string): string {
    const res = spawnSync("psql", [URL_TEXT, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
        input: sql,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) fail(`psql could not start: ${res.error.message} (environment problem — the proof needs a host psql)`, 2);
    if (res.status !== 0) fail(`psql failed:\n${res.stderr.trim()}`);
    return res.stdout.trim();
}

const scalar = (sql: string) => psql(sql).split("\n").pop() ?? "";

function seed(mode: "apply" | "verify"): { status: number; out: string; fingerprint: string | null } {
    const res = spawnSync("npm", ["run", "-s", "staging:seed:firefly", "--", mode, "--target", "local"], {
        cwd: WEB,
        encoding: "utf8",
        env: { ...process.env, FIREFLY_STAGING_SEED_DATABASE_URL: URL_TEXT },
        maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    return { status: res.status ?? 1, out, fingerprint: /fingerprint ([0-9a-f]{32})/.exec(out)?.[1] ?? null };
}

let failures = 0;
function judge(name: string, pass: boolean, detail: string): void {
    if (!pass) failures += 1;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(40)} ${detail}`);
}

function cleanApply(run: ReturnType<typeof seed>): boolean {
    return run.status === 0 && /fence held — \d+ tables, 0 rows changed outside org/.test(run.out)
        && !/\bFAIL\b/.test(run.out) && run.out.includes("✓ verification passed");
}

function main(): void {
    const refusal = scratchProofRefusal(URL_TEXT);
    if (refusal) fail(`refused: ${refusal}`, 3);
    console.log(`Firefly staging seed proof → ${redactDatabaseUrl(URL_TEXT)}`);

    psql(plantZzFixturesSql());
    const tables = psql(ORG_SCOPED_TABLES_SQL).split("\n").filter(Boolean);
    const zzBefore = scalar(zzSnapshotSql(tables));

    console.log("Repeatability");
    const first = seed("apply");
    judge("first_apply_clean", cleanApply(first), first.status === 0 ? `fingerprint ${first.fingerprint}` : first.out.trim().split("\n").slice(-5).join(" / "));
    const second = seed("apply");
    judge("second_apply_clean", cleanApply(second), `fingerprint ${second.fingerprint}`);
    judge("second_apply_same_fingerprint", !!first.fingerprint && second.fingerprint === first.fingerprint, `${first.fingerprint} == ${second.fingerprint}`);

    console.log("Counts after two applies (every row in the seed org)");
    for (const c of scratchCountChecks()) {
        const actual = Number(scalar(c.sql));
        judge(c.name, actual === c.expected, `expected ${c.expected}  actual ${actual}`);
    }

    console.log("Relationships (broken links)");
    for (const c of scratchRelationshipChecks()) {
        const actual = Number(scalar(c.sql));
        judge(c.name, actual === c.expected, `expected ${c.expected}  actual ${actual}`);
    }

    console.log("Drift heals on re-apply");
    const [driftId, knownName] = scalar(DRIFT_TARGET_SQL).split("|");
    psql(driftEditSql(driftId));
    const drifted = seed("verify");
    judge("verify_detects_drift", drifted.status !== 0 && drifted.fingerprint !== first.fingerprint, `exit ${drifted.status}, fingerprint ${drifted.fingerprint}`);
    const healed = seed("apply");
    judge("reapply_restores_fingerprint", cleanApply(healed) && healed.fingerprint === first.fingerprint, `fingerprint ${healed.fingerprint}`);
    const restored = scalar(`SELECT name FROM public.customers WHERE id = '${driftId}'::uuid;`);
    judge("reapply_restores_known_value", restored === knownName, `"${restored}"`);

    console.log("ZZ Alloy QA fixtures");
    const zzAfter = scalar(zzSnapshotSql(tables));
    const [zzRows] = zzBefore.split("|");
    judge("zz_fixtures_present", Number(zzRows) >= ZZ_QA_ORGS.length, `${zzRows} rows across ${tables.length + 1} tables`);
    judge("zz_fixtures_byte_identical", zzAfter === zzBefore, `${zzBefore} → ${zzAfter}`);

    if (failures > 0) fail(`${failures} proof(s) FAILED`);
    console.log("✓ every proof passed");
}

main();
