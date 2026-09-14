#!/usr/bin/env node
/**
 * ALLOY'S CONVENTIONS BELONG TO ALLOY, NOT TO THE RUNTIME.
 *
 * Three values decided how every repository Vacilando touched was promoted, and
 * all three were module constants:
 *
 *   ALLOWED_TARGET_BRANCHES  ["staging"]
 *   BLOCKED_TARGET_BRANCHES  ["main","master","production","prod"]
 *   PROMOTED_REF             "origin/staging"
 *
 * Alloy has a staging trunk and a protected default branch. A repository with
 * neither inherited both, because a constant has no owner. A fourth was worse:
 * `resolveCanonicalRepoRoot` guessed where Alloy lives by trying two
 * environment variables, then `~/Alloy`, then the literal `/Users/Kelly/Alloy`
 * — another person's home directory, in generic runtime.
 *
 * S0 gives those values an owner without changing any of them. The repository
 * registry already modelled repositories WITH PROFILES and said in its own
 * header that "a profile is the set of conventions a repository actually has,
 * never a set of conditionals sprinkled through the codebase". These cases
 * finish that sentence: Alloy's profile carries Alloy's policy, the generic
 * profile carries none, and nothing silently falls back to Alloy.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-s0-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const R = await import("../lib/vacilando/repository-registry.mjs");
const M = await import("../lib/vacilando/trusted-host-merge.mjs");
const A = await import("../lib/vacilando/repository-execution-authority.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const alloyRec = { repository_id: R.ALLOY_REPOSITORY_ID, profile: "alloy" };
const genericRec = { repository_id: "repo_other", profile: "generic" };

/* ── project identity ─────────────────────────────────────────────────────── */

test("1 — prj_alloy resolves deterministically", () => {
  assert.equal(R.ALLOY_PROJECT_ID, "prj_alloy");
  assert.equal(R.projectIdFor(alloyRec), "prj_alloy");
  assert.equal(R.projectIdFor({ ...alloyRec, project_id: "prj_alloy" }), "prj_alloy");
});

test("2 — a record written before S0 still resolves its project", () => {
  // The live registry's Alloy record predates this slice and carries no
  // project_id. Requiring a rewrite would have made S0 a data migration.
  assert.equal(R.projectIdFor({ repository_id: R.ALLOY_REPOSITORY_ID }), "prj_alloy");
});

test("3 — no OTHER repository is handed Alloy's project identity", () => {
  assert.equal(R.projectIdFor(genericRec), null);
  assert.equal(R.projectIdFor(null), null);
  assert.equal(R.projectIdFor({ repository_id: "repo_alloy_lookalike" }), null);
});

/* ── the policy, and who it belongs to ────────────────────────────────────── */

test("4 — Alloy's policy is unchanged in value, changed in ownership", () => {
  const p = R.promotionPolicyFor(alloyRec);
  assert.equal(p.governed_promotion, true);
  assert.equal(p.promotion_branch, "staging");
  assert.deepEqual([...p.protected_branches], ["main", "master", "production", "prod"]);
  assert.equal(p.promoted_ref, "origin/staging");
  assert.equal(p.source, "profile:alloy", "it comes from the profile, not from a module constant");
});

test("5 — THE POINT: a generic repository inherits none of it", () => {
  const p = R.promotionPolicyFor(genericRec);
  assert.equal(p.governed_promotion, false);
  assert.equal(p.promotion_branch, null, "no staging trunk it never had");
  assert.deepEqual([...p.protected_branches], [], "no protected names it never had");
  assert.equal(p.promoted_ref, null, "no release ref it never had");
});

test("6 — an unknown or unregistered repository resolves GENERIC, never Alloy", () => {
  for (const rec of [null, undefined, {}, { profile: "nonexistent" }]) {
    const p = R.promotionPolicyFor(rec);
    assert.equal(p.promotion_branch, null, `${JSON.stringify(rec)} fell back to Alloy`);
    assert.equal(p.governed_promotion, false);
  }
});

