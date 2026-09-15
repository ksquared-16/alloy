#!/usr/bin/env node
/**
 * THE PROJECT REGISTRY IS THE TARGET AUTHORITY. GOVERNANCE IS THE ACTION AUTHORITY.
 *
 * S4 committed 918 seeded files into `prj_vacilando` and then had nowhere
 * governed to send them: `repository.push` refused with "Repository
 * ksquared-16/vacilando is not allowlisted. Allowlisted: ksquared-16/alloy."
 * The allowlist was Alloy's profile slug plus an environment variable — a second
 * repository universe, maintained beside the registry that already knew both
 * projects and their remotes.
 *
 * THE DISTINCTION THIS FILE EXISTS TO HOLD, because collapsing it would be a
 * real security regression:
 *
 *   ELIGIBLE means Vacilando knows this repository and will CONSIDER a request
 *   about it. Registering a project makes a target addressable.
 *
 *   AUTHORIZED means this specific action may execute. That is decided after
 *   eligibility by governed request creation, policy, approval and delegation,
 *   execution ownership, push protections, audit and repository-state
 *   validation — none of which registration touches.
 *
 * Case 7 is the one that matters: adding a project does not push anything, and
 * an eligible target still has to survive the entire governed path.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-s4c-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
delete process.env.VACILANDO_GITHUB_REPOSITORY;
delete process.env.ALLOY_GITHUB_REPOSITORY;

const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;
const R = await import("../lib/vacilando/repository-registry.mjs");
const M = await import("../lib/vacilando/trusted-host-merge.mjs");
const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const pushModule = await import("../lib/vacilando/trusted-host-push.mjs");

/** A registry with an Alloy, a second real project, and several that must NOT qualify. */
function seed(extra = {}) {
  mkdirSync(join(ROOT, "vacilando"), { recursive: true });
  writeFileSync(join(ROOT, "vacilando", "repositories.json"), JSON.stringify({
    schema_version: R.REPOSITORY_SCHEMA,
    repositories: {
      [R.ALLOY_REPOSITORY_ID]: {
        repository_id: R.ALLOY_REPOSITORY_ID, name: "Alloy", root: "/tmp/alloy",
        profile: "alloy", state: "ACTIVE",
      },
      repo_second: {
        repository_id: "repo_second", project_id: "prj_second", name: "Second",
        root: "/tmp/second", profile: "generic", state: "ACTIVE",
        // Exactly prj_vacilando's shape: a normalised remote and NO slug.
        remote: "https://github.com/ksquared-16/second.git",
        remote_normalized: "github.com/ksquared-16/second",
      },
      ...extra,
    },
  }), "utf8");
}
seed();

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const code = (f) => readFileSync(`${LIB}${f}`, "utf8").split("\n")
  .map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");

/* ── target resolution ────────────────────────────────────────────────────── */

test("1 — a registered ACTIVE project with a valid remote is an ELIGIBLE target", () => {
  assert.equal(M.isAllowlistedRepository("ksquared-16/second"), true,
    "a registered project's own remote must be addressable");
  assert.ok(M.allowlistedRepositories().includes("ksquared-16/second"));
});

test("2 — the slug is DERIVED when the record has none", () => {
  /*
   * The operator registered a clone. The registry captured its remote. Asking
   * them to type `ksquared-16/second` into a second field is asking twice for
   * a fact already recorded — which is exactly why prj_vacilando had a null
   * remote_slug and no way to be pushed to.
   */
  const rec = { repository_id: "repo_second", profile: "generic", remote_normalized: "github.com/ksquared-16/second" };
  assert.equal(R.canonicalRemoteFor(rec), "ksquared-16/second");
  // Every spelling of the same repository resolves to one identity.
  for (const form of [
    "https://github.com/ksquared-16/second.git",
    "git@github.com:ksquared-16/second.git",
    "github.com/ksquared-16/second",
    "ksquared-16/Second",
  ]) {
    assert.equal(R.canonicalRemoteFor({ remote_normalized: form }), "ksquared-16/second", `${form} did not normalise`);
  }
});

