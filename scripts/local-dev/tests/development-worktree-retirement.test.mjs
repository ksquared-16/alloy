/**
 * Worktree Retirement V1.
 *
 * The controls here are written against the safety boundary, not the happy
 * path: every one describes a way a worktree could be destroyed that must not
 * be reachable. A retirement subsystem whose tests only prove that removal
 * works has tested the least important half.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const R = await import("../lib/vacilando/worktree-retirement.mjs");
const D = await import("../lib/vacilando/director-authority.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");

/** A world in which every gate passes. Each control spoils exactly one thing. */
const safeWorld = (over = {}) => ({
  path: "wt-old", branch: "agent/claude/4-old", headSha: "a".repeat(40),
  existsInGit: true,
  liveProviders: [], liveDevServer: false,
  activeRuns: [], activeGovernedActions: [], activeLanes: [],
  dirtyPaths: [], untrackedPaths: [], untrackedReproducible: true,
  durability: "merged",
  requestingWorktree: "wt5-current",
  operatorHold: false, governanceException: false,
  ...over,
});

await test("a fully measured, clean, durable worktree is a candidate", () => {
  const r = R.evaluateRetirementSafety(safeWorld());
  assert.equal(r.state, "candidate");
  assert.equal(r.deterministic, true);
  assert.deepEqual(r.blocked_by, []);
  assert.deepEqual(r.unmeasured, []);
});

await test("every gate is reported, including the ones that passed", () => {
  const r = R.evaluateRetirementSafety(safeWorld());
  assert.equal(r.gates.length, R.SAFETY_GATES.length);
  for (const name of R.SAFETY_GATES) assert.ok(r.gates.some((g) => g.gate === name), `missing gate ${name}`);
});

/* ── Negative controls: each one alone must stop retirement ───────────────── */

await test("NC1 — a dirty worktree cannot auto-retire", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ dirtyPaths: ["M web/app/page.tsx"] }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("tree_clean_or_handled"));
});

await test("NC2 — a live provider blocks", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ liveProviders: [{ pid: 4242 }] }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_live_provider"));
});

await test("NC3 — a live dev server blocks", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ liveDevServer: true }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_live_dev_server"));
});

await test("NC4 — a non-terminal Execution Run blocks", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ activeRuns: [{ run_id: "erun_1" }] }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_active_execution_run"));
});

await test("NC5 — an active governed action blocks", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ activeGovernedActions: [{ request_id: "gar_1" }] }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_active_governed_action"));
});

await test("NC6 — an active lane blocks", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ activeLanes: [{ lane_id: "lane_1" }] }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_active_lane"));
});

await test("NC7 — a unique local commit blocks, and says so on both gates", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ durability: "unique_local_commits" }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("branch_durability_proven"));
  assert.ok(r.blocked_by.includes("unique_commits_recoverable"));
});

await test("NC8 — unknown branch durability blocks; unknown is never operator_review", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ durability: "unknown" }));
  assert.equal(r.state, "blocked");
  // An operator asked to approve an unmeasured gate is being asked to guess
  // with more authority. Unknown stops, it does not escalate.
  assert.notEqual(r.state, "operator_review");
});

await test("NC9 — a protected branch blocks even when every other gate passes", () => {
  for (const b of ["staging", "main", "master", "production"]) {
    const r = R.evaluateRetirementSafety(safeWorld({ branch: b }));
    assert.equal(r.state, "blocked", `${b} must block`);
    assert.equal(r.protected_branch, true);
  }
});

await test("NC10 — a worker cannot declare itself disposable", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ requestingWorktree: "wt-old" }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("not_self_retirement"));
});

await test("NC11 — irreproducible untracked files block", () => {
  const r = R.evaluateRetirementSafety(safeWorld({
    untrackedPaths: ["docs/hand-written-notes.md"], untrackedReproducible: false,
  }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_untracked_unreproducible"));
});

await test("NC12 — reproducible untracked build output does NOT block", () => {
  const r = R.evaluateRetirementSafety(safeWorld({
    untrackedPaths: ["web/node_modules/x", "web/.next/cache"], untrackedReproducible: true,
  }));
  assert.equal(r.state, "candidate");
});

await test("NC13 — an operator hold wins over every passing gate", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ operatorHold: true }));
  assert.equal(r.state, "blocked");
  assert.ok(r.blocked_by.includes("no_operator_hold"));
});

