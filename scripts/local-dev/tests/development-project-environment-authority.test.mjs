#!/usr/bin/env node
/**
 * THE ENVIRONMENT BELONGS TO A PROJECT, NOT TO THE MACHINE.
 *
 * S0 gave branch policy an owner, S1 gave execution conventions one. What was
 * left was the layer where Vacilando touched the outside world, and every one
 * of those touches resolved the same way — implicitly, as Alloy:
 *
 *   ALLOY_SERVER_ENV_SOURCE    a credential FILE named from generic runtime,
 *                              falling back through a guess chain that ended in
 *                              another person's home directory
 *   PRODUCTION_APPLY_TARGETS   ["alloy_deployed_primary"], a frozen literal
 *   LEDGER_REPAIR_TARGETS      the same literal, written a second time
 *   ~/Code/alloy-worktrees     the default scan scope of six observers
 *   [3011 … 3016]              a frozen port list an observer scanned for ANY
 *                              project, restating a range the profile owns
 *
 * None of those was wrong for Alloy. All of them were wrong for anything else,
 * and silently — which is the failure mode this slice exists to end.
 *
 * THE RULE THESE CASES HOLD: absence resolves to ABSENCE. A project with no
 * database has no production target; a project with no server has no credential
 * file; a project with no managed slots has no ports and no worktree parent.
 * Nothing falls back to Alloy, and case 12 is the one that would catch it.
 *
 * `ALLOY_SERVER_ENV_SOURCE` is NOT renamed to something generic — that would
 * keep the whole mistake with a tidier label. It is demoted: only the
 * Alloy-specific resolver reads it, it is marked deprecated, and its removal is
 * assigned to S3 with the rest of the `ALLOY_`-prefixed runtime variables.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * A SEEDED RUNTIME ROOT, NOT THE HOST'S.
 *
 * The incumbent assertions are about what Alloy resolves to, so Alloy has to be
 * registered — but reading the host's live registry would make this suite pass
 * or fail on whatever the operator happened to register this morning. The root
 * is a temp directory seeded with exactly one Alloy record, so "unchanged for
 * Alloy" means the same thing on every machine.
 */
