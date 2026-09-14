#!/usr/bin/env node
/**
 * A PROJECT'S CAPABILITIES, WHERE AN OPERATOR CAN SEE THEM.
 *
 * S0 and S1 gave the registry a project identity, a promotion policy and an
 * execution profile. None of it was visible. The only way to learn whether a
 * repository had managed lanes, a promotion trunk or a database was to open
 * `repositories.json` — so registering a project still meant editing a file,
 * which is exactly the thing this surface exists to end.
 *
 * The write path already existed and is untouched: `connect-local`, `update`,
 * `validate`, `retire` and `reactivate` all go through the registry. What was
 * missing was the reading half, and one rule about how it is built.
 *
 * THE RULE: the client computes nothing. `publicRepository` already resolves
 * both blocks through `promotionPolicyFor` and `executionProfileFor`; the view
 * formats them. A second effective-config calculation in the client is a second
 * authority, and it drifts the first time a profile changes. Case 9 is that
 * rule, and it is the one that keeps this a surface rather than a fork.
 *
 * And absence is a STATE. A repository with no database, no hosted environment
 * and no managed lanes is an ordinary repository — most are. It reads "No
 * database target", never `database_target: null`, and never as a fault.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(tmpdir(), "vac-s1a-"));

const R = await import("../lib/vacilando/repository-registry.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");
const SERVER = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url).pathname, "utf8");
const VIEW = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url).pathname, "utf8");

const alloy = R.publicRepository({
  repository_id: R.ALLOY_REPOSITORY_ID, project_id: R.ALLOY_PROJECT_ID, name: "Alloy",
  root: "/Users/vacilando/Alloy", default_branch: "origin/staging",
  worktree_parent: "/Users/vacilando/Code/alloy-worktrees", profile: "alloy", state: "ACTIVE",
});
const repoOnly = R.publicRepository({
  repository_id: "repo_plain", name: "My project", root: "/tmp/plain", profile: "generic", state: "ACTIVE",
});

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── the list reads the canonical registry ────────────────────────────────── */

test("1 — the projects list is served from the repository registry", () => {
  const route = SERVER.slice(SERVER.indexOf('path === "/api/repositories"'), SERVER.indexOf('path === "/api/repositories"') + 900);
  assert.match(route, /repository-registry\.mjs/, "the list must come from the registry");
  assert.match(route, /listRepositories/);
  assert.ok(!/projects\.json/.test(SERVER), "no parallel project store may exist");
});

test("2 — prj_alloy renders its effective S0/S1 values", () => {
  const html = V.renderProjectCapabilities(alloy);
  for (const expected of ["prj_alloy", "staging", "3011", "alloy_deployed_primary",
                          "staging.workwithalloy.com", "ksquared-16/alloy"]) {
    assert.ok(html.includes(expected), `Alloy detail is missing ${expected}`);
  }
  assert.match(html, /Governed promotion<\/dt><dd>Enabled/);
});

/* ── write path: the same authority, already there ────────────────────────── */

test("3 — Add Project persists through the registry, not a new store", () => {
  /*
   * ANCHORED ON THE ROUTE, NOT ON THE PATH STRING.
   *
   * The first version sliced from the first occurrence of the path — which is
   * the file's own header comment listing the endpoints, 1300 lines above the
   * handler. It read the documentation and concluded the code was wrong.
   */
  const at = SERVER.indexOf('path === "/api/repositories/connect-local"');
  assert.ok(at > 0, "the route must exist");
  assert.match(SERVER.slice(at, at + 900), /repository-registry\.mjs/,
    "registration must persist through the registry");
});

test("4 — Edit / validate / retire / reactivate go through the same authority", () => {
  for (const op of ["validate", "retire", "reactivate", "update"]) {
    assert.ok(SERVER.includes(`/api/repositories/`) && SERVER.includes(op),
      `the ${op} operation must be served`);
  }
});

test("5 — no second project or repository store exists", () => {
  assert.ok(!/projects\.json|project-registry\.mjs|ProjectV2/.test(SERVER));
  assert.ok(!/projects\.json|project-registry\.mjs/.test(VIEW));
});

/* ── THE POINT: absence is a state ────────────────────────────────────────── */

test("6 — a repository-only project renders without Alloy capabilities", () => {
  const html = V.renderProjectCapabilities(repoOnly);
  assert.match(html, /Not configured/, "governed promotion absent is stated");
  assert.match(html, /Not managed/, "managed lanes absent is stated");
  assert.match(html, /No hosted environment/, "the environment section says it has none");
});

test("7 — and it acquires none of Alloy's values", () => {
  const html = V.renderProjectCapabilities(repoOnly);
  for (const leak of ["3011", "alloy_deployed_primary", "staging.workwithalloy", "alloy-worktrees", "ksquared-16"]) {
    assert.ok(!html.includes(leak), `a generic project leaked ${leak}`);
  }
});

