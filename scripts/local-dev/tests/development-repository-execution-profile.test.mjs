#!/usr/bin/env node
/**
 * SLOTS, PORTS, WORKTREES AND TARGETS ARE THINGS ALLOY HAS.
 *
 * S0 gave Alloy's branch policy an owner. The same problem remained one layer
 * down, in the conventions Alloy executes by:
 *
 *   3011                       a module constant, so every repository had a
 *                              first agent port whether or not it had slots
 *   ~/Code/alloy-worktrees     a DEFAULT ARGUMENT in six modules, so Alloy's
 *                              namespace was every repository's
 *   ksquared-16/alloy          a DEFAULT_REPOS list and a default parameter
 *   staging.workwithalloy.com  two literals inside the target registry
 *   alloy_deployed_primary     three `||` fallbacks, so a request that omitted
 *                              a target silently acquired ALLOY'S DATABASE
 *
 * The tempting repair is a rename — `DEFAULT_PROJECT_PORT_BASE = 3011` — and it
 * keeps the whole mistake with a tidier name. 3011 is not a default that Alloy
 * uses; it is Alloy's port, and a repository with no managed slot range has
 * none. Case 3 is that distinction, and it is the one worth reading.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(tmpdir(), "vac-s1-"));

const R = await import("../lib/vacilando/repository-registry.mjs");
const M = await import("../lib/vacilando/managed-slots.mjs");
const T = await import("../lib/vacilando/deployed-target-registry.mjs");
const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;

const alloy = { repository_id: R.ALLOY_REPOSITORY_ID, profile: "alloy" };
const generic = { repository_id: "repo_other", profile: "generic" };

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── value identity for Alloy ─────────────────────────────────────────────── */

test("1 — Alloy's execution conventions are value-identical", () => {
  const e = R.executionProfileFor(alloy);
  assert.equal(e.managed_slots, true);
  assert.equal(e.first_agent_port, 3011);
  assert.equal(e.worktree_namespace, "alloy-worktrees");
  assert.equal(e.remote_slug, "ksquared-16/alloy");
  assert.equal(e.deployed_target, "alloy_staging_web");
  assert.equal(e.database_target, "alloy_deployed_primary");
  assert.equal(e.hosted_host, "staging.workwithalloy.com");
  assert.equal(e.source, "profile:alloy");
});

test("2 — the exported port and the hosted target are unchanged", () => {
  assert.equal(M.DEFAULT_FIRST_AGENT_PORT, 3011, "every existing caller names this");
  assert.equal(T.DEPLOYED_TARGETS.alloy_staging_web.host, "staging.workwithalloy.com");
  assert.equal(T.DEPLOYED_TARGETS.alloy_staging_web.base_url, "https://staging.workwithalloy.com");
  assert.equal(R.worktreeParentFor(alloy).endsWith("/Code/alloy-worktrees"), true);
});

/* ── THE POINT: absence is an answer ──────────────────────────────────────── */

test("3 — 3011 was NOT renamed into a generic default", () => {
  // The distinction the whole slice turns on.
  assert.equal(M.firstAgentPortFor(generic), null, "no slot range means no port, not Alloy's port");
  assert.equal(M.firstAgentPortFor(alloy), 3011);
  /*
   * EXECUTABLE TEXT ONLY. The first version scanned the whole file and tripped
   * on the module's own comment, which NAMES the anti-pattern in order to
   * reject it. A static assertion that cannot tell code from the prose
   * explaining the code will always fail on the file that documents itself
   * best -- which is the wrong file to punish.
   */
  const src = readFileSync(`${LIB}managed-slots.mjs`, "utf8")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");
  assert.ok(!/DEFAULT_PROJECT_PORT_BASE|GENERIC_FIRST_PORT/.test(src),
    "a generic-sounding name holding Alloy's value is the same mistake, tidier");
});

test("4 — a generic repository resolves NONE of the Alloy conventions", () => {
  const e = R.executionProfileFor(generic);
  assert.equal(e.managed_slots, false);
  for (const k of ["first_agent_port", "worktree_namespace", "remote_slug",
                   "deployed_target", "database_target", "hosted_host"]) {
    assert.equal(e[k], null, `generic inherited ${k}`);
  }
});

test("5 — and neither does an unknown or unregistered repository", () => {
  for (const rec of [null, undefined, {}, { profile: "invented" }]) {
    const e = R.executionProfileFor(rec);
    assert.equal(e.first_agent_port, null, `${JSON.stringify(rec)} fell back to Alloy`);
    assert.equal(e.database_target, null);
    assert.equal(e.hosted_host, null);
  }
});