await test("NC14 — any unmeasured gate blocks", () => {
  for (const field of ["existsInGit", "liveProviders", "activeRuns", "dirtyPaths", "durability", "activeLanes"]) {
    const r = R.evaluateRetirementSafety(safeWorld({ [field]: null }));
    assert.equal(r.state, "blocked", `${field}=null must block`);
    assert.ok(r.unmeasured.length > 0, `${field}=null must be reported unmeasured`);
  }
});

/* ── Durability taxonomy ──────────────────────────────────────────────────── */

await test("pushed-but-not-merged is operator_review, not a Director candidate", () => {
  const r = R.evaluateRetirementSafety(safeWorld({ durability: "pushed_not_merged" }));
  assert.equal(r.state, "operator_review");
  assert.equal(r.deterministic, false);
});

await test("being BEHIND your own remote is graded the same as being AT it", () => {
  // The defect: `pushed_not_merged` was returned only when HEAD equalled the
  // remote head, so a worktree one commit behind its own pushed branch scored a
  // clean candidate. Where the checkout happens to sit is not a safety property.
  const behind = R.classifyBranchDurability({
    headSha: "a".repeat(40), remoteHeadSha: "b".repeat(40),
    containedInRemoteBranch: true, mergedIntoCanonical: false, aheadOfRemote: false,
  });
  const at = R.classifyBranchDurability({
    headSha: "a".repeat(40), remoteHeadSha: "a".repeat(40),
    containedInRemoteBranch: true, mergedIntoCanonical: false, aheadOfRemote: false,
  });
  assert.equal(behind.durability, "pushed_not_merged");
  assert.equal(at.durability, "pushed_not_merged");
});

await test("durability is unknown when nothing could be established — never inferred", () => {
  const r = R.classifyBranchDurability({ headSha: "a".repeat(40) });
  assert.equal(r.durability, "unknown");
});

/* ── Fingerprint binding ──────────────────────────────────────────────────── */

await test("the fingerprint covers the safety state, not just identity", () => {
  const base = { repository: "repo_alloy", path: "wt-old", branch: "b", headSha: "a".repeat(40), s7State: "retirable" };
  const clean = R.retirementFingerprint({ ...base, safety: R.evaluateRetirementSafety(safeWorld()) });
  const dirty = R.retirementFingerprint({ ...base, safety: R.evaluateRetirementSafety(safeWorld({ dirtyPaths: ["M x"] })) });
  assert.notEqual(clean, dirty);
  assert.match(clean, /^[0-9a-f]{32}$/);
});

await test("NC15 — a stale fingerprint is not current", () => {
  const fresh = { repository: "repo_alloy", path: "wt-old", branch: "b", headSha: "a".repeat(40), s7State: "retirable", safety: R.evaluateRetirementSafety(safeWorld()) };
  assert.equal(R.retirementPlanIsCurrent(R.retirementFingerprint(fresh), fresh), true);
  assert.equal(R.retirementPlanIsCurrent("0".repeat(32), fresh), false);
  assert.equal(R.retirementPlanIsCurrent(null, fresh), false);
});

await test("NC16 — a changed HEAD changes the fingerprint", () => {
  const s = R.evaluateRetirementSafety(safeWorld());
  const a = R.retirementFingerprint({ repository: "r", path: "wt-old", branch: "b", headSha: "a".repeat(40), safety: s, s7State: "retirable" });
  const b = R.retirementFingerprint({ repository: "r", path: "wt-old", branch: "b", headSha: "c".repeat(40), safety: s, s7State: "retirable" });
  assert.notEqual(a, b);
});

/* ── Source guards ────────────────────────────────────────────────────────── */