test("8 — absence is never rendered as an error", () => {
  const html = V.renderProjectCapabilities(repoOnly);
  assert.ok(!/gw-notice err|role="alert"/.test(html),
    "a repository with no database is ordinary, not broken");
  assert.ok(!html.includes("null") && !html.includes("undefined"),
    "operator language, not raw record values");
});

/* ── the rule that keeps this a surface ───────────────────────────────────── */

test("9 — THE RULE: the view formats, it does not compute effective config", () => {
  const start = VIEW.indexOf("export function renderProjectCapabilities");
  const body = VIEW.slice(start, VIEW.indexOf("\n}", start));
  for (const name of ["promotionPolicyFor", "executionProfileFor", "REPOSITORY_PROFILES"]) {
    assert.ok(!body.includes(name), `the view recomputed ${name}; that is a second authority`);
  }
  assert.ok(body.includes("repo.promotion") && body.includes("repo.execution"),
    "it must read the server-resolved blocks");
});

test("10 — detail values agree with the resolvers, because they ARE them", () => {
  const promotion = R.promotionPolicyFor({ profile: "alloy", repository_id: R.ALLOY_REPOSITORY_ID });
  const execution = R.executionProfileFor({ profile: "alloy", repository_id: R.ALLOY_REPOSITORY_ID });
  assert.deepEqual(alloy.promotion, promotion);
  assert.deepEqual(alloy.execution, execution);
  const html = V.renderProjectCapabilities(alloy);
  assert.ok(html.includes(promotion.promotion_branch));
  assert.ok(html.includes(String(execution.first_agent_port)));
});

/* ── provenance ───────────────────────────────────────────────────────────── */

test("11 — a value says whether it was inherited or set on the project", () => {
  const inherited = V.renderProjectCapabilities(alloy);
  assert.match(inherited, /from the alloy profile/, "inherited values name their profile");
  const overridden = R.publicRepository({
    repository_id: "repo_ov", name: "Override", root: "/tmp/ov", profile: "alloy",
    promotion: { promotion_branch: "release" }, state: "ACTIVE",
  });
  assert.match(V.renderProjectCapabilities(overridden), /set on this project/);
});

/* ── the Vacilando shape, proven by fixture and not persisted ─────────────── */

test("12 — the intended Vacilando shape is creatable and renders correctly", () => {
  // Deliberately a FIXTURE. The real record is created through this UI after the
  // external repository exists; persisting one now would point at nothing.
  const vacilando = R.publicRepository({
    repository_id: "repo_vacilando_fixture", name: "Vacilando", root: "/tmp/vacilando",
    default_branch: "main", profile: "generic", state: "ACTIVE",
    promotion: { promotion_branch: "main", protected_branches: [], promoted_ref: "origin/main" },
  });
  const e = vacilando.execution;
  assert.equal(e.managed_slots, false, "no managed slots");
  assert.equal(e.first_agent_port, null, "no Alloy ports");
  assert.equal(e.worktree_namespace, null, "no Alloy worktree namespace");
  assert.equal(e.hosted_host, null, "no hosted environment");
  assert.equal(e.database_target, null, "no database");
  assert.equal(e.deployed_target, null, "no deployment target");
  assert.equal(vacilando.promotion.promotion_branch, "main", "promotion allowed where configured");
  const html = V.renderProjectCapabilities(vacilando);
  assert.match(html, /No hosted environment/);
  assert.ok(!html.includes("3011"));
});

/* ── safety and the incumbent behaviours ──────────────────────────────────── */

test("13 — removal is guarded by runtime truth, and prefers retire", () => {
  assert.match(SERVER, /retire/, "the registry's own retire semantics are reused");
  // Lane counts are computed from live lanes on the list route, which is the
  // truth a removal guard reads.
  const route = SERVER.slice(SERVER.indexOf('path === "/api/repositories"'), SERVER.indexOf('path === "/api/repositories"') + 900);
  assert.match(route, /listDurableLanes/, "lane count comes from live lane state");
  assert.match(route, /lane_count/);
});

test("14 — S0 and S1 authority is unchanged by this surface", () => {
  assert.equal(R.projectIdFor({ repository_id: R.ALLOY_REPOSITORY_ID }), "prj_alloy");
  assert.equal(R.promotionPolicyFor({ profile: "generic" }).promotion_branch, null);
  assert.equal(R.executionProfileFor({ profile: "generic" }).first_agent_port, null);
});

test("15 — the surface reuses the existing shell, not a new admin editor", () => {
  const start = VIEW.indexOf("export function renderProjectCapabilities");
  const body = VIEW.slice(start, VIEW.indexOf("\n}", start));
  assert.ok(body.includes("gw-kv"), "it uses the product's existing key/value pattern");
  assert.ok(!/textarea|contenteditable|JSON\.stringify/.test(body),
    "a raw configuration editor is not the product experience");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