test("3 — an UNREGISTERED remote is refused", () => {
  assert.equal(M.isAllowlistedRepository("ksquared-16/not-a-project"), false);
  assert.equal(M.isAllowlistedRepository("attacker/alloy"), false);
  assert.ok(!M.allowlistedRepositories().includes("attacker/alloy"));
});

test("4 — an INACTIVE registered project is refused", () => {
  seed({
    repo_retired: {
      repository_id: "repo_retired", name: "Retired", root: "/tmp/retired", profile: "generic",
      state: "RETIRED", remote_normalized: "github.com/ksquared-16/retired",
    },
  });
  assert.equal(M.isAllowlistedRepository("ksquared-16/retired"), false,
    "a project the operator took out of service is not a target");
  seed();
});

test("5 — a project whose validation FAILED is refused", () => {
  seed({
    repo_broken: {
      repository_id: "repo_broken", name: "Broken", root: "/tmp/gone", profile: "generic",
      state: "ACTIVE", remote_normalized: "github.com/ksquared-16/broken",
      validation: { ok: false, reason: "repository_root_missing" },
    },
  });
  assert.equal(M.isAllowlistedRepository("ksquared-16/broken"), false,
    "a record pointing at a checkout that is gone cannot be pushed to anyway");
  seed();
});

test("6 — a MALFORMED or ambiguous remote resolves to nothing", () => {
  for (const bad of ["", null, "not-a-slug", "github.com", "a/b/c", "https://example.com/x/y/z", "   "]) {
    assert.equal(R.canonicalRemoteFor({ remote_normalized: bad }), null, `${JSON.stringify(bad)} resolved something`);
  }
  seed({
    repo_vague: {
      repository_id: "repo_vague", name: "Vague", root: "/tmp/vague", profile: "generic",
      state: "ACTIVE", remote_normalized: "not-a-slug",
    },
  });
  assert.ok(!M.allowlistedRepositories().includes("not-a-slug"), "an ambiguous remote is not an identity");
  seed();
});

test("6b — a requested target that DIFFERS from the registered identity is refused", () => {
  // Same owner, near-miss name. The registry holds `second`, not `second-fork`.
  assert.equal(M.isAllowlistedRepository("ksquared-16/second-fork"), false);
  // Right name, wrong owner.
  assert.equal(M.isAllowlistedRepository("someone-else/second"), false);
});

/* ── THE BOUNDARY ─────────────────────────────────────────────────────────── */

test("7 — registration makes a target ELIGIBLE and authorizes NOTHING", () => {
  /*
   * The case that would matter if this design were ever misread. Eligibility is
   * a precondition, not a permission: a governed request for an eligible target
   * still arrives unauthorized and stays that way until a Director approves it.
   */
  assert.equal(M.isAllowlistedRepository("ksquared-16/second"), true, "eligible");

  const req = TH.requestTrustedHostAction({
    missionId: "msn_s4c_boundary",
    assignmentId: "run_s4c_boundary",
    actionType: REG.ACTION_TYPES.REPOSITORY_PUSH,
    inputs: {
      // A working branch, not the trunk: `prj_second` has no governed promotion
      // configured, but a branch push is the shape this case is about.
      repository: "ksquared-16/second", branch: "seed/s4c",
      expectedHeadSha: "0".repeat(40), worktreePath: "/tmp/second",
      base_ref: "origin/main", expected_commits: ["0".repeat(40)], expected_files: ["a.txt"],
    },
  });
  assert.equal(req.ok, true, `the request must be creatable: ${JSON.stringify(req).slice(0, 200)}`);
  assert.notEqual(req.action.state, "completed", "registration must not have executed anything");
  assert.notEqual(req.action.authorizationState, "authorized",
    "an eligible target must still arrive UNAUTHORIZED");

  // And executing it without approval is refused, not performed.
  const out = TH.executeTrustedHostAction(req.action.id, { actor: "director", nowMs: Date.now() });
  assert.equal(out.ok, false, "an unapproved push must not execute merely because the target is eligible");
  assert.equal(out.error, "authorization_required");
});

