#!/usr/bin/env node
/**
 * THE REGISTERED ACTION DISPATCH CONTRACT.
 *
 * There is a layer between "the action is registered" and "the executor works"
 * that nothing was testing, and every recent live failure came out of it:
 *
 *   registered action
 *     -> governed dispatch selection
 *       -> trusted-host action wrapper
 *         -> dependency / factory construction   <- HERE
 *           -> executor call
 *             -> result propagation              <- AND HERE
 *
 * This is not executor unit testing (the executor is called directly by 29 other
 * cases and they were all green), not registration reachability testing (the
 * registry entry was correct), and not schema testing (the inputs validated).
 * It is the seam, and the seam is where the approvals were spent.
 *
 * SPECIMEN. `repository.promote_metadata` built its git as an inline arrow
 * closing over `defaultGit`, which its module never imported. A ReferenceError
 * on a free variable fires when the closure RUNS, and the only thing that ran it
 * was a real dispatch of an operator-approved action. Live result:
 * `metadata_promote_threw: defaultGit is not defined`, after approval.
 *
 * So these cases go through `executeTrustedHostAction` - the same entry point a
 * live governed action uses - against a throwaway repository. Nothing real is
 * mutated: `origin` is a bare repo in a temp directory, created and deleted here.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate the store BEFORE importing: the path is read per call.
const ROOT = mkdtempSync(join(tmpdir(), "dispatch-contract-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const { describeExecutionFailure } = await import("../lib/vacilando/governed-action-request.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const WF = ".github/workflows/vacilando-tier2.yml";
const g = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** A throwaway repository with a bare `origin` carrying main. Nothing real. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "dispatch-repo-"));
  const bare = join(base, "origin.git");
  const work = join(base, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  execFileSync("git", ["clone", "-q", bare, work]);
  g(["config", "user.email", "t@example.com"], work);
  g(["config", "user.name", "t"], work);
  writeFileSync(join(work, "product.ts"), "export const real = 1;\n");
  g(["add", "product.ts"], work);
  g(["commit", "-qm", "product code that must never move"], work);
  g(["push", "-q", "origin", "main"], work);
  const mainSha = g(["rev-parse", "HEAD"], work);

  // The candidate: exactly one commit adding exactly one workflow file.
  g(["checkout", "-q", "-b", "candidate"], work);
  mkdirSync(join(work, ".github", "workflows"), { recursive: true });
  writeFileSync(join(work, WF), "name: Tier 2\non:\n  workflow_dispatch:\n");
  g(["add", WF], work);
  g(["commit", "-qm", "chore(repo-ops): tier 2 workflow definition"], work);
  const candidate = g(["rev-parse", "HEAD"], work);
  return { base, bare, work, mainSha, candidate };
}

/** A pre-authorized action record, written straight into the isolated store. */
function seedAction(inputs, { actionType = ACTION_TYPES.REPOSITORY_PROMOTE_METADATA } = {}) {
  const dir = join(ROOT, "vacilando", "trusted-host-actions");
  mkdirSync(dir, { recursive: true });
  const id = `tha_test_${Math.random().toString(16).slice(2, 10)}`;
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    schema_version: "vacilando.trusted_host_action.v1",
    id,
    missionId: "mission-dispatch-contract",
    actionType,
    actionVersion: 1,
    requestedBy: "director",
    requestedInputs: inputs,
    inputs,
    authorizationIdentity: { scope: "mission-dispatch-contract", actionType, resolved: true },
    authorizationState: "authorized",
    authorizationId: "authz-test",
    executionState: "not_started",
    state: "authorized",
    retryState: { attempts: 0, maxAttempts: 1 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, null, 2));
  return id;
}

/** The normalized inputs, exactly as the validator would hand them to the wrapper. */
const normalized = (f) => ({
  repository: "example/repo",
  target: "main",
  candidate: f.candidate,
  baseRef: f.mainSha,
  expectedCommits: [f.candidate],
  expectedFiles: [WF],
  reason: null,
  destinationRef: f.mainSha,
  remote: "origin",
  worktreePath: f.work,
  mainBefore: f.mainSha,
  dedupeKey: `repository_promote_metadata:main:${f.candidate.slice(0, 12)}:${f.mainSha.slice(0, 12)}`,
});

const dispatch = (id) =>
  TH.executeTrustedHostAction(id, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });

/* ── D1: the whole seam, end to end, through the real entry point ─────────── */

