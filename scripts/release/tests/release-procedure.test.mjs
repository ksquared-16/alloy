/**
 * The release procedure's controls, offline (no Docker, no network):
 *
 *   node --test scripts/release/tests/release-procedure.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
    AuditLog,
    RELEASE_SCOPES,
    STEPS,
    canonicalJson,
    checkProduction,
    checkProductionTenantIsolation,
    checkStaging,
    checkStagingTenancy,
    classifyMigrationSql,
    gitRunner,
    hashRecord,
    identifyCandidate,
    makeApproval,
    planSchema,
    rehearsalConfigRefusal,
    verifyApproval,
    verifyAuditChain,
    wrapMigrationForApply,
} from "../release-lib.mjs";
import { approvalRefusal, renderRunbook } from "../alloy-release.mjs";
import { buildFixtureRepo, greenCheckRuns } from "../release-rehearsal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(HERE, "..", "release-config.json"), "utf8"));
const T = config.tenancy;
const FIREFLY = { id: T.staging_school.id, status: "active", name: "Firefly" };
const ZZ = T.qa_fixture_orgs.map((o) => ({ id: o.id, status: "active", name: o.name }));

// ---------------------------------------------------------------------------------------------

test("procedure order: approval precedes every production step; contract follows the deploy", () => {
    const ids = STEPS.map((s) => s.id);
    const approval = ids.indexOf("owner.approval");
    STEPS.forEach((s, i) => {
        if (s.production) assert.ok(i > approval, `${s.id} runs after owner.approval`);
    });
    assert.ok(ids.indexOf("schema.expand") < ids.indexOf("code.deploy"));
    assert.ok(ids.indexOf("code.deploy") < ids.indexOf("schema.contract"));
    assert.ok(ids.indexOf("production.snapshot") < ids.indexOf("schema.expand"));
});

test("canonical JSON is key-order independent", () => {
    assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
    assert.notEqual(hashRecord({ a: 1 }), hashRecord({ a: 2 }));
});

// --- classification --------------------------------------------------------------------------

test("classify: additive and guarded statements are expand", () => {
    const c = classifyMigrationSql("create table if not exists public.x (id int);\nalter table public.x add column if not exists y text;\ncreate index if not exists x_y on public.x (y);");
    assert.equal(c.class, "expand");
    assert.deepEqual(c.idempotency_warnings, []);
});

test("classify: destructive statements are contract", () => {
    for (const sql of ["drop table public.x;", "alter table public.x drop column y;", "truncate public.x;", "delete from public.x where true;", "alter table public.x rename column a to b;", "alter table public.x alter column y type bigint;", "alter table public.x alter column y set not null;"]) {
        assert.equal(classifyMigrationSql(sql).class, "contract", sql);
    }
});

test("classify: a DELETE inside a function body, a comment or a string is not a migration-time delete", () => {
    const sql = "-- delete from public.x\ncreate or replace function public.f() returns void language plpgsql as $fn$ begin delete from public.x; end $fn$;\nselect 'drop table public.x';";
    assert.equal(classifyMigrationSql(sql).class, "expand");
});

test("classify: C4 idempotency warnings", () => {
    const c = classifyMigrationSql("create table public.x (id int); create index x_i on public.x(id); alter table public.x add constraint c check (id > 0);");
    assert.equal(c.idempotency_warnings.length, 3);
});

// --- schema plan -----------------------------------------------------------------------------

const mig = (version, name, blob = `${version}-blob`) => ({ version, name, file: `${version}_${name}.sql`, blob });
const sqlOf = (sqlByVersion) => (m) => sqlByVersion[m.version] ?? "select 1;";

test("plan: unknown production ledger blocks", () => {
    const p = planSchema({ candidateMigrations: [mig("20270101000000", "a")], productionLedger: null, sqlOf: sqlOf({}) });
    assert.equal(p.status, "blocked");
    assert.match(p.blockers[0], /production_ledger_unknown/);
});

test("plan: pending migrations in version order, split expand/contract", () => {
    const cand = [mig("20270101000000", "a"), mig("20270301000000", "c"), mig("20270201000000", "b")];
    const p = planSchema({ candidateMigrations: cand, productionLedger: ["20270101000000"], baseline: [cand[0]], sqlOf: sqlOf({ "20270301000000": "drop table public.old;" }) });
    assert.equal(p.status, "ready");
    assert.deepEqual(p.pending.map((x) => x.version), ["20270201000000", "20270301000000"]);
    assert.deepEqual(p.expand, ["20270201000000"]);
    assert.deepEqual(p.contract, ["20270301000000"]);
});

test("plan: nothing pending is a noop", () => {
    const p = planSchema({ candidateMigrations: [mig("20270101000000", "a")], productionLedger: ["20270101000000"], baseline: [mig("20270101000000", "a")], sqlOf: sqlOf({}) });
    assert.equal(p.status, "noop");
});

test("plan: blockers — orphan, out of order, renumbered duplicate, changed in place, baseline collision, contract not last", () => {
    const base = [mig("20270101000000", "a"), mig("20270102000000", "edited", "old-blob"), mig("20270103000000", "dup", "dup-blob"), mig("20270104000000", "x1", "c1"), mig("20270104000000", "x2", "c2")];
    const cand = [
        mig("20270101000000", "a"),
        mig("20270102000000", "edited", "new-blob"),
        mig("20270103000000", "dup", "dup-blob"),
        mig("20270104000000", "x1", "c1"),
        mig("20270103500000", "dup_renumbered", "dup-blob"),
        mig("20270201000000", "drop"),
        mig("20270202000000", "add"),
    ];
    const p = planSchema({
        candidateMigrations: cand,
        productionLedger: ["20270101000000", "20270102000000", "20270103000000", "20270104000000", "20270150000000"],
        baseline: base,
        sqlOf: sqlOf({ "20270201000000": "drop table public.legacy;" }),
    });
    const kinds = p.blockers.map((b) => b.split(":")[0]);
    for (const k of ["ledger_orphan", "changed_in_place", "baseline_collision", "renumbered_duplicate", "out_of_order", "contract_not_last"]) assert.ok(kinds.includes(k), `${k} in ${kinds}`);
    assert.equal(p.status, "blocked");
});

test("apply wrapper records the ledger row in the same text it runs", () => {
    const w = wrapMigrationForApply({ version: "20270101000000", name: "a", sql: "select 'x';" });
    assert.match(w, /^select 'x';/);
    assert.match(w, /insert into supabase_migrations\.schema_migrations \(version, name, statements\) values \('20270101000000', 'a', array\['select ''x'';'\]\);/);
});

// --- tenancy (ALY-14) ------------------------------------------------------------------------

test("staging tenancy: Firefly + ZZ Alloy QA passes; a retired self-test org is a warning only", () => {
    const r = checkStagingTenancy(T, [FIREFLY, ...ZZ, { id: "x", status: "retired", name: "_w17_selftest_abcd1234" }]);
    assert.deepEqual(r.failures, []);
    assert.equal(r.warnings.length, 0);
    const r2 = checkStagingTenancy(T, [FIREFLY, { id: "y", status: "active", name: "_w17_selftest_abcd1234" }]);
    assert.deepEqual(r2.failures, []);
    assert.match(r2.warnings[0], /O3/);
});

test("staging tenancy: another school, or no Firefly, fails", () => {
    assert.match(checkStagingTenancy(T, [FIREFLY, ...ZZ, { id: "z", status: "active", name: "Other" }]).failures[0], /neither Firefly nor a ZZ Alloy QA fixture/);
    assert.match(checkStagingTenancy(T, ZZ).failures[0], /absent/);
    assert.match(checkStagingTenancy(T, [{ ...FIREFLY, status: "retired" }]).failures[0], /retired/);
});

test("production isolation: QA orgs, staging-seed namespace and live self-test orgs fail; real schools pass", () => {
    assert.deepEqual(checkProductionTenantIsolation(T, [{ id: "0b5e0000-0000-4000-8000-000000000001", status: "active", name: "A School" }, FIREFLY]), []);
    assert.equal(checkProductionTenantIsolation(T, [ZZ[0]]).length, 1);
    assert.equal(checkProductionTenantIsolation(T, [{ id: `${T.staging_seed_id_prefix}000000000001`, status: "active", name: "Firefly (Staging)" }]).length, 1);
    assert.equal(checkProductionTenantIsolation(T, [{ id: "q", status: "active", name: "_w17_selftest_0000" }]).length, 1);
    assert.equal(checkProductionTenantIsolation(T, [{ id: "q", status: "retired", name: "_w17_selftest_0000" }]).length, 0);
});

// --- staging and production checks -----------------------------------------------------------

const candidate = { sha: "c".repeat(40), staging_sha: "c".repeat(40), production_before_sha: "b".repeat(40) };
const stagingBuild = { gitSha: candidate.sha, gitBranch: "staging", vercelEnv: "preview", supabaseProjectRef: config.environments.staging.supabase_project_ref };
const prodBuild = { gitSha: candidate.sha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: config.environments.production.supabase_project_ref };

test("staging.verify: identity, CI on the candidate SHA, ledger equality, tenancy", () => {
    const ok = checkStaging({ config, candidate, migrations: [mig("20270101000000", "a")], buildInfo: stagingBuild, checkRuns: greenCheckRuns(config, candidate.sha), ledger: ["20270101000000"], orgs: [FIREFLY, ...ZZ] });
    assert.equal(ok.ok, true, ok.failures.join("; "));
    const bad = checkStaging({
        config,
        candidate,
        migrations: [mig("20270101000000", "a"), mig("20270102000000", "b")],
        buildInfo: { ...stagingBuild, supabaseProjectRef: config.environments.production.supabase_project_ref },
        checkRuns: greenCheckRuns(config, "d".repeat(40)),
        ledger: ["20270101000000"],
        orgs: [FIREFLY],
    });
    const text = bad.failures.join("\n");
    assert.match(text, /wired to Supabase project vslwnntzzgpnmrpjipat/);
    assert.match(text, /no run on the candidate/);
    assert.match(text, /ledger lacks 1 candidate migration/);
});

test("production.verify: identity, ledger, fingerprint, RLS", () => {
    const fp = { columns_md5: "a", policies_md5: "b", functions_md5: "c", indexes_md5: "d", tables: "2", rls_disabled: "0" };
    const ok = checkProduction({ config, candidate, buildInfo: prodBuild, ledger: ["1"], expectedVersions: ["1"], fingerprint: fp, expectedFingerprint: fp, orgs: [] });
    assert.equal(ok.ok, true, ok.failures.join("; "));
    const bad = checkProduction({ config, candidate, buildInfo: { ...prodBuild, gitSha: candidate.production_before_sha }, ledger: ["1"], expectedVersions: ["1", "2"], fingerprint: { ...fp, rls_disabled: "1", policies_md5: "x" }, expectedFingerprint: fp, orgs: [] });
    assert.equal(bad.failures.length, 5, bad.failures.join("\n"));
});

// --- approval --------------------------------------------------------------------------------

const manifest = {
    schema: "alloy.release-manifest/v1",
    environment: "production",
    candidate,
    migrations: { pending: [{ version: "2" }], expand: ["2"], contract: [] },
    staging_verification_sha256: "s".repeat(64),
    staging_verified_at: "2027-01-01T10:00:00.000Z",
};
const approvalAt = (at, over = {}) => makeApproval({ environment: "production", approver: "Kelly", manifest, approvedAt: at, ttlHours: 4, ...over });

test("approval: a valid owner approval binds candidate, manifest and staging verification", () => {
    const a = approvalAt("2027-01-01T11:00:00.000Z");
    assert.deepEqual(a.scope, RELEASE_SCOPES);
    assert.equal(verifyApproval({ approval: a, manifest, config, environment: "production", now: "2027-01-01T12:00:00.000Z", scopeNeeded: "code_deploy" }).ok, true);
});

test("approval: every way it can be wrong is refused", () => {
    const now = "2027-01-01T12:00:00.000Z";
    const v = (approval, over = {}) => verifyApproval({ approval, manifest, config, environment: "production", now, ...over }).failures.join(" ");
    assert.match(v(null), /no owner approval/);
    assert.match(v(approvalAt("2027-01-01T11:00:00.000Z", { approver: "Someone" })), /not a configured owner/);
    assert.match(v({ ...approvalAt("2027-01-01T11:00:00.000Z"), environment: "rehearsal" }), /given for rehearsal/);
    assert.match(verifyApproval({ approval: approvalAt("2027-01-01T11:00:00.000Z"), manifest: { ...manifest, candidate: { ...candidate, sha: "e".repeat(40) } }, config, environment: "production", now }).failures.join(" "), /different manifest/);
    assert.match(v(approvalAt("2027-01-01T09:00:00.000Z")), /predates the staging verification/);
    assert.match(v(approvalAt("2027-01-01T07:00:00.000Z")), /expired/);
    assert.match(v(approvalAt("2027-01-01T13:00:00.000Z")), /future/);
    assert.match(v(approvalAt("2027-01-01T11:00:00.000Z", { ttlHours: 48 })), /exceeds 24h/);
    assert.match(v(approvalAt("2027-01-01T11:00:00.000Z"), { scopeNeeded: "schema_contract" }), /does not grant schema_contract/);
});

test("approval: a production approval cannot be recorded from an agent session or without a terminal", () => {
    assert.match(approvalRefusal({ environment: "production", isTTY: true, env: { CLAUDECODE: "1" } }), /agent session/);
    assert.match(approvalRefusal({ environment: "production", isTTY: false, env: {} }), /interactively/);
    assert.equal(approvalRefusal({ environment: "production", isTTY: true, env: {} }), null);
    assert.equal(approvalRefusal({ environment: "rehearsal", isTTY: false, env: { CLAUDECODE: "1" } }), null);
    // And through the real CLI, from this (non-interactive) process:
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-approve-"));
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    const r = (() => {
        try {
            execFileSync("node", [join(HERE, "..", "alloy-release.mjs"), "approve", "--manifest", join(dir, "manifest.json"), "--approver", "Kelly", "--confirm", hashRecord(manifest).slice(0, 12)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CLAUDECODE: "" } });
            return { status: 0 };
        } catch (e) {
            return { status: e.status, stderr: String(e.stderr) };
        }
    })();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /interactively|agent session/);
    rmSync(dir, { recursive: true, force: true });
});

// --- audit chain -----------------------------------------------------------------------------

test("audit: chain verifies, and any edit, deletion or reorder is detected", () => {
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-audit-"));
    const path = join(dir, "audit.jsonl");
    const log = new AuditLog(path);
    log.append("candidate.identify", "pass", { n: 1 }, "2027-01-01T00:00:00Z");
    log.append("staging.verify", "pass", {}, "2027-01-01T00:01:00Z");
    log.append("production.preflight", "pass", {}, "2027-01-01T00:02:00Z");
    const text = readFileSync(path, "utf8");
    assert.equal(verifyAuditChain(text).ok, true);
    assert.equal(new AuditLog(path).head, log.head, "re-opened log continues the same chain");
    const rows = text.trim().split("\n");
    assert.equal(verifyAuditChain(rows.map((r, i) => (i === 1 ? r.replace('"pass"', '"fail"') : r)).join("\n")).ok, false);
    assert.equal(verifyAuditChain([rows[0], rows[2]].join("\n")).ok, false);
    assert.equal(verifyAuditChain([rows[1], rows[0], rows[2]].join("\n")).ok, false);
    rmSync(dir, { recursive: true, force: true });
});

// --- fences ----------------------------------------------------------------------------------

test("rehearsal fence: real project refs and non-loopback hosts are refused", () => {
    const env = (ref, url) => ({ environments: { staging: { supabase_project_ref: "rehearsalstagingref0", build_info_url: "http://127.0.0.1:1/staging" }, production: { supabase_project_ref: ref, build_info_url: url } } });
    assert.match(rehearsalConfigRefusal(env("vslwnntzzgpnmrpjipat", "http://127.0.0.1:1/p")), /real Supabase project/);
    assert.match(rehearsalConfigRefusal(env("rehearsalproductionrf", "https://www.workwithalloy.com/api/build-info")), /not loopback/);
    assert.equal(rehearsalConfigRefusal(env("rehearsalproductionrf", "http://127.0.0.1:1/p")), null);
    assert.match(rehearsalConfigRefusal(config), /real Supabase project/, "the live config can never pass as a rehearsal");
});

// --- candidate identification (local fixture repository) --------------------------------------

test("identify: routine candidate fast-forwards; a diverged main, an extra tree path or a migration edit is refused", () => {
    const fx = buildFixtureRepo();
    const git = gitRunner(fx.dir);
    const ok = identifyCandidate({ git, stagingRef: "staging", mainRef: "main" });
    assert.equal(ok.ok, true, ok.failures.join("; "));
    assert.equal(ok.candidate.sha, fx.stagingSha);
    assert.equal(ok.candidate.production_before_sha, fx.mainSha);
    assert.equal(ok.migrations.length, 4);

    const diverged = identifyCandidate({ git, stagingRef: "staging", mainRef: "hotfix" });
    assert.match(diverged.failures.join(" "), /does not fast-forward/);

    const env = { ...process.env, GIT_AUTHOR_NAME: "f", GIT_AUTHOR_EMAIL: "f@invalid", GIT_COMMITTER_NAME: "f", GIT_COMMITTER_EMAIL: "f@invalid" };
    execFileSync("git", ["-C", fx.dir, "checkout", "-q", "-b", "integration", "staging"], { env });
    writeFileSync(join(fx.dir, "web", "app", "extra.txt"), "x\n");
    writeFileSync(join(fx.dir, "supabase", "migrations", "20270301000000_late.sql"), "select 1;\n");
    execFileSync("git", ["-C", fx.dir, "add", "-A"], { env });
    execFileSync("git", ["-C", fx.dir, "commit", "-q", "-m", "integration"], { env });
    const strict = identifyCandidate({ git, stagingRef: "staging", mainRef: "main", candidateRef: "integration", allowTreeDiff: ["web/app/extra.txt"] });
    assert.match(strict.failures.join(" "), /outside the allowed paths: supabase\/migrations\/20270301000000_late\.sql/);
    assert.match(strict.failures.join(" "), /migrations differ from staging's/);
    rmSync(fx.root, { recursive: true, force: true });
});

test("runbook: names the manifest hash, the approval, and every production step in order", () => {
    const m = { ...manifest, candidate: { ...candidate, commits_ahead_of_main: 3 }, migrations: { ...manifest.migrations, production_ledger_head: "1", pending: [{ version: "2", class: "expand" }] }, candidate_versions: ["1", "2"] };
    const text = renderRunbook(m, config);
    assert.ok(text.includes(hashRecord(m).slice(0, 12)));
    const order = ["## 4. owner.approval", "## 5. production.snapshot", "## 6. schema.expand", "## 7. code.deploy", "## 8. production.verify", "## 9. schema.contract", "## 10. release.record"].map((h) => text.indexOf(h));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), String(order));
    assert.match(text, /never --force/);
    assert.match(text, /Instant Rollback/);
    assert.ok(!/supabase db push(?! does)/.test(text), "applies exactly the approved versions, not whatever db push finds");
});

test("live evidence path through the CLI: prepare → runbook → record (gated) → check-production", () => {
    const fx = buildFixtureRepo();
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-cli-"));
    const cli = (...args) => {
        try {
            return { status: 0, out: execFileSync("node", [join(HERE, "..", "alloy-release.mjs"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
        } catch (e) {
            return { status: e.status, out: String(e.stdout), err: String(e.stderr) };
        }
    };
    const w = (name, body) => (writeFileSync(join(dir, name), typeof body === "string" ? body : JSON.stringify(body)), join(dir, name));
    const all = ["20270101000000", "20270101000100", "20270201000000", "20270201000100"];
    const fp = "columns_md5|a\npolicies_md5|b\nfunctions_md5|c\nindexes_md5|d\ntables|2\nrls_disabled|0\n";
    const orgsStaging = [FIREFLY, ...ZZ].map((o) => `${o.id}|${o.status}|${o.name}`).join("\n");
    const sb = w("staging-build-info.json", { gitSha: fx.stagingSha, gitBranch: "staging", vercelEnv: "preview", supabaseProjectRef: config.environments.staging.supabase_project_ref });
    const pb = w("production-build-info.json", { gitSha: fx.mainSha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: config.environments.production.supabase_project_ref });
    const out = join(dir, "release");
    const prep = cli("prepare", "--repo", fx.dir, "--staging", "staging", "--main", "main", "--out-dir", out,
        "--staging-build-info", sb, "--check-runs", w("check-runs.json", greenCheckRuns(config, fx.stagingSha)), "--staging-ledger", w("staging-ledger.txt", all.join("\n")),
        "--staging-orgs", w("staging-orgs.txt", orgsStaging), "--staging-fingerprint", w("staging-fp.txt", fp),
        "--production-build-info", pb, "--production-ledger", w("production-ledger.txt", all.slice(0, 2).join("\n")));
    assert.equal(prep.status, 0, prep.out + prep.err);
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.equal(manifest.environment, "production");
    assert.deepEqual(manifest.migrations.expand, ["20270201000000", "20270201000100"]);

    const book = cli("runbook", "--manifest", join(out, "manifest.json"));
    assert.match(book.out, new RegExp(hashRecord(manifest).slice(0, 12)));

    assert.equal(cli("check-ledger", "--manifest", join(out, "manifest.json"), "--ledger", join(dir, "production-ledger.txt")).status, 0);
    assert.equal(cli("check-ledger", "--manifest", join(out, "manifest.json"), "--ledger", w("drifted-ledger.txt", all.slice(0, 3).join("\n"))).status, 1);

    const emitted = cli("emit-apply", "--repo", fx.dir, "--manifest", join(out, "manifest.json"), "--version", "20270201000000");
    assert.match(emitted.out, /add column if not exists email[\s\S]*insert into supabase_migrations\.schema_migrations/);

    const rec = (approvalPath) => cli("record", "--audit", join(out, "audit.jsonl"), "--manifest", join(out, "manifest.json"), "--approval", approvalPath, "--step", "schema.expand", "--status", "applied", "--detail", '{"version":"20270201000000"}');
    const refused = rec(join(out, "missing.json"));
    assert.equal(refused.status, 1);
    assert.match(refused.err, /refusing to record schema\.expand: no owner approval/);
    const approval = makeApproval({ environment: "production", approver: "Kelly", manifest, approvedAt: new Date().toISOString(), ttlHours: 1 });
    assert.equal(rec(w("approval.json", approval)).status, 0);
    assert.equal(cli("verify-audit", join(out, "audit.jsonl")).status, 0);

    const after = (sha, ledger) => cli("check-production", "--manifest", join(out, "manifest.json"),
        "--build-info", w("after-build.json", { gitSha: sha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: config.environments.production.supabase_project_ref }),
        "--ledger", w("after-ledger.txt", ledger.join("\n")), "--fingerprint", w("after-fp.txt", fp), "--orgs", w("after-orgs.txt", "0b5e0000-0000-4000-8000-000000000001|active|A School"));
    assert.equal(after(fx.stagingSha, all).status, 0);
    const bad = after(fx.mainSha, all.slice(0, 3));
    assert.equal(bad.status, 1);
    assert.match(bad.out, /serves .*expected/);
    rmSync(dir, { recursive: true, force: true });
    rmSync(fx.root, { recursive: true, force: true });
});