const executorSrc = readFileSync(new URL("../lib/vacilando/trusted-host-worktree-retirement.mjs", import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

await test("NC17 — the executor contains no filesystem deletion and no rm", () => {
  const code = strip(executorSrc);
  for (const forbidden of ["rm -rf", "rmSync", "rimraf", "unlinkSync", "rmdirSync", "SIGKILL", "SIGTERM"]) {
    assert.ok(!code.includes(forbidden), `the retirement executor must not contain ${forbidden}`);
  }
});

await test("NC18 — the executor removes only through git worktree remove, and never with --force", () => {
  const code = strip(executorSrc);
  assert.ok(code.includes('"worktree", "remove"'), "removal must go through git worktree remove");
  // --force exists precisely to defeat Git's own refusal on a dirty or locked
  // worktree, which is the last safety gate.
  assert.ok(!code.includes('"--force"'), "the retirement executor must never force removal");
});

await test("NC19 — retirement never deletes a branch", () => {
  const code = strip(executorSrc);
  for (const forbidden of ["delete_remote_branch", "push --delete", "branch -D", "branch -d", ":refs/heads"]) {
    assert.ok(!code.includes(forbidden), `retirement must not reference ${forbidden}`);
  }
  assert.ok(executorSrc.includes("branch_deleted: false"), "the result must state that no branch was deleted");
});

await test("NC20 — the CLI is a request surface: no removal, no --force", () => {
  const cli = strip(readFileSync(new URL("../vac-worktree-retire.mjs", import.meta.url), "utf8"));
  assert.ok(!cli.includes("executeWorktreeRetirement"), "the CLI must not import the executor");
  assert.ok(!cli.includes("worktree\", \"remove\""), "the CLI must not remove anything");
  assert.ok(!cli.includes("--force"), "there is deliberately no --force");
  assert.ok(cli.includes("requestGovernedAction"), "the CLI files a governed request");
});

await test("NC21 — S7 apply still contains no retirement verb", () => {
  // Retirement must never migrate back into metadata reconciliation, whose
  // safety rests on containing no destructive verb at all.
  const s7 = strip(readFileSync(new URL("../lib/vacilando/reconciliation-apply.mjs", import.meta.url), "utf8"));
  for (const forbidden of ["worktree remove", "retire_worktree", "executeWorktreeRetirement"]) {
    assert.ok(!s7.includes(forbidden), `S7 apply must not contain ${forbidden}`);
  }
});

/* ── Director policy ──────────────────────────────────────────────────────── */

const retirementEvidence = (over = {}) => ({
  repository: "ksquared-16/alloy", managed_repository: true,
  branch: "agent/claude/4-old",
  retirement_safety_measured: true, retirement_state: "candidate",
  worktree_dirty_paths: 0, live_worktree_references: 0,
  branch_durability: "merged", unique_work_at_risk: false,
  untracked_unreproducible: 0, self_retirement: false,
  retirement_fingerprint: "a".repeat(32), requests_branch_deletion: false,
  governance_exception_active: false, operator_hold: false,
  ...over,
});
const decide = (evidence) => D.evaluateDirectorAuthority({
  request: { request_id: "gar_x", action_key: "vacilando.retire_worktree", target: "staging", inputs: { environment: "staging" } },
  evidence,
});

await test("the Director approves a fully measured, deterministic retirement", () => {
  const d = decide(retirementEvidence());
  assert.equal(d.decision, "director_approved");
  assert.equal(d.matched_policy, "routine_worktree_retirement_v1");
  assert.equal(d.decision_actor, "director");
});

await test("NC22 — the Director denies when a retirement gate fails", () => {
  for (const [field, value, gate] of [
    ["worktree_dirty_paths", 3, "worktree_clean"],
    ["live_worktree_references", 1, "no_live_worktree_references"],
    ["unique_work_at_risk", true, "no_unique_work_at_risk"],
    ["branch_durability", "unique_local_commits", "branch_durability_proven"],
    ["untracked_unreproducible", 2, "no_untracked_unreproducible"],
    ["self_retirement", true, "not_self_retirement"],
    ["retirement_state", "blocked", "retirement_state_is_candidate"],
    ["requests_branch_deletion", true, "no_implicit_branch_deletion"],
  ]) {
    const d = decide(retirementEvidence({ [field]: value }));
    assert.equal(d.decision, "policy_denied", `${field}=${value} must deny`);
    assert.ok(d.failed_gates.includes(gate), `${field} must fail ${gate}`);
  }
});

await test("NC23 — an unmeasured retirement gate escalates, never approves", () => {
  for (const field of ["retirement_safety_measured", "branch_durability", "worktree_dirty_paths", "self_retirement", "retirement_fingerprint"]) {
    const d = decide(retirementEvidence({ [field]: null }));
    assert.equal(d.decision, "operator_approval_required", `${field}=null must escalate`);
    assert.ok(d.unmeasured_gates.length > 0);
  }
});

await test("NC24 — an operator hold and an operator denial both win", () => {
  assert.equal(decide(retirementEvidence({ operator_hold: true })).decision, "operator_approval_required");
  const denied = D.evaluateDirectorAuthority({
    request: {
      request_id: "gar_x", action_key: "vacilando.retire_worktree", target: "staging",
      inputs: { environment: "staging" }, operator_approval: { decision: "denied" },
    },
    evidence: retirementEvidence(),
  });
  assert.equal(denied.decision, "operator_approval_required");
});

await test("NC25 — a protected branch is denied by policy as well as by the contract", () => {
  const d = decide(retirementEvidence({ branch: "staging" }));
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("not_protected_worktree_branch"));
});

await test("NC26 — branch deletion is not delegated by the retirement policy", () => {
  const retire = D.DELEGATED_POLICIES_V1.find((p) => p.policy_id === "routine_worktree_retirement_v1");
  assert.ok(retire.enabled);
  assert.equal(retire.action_key, "vacilando.retire_worktree");
  // Retirement authority must not extend to any branch action.
  assert.ok(!JSON.stringify(retire).includes("delete_remote_branch"));
  // And deleting a branch remains its own separately gated policy.
  const del = D.DELEGATED_POLICIES_V1.find((p) => p.action_key === "repository.delete_remote_branch");
  assert.ok(del, "branch deletion keeps its own policy");
  assert.notEqual(del.policy_id, retire.policy_id);
});

/* ── Registry ─────────────────────────────────────────────────────────────── */

await test("NC27 — a retirement request carrying a branch deletion is malformed", () => {
  const def = REG.getActionDefinition("vacilando.retire_worktree");
  const ok = def.validateInputs({
    repository: "repo_alloy", worktree: "wt-old", branch: "b",
    headSha: "a".repeat(40), safetyFingerprint: "b".repeat(32), s7State: "retirable",
  });
  assert.equal(ok.ok, true);
  const bad = def.validateInputs({
    repository: "repo_alloy", worktree: "wt-old", branch: "b",
    headSha: "a".repeat(40), safetyFingerprint: "b".repeat(32), s7State: "retirable",
    deleteBranch: true,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "branch_deletion_is_a_separate_action");
});

await test("NC28 — an abbreviated SHA or a path-like worktree is refused at filing", () => {
  const def = REG.getActionDefinition("vacilando.retire_worktree");
  assert.equal(def.validateInputs({ repository: "r", worktree: "wt", branch: "b", headSha: "d40f469b4", safetyFingerprint: "b".repeat(32), s7State: "retirable" }).code, "invalid_head_sha");
  assert.equal(def.validateInputs({ repository: "r", worktree: "../etc", branch: "b", headSha: "a".repeat(40), safetyFingerprint: "b".repeat(32), s7State: "retirable" }).code, "invalid_worktree_identity");
});

await test("grouping separates 'unknown' from 'safe but someone must decide'", () => {
  const g = R.groupRetirementCandidates([
    R.evaluateRetirementSafety(safeWorld()),
    R.evaluateRetirementSafety(safeWorld({ durability: "pushed_not_merged" })),
    R.evaluateRetirementSafety(safeWorld({ dirtyPaths: ["M x"] })),
    R.evaluateRetirementSafety(safeWorld({ branch: "main" })),
  ]);
  assert.equal(g.director_safe.length, 1);
  assert.equal(g.operator_required.length, 1);
  assert.equal(g.blocked.length, 1);
  assert.equal(g.protected.length, 1);
});

/* ── Executor, against a real Git repository ──────────────────────────────────
 *
 * These use real git rather than a stub. The claims being made — "removed
 * through Git", "the branch still exists", "nothing was applied" — are claims
 * about Git's actual state, and a stub can only prove that the code called what
 * the test expected it to call.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

const X = await import("../lib/vacilando/trusted-host-worktree-retirement.mjs");
const OBS = await import("../lib/vacilando/worktree-retirement-observe.mjs");
const RUNSTORE = await import("../lib/vacilando/execution-run.mjs");
const GASTORE = await import("../lib/vacilando/governed-action-request.mjs");
const LANESTORE = await import("../lib/vacilando/development-lane.mjs");
const g = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** A canonical repo with one extra worktree whose commits are all on staging. */
function repoWithWorktree({ name = "wt-old", dirty = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), "wtr-"));
  const repo = join(base, "canonical");
  const parent = join(base, "worktrees");
  const root = join(base, "state");
  mkdirSync(repo); mkdirSync(parent); mkdirSync(root, { recursive: true });
  g(["init", "-q", "-b", "staging"], repo);
  g(["config", "user.email", "t@example.com"], repo);
  g(["config", "user.name", "t"], repo);
  writeFileSync(join(repo, "a.txt"), "one\n");
  g(["add", "."], repo); g(["commit", "-qm", "one"], repo);
  // A REMOTE, because durability is reachability FROM one. Without an origin
  // nothing in this repo is recoverable and every worktree is correctly
  // unretirable — which makes a remote-less fixture prove the opposite of what
  // it looks like it proves.
  const remote = join(base, "origin.git");
  g(["init", "-q", "--bare", remote], base);
  g(["remote", "add", "origin", remote], repo);
  g(["push", "-q", "origin", "staging"], repo);
  g(["fetch", "-q", "origin"], repo);
  g(["worktree", "add", "-q", "-b", "agent/claude/4-old", join(parent, name)], repo);
  if (dirty) writeFileSync(join(parent, name, "a.txt"), "edited\n");
  // The canonical stores, written through the SAME path helpers the observer
  // reads. A store that is merely absent must not read as "nothing is active":
  // a mis-pathed store would then silently authorise destroying a worktree with
  // a live run on it. Absent stays unmeasured and blocks (NC35).
  mkdirSync(join(root, "vacilando"), { recursive: true });
  for (const [pathFn, empty] of [
    [RUNSTORE.executionRunStorePath, { lanes: {} }],
    [GASTORE.governedActionStorePath, { requests: [] }],
    [LANESTORE.developmentLaneStorePath, { lanes: {} }],
  ]) {
    const p = pathFn(root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(empty));
  }
  const head = g(["rev-parse", "HEAD"], join(parent, name));
  return { base, repo, parent, root, name, head, path: join(parent, name) };
}