test("7 — a record may narrow its profile, and says when it did", () => {
  const narrowed = R.promotionPolicyFor({ ...alloyRec, promotion: { promotion_branch: "release" } });
  assert.equal(narrowed.promotion_branch, "release");
  assert.equal(narrowed.source, "repository_record");
  // The dimensions it did not state still come from the profile.
  assert.deepEqual([...narrowed.protected_branches], ["main", "master", "production", "prod"]);
});

/* ── the consumers actually read it ───────────────────────────────────────── */

test("8 — the merge guard's exported constants are derived, not declared", () => {
  assert.deepEqual([...M.ALLOWED_TARGET_BRANCHES], ["staging"]);
  assert.deepEqual([...M.BLOCKED_TARGET_BRANCHES], ["main", "master", "production", "prod"]);
  assert.equal(M.mergeBranchPolicyFor(alloyRec).promotion_branch, "staging");
  assert.equal(M.mergeBranchPolicyFor(genericRec).governed_promotion, false,
    "a repository without governed promotion must not get Alloy's branches");
});

test("9 — the promoted ref is Alloy's, and generic has none", () => {
  assert.equal(A.PROMOTED_REF, "origin/staging");
  assert.equal(A.promotedRefFor(alloyRec), "origin/staging");
  assert.equal(A.promotedRefFor(genericRec), null);
});

test("10 — the canonical root asks the registry before it guesses", () => {
  const reg = mkdtempSync(join(tmpdir(), "vac-s0-reg-"));
  const repo = mkdtempSync(join(tmpdir(), "vac-s0-repo-"));
  mkdirSync(join(reg, "vacilando"), { recursive: true });
  writeFileSync(join(reg, "vacilando", "repositories.json"), JSON.stringify({
    schema_version: R.REPOSITORY_SCHEMA,
    repositories: { [R.ALLOY_REPOSITORY_ID]: { repository_id: R.ALLOY_REPOSITORY_ID, root: repo, profile: "alloy", state: "ACTIVE" } },
  }), "utf8");
  assert.equal(R.getRepository(R.ALLOY_REPOSITORY_ID, reg).root, repo,
    "the registry is the authority on where a project lives");
  // And a registry that holds no Alloy record answers null rather than guessing
  // on the registry's behalf — the guessing, if any, happens above this layer.
  const empty = mkdtempSync(join(tmpdir(), "vac-s0-empty-"));
  assert.equal(R.getRepository(R.ALLOY_REPOSITORY_ID, empty), null);
});

/* ── no duplicate authority, and no hidden fallback ───────────────────────── */

test("11 — exactly ONE repository authority exists", async () => {
  const { readFileSync } = await import("node:fs");
  const lib = new URL("../lib/vacilando/", import.meta.url).pathname;
  const merge = readFileSync(`${lib}trusted-host-merge.mjs`, "utf8");
  const auth = readFileSync(`${lib}repository-execution-authority.mjs`, "utf8");
  for (const [name, src] of [["merge", merge], ["execution-authority", auth]]) {
    assert.ok(src.includes("promotionPolicyFor"), `${name} must consult the one authority`);
  }
  // The values must no longer be written as literals in the consumers.
  assert.ok(!/ALLOWED_TARGET_BRANCHES = Object\.freeze\(\["staging"\]\)/.test(merge),
    "a literal beside the authority is a second authority");
  assert.ok(!/PROMOTED_REF = "origin\/staging"/.test(auth));
});

test("12 — Alloy is not the generic default anywhere in the policy resolver", async () => {
  const { readFileSync } = await import("node:fs");
  const lib = new URL("../lib/vacilando/", import.meta.url).pathname;
  const registry = readFileSync(`${lib}repository-registry.mjs`, "utf8");
  const start = registry.indexOf("export function promotionPolicyFor");
  const body = registry.slice(start, registry.indexOf("\n}", start));
  assert.ok(!body.includes("alloy"), "the resolver must not name Alloy; it resolves whatever profile it is given");
  assert.ok(body.includes("REPOSITORY_PROFILES.generic"), "and its floor is generic");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