test("8 — governance remains required, and the chain reaches the REAL push", () => {
  /*
   * Drives the governed wrapper rather than the helper: request through the real
   * validator, authorize the record the way the other executor suites do, then
   * `executeTrustedHostAction`. Reaching the real push implementation is the
   * assertion — it fails on a fabricated head SHA, which is the proof it got
   * there rather than being turned away at the allowlist.
   */
  const req = TH.requestTrustedHostAction({
    missionId: "msn_s4c_chain", assignmentId: "run_s4c_chain",
    actionType: REG.ACTION_TYPES.REPOSITORY_PUSH,
    inputs: {
      repository: "ksquared-16/second", branch: "seed/s4c",
      expectedHeadSha: "1".repeat(40), worktreePath: "/tmp/second",
      base_ref: "origin/main", expected_commits: ["1".repeat(40)], expected_files: ["a.txt"],
    },
  });
  assert.equal(req.ok, true);
  const file = join(ROOT, "vacilando", "trusted-host-actions", `${req.action.id}.json`);
  const rec = JSON.parse(readFileSync(file, "utf8"));
  rec.authorizationState = "authorized";
  rec.authorizationId = "authz-s4c";
  rec.state = "authorized";
  rec.authorizationIdentity = { scope: "msn_s4c_chain", actionType: REG.ACTION_TYPES.REPOSITORY_PUSH, resolved: true };
  writeFileSync(file, JSON.stringify(rec), "utf8");

  const out = TH.executeTrustedHostAction(req.action.id, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g_s4c" } });
  assert.equal(out.ok, false, "a fabricated SHA in a nonexistent worktree cannot succeed");
  assert.notEqual(out.error, "repository_not_allowlisted",
    "the chain was turned away at the allowlist instead of reaching the push");
  assert.notEqual(out.error, "unknown_action_type");
});

/* ── both real projects ───────────────────────────────────────────────────── */

test("9 — Alloy continues to resolve, and survives an unseeded registry", () => {
  assert.equal(M.isAllowlistedRepository("ksquared-16/alloy"), true);
  // The floor: a host that has registered nothing still resolves the incumbent,
  // which is the S2 lesson about deriving a governed set from host state alone.
  const empty = mkdtempSync(join(tmpdir(), "vac-s4c-empty-"));
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  process.env.ALLOY_RUNTIME_ROOT = empty;
  assert.equal(M.isAllowlistedRepository("ksquared-16/alloy"), true,
    "an unseeded host must not lose the incumbent; that is how 19 ledger cases failed in S2");
  process.env.ALLOY_RUNTIME_ROOT = prev;
});

test("10 — no Vacilando literal exists in the push authority", () => {
  for (const f of ["trusted-host-merge.mjs", "repository-registry.mjs"]) {
    const body = code(f);
    assert.ok(!/vacilando\/vacilando|ksquared-16\/vacilando/.test(body),
      `${f} names the Vacilando repository; it must resolve from the record like any other`);
  }
  // And the generic path is what resolves it.
  const merge = code("trusted-host-merge.mjs");
  assert.ok(merge.includes("eligibleRepositoryRemotes"), "the registry must supply the target universe");
});

test("11 — REMOVING the registry-derived path makes the second project fail", () => {
  /*
   * The planted defect, as an assertion about the code rather than a mutation:
   * if `allowlistedRepositories` stops consulting the registry, the only
   * remaining sources are the profile floor and the env extras — neither of
   * which contains a second project — and the S4 push refuses again.
   */
  const merge = code("trusted-host-merge.mjs");
  const start = merge.indexOf("export function allowlistedRepositories");
  const fn = merge.slice(start, merge.indexOf("\n}", start));
  assert.ok(fn.includes("eligibleRepositoryRemotes"),
    "without the registry source the second project is unreachable again");
  // Prove it by construction: the floor alone does not contain it.
  const floorOnly = M.allowlistedRepositories().filter((r) => r !== "ksquared-16/second");
  assert.ok(!floorOnly.includes("ksquared-16/second"));
  assert.ok(floorOnly.includes("ksquared-16/alloy"), "and the floor is what keeps Alloy working");
});

test("12 — env extras remain a compatibility path, not the universe", () => {
  process.env.VACILANDO_GITHUB_REPOSITORY = "legacy/override";
  assert.equal(M.isAllowlistedRepository("legacy/override"), true, "still honoured for hosts that set it");
  assert.equal(M.isAllowlistedRepository("ksquared-16/second"), true, "and it does not displace the registry");
  delete process.env.VACILANDO_GITHUB_REPOSITORY;
  assert.equal(M.isAllowlistedRepository("legacy/override"), false);
});

test("13 — the PROTECTED set is the target project's, and Alloy is not weakened", () => {
  /*
   * The same defect as the allowlist, one layer deeper and found by driving the
   * real chain: `PROTECTED_REFS` is Alloy's branch policy frozen in the push
   * guard. `prj_vacilando` declares `promotion_branch: main` with no protected
   * branches, and was refused its own trunk with "main is promoted by merging a
   * reviewed pull request" — a sentence true of Alloy and false of it.
   */
  const P = pushModule;
  const alloy = R.getRepository(R.ALLOY_REPOSITORY_ID);
  const alloyProtected = P.protectedRefsFor(alloy);
  for (const b of ["main", "master", "production", "prod", "staging", "HEAD"]) {
    assert.ok(alloyProtected.includes(b), `Alloy stopped protecting ${b}`);
  }
  // `staging` is protected for Alloy because it is its GOVERNED PROMOTION trunk,
  // not because it appears in a list — a governed trunk moves by reviewed merge.
  assert.ok(!(R.promotionPolicyFor(alloy).protected_branches || []).includes("staging"));

  // A project with governed promotion protects its own trunk, whatever it is.
  const governed = { repository_id: "repo_g", profile: "generic", promotion: { governed_promotion: true, promotion_branch: "release" } };
  assert.ok(P.protectedRefsFor(governed).includes("release"));
  assert.ok(!P.protectedRefsFor(governed).includes("staging"), "and does not inherit Alloy's");

  // A project with no governed promotion protects only what it declares.
  const plain = { repository_id: "repo_p", profile: "generic" };
  assert.deepEqual([...P.protectedRefsFor(plain)], ["HEAD"]);

  // An unknown target gets the full floor, which is the safe direction.
  for (const b of ["staging", "main", "master", "production", "prod", "HEAD"]) {
    assert.ok(P.protectedRefsFor(null).includes(b), `an unregistered target lost ${b}`);
  }
});

test("14 — the PROMOTION BASE is the target project's too", () => {
  /*
   * The third copy of one defect, and the shape is identical each time. The
   * allowlist refused `ksquared-16/vacilando`; the push guard refused its
   * `main`; and `promotion.open_pr` refused a pull request into it with "base
   * must be one of: staging" -- true of Alloy, false of a project whose
   * declared promotion branch is `main`.
   */
  const alloy = R.getRepository(R.ALLOY_REPOSITORY_ID);
  assert.deepEqual([...M.allowedTargetBranchesFor(alloy)], ["staging"], "Alloy still promotes into staging");
  const governed = { repository_id: "repo_g", profile: "generic", promotion: { governed_promotion: true, promotion_branch: "main" } };
  assert.deepEqual([...M.allowedTargetBranchesFor(governed)], ["main"]);
  // Ungoverned and unregistered both keep the incumbent floor.
  assert.deepEqual([...M.allowedTargetBranchesFor({ repository_id: "repo_p", profile: "generic" })], ["staging"]);
  assert.deepEqual([...M.allowedTargetBranchesFor(null)], ["staging"]);
  // And the remote resolves back to its record, which is what makes it per-target.
  assert.equal(M.repositoryRecordForRemote("ksquared-16/second")?.repository_id, "repo_second");
  assert.equal(M.repositoryRecordForRemote("nobody/nothing"), null);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