await test("NC35 — an absent canonical store blocks; it never reads as 'nothing is active'", () => {
  const env = repoWithWorktree();
  // Point at a root with no stores at all, exactly as a mis-pathed helper would.
  const blind = mkdtempSync(join(tmpdir(), "wtr-blind-"));
  const measured = OBS.observeRetirementCandidates({
    root: blind,
    s7Worktrees: [{ path: env.name, state: "retirable", in_git_worktree_list: true, reasons: [] }],
    processes: [], worktreeParent: env.parent,
    requestingWorktree: "wt-somewhere-else", repository: "repo_test",
  })[0];
  assert.equal(measured.state, "blocked");
  for (const gate of ["no_active_execution_run", "no_active_governed_action", "no_active_lane"]) {
    assert.ok(measured.unmeasured.includes(gate), `${gate} must be unmeasured when its store is absent`);
  }
});

function freshFingerprint(env, s7State = "retirable") {
  const O = envObserve(env, s7State);
  return O ? O.fingerprint : null;
}
function envObserve(env, s7State = "retirable") {
  // Same observer the executor uses, so a fingerprint computed here is the one
  // the executor will compute unless reality moved.
  return OBS.observeRetirementCandidates({
    root: env.root,
    s7Worktrees: [{ path: env.name, state: s7State, in_git_worktree_list: true, reasons: [] }],
    processes: [],
    worktreeParent: env.parent,
    requestingWorktree: "wt-somewhere-else",
    repository: "repo_test",
  })[0];
}

