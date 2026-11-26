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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(tmpdir(), "vac-s1a-"));

const R = await import("../lib/vacilando/repository-registry.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");
const SERVER = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url).pathname, "utf8");
const VIEW = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url).pathname, "utf8");
const APP = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url).pathname, "utf8");
const CSS = readFileSync(new URL("../apps/vacilando/public/styles.css", import.meta.url).pathname, "utf8");

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

test("4 — Edit / validate / retire / reactivate are ROUTED, not just documented", () => {
  /*
   * THE FIRST VERSION OF THIS CASE WAS A FALSE GREEN. It asserted that the file
   * contained "/api/repositories/" and the word "retire" somewhere — which the
   * file's own header comment, listing the endpoints it intends to serve,
   * satisfies without a single line of routing. A test that a comment can pass
   * is a test of the documentation.
   *
   * These four are served by ONE regex rather than four `path ===` branches, so
   * the assertion has to read that regex.
   */
  const routed = SERVER.match(/path\.match\(\/\^\\\/api\\\/repositories\\\/\(\[\^\/\]\+\)\\\/\(([a-z|]+)\)\$\/\)/);
  assert.ok(routed, "the per-project route must exist in the server, not only in its header");
  const verbs = routed[1].split("|");
  for (const op of ["validate", "retire", "reactivate", "update"]) {
    assert.ok(verbs.includes(op), `${op} is documented but not routed`);
  }
  const at = SERVER.indexOf(routed[0]);
  const handler = SERVER.slice(at, at + 2600);
  assert.match(handler, /repository-registry\.mjs/, "and it must act through the registry");
  for (const fn of ["validateRepository", "updateRepository", "retireRepository", "reactivateRepository"]) {
    assert.ok(handler.includes(fn), `the handler must call ${fn}`);
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

/* ── the manage surface: the half that made "edit the file" unnecessary ───── */

const retired = R.publicRepository({
  repository_id: "repo_old", name: "Retired one", root: "/tmp/old", profile: "generic", state: "RETIRED",
});

test("16 — Projects lists every registered project, retired ones included", () => {
  const html = V.renderProjectsSheet({ repositories: [alloy, repoOnly, retired] });
  for (const r of [alloy, repoOnly, retired]) {
    assert.ok(html.includes(`data-gw-proj-open="${r.repository_id}"`), `${r.name} is not openable`);
  }
  assert.match(html, /Inactive/, "a retired project must be visibly retired, not hidden");
  assert.match(html, /data-gw-proj-new/, "and a project can be added from here");
});

test("17 — a retired project is fetched deliberately, not by accident", () => {
  // A project you cannot see is a project you cannot bring back.
  assert.match(APP, /\/api\/repositories\?include_retired=1/,
    "the manage list must ask for retired records");
});

test("18 — opening a project shows what it can do ABOVE what can be typed", () => {
  const html = V.renderProjectsSheet({ repositories: [alloy], selected: alloy.repository_id });
  const caps = html.indexOf("gw-project-caps");
  const edit = html.indexOf("gw-proj-edit");
  assert.ok(caps > 0 && edit > caps, "capabilities must precede the edit fields");
  assert.ok(html.includes("prj_alloy") && html.includes("3011"));
});

test("19 — only the three fields the server accepts are editable", () => {
  const html = V.renderProjectsSheet({ repositories: [repoOnly], selected: "repo_plain" });
  for (const f of ["data-gw-proj-name", "data-gw-proj-branch", "data-gw-proj-wt"]) {
    assert.ok(html.includes(f), `${f} must be offered`);
  }
  /*
   * PROMOTION AND EXECUTION ARE NOT FIELDS. They resolve from the profile; a
   * text box holding a copy of a resolved value is a second authority wearing a
   * label, and it disagrees with the resolver the first time a profile changes.
   */
  for (const name of ["promotion_branch", "database_target", "first_agent_port", "promoted_ref"]) {
    assert.ok(!new RegExp(`data-gw-proj-[a-z]*["'][^>]*${name}|name="${name}"`).test(html),
      `${name} must not be an editable field`);
  }
});

test("20 — the client sends ONLY the fields the update route allows", () => {
  const at = APP.indexOf("async function saveProjectEdits");
  assert.ok(at > 0, "the save path must exist");
  const body = APP.slice(at, APP.indexOf("\n}", at));
  const keys = body.match(/\["name", "default_branch", "worktree_parent"\]/);
  assert.ok(keys, "the patch must be built from the route's allowed list");
  // The route rejects anything else as unexpected_control_field; sending a
  // whole record would fail every save.
  assert.ok(!/JSON\.stringify\(repo\)|\.\.\.repo/.test(body), "a whole record must never be posted");
});

test("21 — Deactivate is RETIRE: reversible, and nothing is deleted", () => {
  const html = V.renderProjectsSheet({ repositories: [repoOnly], selected: "repo_plain" });
  assert.match(html, /data-gw-proj-retire="repo_plain"/);
  assert.match(html, /Nothing is deleted/, "the operator must be told what deactivating does");
  assert.ok(!/data-gw-proj-delete|Delete project/.test(html), "there is no delete");
  const back = V.renderProjectsSheet({ repositories: [retired], selected: "repo_old" });
  assert.match(back, /data-gw-proj-reactivate="repo_old"/, "a retired project can be brought back");
  assert.ok(!/data-gw-proj-retire/.test(back), "and cannot be retired twice");
});

test("22 — a refusal for live work reads as work in progress, not as a fault", () => {
  const text = V.projectErrorText("repository_has_active_work", { active_lanes: ["ln_a", "ln_b"] });
  assert.match(text, /2 lanes/, "it must count the lanes the registry actually named");
  assert.ok(!text.includes("undefined") && !text.includes("some"),
    "reading the wrong field renders a vague message for every refusal");
  assert.match(V.projectErrorText("repository_has_active_work", { active_lanes: ["ln_a"] }), /1 lane of this project has work in progress/);
});

test("23 — every control the sheet renders is handled by the client", () => {
  const html = [
    V.renderProjectsSheet({ repositories: [alloy, retired] }),
    V.renderProjectsSheet({ repositories: [alloy], selected: alloy.repository_id }),
    V.renderProjectsSheet({ repositories: [retired], selected: "repo_old" }),
  ].join("");
  const attrs = new Set([...html.matchAll(/data-gw-(proj[a-z-]*|projects)\b/g)].map((m) => m[0]));
  assert.ok(attrs.size >= 7, `expected the full control set, saw ${[...attrs].join(", ")}`);
  for (const a of attrs) {
    assert.ok(APP.includes(`[${a}]`), `${a} is rendered but nothing listens for it`);
  }
});

test("24 — the inventory has a door on the lane list", () => {
  const list = V.renderLaneList([], null, { repositories: [alloy] });
  assert.match(list, /data-gw-projects/, "Projects must be reachable without knowing a URL");
  assert.match(list, /data-gw-repo-new/, "and adding a repository still works as it did");
});

test("25 — absence is styled as ordinary, never as an alert", () => {
  const rule = CSS.match(/\.gw-cap-absent\{([^}]*)\}/);
  assert.ok(rule, "the absent state must be styled, not left to default ink");
  assert.ok(!/--blocked|--red|--danger/.test(rule[1]),
    "a project with no database is not broken and must not be coloured as if it were");
  for (const cls of ["gw-proj-row", "gw-project-caps", "gw-proj-edit"]) {
    assert.ok(CSS.includes(`.${cls}`), `${cls} is rendered with no stylesheet rule`);
  }
});

/* ── what the LIVE registration proved was still missing ──────────────────── */

test("26 — a registered project is given an identity of its own", () => {
  /*
   * FOUND BY REGISTERING THE REAL REPOSITORY, not by reading the code.
   *
   * S0 gave Alloy `prj_alloy` and gave every other project null, and no write
   * path set the field — not registration, not update. The real Vacilando
   * project registered correctly, resolved none of Alloy's conventions, and had
   * no identity, so `prj_vacilando` was unreachable through the product. A
   * project model where exactly one project has an identity is half a model.
   */
  assert.equal(R.mintProjectId("Vacilando"), "prj_vacilando", "readable, from the operator's own name");
  assert.equal(R.mintProjectId("My Project!"), "prj_my-project");
  assert.equal(R.mintProjectId(""), "prj_project", "an unnameable project still gets an identity");
  // Collisions take a suffix rather than silently reusing an identity.
  const store = { repositories: { a: { project_id: "prj_vacilando" } } };
  assert.equal(R.mintProjectId("Vacilando", store), "prj_vacilando_2");
  // Alloy's identity is still reserved, even though its record predates the field.
  const alloyStore = { repositories: { repo_alloy: { repository_id: R.ALLOY_REPOSITORY_ID } } };
  assert.equal(R.mintProjectId("Alloy", alloyStore), "prj_alloy_2");
});

test("27 — promotion is SETTABLE, not just showable", () => {
  /*
   * The surface could show a project's promotion policy and not change it, so a
   * newly registered project could never be given governed promotion without
   * opening repositories.json — the thing this slice exists to end. Registering
   * the real Vacilando repository (canonical main, promotion main) is what made
   * that concrete.
   */
  const at = SERVER.indexOf('const allowed = ["name", "default_branch", "worktree_parent", "promotion"]');
  assert.ok(at > 0, "the update route must accept a promotion policy");
  const html = V.renderProjectsSheet({ repositories: [repoOnly], selected: "repo_plain" });
  assert.match(html, /data-gw-proj-gp/, "governed promotion must be a control");
  assert.ok(APP.includes("[data-gw-proj-gp]"), "and something must listen for it");
  // Off by default for a generic project: the branch box only appears once it is on.
  assert.ok(!html.includes("data-gw-proj-pb"), "a promotion branch with promotion off reads nothing");
  const on = R.publicRepository({
    repository_id: "repo_gp", name: "GP", root: "/tmp/gp", profile: "generic", state: "ACTIVE",
    default_branch: "main", promotion: { governed_promotion: true, promotion_branch: "main" },
  });
  assert.match(V.renderProjectsSheet({ repositories: [on], selected: "repo_gp" }), /data-gw-proj-pb/);
});

test("28 — the promotion patch is validated, and never widens silently", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-s1a-upd-"));
  const rec = { repository_id: "repo_u", name: "U", root: "/tmp/u", profile: "generic", state: "ACTIVE" };
  mkdirSync(join(root, "vacilando"), { recursive: true });
  writeFileSync(join(root, "vacilando", "repositories.json"),
    JSON.stringify({ schema_version: R.REPOSITORY_SCHEMA, repositories: { repo_u: rec } }), "utf8");
  // A field the policy does not own is refused rather than stored.
  assert.equal(R.updateRepository("repo_u", { promotion: { database_target: "x" } }, { root }).error,
    "invalid_promotion_field");
  assert.equal(R.updateRepository("repo_u", { promotion: { promotion_branch: "a b" } }, { root }).error, "invalid_branch");
  // The real thing.
  const ok = R.updateRepository("repo_u", { promotion: { governed_promotion: true, promotion_branch: "main" } }, { root });
  assert.equal(ok.ok, true);
  assert.equal(ok.repository.promotion.governed_promotion, true);
  assert.equal(ok.repository.promotion.promotion_branch, "main");
  assert.equal(ok.repository.promotion.source, "repository_record", "and it says the project owns it");
  // Turning it off states false rather than deleting the block into a profile default.
  const off = R.updateRepository("repo_u", { promotion: { governed_promotion: false } }, { root });
  assert.equal(off.repository.promotion.governed_promotion, false);
});

test("29 — a retired project is RECONNECTED by Add project, not refused", async () => {
  /*
   * THE FOURTH THING THE LIVE REGISTRATION FOUND, and the one with no way out.
   *
   * `findRepositoryByCommonDir` matched retired records, so registering a path
   * you had previously deactivated answered `repository_already_registered` and
   * pointed at a record the list does not show by default. The operator is
   * looking at a repository Vacilando says it already has and cannot see, with
   * nothing in the product to do about it.
   *
   * Retire has always meant disconnect, never delete — so registering the same
   * path again is the operator RECONNECTING it. The record, its lanes and its
   * history come back rather than a duplicate appearing beside them, and a
   * record written before project identities existed gets one on the way.
   */
  const { execFileSync } = await import("node:child_process");
  const root = mkdtempSync(join(tmpdir(), "vac-s1a-reconn-"));
  const repo = mkdtempSync(join(tmpdir(), "vac-s1a-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
  execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "x"], { env });

  const first = await R.registerLocalRepository({ path: repo, name: "Reconnect Me", root });
  assert.equal(first.ok, true);
  const id = first.repository.repository_id;
  assert.match(String(first.repository.project_id), /^prj_reconnect-me$/, "registration mints an identity");

  assert.equal(R.retireRepository(id, { root }).ok, true);
  const again = await R.registerLocalRepository({ path: repo, name: "Reconnect Me", root });
  assert.equal(again.ok, true, `a retired path must reconnect, got ${again.error}`);
  assert.equal(again.reconnected, true, "and say that is what happened");
  assert.equal(again.repository.repository_id, id, "the SAME record, not a duplicate");
  assert.equal(again.repository.state, "ACTIVE");
  assert.equal(R.listRepositories({ root }).filter((r) => r.root === again.repository.root).length, 1,
    "reconnecting must never leave two records for one repository");
  // An ACTIVE one is still refused: that is a different question.
  const third = await R.registerLocalRepository({ path: repo, name: "Reconnect Me", root });
  assert.equal(third.error, "repository_already_registered");
});

test("30 — a record written before identities existed gets one, except Alloy's", () => {
  const store = { repositories: {} };
  const legacy = { repository_id: "repo_legacy", name: "Legacy Thing" };
  assert.equal(R.ensureProjectIdentity(legacy, store), "prj_legacy-thing");
  assert.equal(legacy.project_id, "prj_legacy-thing", "and it is PERSISTED, not derived each read");
  // Alloy is left alone: its identity is already what every governed record uses.
  const alloy = { repository_id: R.ALLOY_REPOSITORY_ID, name: "Alloy" };
  assert.equal(R.ensureProjectIdentity(alloy, store), "prj_alloy");
  assert.equal(alloy.project_id, undefined, "writing one would change a persisted identity");
  // An identity already chosen is never overwritten.
  const held = { repository_id: "repo_h", name: "Renamed", project_id: "prj_original" };
  assert.equal(R.ensureProjectIdentity(held, store), "prj_original");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