test("D1 — an approved metadata promotion reaches its executor through the real dispatcher", () => {
  const f = fixture();
  try {
    const out = dispatch(seedAction(normalized(f)));
    assert.notEqual(out.error, "unknown_action_type");
    assert.notEqual(out.error, "action_unavailable");
    assert.equal(out.ok, true, `dispatch failed: ${out.error || ""} — ${out.detail || ""}`);
    // This is the assertion the 29 executor cases could not make: the git the
    // wrapper constructs is the one that actually ran.
    assert.equal(out.action.result.product_files_changed, false);
    assert.deepEqual(out.action.result.files, [WF]);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("D1a — and the write it performed is exactly one workflow file", () => {
  const f = fixture();
  try {
    const out = dispatch(seedAction(normalized(f)));
    assert.equal(out.ok, true, out.detail || out.error || "");
    const after = g(["rev-parse", "refs/heads/main"], f.bare);
    assert.notEqual(after, f.mainSha, "main did not move");
    const changed = execFileSync("git", ["diff", "--name-only", `${f.mainSha}..${after}`], { cwd: f.work, encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    assert.deepEqual(changed, [WF]);
    const count = g(["rev-list", "--count", `${f.mainSha}..${after}`], f.bare);
    assert.equal(count, "1", "exactly one commit may reach main");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("D1b — the caller's index is untouched by the build", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.work, "staged.txt"), "operator work in progress\n");
    g(["add", "staged.txt"], f.work);
    const before = g(["diff", "--cached", "--name-only"], f.work);
    dispatch(seedAction(normalized(f)));
    assert.equal(g(["diff", "--cached", "--name-only"], f.work), before,
      "a governed build must not discard what the named worktree had staged");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

/* ── D2: the factory the seam exists to cover ─────────────────────────────── */

test("D2 — the wrapper's git factory is constructable and runs", () => {
  // The exact object the dispatch wrapper builds. An inline arrow over an
  // unimported symbol is syntactically valid and throws only when called.
  const f = fixture();
  try {
    const git = TH.metadataPromotionGit(f.work);
    assert.equal(typeof git, "function");
    const r = git(["rev-parse", "--absolute-git-dir"]);
    assert.equal(r.status, 0, r.stderr || "");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("D2a — a missing worktree is refused by the wrapper, not thrown", () => {
  const n = normalized({ candidate: "a".repeat(40), mainSha: "b".repeat(40), work: "" });
  delete n.worktreePath;
  const out = dispatch(seedAction(n));
  assert.equal(out.ok, false);
  assert.equal(out.error, "worktree_path_missing");
});

/* ── D5: the detail the operator is shown ─────────────────────────────────── */

test("D5 — an executor failure's actionable sentence survives to the operator surface", () => {
  const f = fixture();
  try {
    // A safe synthetic failure: the candidate is absent from the worktree.
    const n = normalized(f);
    n.candidate = "0".repeat(40);
    n.expectedCommits = [n.candidate];
    const out = dispatch(seedAction(n));
    assert.equal(out.ok, false);
    assert.ok(out.detail, "failTrustedAction must return the detail it recorded");
    // The governed boundary is what the operator actually reads.
    const shown = describeExecutionFailure(out);
    assert.match(shown, /0{12}/, "the sentence must name what was missing");
    assert.notEqual(shown, out.error, "collapsing to the bare code is the defect");
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("D5a — the historical specimen shape is carried, not collapsed", () => {
  // The live failure: operator saw `metadata_promote_threw` and never the cause.
  const shown = describeExecutionFailure({
    ok: false, error: "metadata_promote_threw",
    detail: "metadata executor specimen failure",
    action: { failureReason: "metadata_promote_threw" },
  });
  assert.match(shown, /metadata executor specimen failure/);
  assert.match(shown, /metadata_promote_threw/);
});

test("D5b — and a secret in that detail does not reach the operator", () => {
  const shown = describeExecutionFailure({
    ok: false, error: "metadata_promote_threw",
    detail: "metadata executor specimen failure while reading postgresql://u:p@host:5432/db",
  });
  assert.match(shown, /metadata executor specimen failure/, "actionable detail survives");
  assert.doesNotMatch(shown, /u:p@host/, "secrets do not");
  assert.match(shown, /\[redacted\]/);
});

test("D5c — a detail that merely repeats the code adds no noise", () => {
  assert.equal(
    describeExecutionFailure({ ok: false, error: "metadata_target_head_changed", detail: "metadata_target_head_changed" }),
    "metadata_target_head_changed",
  );
});

/* ── R: the result shape a consumer is promised ───────────────────────────── */

const { getActionDefinition } = await import("../lib/vacilando/trusted-host-action-registry.mjs");

test("R1 — the dispatched result carries every field the registry declares", () => {
  /*
   * CHECKED AT RUNTIME, ON THE REAL DISPATCHED RESULT — deliberately not by
   * reading the source.
   *
   * A static version of this was written first: for each action, regex the
   * executor body for each declared outputSchema key. It reported
   * `database.apply_promoted_migration` as dropping `target` and
   * `recensus_required`. Both are present. `target` is a shorthand property
   * (`{ ...publicResult, ok: true, target }`) and `recensus_required` arrives
   * through the spread from `publicProductionApplyResult`. A `key:` regex can
   * see neither, so the check produced a false defect report against a
   * database-mutating action.
   *
   * The lesson is the gate's design, not the regex: a result-shape contract has
   * to be asserted on a result that was actually produced.
   */
  const f = fixture();
  try {
    const out = dispatch(seedAction(normalized(f)));
    assert.equal(out.ok, true, out.detail || out.error || "");
    const declared = Object.keys(getActionDefinition(ACTION_TYPES.REPOSITORY_PROMOTE_METADATA).outputSchema || {});
    assert.ok(declared.length > 0, "the action must declare what its consumers get");
    const missing = declared.filter((k) => !(k in out.action.result));
    assert.deepEqual(missing, [],
      `declared to consumers but absent from the dispatched result: ${missing.join(", ")}`);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("R1a — and the declared fields are not silently null on a successful write", () => {
  const f = fixture();
  try {
    const r = dispatch(seedAction(normalized(f))).action.result;
    assert.equal(typeof r.main_before, "string");
    assert.equal(typeof r.main_after, "string");
    assert.notEqual(r.main_after, r.main_before, "a successful write moves the branch");
    assert.equal(typeof r.commit, "string");
    assert.equal(r.product_files_changed, false);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