await test("NC29 — a stale fingerprint applies NOTHING and the worktree survives", () => {
  const env = repoWithWorktree();
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    expectedFingerprint: "0".repeat(32),
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: "wt-somewhere-else", s7State: "retirable",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "stale_retirement_plan");
  assert.deepEqual(out.applied, []);
  assert.ok(existsSync(env.path), "the worktree must still exist");
  assert.ok(g(["worktree", "list"], env.repo).includes(env.name));
});

await test("NC30 — a changed HEAD applies NOTHING", () => {
  const env = repoWithWorktree();
  const fp = freshFingerprint(env);
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    expectedFingerprint: fp, expectedHeadSha: "c".repeat(40),
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: "wt-somewhere-else", s7State: "retirable",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "stale_retirement_plan");
  assert.deepEqual(out.applied, []);
  assert.ok(existsSync(env.path));
});

await test("NC31 — a path outside the managed worktree parent is refused", () => {
  const env = repoWithWorktree();
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: "/etc/passwd", repository: "repo_test",
    worktreeParent: env.parent, canonicalRoot: env.repo,
  });
  assert.equal(out.ok, false);
  assert.ok(["path_outside_worktree_parent", "not_retirable_now", "worktree_not_observable"].includes(out.error));
  assert.ok(existsSync("/etc/passwd"), "nothing outside the parent may be touched");
});