const ROOT = mkdtempSync(join(tmpdir(), "vac-s2-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
const ALLOY_ROOT = "/Users/vacilando/Alloy";

const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;
const R = await import("../lib/vacilando/repository-registry.mjs");
const R1 = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const PM = await import("../lib/vacilando/trusted-host-production-migrate.mjs");
const LR = await import("../lib/vacilando/trusted-host-ledger-repair.mjs");
const HY = await import("../lib/vacilando/hygiene-observe.mjs");
const WR = await import("../lib/vacilando/worktree-retirement-observe.mjs");

const ALLOY = { repository_id: R.ALLOY_REPOSITORY_ID, profile: "alloy", root: ALLOY_ROOT };
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
writeFileSync(join(ROOT, "vacilando", "repositories.json"), JSON.stringify({
  schema_version: R.REPOSITORY_SCHEMA,
  repositories: { [R.ALLOY_REPOSITORY_ID]: { ...ALLOY, name: "Alloy", state: "ACTIVE" } },
}), "utf8");
const GENERIC = { repository_id: "repo_other", profile: "generic", root: "/tmp/plain" };

/** A registry containing ONLY a repository-only project — no Alloy anywhere. */
function registryWith(...records) {
  const root = mkdtempSync(join(tmpdir(), "vac-s2-reg-"));
  mkdirSync(join(root, "vacilando"), { recursive: true });
  const repositories = {};
  for (const r of records) repositories[r.repository_id] = { state: "ACTIVE", ...r };
  writeFileSync(join(root, "vacilando", "repositories.json"),
    JSON.stringify({ schema_version: R.REPOSITORY_SCHEMA, repositories }), "utf8");
  return root;
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const src = (f) => readFileSync(`${LIB}${f}`, "utf8");
/** Executable text only: a comment that NAMES a removed literal is not the literal. */
const code = (f) => src(f).split("\n")
  .map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");

/* ── the five questions, answered in one place ────────────────────────────── */

test("1 — a project scope answers all five questions from the record", () => {
  const s = R.projectScope(R.ALLOY_REPOSITORY_ID);
  // Alloy is registered on this host; the scope is its live record.
  assert.equal(s.known, true, "Alloy must be registered for the incumbent assertions to mean anything");
  assert.equal(s.project_id, "prj_alloy");
  assert.ok(s.worktree_parent && s.worktree_parent.endsWith("/alloy-worktrees"));
  assert.equal(s.database_target, "alloy_deployed_primary");
  assert.equal(s.deployed_target, "alloy_staging_web");
  assert.equal(s.env_source, join(s.root, "web", ".env.local"));
  assert.deepEqual([...s.slot_ports], [3011, 3012, 3013, 3014, 3015, 3016]);
});

test("2 — Alloy's environment values are unchanged in value", () => {
  const e = R.executionProfileFor(ALLOY);
  assert.equal(e.env_source_relpath, "web/.env.local");
  assert.equal(e.migrations_relpath, "supabase/migrations");
  assert.equal(e.local_stack_name, "alloy-cert");
  assert.equal(e.managed_slot_count, 6);
  assert.equal(R.environmentSourceFor(ALLOY), join(ALLOY_ROOT, "web", ".env.local"));
  assert.deepEqual([...R.slotPortsFor(ALLOY)], [3011, 3012, 3013, 3014, 3015, 3016]);
});

/* ── THE POINT: absence resolves to absence ───────────────────────────────── */

test("3 — a repository-only project has no environment at all", () => {
  const e = R.executionProfileFor(GENERIC);
  for (const k of ["env_source_relpath", "migrations_relpath", "local_stack_name",
                   "database_target", "deployed_target", "hosted_host"]) {
    assert.equal(e[k], null, `generic inherited ${k}`);
  }
  assert.equal(R.environmentSourceFor(GENERIC), null, "no server means no credential file");
  assert.deepEqual([...R.slotPortsFor(GENERIC)], [], "no managed slots means no ports");
});

test("4 — and an unknown project resolves to nothing, never to Alloy", () => {
  for (const id of [null, undefined, "", "repo_invented"]) {
    const s = R.projectScope(id);
    assert.equal(s.known, false);
    for (const k of ["root", "worktree_parent", "database_target", "deployed_target", "env_source"]) {
      assert.equal(s[k], null, `${JSON.stringify(id)} resolved ${k}`);
    }
    assert.deepEqual([...s.slot_ports], []);
  }
});

/* ── the environment source: demoted, not renamed ─────────────────────────── */

test("5 — the env source is resolved from the project, and Alloy's is unchanged", () => {
  assert.equal(R1.projectEnvSource(R.ALLOY_REPOSITORY_ID), R.projectScope(R.ALLOY_REPOSITORY_ID).env_source);
  assert.equal(R1.resolveTrustedServerEnvSource(), R1.projectEnvSource(R.ALLOY_REPOSITORY_ID),
    "the incumbent resolver must agree with the project authority it now reads");
});

test("6 — projectEnvSource answers NULL for a project that has no server", () => {
  assert.equal(R1.projectEnvSource("repo_invented"), null);
  assert.equal(R1.projectEnvSource(null), null);
});

test("7 — ALLOY_SERVER_ENV_SOURCE was DEMOTED, not renamed to something generic", () => {
  /*
   * The instruction that matters: renaming this to a generic-sounding name
   * while it kept Alloy semantics would preserve the entire defect behind a
   * tidier label. So two things must both be true — the variable still exists
   * under its own Alloy-specific name, and only the Alloy-specific resolver
   * reads it.
   */
  const registry = code("trusted-host-action-registry.mjs");
  assert.ok(registry.includes("ALLOY_SERVER_ENV_SOURCE"),
    "it must keep its honest name rather than be genericised");
  const generic = registry.slice(registry.indexOf("export function projectEnvSource"),
    registry.indexOf("export function resolveTrustedServerEnvSource"));
  assert.ok(!generic.includes("ALLOY_SERVER_ENV_SOURCE"),
    "the GENERIC resolver must not read one project's environment variable");
  // Deprecated, with its removal assigned rather than left to be discovered.
  const doc = src("trusted-host-action-registry.mjs");
  assert.match(doc, /@deprecated-input ALLOY_SERVER_ENV_SOURCE/);
  assert.match(doc, /removal assigned to S3/i);
});

/* ── production apply / ledger repair ─────────────────────────────────────── */

test("8 — production-apply targets are DERIVED, and identical for Alloy", () => {
  assert.deepEqual([...PM.productionApplyTargets()], ["alloy_deployed_primary"]);
  assert.deepEqual([...LR.ledgerRepairTargets()], ["alloy_deployed_primary"]);
  for (const f of ["trusted-host-production-migrate.mjs", "trusted-host-ledger-repair.mjs"]) {
    assert.ok(!/Object\.freeze\(\["alloy_deployed_primary"\]\)/.test(code(f)),
      `${f} still declares the target as a literal`);
  }
});

test("9 — a project whose profile declares no database contributes none", () => {
  /*
   * THE PROPERTY THAT ACTUALLY MATTERS, and the one that survived a correction.
   *
   * The first version asserted the set was EMPTY on a host whose only project
   * was repository-only. That read as admirable fail-closed behaviour and was
   * wrong: it made the governed-target list depend on whether a host had been
   * seeded, and 19 ledger-repair cases failed on a CI runner with an empty
   * runtime root — a machine where Alloy's production database had not stopped
   * existing, only stopped being mentioned.
   *
   * The list answers "which names does this capability ever address", not "may
   * this request proceed" — authorization decides that, operator-only and
   * Director-approved either way. So it is the union of what the known profiles
   * declare and what registered projects declare. A repository-only project
   * contributes nothing because the GENERIC PROFILE has no database, which is
   * the real invariant and does not move with host state.
   */
  const root = registryWith(GENERIC);
  const targets = [...R.deployedDatabaseTargets({ root })];
  assert.ok(!targets.includes("repo_plain"), "sanity: targets are database names");
  assert.equal(R.executionProfileFor(GENERIC).database_target, null,
    "the generic profile declares no database, so it can contribute none");
  // Registering it added nothing that was not already declared by a profile.
  assert.deepEqual(targets, [...R.deployedDatabaseTargets({ root: registryWith() })],
    "a repository-only project widened the governed set");
});

test("10 — the set is declared, never a literal, and never host-state dependent", () => {
  const seeded = [...R.deployedDatabaseTargets({ root: registryWith(ALLOY) })];
  const unseeded = [...R.deployedDatabaseTargets({ root: registryWith() })];
  assert.deepEqual(seeded, unseeded,
    "an unseeded host is not a host where Alloy's database stopped existing");
  assert.ok(seeded.includes("alloy_deployed_primary"));
  const body = code("repository-registry.mjs");
  const start = body.indexOf("export function deployedDatabaseTargets");
  const fn = body.slice(start, body.indexOf("\n}", start));
  assert.ok(!fn.includes("alloy_deployed_primary"),
    "the resolver must not name a database; the profile declares it");
  assert.ok(fn.includes("REPOSITORY_PROFILES"), "profiles are one of the two sources");
});

test("10b — a project that declares a NEW database widens the set, and only it", () => {
  const root = registryWith({
    repository_id: "repo_other2", profile: "generic", root: "/tmp/o2",
    execution: { database_target: "other_deployed_primary" },
  });
  const targets = [...R.deployedDatabaseTargets({ root })];
  assert.ok(targets.includes("other_deployed_primary"), "a declared database becomes addressable");
  assert.ok(targets.includes("alloy_deployed_primary"), "and Alloy's is unaffected");
  // The per-project resolution is the thing that must never leak, and does not.
  assert.equal(R.executionProfileFor(GENERIC).database_target, null);
});

test("11 — the operator-only safety denylists are UNTOUCHED", () => {
  /*
   * `alloy_deployed_primary` also appears in never-auto-approve lists in
   * `trusted-host-authz` and `executor-authority`. Those are SAFETY POLICY, not
   * configuration: they say this name is never approved automatically, which
   * every project benefits from. Genericising them because the value contains
   * Alloy's name would weaken authorization to tidy a string.
   */
  for (const f of ["trusted-host-authz.mjs", "executor-authority.mjs"]) {
    assert.ok(src(f).includes("alloy_deployed_primary"),
      `${f} must keep its never-auto-approve entry`);
  }
});

/* ── observation and hygiene ──────────────────────────────────────────────── */

test("12 — THE RULE: an observer with no project does not scan Alloy's worktrees", () => {
  assert.equal(HY.defaultWorktreeParent("repo_invented"), null);
  assert.equal(HY.defaultCanonicalRoot("repo_invented"), null);
  // Alloy's own scope is unchanged.
  assert.ok(String(HY.defaultWorktreeParent()).endsWith("/alloy-worktrees"));
  assert.equal(HY.defaultCanonicalRoot(), ALLOY_ROOT);
});

test("13 — retirement candidates for an unregistered project are EMPTY, not Alloy's", () => {
  const out = WR.observeRetirementCandidates({
    root: ROOT, processes: [], s7Worktrees: [{ path: "wt1-something" }], repository: "repo_invented",
  });
  assert.deepEqual(out, [], "retiring another project's worktrees is the worst possible default");
});

test("13b — an observer never silently scans NOTHING for the incumbent", () => {
  /*
   * The other half of the correction CI found, and the more dangerous half.
   *
   * An unregistered id resolving to an empty port range is right for a project
   * with no slots. For the INCUMBENT on an unseeded host it is catastrophic:
   * "I looked at no ports and found no problems" is indistinguishable from
   * "this host is healthy", and five port-classification cases failed exactly
   * that way. Alloy's id falls back to Alloy's PROFILE — asked for by name, so
   * no other project inherits it.
   */
  const body = code("reconciliation-observe.mjs");
  assert.ok(body.includes("ALLOY_REPOSITORY_ID"), "the fallback must be scoped to the incumbent by name");
  assert.deepEqual([...R.slotPortsFor({ profile: "alloy", repository_id: R.ALLOY_REPOSITORY_ID })],
    [3011, 3012, 3013, 3014, 3015, 3016], "and it resolves the profile, not a literal");
  // Any other project still gets nothing.
  assert.deepEqual([...R.slotPortsFor({ profile: "generic", repository_id: "repo_other" })], []);
});

test("14 — no observer keeps Alloy's worktree namespace as an executable default", () => {
  for (const f of ["hygiene-observe.mjs", "reconciliation-observe.mjs", "worktree-retirement-observe.mjs",
                   "server-fleet-observation.mjs", "lane-placement.mjs", "director-evidence.mjs"]) {
    const body = code(f);
    // A resolved value with a filesystem floor is allowed; a bare default is not.
    const bare = body.match(/=\s*join\((?:homedir\(\)|process\.env\.HOME[^,]*),\s*"Code",\s*"alloy-worktrees"\)/g) || [];
    assert.equal(bare.length, 0, `${f} still defaults straight to Alloy's worktree space`);
    assert.ok(body.includes("projectScope"), `${f} must resolve its scope from the project authority`);
  }
});

test("15 — the port range is derived, not a frozen list beside the profile", () => {
  const body = code("reconciliation-observe.mjs");
  assert.ok(!/PORTS\s*=\s*Object\.freeze\(\[3011/.test(body),
    "a frozen copy of Alloy's ports is a second statement of the profile");
  assert.ok(body.includes("slot_ports"), "it must read the resolved range");
});

test("16 — the policy board renders what the runtime resolves", () => {
  const body = code("policies.mjs");
  assert.ok(!/3011.3016/.test(body), "the board must not restate the port range as prose");
  assert.ok(body.includes("slotPortRangeText"), "it must render the resolved range");
});

test("21 — a request that NAMES a project never acquires Alloy's database", () => {
  /*
   * S1 replaced the literal `"alloy_deployed_primary"` with Alloy's profile,
   * which fixed where the value came from and left the BEHAVIOUR: a governed
   * request that omitted a target still resolved Alloy's database, whichever
   * project it named. A repository-only project must get NO target and refuse,
   * not somebody else's production database.
   */
  const body = code("governed-action-request.mjs");
  assert.ok(body.includes("function requestDatabaseTarget"), "the resolution must have one owner");
  const fn = body.slice(body.indexOf("function requestDatabaseTarget"), body.indexOf("\n}", body.indexOf("function requestDatabaseTarget")));
  assert.ok(fn.includes("projectScope"), "a named project must resolve its own database");
  // The two decision sites read the resolver rather than the Alloy default.
  assert.ok(!/\|\|\s*alloyDatabaseTarget\(\);\s*$/m.test(body.replace(fn, "")),
    "a decision site still falls back to Alloy's database");
});

/* ── one authority, and nothing new ───────────────────────────────────────── */

test("17 — NO second environment or project authority was introduced", () => {
  const registry = src("repository-registry.mjs");
  for (const fn of ["environmentSourceFor", "slotPortsFor", "projectScope", "deployedDatabaseTargets"]) {
    assert.ok(registry.includes(`export function ${fn}`), `${fn} must live with the record`);
  }
  // Every consumer reads the one module; none declares its own map.
  for (const f of ["hygiene-observe.mjs", "reconciliation-observe.mjs", "worktree-retirement-observe.mjs",
                   "server-fleet-observation.mjs", "trusted-host-worktree-retirement.mjs",
                   "policies.mjs", "promotion-train.mjs", "provider-capability-resolver.mjs"]) {
    assert.ok(src(f).includes('from "./repository-registry.mjs"'), `${f} must consult the one authority`);
    assert.ok(!/REPOSITORY_PROFILES\s*=/.test(code(f)), `${f} declares a second profile map`);
  }
});

test("18 — the resolvers never name Alloy", () => {
  const registry = src("repository-registry.mjs");
  for (const fn of ["environmentSourceFor", "slotPortsFor", "deployedDatabaseTargets"]) {
    const start = registry.indexOf(`export function ${fn}`);
    const body = registry.slice(start, registry.indexOf("\n}", start))
      .split("\n").map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");
    assert.ok(!body.includes("alloy"), `${fn} names Alloy; it must resolve whatever record it is given`);
  }
});

/* ── S0 / S1 / S1A are untouched ──────────────────────────────────────────── */

test("19 — S0, S1 and S1A authority is unchanged", () => {
  assert.equal(R.projectIdFor(ALLOY), "prj_alloy");
  assert.equal(R.promotionPolicyFor(ALLOY).promotion_branch, "staging");
  assert.equal(R.promotionPolicyFor(GENERIC).promotion_branch, null);
  assert.equal(R.executionProfileFor(ALLOY).first_agent_port, 3011);
  assert.equal(R.executionProfileFor(GENERIC).first_agent_port, null);
  assert.equal(R.worktreeParentFor(GENERIC), null);
});

test("20 — prj_vacilando's shape: registered, promotable, and environment-free", () => {
  // The project this whole sequence exists to make possible. Still a fixture:
  // the record is created through the Projects UI once the repository exists.
  const vacilando = {
    repository_id: "repo_vacilando_fixture", profile: "generic", root: "/tmp/vacilando",
    default_branch: "main",
    promotion: { promotion_branch: "main", protected_branches: [], promoted_ref: "origin/main" },
  };
  const root = registryWith(vacilando);
  const s = R.projectScope("repo_vacilando_fixture", { root });
  assert.equal(s.known, true, "it is a real registered project");
  assert.equal(R.promotionPolicyFor(vacilando).promotion_branch, "main", "governed promotion is configurable");
  for (const k of ["database_target", "deployed_target", "hosted_host", "env_source",
                   "migrations_relpath", "local_stack_name", "worktree_parent"]) {
    assert.equal(s[k], null, `prj_vacilando inherited Alloy's ${k}`);
  }
  assert.deepEqual([...s.slot_ports], []);
  /*
   * The project exposes no production target OF ITS OWN. Asserting the global
   * governed set is empty here was the same superseded claim as case 9: that
   * set is what the known profiles and registered projects declare, and Alloy's
   * profile declares one whether or not prj_vacilando exists beside it. What
   * matters is that prj_vacilando contributes nothing and resolves nothing.
   */
  assert.equal(s.database_target, null, "it has no database of its own");
  assert.deepEqual([...R.deployedDatabaseTargets({ root })],
    [...R.deployedDatabaseTargets({ root: registryWith() })],
    "registering it widened the governed set");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