test("6 — a repository with no worktree namespace gets NO parent, not Alloy's", () => {
  assert.equal(R.worktreeParentFor(generic), null);
  // A record that states its own parent keeps it, whatever the profile says.
  assert.equal(R.worktreeParentFor({ ...generic, worktree_parent: "/tmp/elsewhere" }), "/tmp/elsewhere");
});

test("7 — a repository with no slot policy cannot allocate an Alloy slot", () => {
  const e = R.executionProfileFor(generic);
  assert.equal(e.managed_slots, false);
  assert.equal(M.firstAgentPortFor(generic), null,
    "the port is the allocation's input; absent it, there is nothing to allocate from");
});

/* ── prj_vacilando is representable ───────────────────────────────────────── */

test("8 — prj_vacilando can be represented with none of Alloy's capabilities", () => {
  const vacilando = { repository_id: "repo_vacilando", profile: "generic" };
  const e = R.executionProfileFor(vacilando);
  const p = R.promotionPolicyFor(vacilando);
  assert.deepEqual(
    { slots: e.managed_slots, port: e.first_agent_port, wt: e.worktree_namespace,
      slug: e.remote_slug, deploy: e.deployed_target, db: e.database_target, host: e.hosted_host },
    { slots: false, port: null, wt: null, slug: null, deploy: null, db: null, host: null },
  );
  assert.equal(p.promotion_branch, null);
  // …and it can opt IN explicitly, which is the other half of "absence is valid".
  const configured = R.executionProfileFor({ ...vacilando, execution: { remote_slug: "org/vacilando" } });
  assert.equal(configured.remote_slug, "org/vacilando");
  assert.equal(configured.first_agent_port, null, "opting into one thing does not opt into Alloy's");
  assert.equal(configured.source, "repository_record");
});

/* ── no silent fallback survives ──────────────────────────────────────────── */

test("9 — the database-target fallbacks no longer name Alloy in code", () => {
  for (const f of ["governed-action-request.mjs", "trusted-host-actions.mjs"]) {
    const code = readFileSync(`${LIB}${f}`, "utf8")
      .split("\n").filter((l) => !/^\s*[*/]/.test(l)).join("\n");
    assert.ok(!code.includes('|| "alloy_deployed_primary"'),
      `${f} still falls back to Alloy's database by literal`);
  }
});

test("10 — the hosted domain and slug are no longer literals in their consumers", () => {
  const targets = readFileSync(`${LIB}deployed-target-registry.mjs`, "utf8");
  assert.ok(!/host: "staging\.workwithalloy\.com"/.test(targets));
  const merge = readFileSync(`${LIB}trusted-host-merge.mjs`, "utf8");
  assert.ok(!/DEFAULT_REPOS = Object\.freeze\(\["ksquared-16\/alloy"\]\)/.test(merge));
});

/* ── one authority, same resolution rule ──────────────────────────────────── */

test("11 — execution and promotion resolve by the SAME rule, in one place", () => {
  const registry = readFileSync(`${LIB}repository-registry.mjs`, "utf8");
  for (const fn of ["executionProfileFor", "promotionPolicyFor", "worktreeParentFor"]) {
    assert.ok(registry.includes(`export function ${fn}`), `${fn} must live with the record`);
  }
  const start = registry.indexOf("export function executionProfileFor");
  const body = registry.slice(start, registry.indexOf("\n}", start));
  assert.ok(!body.includes('"alloy"'), "the resolver must not name Alloy");
  assert.ok(body.includes("REPOSITORY_PROFILES.generic"), "and its floor is generic");
});

test("12 — no second registry was introduced", () => {
  const registry = readFileSync(`${LIB}repository-registry.mjs`, "utf8");
  assert.ok(registry.includes("REPOSITORY_PROFILES"), "the incumbent profile map is still the owner");
  for (const f of ["managed-slots.mjs", "deployed-target-registry.mjs", "trusted-host-merge.mjs", "promotion-train.mjs"]) {
    const src = readFileSync(`${LIB}${f}`, "utf8");
    assert.ok(src.includes("executionProfileFor"), `${f} must consult the one authority`);
    assert.ok(!/REPOSITORY_PROFILES\s*=/.test(src), `${f} must not declare a second profile map`);
  }
});

test("13 — S0's authority is untouched", () => {
  const p = R.promotionPolicyFor(alloy);
  assert.equal(p.promotion_branch, "staging");
  assert.deepEqual([...p.protected_branches], ["main", "master", "production", "prod"]);
  assert.equal(R.projectIdFor(alloy), "prj_alloy");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