await test("NC32 — a dirty worktree is refused by the executor even with a matching fingerprint", () => {
  const env = repoWithWorktree({ dirty: true });
  const fp = freshFingerprint(env);
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    expectedFingerprint: fp,
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: "wt-somewhere-else", s7State: "retirable",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "not_retirable_now");
  assert.ok(existsSync(env.path), "a dirty worktree must survive");
});

await test("NC33 — self-retirement is refused by the executor", () => {
  const env = repoWithWorktree();
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: env.name, s7State: "retirable",
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "not_retirable_now");
  assert.ok(out.blocked_by.includes("not_self_retirement"));
  assert.ok(existsSync(env.path));
});

await test("a safe worktree is removed through Git, and the branch survives", () => {
  const env = repoWithWorktree();
  const measured = envObserve(env);
  assert.equal(measured.state, "candidate", `expected candidate, got ${measured.state}: ${measured.reason}`);
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    expectedFingerprint: measured.fingerprint, expectedHeadSha: measured.head_sha,
    expectedBranch: measured.branch,
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: "wt-somewhere-else", s7State: "retirable",
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.state, "retired");
  assert.equal(out.removal_method, "git worktree remove");
  // Postconditions, measured against Git rather than asserted by the executor.
  assert.equal(out.postconditions.absent_from_git_worktree_list, true);
  assert.equal(out.postconditions.filesystem_path_absent, true);
  assert.equal(existsSync(env.path), false);
  assert.ok(!g(["worktree", "list"], env.repo).includes(env.name));
  // THE BRANCH SURVIVES. Retirement is not deletion.
  assert.equal(out.branch_deleted, false);
  assert.equal(out.postconditions.branch_retained, true);
  assert.ok(g(["branch", "--list", "agent/claude/4-old"], env.repo).includes("agent/claude/4-old"),
    "the branch must still exist after the worktree is retired");
});

await test("a retired worktree's registration becomes archived, and keeps its evidence", async () => {
  const env = repoWithWorktree();
  const measured = envObserve(env);
  const out = X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    expectedFingerprint: measured.fingerprint,
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: "wt-somewhere-else", s7State: "retirable",
  });
  assert.equal(out.ok, true);
  assert.equal(out.postconditions.registration_provenance, "archived");
  const REGI = await import("../lib/vacilando/worktree-registration.mjs");
  const rows = REGI.listRegisteredWorktrees({ root: env.root });
  const row = rows.find((r) => r.name === env.name);
  assert.equal(row.provenance, "archived");
  assert.equal(row.managed, false);
  assert.ok(row.retirement_evidence, "the gate snapshot that justified removal must survive the removal");
});

await test("NC34 — retirement never assigns a slot, port or agent", async () => {
  const env = repoWithWorktree();
  const measured = envObserve(env);
  X.executeWorktreeRetirement({
    root: env.root, worktree: env.name, repository: "repo_test",
    expectedFingerprint: measured.fingerprint,
    worktreeParent: env.parent, canonicalRoot: env.repo,
    requestingWorktree: "wt-somewhere-else", s7State: "retirable",
  });
  const REGI = await import("../lib/vacilando/worktree-registration.mjs");
  const row = REGI.listRegisteredWorktrees({ root: env.root }).find((r) => r.name === env.name);
  for (const f of ["slot", "port", "agent"]) assert.equal(row[f] ?? null, null, `retirement must not assign ${f}`);
});

