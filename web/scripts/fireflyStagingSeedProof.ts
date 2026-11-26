#!/usr/bin/env npx tsx
/**
 * Firefly staging seed — the in-database proof (ALY-14 E2). Run from `web/`, against a throwaway database:
 *
 *   FIREFLY_STAGING_SEED_SCRATCH_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/firefly_seed_scratch \
 *     npm run staging:seed:firefly:prove -- --tenant configured        (or --tenant bare)
 *
 * If the Firefly org is absent, first proves the seed refuses to run (it creates no org). Then plants the
 * ZZ Alloy QA fixtures and the Firefly org (real ids) in the chosen shape, snapshots both, and drives the
 * real seed command: apply, apply, hand-edit a seeded row, verify (must fail), apply (must heal). Prints
 * one PASS/FAIL line per proof and exits 1 on any FAIL. Refuses anything but a loopback
 * `firefly_seed_scratch*` database. See docs/platform/governance/firefly-staging-seed.md.
 */

import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
    DRIFT_TARGET_SQL,
    driftEditSql,
    fenceTamperedSeedSql,
    FIREFLY_ORG_ROW_SQL,
    FIREFLY_PRESENT_SQL,
    fireflyTenantSnapshotSql,
    ORG_SCOPED_TABLES_SQL,
    plantFireflySql,
    plantZzFixturesSql,
    scratchCountChecks,
    scratchProofRefusal,
    scratchRelationshipChecks,
    TENANT_SHAPES,
    type TenantShape,
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

/** Run a seed script directly (as the CLI does), for the fence-sensitivity proof only. */
function rawSeed(script: string): { status: number; out: string } {
    const res = spawnSync("psql", [URL_TEXT, "-X", "-q", "-v", "seed_target=local", "-f", "-"], {
        input: script,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    return { status: res.status ?? 1, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

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
    return run.status === 0 && /fence held — \d+ tables, 0 rows changed outside the seed rows/.test(run.out)
        && !/\bFAIL\b/.test(run.out) && run.out.includes("✓ verification passed");
}

function shapeArg(): TenantShape {
    const i = process.argv.indexOf("--tenant");
    const shape = i >= 0 ? process.argv[i + 1] : undefined;
    if (!(TENANT_SHAPES as readonly string[]).includes(String(shape))) {
        fail(`name the Firefly tenant shape to plant: --tenant ${TENANT_SHAPES.join(" | ")}`, 3);
    }
    return shape as TenantShape;
}

function main(): void {
    const refusal = scratchProofRefusal(URL_TEXT);
    if (refusal) fail(`refused: ${refusal}`, 3);
    const shape = shapeArg();
    console.log(`Firefly staging seed proof → ${redactDatabaseUrl(URL_TEXT)} (Firefly tenant: ${shape})`);

    console.log("No tenant is created");
    if (scalar(FIREFLY_PRESENT_SQL) === "0") {
        const orgsBefore = scalar("SELECT count(*) FROM public.orgs;");
        const refused = seed("apply");
        const orgsAfter = scalar("SELECT count(*) FROM public.orgs;");
        judge("refuses_without_firefly_org", refused.status !== 0 && /creates no org/.test(refused.out), `exit ${refused.status}`);
        judge("refusal_wrote_no_org", orgsAfter === orgsBefore, `orgs ${orgsBefore} → ${orgsAfter}`);
    } else {
        console.log("  SKIP  refuses_without_firefly_org             the Firefly org was already planted here");
    }

    psql(plantZzFixturesSql());
    psql(plantFireflySql(shape));
    const tables = psql(ORG_SCOPED_TABLES_SQL).split("\n").filter(Boolean);
    const zzBefore = scalar(zzSnapshotSql(tables));
    const tenantBefore = scalar(fireflyTenantSnapshotSql(tables));
    const counts = scratchCountChecks(shape);
    const countsBefore = counts.map((c) => Number(scalar(c.sql)));
    const seededBefore = counts.map((c) => (c.seededSql ? Number(scalar(c.seededSql)) : 0));

    console.log("Repeatability");
    const first = seed("apply");
    judge("first_apply_clean", cleanApply(first), first.status === 0 ? `fingerprint ${first.fingerprint}` : first.out.trim().split("\n").slice(-5).join(" / "));
    const second = seed("apply");
    judge("second_apply_clean", cleanApply(second), `fingerprint ${second.fingerprint}`);
    judge("second_apply_same_fingerprint", !!first.fingerprint && second.fingerprint === first.fingerprint, `${first.fingerprint} == ${second.fingerprint}`);

    console.log("Rows added to the Firefly org by two applies (every row, seeded or not)");
    counts.forEach((c, i) => {
        const added = Number(scalar(c.sql)) - countsBefore[i];
        const expected = c.expected - seededBefore[i];
        judge(c.name, added === expected, `expected +${expected}  actual +${added}${seededBefore[i] ? ` (${seededBefore[i]} already seeded)` : ""}`);
    });

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

    console.log("The fence catches a write to the tenant's own rows (a tampered copy of the seed)");
    const orgRowBefore = scalar(FIREFLY_ORG_ROW_SQL);
    const tampered = rawSeed(fenceTamperedSeedSql(readFileSync(resolve(WEB, "../supabase/seed/firefly_staging_seed.sql"), "utf8")));
    judge("fence_rejects_tenant_write", tampered.status !== 0 && /FENCE — rows that are not seed rows changed; rolled back: public\.orgs/.test(tampered.out), `exit ${tampered.status}`);
    judge("fence_rollback_left_org_row", scalar(FIREFLY_ORG_ROW_SQL) === orgRowBefore, orgRowBefore);

    console.log("The Firefly tenant's own rows");
    const tenantAfter = scalar(fireflyTenantSnapshotSql(tables));
    judge("tenant_rows_byte_identical", tenantAfter === tenantBefore, `${tenantBefore} → ${tenantAfter}`);

    console.log("ZZ Alloy QA fixtures");
    const zzAfter = scalar(zzSnapshotSql(tables));
    const [zzRows] = zzBefore.split("|");
    judge("zz_fixtures_present", Number(zzRows) >= ZZ_QA_ORGS.length, `${zzRows} rows across ${tables.length + 1} tables`);
    judge("zz_fixtures_byte_identical", zzAfter === zzBefore, `${zzBefore} → ${zzAfter}`);

    if (failures > 0) fail(`${failures} proof(s) FAILED`);
    console.log("✓ every proof passed");
}

main();
