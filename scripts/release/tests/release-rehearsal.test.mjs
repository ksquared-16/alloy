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
import { ORG_ROWS, ThrowawayPostgres, dockerAvailable, runRehearsalScenario } from "../release-rehearsal.mjs";

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

test("the rehearsal database is a labelled, network-less throwaway", () => {
    const labels = execFileSync("docker", ["inspect", "-f", "{{json .Config.Labels}}", pg.name], { encoding: "utf8" });
    assert.match(labels, /p6-release-rehearsal/);
    const net = execFileSync("docker", ["inspect", "-f", "{{.HostConfig.NetworkMode}}", pg.name], { encoding: "utf8" }).trim();
    assert.equal(net, "none");
});