await test("NC36 — naming a worktree on the command line does not make it look occupied", () => {
  // The live defect: `vac worktree-retire <name> --apply` counted its own argv
  // as two live providers, so the command blocked the very worktree it named.
  // Occupancy is a path, not a word.
  const env = repoWithWorktree();
  const measured = OBS.observeRetirementCandidates({
    root: env.root,
    s7Worktrees: [{ path: env.name, state: "retirable", in_git_worktree_list: true, reasons: [] }],
    processes: [
      { pid: 999001, command: `node /usr/local/bin/vac worktree-retire ${env.name} --apply` },
      { pid: 999002, command: `grep ${env.name} /var/log/x` },
    ],
    worktreeParent: env.parent,
    requestingWorktree: "wt-somewhere-else",
    repository: "repo_test",
  })[0];
  assert.equal(measured.state, "candidate", `mere mention must not occupy: ${measured.reason}`);
});

await test("NC37 — a process running INSIDE the worktree path does occupy it", () => {
  const env = repoWithWorktree();
  const measured = OBS.observeRetirementCandidates({
    root: env.root,
    s7Worktrees: [{ path: env.name, state: "retirable", in_git_worktree_list: true, reasons: [] }],
    processes: [{ pid: 999003, command: `node ${env.path}/web/node_modules/.bin/next dev -p 3011` }],
    worktreeParent: env.parent,
    requestingWorktree: "wt-somewhere-else",
    repository: "repo_test",
  })[0];
  assert.equal(measured.state, "blocked");
  assert.ok(measured.blocked_by.includes("no_live_provider"));
  assert.ok(measured.blocked_by.includes("no_live_dev_server"), "a next dev in the path is a dev server");
});

await test("NC38 — the requester identity comes from the record, in every consumer", () => {
  // The live defect: the evidence collector read inputs.requestingWorktree,
  // which the CLI never sends, so not_self_retirement was unmeasured there
  // while the CLI had measured it. Different gate sets, different fingerprints,
  // and a correct retirement was denied as stale. Wiring a rule in two of three
  // places is not wiring it.
  const src = readFileSync(new URL("../lib/vacilando/director-evidence.mjs", import.meta.url), "utf8");
  assert.ok(
    /requestingWorktree:\s*rec\?\.worktree_path/.test(src),
    "the evidence collector must take the requester from the record",
  );
  const ga = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
  assert.ok(
    /requestingWorktree:\s*rec\.worktree_path/.test(ga),
    "defaultExecute must take the requester from the record",
  );
});

await test("NC39 — every executor fallback identifier actually resolves", () => {
  // The live defect: `action.inputs?.runtimeRoot || runtimeRoot()` appeared in
  // two executors and runtimeRoot was never defined in that module. The
  // reconciliation CLI always sends inputs.runtimeRoot, so the `||`
  // short-circuited and the ReferenceError stayed latent until the first caller
  // whose normalised inputs omitted the key — which was retirement, because
  // validateInputs drops whatever it does not name.
  const src = readFileSync(new URL("../lib/vacilando/trusted-host-actions.mjs", import.meta.url), "utf8");
  const used = [...src.matchAll(/\|\|\s*([a-zA-Z_$][\w$]*)\(\)/g)].map((m) => m[1]);
  for (const fn of new Set(used)) {
    const defined = new RegExp(`(function\\s+${fn}\\s*\\(|const\\s+${fn}\\s*=|\\b${fn}\\b[^\\n]*from\\s+")`).test(src);
    assert.ok(defined, `${fn}() is used as a fallback but is not defined or imported in trusted-host-actions.mjs`);
  }
});

await test("NC40 — normalised retirement inputs keep the runtime root", () => {
  const def = REG.getActionDefinition("vacilando.retire_worktree");
  const out = def.validateInputs({
    repository: "repo_alloy", worktree: "wt-old", branch: "b",
    headSha: "a".repeat(40), safetyFingerprint: "b".repeat(32), s7State: "retirable",
    runtimeRoot: "/some/root",
  });
  assert.equal(out.ok, true);
  assert.equal(out.normalized.runtimeRoot, "/some/root");
});
