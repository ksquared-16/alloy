/**
 * Non-live rehearsal of the staging-to-production release procedure.
 *
 * Every scenario runs the real prepare/execute sequence (release-runner.mjs) and the real checks
 * (release-lib.mjs) against stand-ins only: a throwaway `--network none` postgres container, a local
 * bare repository and a loopback build-info server. No real environment, credential or push.
 *
 * Needs Docker and the local `postgres:17-alpine` image. Without them the suite FAILS with an
 * environment message rather than skipping, so a missing runtime cannot read as a pass.
 *
 *   node --test scripts/release/tests/release-rehearsal.test.mjs
 *   ALLOY_RELEASE_REHEARSAL_OUT=<dir> node --test …   # keep the manifests, approvals and audit logs
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { RELEASE_SCOPES, verifyAuditChain } from "../release-lib.mjs";
import { FIXTURE_BASE_MIGRATIONS, ORG_ROWS, ThrowawayPostgres, dockerAvailable, runRehearsalScenario } from "../release-rehearsal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const baseConfig = JSON.parse(readFileSync(join(HERE, "..", "release-config.json"), "utf8"));
const outDir = process.env.ALLOY_RELEASE_REHEARSAL_OUT || mkdtempSync(join(tmpdir(), "alloy-p6-rehearsal-out-"));
mkdirSync(outDir, { recursive: true });

let pg;
before(() => {
    assert.ok(dockerAvailable(), "ENVIRONMENT: docker or the local postgres:17-alpine image is unavailable; the rehearsal cannot run");
    pg = new ThrowawayPostgres().start();
});
after(() => pg?.stop());

const run = (name, opts = {}) => runRehearsalScenario({ pg, baseConfig, outDir, name, ...opts });
const auditOf = (r) => readFileSync(r.auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const steps = (r) => auditOf(r).map((e) => `${e.step}:${e.status}`);
const unchanged = (r) => {
    assert.deepEqual(r.after.ledger, r.before.ledger, "production ledger unchanged");
    assert.equal(r.after.buildInfo.gitSha, r.fixture.mainSha, "production still serves the previous build");
    assert.equal(r.after.main, r.fixture.mainSha, "main not moved");
};

test("routine release: every control passes in order, production ends identical to staging", async () => {
    const r = await run("happy");
    assert.equal(r.prep.ok, true, JSON.stringify(r.prep.failures));
    assert.equal(r.result.ok, true, JSON.stringify(r.result.failures));
    assert.deepEqual(steps(r), [
        "candidate.identify:pass", "staging.verify:pass", "production.preflight:pass", "owner.approval:pass", "production.snapshot:pass",
        "schema.expand:applied", "schema.expand:applied", "schema.expand:pass", "code.deploy:pass", "production.verify:pass", "schema.contract:skip", "release.record:pass",
    ]);
    assert.deepEqual(r.after.ledger, ["20270101000000", "20270101000100", "20270201000000", "20270201000100"]);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.stagingSha);
    assert.equal(r.after.main, r.fixture.stagingSha);
    assert.deepEqual(r.after.fingerprint, r.prep.manifest.expected_fingerprint, "production schema fingerprint equals staging's");
    assert.equal(verifyAuditChain(readFileSync(r.auditPath, "utf8")).ok, true);

    // The rollback point is usable: restoring the pre-release snapshot reproduces the pre-release schema.
    const snap = auditOf(r).find((e) => e.step === "production.snapshot").detail;
    pg.restore(snap.path, "p6_restore_happy");
    assert.deepEqual(pg.observe("p6_restore_happy").fingerprint, r.before.fingerprint);
    assert.deepEqual(pg.observe("p6_restore_happy").ledger, r.before.ledger);
});

test("no owner approval: stops before the first production action", async () => {
    const r = await run("no_approval", { approve: () => null });
    assert.equal(r.result.step, "owner.approval");
    assert.deepEqual(steps(r).slice(-1), ["owner.approval:fail"]);
    assert.ok(!steps(r).some((s) => s.startsWith("production.snapshot")));
    unchanged(r);
});

test("expired approval is refused", async () => {
    const r = await run("expired_approval", { approve: (_m, mk) => mk({ approvedAt: new Date(Date.now() - 5 * 3600_000).toISOString(), ttlHours: 1 }) });
    assert.equal(r.result.step, "owner.approval");
    assert.match(r.result.failures.join(" "), /expired|predates/);
    unchanged(r);
});

test("approval bound to another manifest is refused (candidate or plan changed after approval)", async () => {
    const r = await run("stale_approval", { approve: (m, mk) => ({ ...mk(), manifest_sha256: "0".repeat(64) }) });
    assert.equal(r.result.step, "owner.approval");
    assert.match(r.result.failures.join(" "), /different manifest/);
    unchanged(r);
});

test("staging verification: a red required check blocks before any manifest exists", async () => {
    const r = await run("staging_ci_red", {
        checkRuns: (config, sha) => ({ check_runs: config.required_checks.map((name, i) => ({ name, head_sha: sha, status: "completed", conclusion: i === 0 ? "failure" : "success" })) }),
    });
    assert.equal(r.prep.ok, false);
    assert.equal(r.prep.step, "staging.verify");
    assert.match(r.prep.failures.join(" "), /CI: required check trust-db-certification is completed\/failure/);
    assert.equal(r.result, null, "nothing to approve, nothing executed");
    unchanged(r);
});

test("staging verification: ALY-14 — a second school on staging blocks", async () => {
    const r = await run("staging_extra_tenant", { stagingOrgs: [ORG_ROWS.firefly, ORG_ROWS.zzQa, ORG_ROWS.zzCross, "('11111111-1111-4111-8111-111111111111', 'Another School', 'active')"] });
    assert.equal(r.prep.step, "staging.verify");
    assert.match(r.prep.failures.join(" "), /Another School .* is neither Firefly nor a ZZ Alloy QA fixture/);
    unchanged(r);
});

test("staging verification: staging without Firefly blocks", async () => {
    const r = await run("staging_no_firefly", { stagingOrgs: [ORG_ROWS.zzQa] });
    assert.equal(r.prep.step, "staging.verify");
    assert.match(r.prep.failures.join(" "), /staging school Firefly .* is absent/);
});

test("preflight: a production ledger version with no candidate file blocks (C1 orphan)", async () => {
    const r = await run("ledger_orphan", {
        beforePrepare: ({ pg: p, dbs }) => p.applyMigration(dbs.productionDb, { version: "20270110000000", name: "dashboard_sql", sql: "select 1;" }),
    });
    assert.equal(r.prep.step, "production.preflight");
    assert.match(r.prep.failures.join(" "), /ledger_orphan: .*20270110000000/);
    assert.equal(r.result, null);
});

test("schema.expand: a failing migration halts before the code deploy; old build keeps serving", async () => {
    const r = await run("migration_failure", { faults: { failMigration: "20270201000100" } });
    assert.equal(r.result.ok, false);
    assert.equal(r.result.step, "schema.expand");
    assert.deepEqual(r.result.applied, ["20270201000000"]);
    assert.equal(r.result.production_code_changed, false);
    assert.deepEqual(r.after.ledger, [...r.before.ledger, "20270201000000"]);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.mainSha);
    assert.equal(r.after.main, r.fixture.mainSha);
    assert.match(r.result.recovery, /fix forward/);
    assert.match(r.result.failures.join(" "), /division by zero/);
    const index = pg.psql(r.dbs.productionDb, "select count(*) from pg_indexes where indexname = 'people_email_idx';");
    assert.equal(index, "0", "the failing file's CREATE INDEX was rolled back with it");
});

test("schema.expand: production ledger changed after approval is refused", async () => {
    const r = await run("ledger_drift", {
        beforeExecute: ({ pg: p, dbs }) => p.applyMigration(dbs.productionDb, { version: "20270115000000", name: "dashboard_hotfix", sql: "select 1;" }),
    });
    assert.equal(r.result.step, "schema.expand");
    assert.match(r.result.failures.join(" "), /ledger changed since the approval/);
    assert.equal(r.after.main, r.fixture.mainSha);
});

test("code.deploy: main moved after approval — compare-and-swap refuses, schema stays additive", async () => {
    const r = await run("main_moved", { faults: { moveMainBeforeDeploy: true } });
    assert.equal(r.result.step, "code.deploy");
    assert.match(r.result.failures.join(" "), /main is no longer .*refusing to deploy over an unapproved production build/);
    assert.equal(r.after.main, r.fixture.hotfixSha, "the other change is left in place, not overwritten");
    assert.equal(r.result.production_code_changed, false);
});

test("production.verify fails (stale build served) → code rollback to the previous build", async () => {
    const r = await run("verify_fail_rollback", { faults: { deployServesStale: true } });
    assert.equal(r.result.ok, false);
    assert.equal(r.result.rolledBack, true);
    assert.match(r.result.failures.join(" "), /production: serves/);
    assert.deepEqual(steps(r).slice(-2), ["production.verify:fail", "code.rollback:pass"]);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.mainSha, "previous build served again");
});

test("production.verify: ALY-14 — a ZZ Alloy QA org in production fails verification and rolls back", async () => {
    const r = await run("production_tenant_leak", { productionOrgs: [ORG_ROWS.productionSchool, ORG_ROWS.zzQa] });
    assert.equal(r.result.ok, false);
    assert.match(r.result.failures.join(" "), /QA fixture org ZZ Alloy QA .* is present/);
    assert.equal(r.result.rolledBack, true);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.mainSha);
});

const CONTRACT_RELEASE = {
    "20270201000000_people_email.sql": "alter table public.people add column if not exists email text;\n",
    "20270201000200_drop_full_name.sql": "alter table public.people drop column if exists full_name;\n",
};

test("contract migration at the tail ships after the code deploy when schema_contract is granted", async () => {
    const r = await run("contract_release", { release: CONTRACT_RELEASE });
    assert.equal(r.prep.ok, true, JSON.stringify(r.prep.failures));
    assert.deepEqual(r.prep.manifest.migrations.contract, ["20270201000200"]);
    assert.equal(r.result.ok, true, JSON.stringify(r.result.failures));
    const s = steps(r);
    assert.ok(s.indexOf("code.deploy:pass") < s.indexOf("schema.contract:applied"), "destructive change after the new code is live");
    assert.deepEqual(r.after.fingerprint, r.prep.manifest.expected_fingerprint);
});

test("contract migration without schema_contract: release goes live, destructive change held", async () => {
    const r = await run("contract_without_scope", { release: CONTRACT_RELEASE, approve: (_m, mk) => mk({ scope: [...RELEASE_SCOPES] }) });
    assert.equal(r.result.step, "schema.contract");
    assert.match(r.result.failures.join(" "), /does not grant schema_contract/);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.stagingSha);
    assert.ok(!r.after.ledger.includes("20270201000200"));
});

test("preflight: a destructive migration before an additive one blocks the release", async () => {
    const r = await run("contract_not_last", {
        release: { "20270201000000_drop_full_name.sql": "alter table public.people drop column if exists full_name;\n", "20270201000100_people_email.sql": "alter table public.people add column if not exists email text;\n" },
    });
    assert.equal(r.prep.step, "production.preflight");
    assert.match(r.prep.failures.join(" "), /contract_not_last/);
    unchanged(r);
});

// --- first-promotion mode (briefing D9): a NEW, empty project receives the whole chain --------

const FP_RELEASE = {
    // A destructive file ahead of additive ones: a routine release blocks this (contract_not_last).
    "20270201000000_drop_full_name.sql": "alter table public.people drop column if exists full_name;\n",
    "20270201000100_people_email.sql": "alter table public.people add column if not exists email text;\n",
    // The W-17 shape: the chain itself creates one org, retired (D10).
    "20270201000200_w17_selftest_retired.sql": "insert into public.orgs (id, name, status) values ('99999999-0000-4000-8000-000000000017', '_w17_selftest_0bbaad43', 'retired') on conflict (id) do nothing;\n",
};
// The census checks these three for real (postgres:17-alpine ships them); see rehearsalAdapters for the other four.
const FP_BASE = { ...FIXTURE_BASE_MIGRATIONS, "20270101000050_extensions.sql": "create extension if not exists btree_gist;\ncreate extension if not exists pgcrypto;\ncreate extension if not exists \"uuid-ossp\";\n" };
const FP_ALL = ["20270101000000", "20270101000050", "20270101000100", "20270201000000", "20270201000100", "20270201000200"];
const runFirst = (name, opts = {}) => run(name, { firstPromotion: true, base: FP_BASE, release: FP_RELEASE, ...opts });
const untouched = (r) => {
    assert.equal(r.after.buildInfo.gitSha, r.fixture.mainSha, "production still serves the previous build");
    assert.equal(r.after.buildInfo.supabaseProjectRef, "rehearsalproductionrf", "…on the previous project");
    assert.equal(r.after.main, r.fixture.mainSha, "main not moved");
};

test("first promotion: an empty project receives the whole chain in version order, census before deploy, then verifies on the new ref", async () => {
    const r = await runFirst("fp_happy");
    assert.equal(r.prep.ok, true, JSON.stringify(r.prep.failures));
    assert.deepEqual(r.before.ledger, [], "no ledger table at all on the new project");
    assert.equal(r.prep.manifest.mode, "first_promotion");
    assert.deepEqual(r.prep.manifest.migrations.expand, FP_ALL);
    assert.deepEqual(r.prep.manifest.migrations.destructive_in_chain, ["20270201000000"]);
    assert.equal(r.result.ok, true, JSON.stringify(r.result.failures));
    assert.deepEqual(steps(r), [
        "candidate.identify:pass", "staging.verify:pass", "production.preflight:pass", "owner.approval:pass", "production.snapshot:pass",
        "schema.expand:ledger_ready", ...FP_ALL.map(() => "schema.expand:applied"), "schema.expand:pass", "schema.expand:census_pass",
        "code.deploy:pass", "production.verify:pass", "schema.contract:skip", "release.record:pass",
    ]);
    assert.deepEqual(auditOf(r).filter((e) => e.status === "applied").map((e) => e.detail.version), FP_ALL, "applied in version order");
    assert.deepEqual(r.after.ledger, FP_ALL);
    assert.deepEqual(r.after.fingerprint, r.prep.manifest.expected_fingerprint, "the new project's schema equals staging's");
    assert.deepEqual(r.after.orgs, [{ id: "99999999-0000-4000-8000-000000000017", status: "retired", name: "_w17_selftest_0bbaad43" }]);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.stagingSha);
    assert.equal(r.after.buildInfo.supabaseProjectRef, "rehearsalnewprojectr");
    assert.equal(verifyAuditChain(readFileSync(r.auditPath, "utf8")).ok, true);
    const statements = pg.psql(r.dbs.productionDb, "select count(*) from supabase_migrations.schema_migrations where statements is not null;");
    assert.equal(statements, String(FP_ALL.length), "each ledger row carries the statements it ran");
});

test("first promotion: refused when the target's ledger is not empty; nothing is applied", async () => {
    const r = await runFirst("fp_ledger_not_empty", {
        beforePrepare: ({ pg: p, dbs }) => {
            p.psql(dbs.productionDb, "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);");
            p.applyMigration(dbs.productionDb, { version: "20270101000000", name: "orgs", sql: "select 1;" });
        },
    });
    assert.equal(r.prep.ok, false);
    assert.equal(r.prep.step, "production.preflight");
    assert.match(r.prep.failures.join(" "), /first_promotion_ledger_not_empty: the target records 1 version/);
    assert.equal(r.result, null);
    assert.deepEqual(r.after.ledger, ["20270101000000"]);
    untouched(r);
});

test("first promotion: the same evidence without the flag is a routine release and blocks as before", async () => {
    const r = await run("fp_without_flag", { release: FP_RELEASE });
    assert.equal(r.prep.step, "production.preflight");
    assert.match(r.prep.failures.join(" "), /contract_not_last/);
    assert.equal(r.prep.manifest, undefined);
});

test("first promotion: a write to the target after the approval is refused before the chain", async () => {
    const r = await runFirst("fp_drift", {
        beforeExecute: ({ pg: p, dbs }) => {
            p.psql(dbs.productionDb, "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);");
            p.applyMigration(dbs.productionDb, { version: "20270115000000", name: "someone_else", sql: "select 1;" });
        },
    });
    assert.equal(r.result.step, "schema.expand");
    assert.match(r.result.failures.join(" "), /no longer empty/);
    assert.deepEqual(r.after.ledger, ["20270115000000"]);
    untouched(r);
});

test("first promotion: a failing file mid-chain stops; it left nothing; the old build serves on the old project", async () => {
    const r = await runFirst("fp_migration_failure", { faults: { failMigration: "20270201000100" } });
    assert.equal(r.result.step, "schema.expand");
    assert.deepEqual(r.result.applied, FP_ALL.slice(0, 4));
    assert.deepEqual(r.after.ledger, FP_ALL.slice(0, 4));
    assert.equal(pg.psql(r.dbs.productionDb, "select count(*) from information_schema.columns where table_name = 'people' and column_name = 'email';"), "0", "the failing file's DDL rolled back with it");
    untouched(r);
});

test("first promotion: the census fails (an extension missing) → hold before any code points at the new project", async () => {
    const r = await runFirst("fp_census_fail", { faults: { censusMissingExtension: true } });
    assert.equal(r.result.step, "schema.expand");
    assert.match(r.result.failures.join(" "), /census: extension pg_cron is missing/);
    assert.match(r.result.recovery, /previous build on the previous project/);
    assert.deepEqual(r.after.ledger, FP_ALL);
    untouched(r);
});

test("first promotion: an approval without schema_contract cannot start a chain that holds destructive files", async () => {
    const r = await runFirst("fp_no_contract_scope", { approve: (_m, mk) => mk({ scope: [...RELEASE_SCOPES] }) });
    assert.equal(r.result.step, "schema.expand");
    assert.match(r.result.failures.join(" "), /does not grant schema_contract/);
    assert.deepEqual(r.after.ledger, [], "nothing applied");
    untouched(r);
});

test("first promotion: verification fails after the deploy → code rollback to the previous build, on the previous project", async () => {
    const r = await runFirst("fp_verify_fail_rollback", { faults: { deployServesStale: true } });
    assert.equal(r.result.ok, false);
    assert.equal(r.result.rolledBack, true);
    assert.deepEqual(steps(r).slice(-2), ["production.verify:fail", "code.rollback:pass"]);
    assert.equal(r.after.buildInfo.gitSha, r.fixture.mainSha);
    assert.equal(r.after.buildInfo.supabaseProjectRef, "rehearsalproductionrf");
});

test("first promotion: a config copy that names another new project is refused at the approval", async () => {
    const r = await runFirst("fp_config_mismatch", {
        beforeExecute: ({ config }) => {
            config.environments.production.supabase_project_ref = "rehearsalotherprojec";
        },
    });
    assert.equal(r.result.step, "owner.approval");
    assert.match(r.result.failures.join(" "), /the manifest's new project is rehearsalnewprojectr/);
    assert.deepEqual(r.after.ledger, []);
});

test("the rehearsal database is a labelled, network-less throwaway", () => {
    const labels = execFileSync("docker", ["inspect", "-f", "{{json .Config.Labels}}", pg.name], { encoding: "utf8" });
    assert.match(labels, /p6-release-rehearsal/);
    const net = execFileSync("docker", ["inspect", "-f", "{{.HostConfig.NetworkMode}}", pg.name], { encoding: "utf8" }).trim();
    assert.equal(net, "none");
});
