/**
 * The release procedure's controls, offline (no Docker, no network):
 *
 *   node --test scripts/release/tests/release-procedure.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
    AuditLog,
    CONTRACT_SCOPE,
    FIRST_PROMOTION,
    LEDGER_IF_PRESENT_PSQL,
    RELEASE_SCOPES,
    STEPS,
    buildManifest,
    canonicalJson,
    checkFirstPromotionCensus,
    checkNoTenantYet,
    checkProduction,
    checkProductionBefore,
    firstPromotionConfig,
    firstPromotionConfigRefusal,
    manifestConfigMismatch,
    scopesFor,
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
import { approvalRefusal, renderFirstPromotionRunbook, renderRunbook } from "../alloy-release.mjs";
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

// GitHub names a check-run after the job's `name:`, not the workflow file. checkStaging matches on that name, so a
// required check that names a file (as `web-typecheck` once did) can never pass (B4 finding F6).
test("required checks: each names a job that a pull_request to main runs", () => {
    const WF = join(HERE, "..", "..", "..", ".github", "workflows");
    const jobNames = new Set();
    for (const f of execFileSync("ls", [WF], { encoding: "utf8" }).split("\n").filter((n) => n.endsWith(".yml"))) {
        const y = readFileSync(join(WF, f), "utf8");
        const on = y.split(/^on:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
        if (!/^ {2}pull_request:/m.test(on) || /^ {2}pull_request:\s*\n {4}branches:/m.test(on)) continue;
        for (const m of (y.split(/^jobs:\s*$/m)[1] ?? "").matchAll(/^ {4}name:\s*(.+?)\s*$/gm)) jobNames.add(m[1].replace(/^["']|["']$/g, ""));
    }
    for (const name of config.required_checks) assert.ok(jobNames.has(name), `${name} is not the name of a pull_request job`);
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

test("classify: a destructive statement inside a DO block runs at migration time, so it is contract", () => {
    for (const sql of [
        "do $$ begin drop table if exists public.old_t; end $$;",
        "do $$ begin if exists (select 1 from public.x) then delete from public.x where k = 'a'; end if; end $$;",
        "do $do$ begin alter table public.x alter column y set not null; end $do$;",
        "do $$ begin truncate public.x; end $$;",
        "do $$ begin alter table public.x rename column a to b; end $$;",
        "do $$ begin execute 'drop table public.x'; end $$;",
        "do $$ begin execute format('alter table %I drop column y', 'x'); end $$;",
        "do $outer$ begin execute $q$ delete from public.x $q$; end $outer$;",
        "truncate table public.x, public.y restart identity;",
        // Milestone QA: TRUNCATE that starts a dynamic-SQL string was classed expand.
        "do $$ begin execute format('truncate table %I', t); end $$;",
        "do $$ begin execute ('truncate public.t'); end $$;",
        "do $$ begin execute 'truncate ' || quote_ident(t); end $$;",
        "do $$ begin execute 'select 1; truncate public.t'; end $$;",
        "do $$ begin execute format('grant select on %I to anon; truncate %I', t, t); end $$;",
    ]) {
        assert.equal(classifyMigrationSql(sql).class, "contract", sql);
    }
});

test("classify: a function created inside a DO block is still code; a guarded DO block adds no idempotency warning", () => {
    const sql = "do $do$ begin create or replace function public.f() returns void language plpgsql as $fn$ begin delete from public.x; end $fn$; end $do$;\n"
        + "do $$ begin if not exists (select 1 from pg_constraint where conname = 'c') then alter table public.x add constraint c check (id > 0); end if; end $$;";
    const c = classifyMigrationSql(sql);
    assert.equal(c.class, "expand");
    assert.deepEqual(c.idempotency_warnings, []);
});

test("classify: TRUNCATE as a privilege name is not a truncate", () => {
    const sql = "do $$ begin execute format('revoke insert, update, delete, truncate on table public.%I from anon', 'x'); "
        + "if has_table_privilege('anon', 'public.x', 'SELECT,TRUNCATE,TRIGGER') then raise exception 'x'; end if; end $$;\nrevoke truncate on public.x from anon;";
    assert.equal(classifyMigrationSql(sql).class, "expand");
});

test("classify: a GRANT privilege list, plain or a quoted privilege CSV, is not a truncate", () => {
    for (const sql of [
        "grant select, insert, update, delete, truncate, references, trigger on public.x to service_role;",
        "alter default privileges in schema public grant truncate on tables to service_role;",
        "do $$ begin execute format('grant %s on table public.%I to service_role', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE', 'x'); end $$;",
        "do $$ begin execute 'grant truncate on public.x to service_role'; end $$;",
    ]) {
        assert.equal(classifyMigrationSql(sql).class, "expand", sql);
    }
});

test("classify: a privilege CSV outside a grant, or a privilege list without ON, is not excluded", () => {
    for (const sql of [
        "do $$ begin execute format('%s public.%I', 'TRUNCATE', 'x'); end $$;",
        "do $$ begin perform 1 where 'truncate' = any(array['SELECT']); end $$;",
        "do $$ begin execute 'grant select to x; truncate public.x'; end $$;",
    ]) {
        assert.equal(classifyMigrationSql(sql).class, "contract", sql);
    }
});

test("classify: the repo's DO-block delete migration is contract", () => {
    const file = "supabase/migrations/20260430216000_childcare_org_delete_cleaning_location_field_definitions.sql";
    const c = classifyMigrationSql(readFileSync(join(HERE, "../../..", file), "utf8"));
    assert.equal(c.class, "contract");
    assert.ok(c.destructive.includes("delete rows"), c.destructive.join(", "));
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

const ALLOY_BEND_ID = "7803388d-cdee-4afb-89cf-23a137f39423";

test("staging tenancy: the reviewed retired org Alloy Bend passes only while retired", () => {
    assert.ok(T.staging_retired_orgs.some((o) => o.id === ALLOY_BEND_ID && o.slug === "alloy-bend" && o.status === "retired"));
    const retired = checkStagingTenancy(T, [FIREFLY, ...ZZ, { id: ALLOY_BEND_ID, status: "retired", name: "Alloy Bend" }]);
    assert.deepEqual(retired.failures, []);
    assert.deepEqual(retired.warnings, []);
    const active = checkStagingTenancy(T, [FIREFLY, ...ZZ, { id: ALLOY_BEND_ID, status: "active", name: "Alloy Bend" }]);
    assert.equal(active.failures.length, 1);
    assert.match(active.failures[0], /Alloy Bend .* on the reviewed retired list but is active/);
});

test("staging tenancy: a retired org not on the reviewed list fails; an active unknown org still fails", () => {
    const unknownRetired = checkStagingTenancy(T, [FIREFLY, ...ZZ, { id: "0b5e0000-0000-4000-8000-0000000000aa", status: "retired", name: "Old School" }]);
    assert.equal(unknownRetired.failures.length, 1);
    assert.match(unknownRetired.failures[0], /Old School .* is neither Firefly nor a ZZ Alloy QA fixture/);
    // An org named like Alloy Bend under another id is not the reviewed org.
    const lookalike = checkStagingTenancy(T, [FIREFLY, { id: "0b5e0000-0000-4000-8000-0000000000bb", status: "retired", name: "Alloy Bend" }]);
    assert.equal(lookalike.failures.length, 1);
    assert.match(checkStagingTenancy(T, [FIREFLY, { id: "z", status: "active", name: "Other" }]).failures[0], /neither Firefly/);
});

test("staging tenancy: a reviewed-list entry that does not say retired is refused, and its org is not accepted", () => {
    const t = { ...T, staging_retired_orgs: [{ id: ALLOY_BEND_ID, slug: "alloy-bend", name: "Alloy Bend", status: "active" }] };
    const r = checkStagingTenancy(t, [FIREFLY, { id: ALLOY_BEND_ID, status: "active", name: "Alloy Bend" }]);
    assert.equal(r.failures.length, 2, r.failures.join("\n"));
    assert.match(r.failures[0], /must name status "retired"/);
    assert.match(r.failures[1], /neither Firefly/);
    assert.match(checkStagingTenancy({ ...T, staging_retired_orgs: [{ slug: "x", status: "retired" }] }, [FIREFLY]).failures[0], /has no id/);
    // Absent list: behaviour as before the list existed.
    const { staging_retired_orgs: _drop, ...bare } = T;
    assert.match(checkStagingTenancy(bare, [FIREFLY, { id: ALLOY_BEND_ID, status: "retired", name: "Alloy Bend" }]).failures[0], /neither Firefly/);
});

test("production: staging's reviewed retired org must be absent; W-17 retired + Firefly is the expected end state", () => {
    const w17 = { id: "37c56459-5082-44c5-a261-03466b127361", status: "retired", name: "_w17_selftest_37c56459" };
    assert.deepEqual(checkProductionTenantIsolation(T, [w17, { id: "0b5e0000-0000-4000-8000-000000000001", status: "active", name: "Firefly" }]), []);
    const bend = checkProductionTenantIsolation(T, [w17, { id: ALLOY_BEND_ID, status: "retired", name: "Alloy Bend" }]);
    assert.equal(bend.length, 1);
    assert.match(bend[0], /staging's retired org Alloy Bend .* not migrated/);
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

// --- first-promotion mode (briefing D9, M3/M4) ------------------------------------------------

const NEW_REF = "abcdefghijklmnopqrst";
const fpConfig = firstPromotionConfig(config, NEW_REF);
const chain = [mig("20270101000000", "orgs"), mig("20270102000000", "drop_legacy"), mig("20270103000000", "add_col"), mig("20270104000000", "w17_retire")];
const chainSql = sqlOf({ "20270102000000": "drop table if exists public.legacy;" });

test("first promotion: an empty ledger plans the whole chain in version order; the contract_not_last waiver is the only one", () => {
    const shuffled = [chain[2], chain[0], chain[3], chain[1]];
    const p = planSchema({ candidateMigrations: shuffled, productionLedger: [], baseline: [chain[0]], sqlOf: chainSql, firstPromotion: true });
    assert.equal(p.status, "ready", p.blockers.join("; "));
    assert.equal(p.mode, FIRST_PROMOTION);
    assert.deepEqual(p.expand, chain.map((m) => m.version), "every file, ascending, before the deploy");
    assert.deepEqual(p.contract, []);
    assert.deepEqual(p.destructive_in_chain, ["20270102000000"]);
    assert.equal(p.pending.find((x) => x.version === "20270102000000").class, "contract", "each file keeps its class");
    // The same chain in a routine release is still blocked: the waiver needs the mode.
    const routine = planSchema({ candidateMigrations: shuffled, productionLedger: [], baseline: [chain[0]], sqlOf: chainSql });
    assert.match(routine.blockers.join(" "), /contract_not_last/);
    assert.equal(routine.mode, undefined);
});

test("first promotion: a target that records any version is refused outright", () => {
    const p = planSchema({ candidateMigrations: chain, productionLedger: ["20270101000000"], baseline: [], sqlOf: chainSql, firstPromotion: true });
    assert.equal(p.status, "blocked");
    assert.deepEqual(p.pending, []);
    assert.match(p.blockers[0], /first_promotion_ledger_not_empty: the target records 1 version/);
    const unknown = planSchema({ candidateMigrations: chain, productionLedger: null, sqlOf: chainSql, firstPromotion: true });
    assert.match(unknown.blockers[0], /production_ledger_unknown/);
    const unversioned = planSchema({ candidateMigrations: [...chain, { version: null, name: "x", file: "x.sql", blob: "b" }], productionLedger: [], sqlOf: chainSql, firstPromotion: true });
    assert.match(unversioned.blockers.join(" "), /unversioned_file: x\.sql/);
});

test("first promotion: the other planner blockers still apply (renumbered duplicate needs a ledger, so: none can fire on empty), routine plans are byte-identical without the flag", () => {
    const cand = [mig("20270101000000", "a"), mig("20270301000000", "c"), mig("20270201000000", "b")];
    const args = { candidateMigrations: cand, productionLedger: ["20270101000000"], baseline: [cand[0]], sqlOf: sqlOf({ "20270301000000": "drop table public.old;" }) };
    assert.deepEqual(planSchema(args), planSchema({ ...args, firstPromotion: false }));
    assert.deepEqual(Object.keys(planSchema(args)).sort(), ["blockers", "contract", "expand", "ledger_head", "pending", "status", "warnings"]);
});

test("first-promotion config copy: names the new ref, records the previous one, leaves the policy alone", () => {
    assert.equal(fpConfig.environments.production.supabase_project_ref, NEW_REF);
    assert.equal(fpConfig.environments.production.previous_supabase_project_ref, "vslwnntzzgpnmrpjipat");
    assert.equal(fpConfig.derived_from_sha256, hashRecord(config));
    assert.deepEqual({ ...fpConfig, environments: undefined, derived_from_sha256: undefined }, { ...config, environments: undefined, derived_from_sha256: undefined });
    assert.deepEqual(fpConfig.environments.staging, config.environments.staging);
    assert.equal(config.environments.production.supabase_project_ref, "vslwnntzzgpnmrpjipat", "the committed config is unchanged");
    assert.throws(() => firstPromotionConfig(config, "vslwnntzzgpnmrpjipat"), /previous project/);
    assert.throws(() => firstPromotionConfig(config, "ikaxilmwmrmbagoidedu"), /staging's project/);
    assert.throws(() => firstPromotionConfig(config, "Not-A-Ref"), /not a Supabase project ref/);
    assert.match(firstPromotionConfigRefusal(config).join(" "), /no production\.previous_supabase_project_ref/, "the committed config cannot run a first promotion");
});

test("first promotion preflight: production still serves old main on the PREVIOUS project; the new project is empty", () => {
    const before = { gitSha: candidate.production_before_sha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: "vslwnntzzgpnmrpjipat" };
    assert.deepEqual(checkProductionBefore({ config: fpConfig, candidate, buildInfo: before, firstPromotion: true }).failures, []);
    assert.deepEqual(checkProductionBefore({ config: fpConfig, candidate, buildInfo: before, firstPromotion: true, fingerprint: { tables: "0" } }).failures, []);
    assert.match(checkProductionBefore({ config: fpConfig, candidate, buildInfo: before, firstPromotion: true, fingerprint: { tables: "3" } }).failures.join(" "), /already holds 3 table/);
    assert.match(checkProductionBefore({ config: fpConfig, candidate, buildInfo: { ...before, supabaseProjectRef: NEW_REF }, firstPromotion: true }).failures.join(" "), /expected vslwnntzzgpnmrpjipat/);
    assert.match(checkProductionBefore({ config, candidate, buildInfo: before, firstPromotion: true }).failures.join(" "), /previous_supabase_project_ref/);
    // Routine preflight is unchanged: the committed config, the committed ref.
    assert.deepEqual(checkProductionBefore({ config, candidate, buildInfo: before }).failures, []);
    assert.match(checkProductionBefore({ config: fpConfig, candidate, buildInfo: before }).failures.join(" "), new RegExp(`expected ${NEW_REF}`));
});

const fpIdentified = { candidate: { ...candidate, commits_ahead_of_main: 3 }, migrations: chain, baseline_migrations: [] };
const fpPlan = planSchema({ candidateMigrations: chain, productionLedger: [], sqlOf: chainSql, firstPromotion: true });
const fpManifest = {
    ...buildManifest({ environment: "production", identified: fpIdentified, plan: fpPlan, stagingVerification: { verified_at: "2027-01-01T10:00:00.000Z" }, createdAt: "2027-01-01T10:05:00.000Z", config: fpConfig }),
    production_ledger_sha256: hashRecord([]),
    expected_fingerprint: null,
    candidate_versions: chain.map((m) => m.version),
};

test("first-promotion manifest: carries the mode and both refs; the approval must grant schema_contract for the chain's destructive files", () => {
    assert.equal(fpManifest.mode, FIRST_PROMOTION);
    assert.deepEqual(fpManifest.first_promotion, { new_supabase_project_ref: NEW_REF, previous_supabase_project_ref: "vslwnntzzgpnmrpjipat", config_sha256: hashRecord(fpConfig) });
    assert.deepEqual(scopesFor(fpManifest), [...RELEASE_SCOPES, CONTRACT_SCOPE]);
    const a = makeApproval({ environment: "production", approver: "Kelly", manifest: fpManifest, approvedAt: "2027-01-01T11:00:00.000Z", ttlHours: 4 });
    assert.match(a.statement, new RegExp(`first promotion .* new project ${NEW_REF}, .* on vslwnntzzgpnmrpjipat \\(left untouched\\)`));
    assert.equal(verifyApproval({ approval: a, manifest: fpManifest, config: fpConfig, environment: "production", now: "2027-01-01T12:00:00.000Z", scopeNeeded: "schema_expand" }).ok, true);
    // Routine manifests gain no keys.
    const routine = buildManifest({ environment: "production", identified: fpIdentified, plan: planSchema({ candidateMigrations: chain.slice(0, 1), productionLedger: [], sqlOf: chainSql }), stagingVerification: { verified_at: "x" }, createdAt: "y", config });
    assert.deepEqual(Object.keys(routine).sort(), ["candidate", "created_at", "environment", "migrations", "schema", "staging_verification_sha256", "staging_verified_at"]);
    assert.equal(routine.migrations.destructive_in_chain, undefined);
});

test("first-promotion manifest: a config naming any other project cannot check or record it", () => {
    assert.deepEqual(manifestConfigMismatch(fpManifest, fpConfig), []);
    assert.match(manifestConfigMismatch(fpManifest, config).join(" "), /production names vslwnntzzgpnmrpjipat, the manifest's new project is abcdefghijklmnopqrst/);
    assert.match(manifestConfigMismatch(fpManifest, firstPromotionConfig(config, "zyxwvutsrqponmlkjihg")).join(" "), /new project is abcdefghijklmnopqrst/);
    assert.deepEqual(manifestConfigMismatch(manifest, config), [], "routine manifests are not affected");
});

test("first promotion verification: no tenant before step 16, only the retired self-test org; census needs the extensions and the bucket", () => {
    const w17 = { id: "w", status: "retired", name: "_w17_selftest_0bbaad43" };
    assert.deepEqual(checkNoTenantYet(T, [w17]), []);
    assert.deepEqual(checkNoTenantYet(T, []), []);
    assert.match(checkNoTenantYet(T, [w17, FIREFLY]).join(" "), /org Firefly .* exists before tenant creation/);
    assert.equal(checkNoTenantYet(T, [{ ...w17, status: "active" }]).length, 1);
    const fp = { columns_md5: "a", policies_md5: "b", functions_md5: "c", indexes_md5: "d", tables: "2", rls_disabled: "0" };
    const newBuild = { gitSha: candidate.sha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: NEW_REF };
    const base = { config: fpConfig, candidate, buildInfo: newBuild, ledger: ["1"], expectedVersions: ["1"], fingerprint: fp, expectedFingerprint: fp };
    assert.equal(checkProduction({ ...base, orgs: [w17], firstPromotion: true }).ok, true);
    assert.equal(checkProduction({ ...base, orgs: [FIREFLY], firstPromotion: true }).ok, false);
    assert.equal(checkProduction({ ...base, orgs: [FIREFLY] }).ok, true, "routine verification does not apply the no-tenant rule");
    assert.match(checkProduction({ ...base, buildInfo: { ...newBuild, supabaseProjectRef: "vslwnntzzgpnmrpjipat" }, orgs: [w17], firstPromotion: true }).failures.join(" "), new RegExp(`expected ${NEW_REF}`), "check-production expects the new ref");
    const census = { "extension:btree_gist": "present", "extension:pg_cron": "present", "extension:pg_net": "present", "extension:pgcrypto": "present", "extension:supabase_vault": "present", "extension:uuid-ossp": "present", "bucket:org_documents": "present" };
    assert.deepEqual(checkFirstPromotionCensus(census), []);
    assert.match(checkFirstPromotionCensus({ ...census, "extension:pg_net": "missing", "bucket:org_documents": undefined }).join(" "), /pg_net is missing.*org_documents is not observed/);
});

test("first-promotion runbook: config copy on every command, a target guard on every write, the whole chain, census before deploy", () => {
    const text = renderFirstPromotionRunbook(fpManifest, fpConfig);
    const order = ["## 4. owner.approval", "## 5. production.snapshot", "## 6. schema.expand", "--stage schema", "## 7. code.deploy", "## 8. production.verify", "## 9. schema.contract", "## 10. release.record"].map((h) => text.indexOf(h));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), String(order));
    for (const line of text.split("\n").filter((l) => /alloy-release\.mjs (approve|record|check-production|check-ledger)/.test(l))) assert.match(line, /--config <release-dir>\/release-config\.json/, line);
    for (const line of text.split("\n").filter((l) => /psql "\$PRODUCTION_DB_URL" /.test(l) || /pg_dump/.test(l))) assert.match(line, /fp_target "\$PRODUCTION_DB_URL" &&/, line);
    assert.match(text, /\*:6543\*\) echo "refused: transaction pooler/);
    assert.match(text, /\*vslwnntzzgpnmrpjipat\*\) echo "refused: names the previous project"/);
    assert.match(text, /--single-transaction/);
    assert.match(text, /ON_ERROR_STOP=1/);
    assert.match(text, /set -o pipefail/);
    assert.match(text, /apply-order --manifest/);
    assert.match(text, new RegExp(`"supabaseProjectRef":"${NEW_REF}"`));
    assert.match(text, /never --force/);
    assert.ok(!/supabase db push/.test(text));
    assert.match(text, /4 migration\(s\), `20270101000000` … `20270104000000`/);
    // The routine runbook does not change shape for routine manifests.
    assert.ok(!renderRunbook({ ...manifest, candidate: { ...candidate, commits_ahead_of_main: 1 }, migrations: { ...manifest.migrations, production_ledger_head: "1" } }, config).includes("fp_target"));
});

test("ledger-if-present: psql meta-commands only; reads the ledger only when the table exists", () => {
    assert.match(LEDGER_IF_PRESENT_PSQL, /^select to_regclass\('supabase_migrations\.schema_migrations'\) is not null as alloy_has_ledger \\gset\n\\if :alloy_has_ledger\nselect version from supabase_migrations\.schema_migrations order by version;\n\\endif\n$/);
});

test("first promotion through the CLI: config copy → prepare --first-promotion → runbook → check-ledger → record → check-production; refusals", () => {
    const fx = buildFixtureRepo({ release: { "20270201000000_drop_full_name.sql": "alter table public.people drop column if exists full_name;\n", "20270201000100_people_email.sql": "alter table public.people add column if not exists email text;\n" } });
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-fp-cli-"));
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
    const out = join(dir, "release");
    const cfgPath = join(out, "release-config.json");

    // M4: the generator writes the copy; it refuses to overwrite a different one.
    const gen = cli("first-promotion-config", "--new-ref", NEW_REF, "--out", cfgPath);
    assert.equal(gen.status, 0, gen.err);
    assert.deepEqual(JSON.parse(readFileSync(cfgPath, "utf8")), fpConfig);
    assert.equal(cli("first-promotion-config", "--new-ref", NEW_REF, "--out", cfgPath).status, 0, "idempotent");
    assert.match(cli("first-promotion-config", "--new-ref", "zyxwvutsrqponmlkjihg", "--out", cfgPath).err, /refusing to overwrite/);
    assert.match(cli("first-promotion-config", "--new-ref", "vslwnntzzgpnmrpjipat").err, /previous project/);

    const evidence = (ledgerText) => ["--repo", fx.dir, "--staging", "staging", "--main", "main", "--out-dir", out,
        "--staging-build-info", w("staging-build-info.json", { gitSha: fx.stagingSha, gitBranch: "staging", vercelEnv: "preview", supabaseProjectRef: config.environments.staging.supabase_project_ref }),
        "--check-runs", w("check-runs.json", greenCheckRuns(config, fx.stagingSha)), "--staging-ledger", w("staging-ledger.txt", all.join("\n")),
        "--staging-orgs", w("staging-orgs.txt", [FIREFLY, ...ZZ].map((o) => `${o.id}|${o.status}|${o.name}`).join("\n")), "--staging-fingerprint", w("staging-fp.txt", fp),
        "--production-build-info", w("production-build-info.json", { gitSha: fx.mainSha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: "vslwnntzzgpnmrpjipat" }),
        "--production-ledger", w("production-ledger.txt", ledgerText), "--production-fingerprint", w("production-fp.txt", "tables|0\nrls_disabled|0\n")];

    // Refusals: the committed config, a non-empty ledger, and the routine mode over the same evidence.
    const committedCfg = cli("prepare", "--first-promotion", ...evidence(""));
    assert.equal(committedCfg.status, 1);
    assert.match(committedCfg.out, /previous_supabase_project_ref/);
    const nonEmpty = cli("prepare", "--first-promotion", "--config", cfgPath, ...evidence("20270101000000\n"));
    assert.equal(nonEmpty.status, 1);
    assert.match(nonEmpty.out, /first_promotion_ledger_not_empty/);
    const routine = cli("prepare", "--config", cfgPath, ...evidence(""));
    assert.equal(routine.status, 1, "without the flag nothing changes: the old project ref and contract_not_last both block");
    assert.match(routine.out, /contract_not_last/);
    assert.ok(!existsSync(join(out, "manifest.json")), "no refused prepare writes a manifest");
    rmSync(join(out, "audit.jsonl"), { force: true });

    const prep = cli("prepare", "--first-promotion", "--config", cfgPath, ...evidence(""));
    assert.equal(prep.status, 0, prep.out + prep.err);
    const m = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.equal(m.mode, FIRST_PROMOTION);
    assert.deepEqual(m.migrations.expand, all);
    assert.deepEqual(m.migrations.destructive_in_chain, ["20270201000000"]);
    assert.equal(cli("apply-order", "--manifest", join(out, "manifest.json")).out, `${all.join("\n")}\n`);
    assert.match(cli("runbook", "--manifest", join(out, "manifest.json"), "--config", cfgPath).out, /First-promotion runbook/);
    assert.match(cli("runbook", "--manifest", join(out, "manifest.json")).err, /pass --config/);

    assert.equal(cli("check-ledger", "--manifest", join(out, "manifest.json"), "--ledger", w("empty.txt", "")).status, 0);
    assert.match(cli("check-ledger", "--manifest", join(out, "manifest.json"), "--ledger", w("one.txt", "20270101000000\n")).out, /no longer empty/);

    const approval = w("approval.json", makeApproval({ environment: "production", approver: "Kelly", manifest: m, approvedAt: new Date().toISOString(), ttlHours: 1 }));
    const rec = (...extra) => cli("record", "--audit", join(out, "audit.jsonl"), "--manifest", join(out, "manifest.json"), "--approval", approval, "--step", "schema.expand", "--status", "applied", "--detail", '{"version":"20270101000000"}', ...extra);
    assert.match(rec().err, /pass --config/, "recording against the committed config is refused");
    assert.equal(rec("--config", cfgPath).status, 0);
    assert.equal(cli("verify-audit", join(out, "audit.jsonl")).status, 0);
    const audit = readFileSync(join(out, "audit.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(audit.find((e) => e.step === "production.preflight").detail.mode, FIRST_PROMOTION);

    const w17 = "99999999-0000-4000-8000-000000000017|retired|_w17_selftest_0bbaad43";
    const census = "extension:btree_gist|present\nextension:pg_cron|present\nextension:pg_net|present\nextension:pgcrypto|present\nextension:supabase_vault|present\nextension:uuid-ossp|present\nbucket:org_documents|present\n";
    const schema = (orgs) => cli("check-production", "--config", cfgPath, "--manifest", join(out, "manifest.json"), "--stage", "schema", "--ledger", w("c-ledger.txt", all.join("\n")), "--fingerprint", w("c-fp.txt", fp), "--orgs", w("c-orgs.txt", orgs), "--census", w("c-census.txt", census));
    assert.equal(schema(w17).status, 0);
    assert.match(schema(`${w17}\n${FIREFLY.id}|active|Firefly`).out, /exists before tenant creation/);
    const final = (ref) => cli("check-production", "--config", cfgPath, "--manifest", join(out, "manifest.json"), "--build-info", w("a-build.json", { gitSha: fx.stagingSha, gitBranch: "main", vercelEnv: "production", supabaseProjectRef: ref }),
        "--ledger", join(dir, "c-ledger.txt"), "--fingerprint", join(dir, "c-fp.txt"), "--orgs", w("a-orgs.txt", w17));
    assert.equal(final(NEW_REF).status, 0);
    assert.match(final("vslwnntzzgpnmrpjipat").out, new RegExp(`expected ${NEW_REF}`));
    rmSync(dir, { recursive: true, force: true });
    rmSync(fx.root, { recursive: true, force: true });
});

test("emit-apply through a pipe delivers the whole file (a large migration is not cut at 64 KiB)", () => {
    // B2 found it on the real chain: the CLI exited with output still buffered, so `emit-apply | psql`
    // received 65,536 bytes of the 693 KB baseline migration. Pipes are asynchronous on macOS.
    const big = `${Array.from({ length: 6000 }, (_, i) => `create table if not exists public.t${i} (id int);`).join("\n")}\n`;
    assert.ok(big.length > 256 * 1024);
    const fx = buildFixtureRepo({ release: { "20270201000000_big.sql": big } });
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-pipe-"));
    const sql = execFileSync("git", ["-C", fx.dir, "show", "staging:supabase/migrations/20270201000000_big.sql"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trimEnd();
    const blob = execFileSync("git", ["-C", fx.dir, "rev-parse", "staging:supabase/migrations/20270201000000_big.sql"], { encoding: "utf8" }).trim();
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ migrations: { pending: [{ version: "20270201000000", name: "big", blob }] } }));
    const piped = execFileSync("sh", ["-c", `node "${join(HERE, "..", "alloy-release.mjs")}" emit-apply --repo "${fx.dir}" --manifest "${join(dir, "manifest.json")}" --version 20270201000000 | wc -c`], { encoding: "utf8" });
    assert.equal(Number(piped.trim()), Buffer.byteLength(wrapMigrationForApply({ version: "20270201000000", name: "big", sql })));
    rmSync(dir, { recursive: true, force: true });
    rmSync(fx.root, { recursive: true, force: true });
});

test("the CLI runs when started through a symlinked directory (macOS /tmp → /private/tmp), never a silent exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "alloy-release-link-"));
    try {
        const link = join(dir, "release");
        symlinkSync(join(HERE, ".."), link);
        const out = execFileSync("node", [join(link, "alloy-release.mjs"), "emit-sql", "ledger"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        assert.match(out, /schema_migrations/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
