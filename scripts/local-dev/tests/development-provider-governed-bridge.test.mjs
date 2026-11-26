/**
 * Provider prompt → governed action → automatic resume.
 *
 * The danger in this slice is specific: it turns a provider's attempted
 * privileged command into a real governed request. Get it wrong and Vacilando
 * either files approvals for work that cannot execute, or lets the raw command
 * run alongside its own executor. Most of what follows guards those two.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const C = await import("../lib/vacilando/provider-capability-resolver.mjs");
const B = await import("../lib/vacilando/provider-governed-bridge.mjs");

const root = () => mkdtempSync(join(tmpdir(), "pbridge-"));
const MIGRATION = "supabase/migrations/20260826120000_h1_person_health_facts.sql";
const REAL_CMD = `docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < ${MIGRATION}`;
const CAPS = ["database.apply_migration", "repository.push", "repository.merge_pull_request", "repository.delete_remote_branch"];

const g = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** A repo where the migration exists on origin/staging (or not). */
function repoWith({ onStaging = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), "pbrepo-"));
  const origin = join(base, "origin.git");
  const repo = join(base, "repo");
  mkdirSync(repo);
  g(["init", "-q", "--bare", origin], base);
  g(["init", "-q", "-b", "staging"], repo);
  g(["config", "user.email", "t@e.com"], repo); g(["config", "user.name", "t"], repo);
  mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "x");
  if (onStaging) writeFileSync(join(repo, MIGRATION), "-- health facts\n");
  g(["add", "."], repo); g(["commit", "-qm", "base"], repo);
  g(["remote", "add", "origin", origin], repo);
  g(["push", "-q", "origin", "staging"], repo);
  if (!onStaging) {
    // Present only in the local checkout — never acceptable.
    writeFileSync(join(repo, MIGRATION), "-- health facts\n");
    g(["add", "."], repo); g(["commit", "-qm", "local only"], repo);
  }
  g(["fetch", "-q", "--prune", "origin"], repo);
  return repo;
}

const resolveReal = (repo) => C.resolveProviderCapability({
  command: REAL_CMD, repository: "ksquared-16/alloy", repoRoot: repo, registeredCapabilities: CAPS,
});

/* ── Resolution ───────────────────────────────────────────────────────────── */

await test("the real Trust Runtime command resolves to database.apply_migration", () => {
  const r = resolveReal(repoWith());
  assert.equal(r.resolution, "registered_governed_capability");
  assert.equal(r.capability, "database.apply_migration");
  assert.equal(r.executable, true);
  assert.equal(r.environment, "certification", "alloy-cert is the certification stack, not staging");
  assert.equal(r.canonical_inputs.migrations[0].version, "20260826120000");
});

await test("NC1 — an unknown prompt cannot fabricate a governed capability", () => {
  for (const cmd of ["echo hello", "docker exec -i thing bash", "psql -c 'select 1'", "some nonsense"]) {
    const r = C.resolveProviderCapability({ command: cmd, repoRoot: repoWith(), registeredCapabilities: CAPS });
    assert.notEqual(r.resolution, "registered_governed_capability", cmd);
  }
});

await test("NC12 — missing migration content is never executable", () => {
  // The false state this system has already been burned by: an approval the
  // operator can grant and the executor can only fail.
  const r = resolveReal(repoWith({ onStaging: false }));
  assert.equal(r.resolution, "registered_governed_capability");
  assert.equal(r.executable, false);
  assert.equal(r.blocked_reason, "migration_content_not_at_canonical_sha");
  assert.ok(r.prerequisite);
});

await test("a capability not registered on this host is unsupported, not invented", () => {
  const r = C.resolveProviderCapability({ command: REAL_CMD, repoRoot: repoWith(), registeredCapabilities: ["repository.push"] });
  assert.equal(r.resolution, "unsupported_privileged_action");
});

/* ── Executor selection ───────────────────────────────────────────────────── */

await test("NC2/NC10 — a trusted-executor capability may NEVER answer the provider", () => {
  const r = resolveReal(repoWith());
  const e = C.selectExecutor(r);
  assert.equal(e.mode, "trusted_executor");
  assert.equal(e.may_answer_provider, false);
  // The worker cannot choose otherwise: selection is a function of the
  // capability, not of anything the prompt or the provider supplies.
  assert.equal(C.selectExecutor({ ...r, executor_mode: "trusted_executor" }).may_answer_provider, false);
});

await test("NC3 — the governed executor and the raw command cannot both run", () => {
  const r = resolveReal(repoWith());
  const plan = B.continuationPlan({
    id: "b1", session_id: "%16", run_id: "e1", state: "resolved",
    may_answer_provider: C.selectExecutor(r).may_answer_provider,
    capability: r.capability, attempted_operation: { migration_path: MIGRATION },
  });
  assert.equal(plan.action, "dismiss_then_continue");
  assert.equal(plan.dismissal, "decline_raw_command");
  assert.notEqual(plan.action, "answer_narrow_affirmative");
});

/* ── Bridge lifecycle, dedupe, durability ─────────────────────────────────── */

const openReal = (r, root, over = {}) => B.openBridge({
  root, laneId: "lane_trust", runId: "erun_1", sessionId: "%16", promptFingerprint: "fp1",
  resolution: r, executor: C.selectExecutor(r), ...over,
});

await test("a bridge is opened, persisted, and survives a Gateway restart", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const out = openReal(r, rt);
  assert.equal(out.ok, true);
  assert.equal(out.bridge.state, "governed");
  // NC14: a fresh read simulates a restart — nothing is held in memory.
  const reread = B.getBridge({ root: rt, id: out.bridge.id });
  assert.equal(reread.id, out.bridge.id);
  assert.equal(reread.content_fingerprint, r.content_fingerprint);
  assert.equal(reread.may_answer_provider, false);
});

await test("NC4 — a duplicate prompt cannot create a duplicate governed action", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const pending = [{ request_id: "gar_x", action_key: "database.apply_migration", status: "awaiting_operator",
    inputs: { expectedSha: r.canonical_inputs.expectedSha, environment: "certification" } }];
  const a = openReal(r, rt, { existingActions: pending });
  const b = openReal(r, rt, { existingActions: pending });
  assert.equal(a.bridge.id, b.bridge.id, "same operation, same bridge");
  assert.equal(a.dedupe, "attached_pending");
  assert.equal(a.bridge.governed_request_id, "gar_x");
  assert.equal(B.listBridges({ root: rt }).length, 1);
});

await test("NC7 — a prior FAILED action is not presented as still needing approval", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const failed = [{ request_id: "gar_f", action_key: "database.apply_migration", status: "failed",
    inputs: { expectedSha: r.canonical_inputs.expectedSha, environment: "certification" } }];
  const out = openReal(r, rt, { existingActions: failed });
  assert.equal(out.dedupe, "prior_failed");
  assert.equal(out.bridge.governed_request_id, null, "a failed action is not a pending approval");
});

await test("an already-complete action is reused rather than re-filed", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const done = [{ request_id: "gar_c", action_key: "database.apply_migration", status: "complete",
    inputs: { expectedSha: r.canonical_inputs.expectedSha, environment: "certification" } }];
  assert.equal(openReal(r, rt, { existingActions: done }).dedupe, "reuse_complete");
});

await test("NC12b — a non-executable capability is recorded but never filed", () => {
  const rt = root();
  const r = resolveReal(repoWith({ onStaging: false }));
  const out = openReal(r, rt);
  assert.equal(out.dedupe, "not_executable");
  assert.equal(out.bridge.governed_request_id, null);
  assert.equal(out.bridge.executable, false);
});

/* ── Truth ladder ─────────────────────────────────────────────────────────── */

await test("NC8 — complete-but-not-effective does NOT resume the provider as success", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const id = openReal(r, rt).bridge.id;
  B.attachGovernedRequest({ root: rt, id, requestId: "gar_x" });
  const unverified = B.advanceBridge({ root: rt, id, actionStatus: "complete", effective: null });
  assert.equal(unverified.bridge.state, "executing_elsewhere", "a successful exit is not proof the schema changed");
  assert.equal(B.continuationPlan(unverified.bridge).action, "hold");
  const verified = B.advanceBridge({ root: rt, id, actionStatus: "complete", effective: true });
  assert.equal(verified.bridge.state, "resolved");
});

await test("verification negative marks the bridge failed, not resolved", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const id = openReal(r, rt).bridge.id;
  const out = B.advanceBridge({ root: rt, id, actionStatus: "complete", effective: false });
  assert.equal(out.bridge.state, "failed");
});

await test("NC6/NC7b — a denied action is dismissed, never answered affirmatively", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const id = openReal(r, rt).bridge.id;
  const out = B.advanceBridge({ root: rt, id, actionStatus: "denied" });
  assert.equal(out.bridge.state, "dismissed");
  const plan = B.continuationPlan(out.bridge);
  assert.equal(plan.action, "dismiss_then_continue");
  assert.equal(plan.dismissal, "decline_raw_command");
  assert.match(plan.message, /denied/i);
});

await test("NC7c — a failed execution does not revert to awaiting_operator", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const id = openReal(r, rt).bridge.id;
  const out = B.advanceBridge({ root: rt, id, actionStatus: "failed", failure: "exit 1" });
  assert.equal(out.bridge.state, "failed");
  assert.notEqual(out.bridge.state, "waiting_decision");
  assert.match(B.continuationPlan(out.bridge).message, /failed/i);
});

await test("NC5/NC13 — a stale prompt cannot receive a decision for the old fingerprint", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const id = openReal(r, rt).bridge.id;
  const same = B.markStale({ root: rt, id, observedFingerprint: "fp1" });
  assert.equal(same.stale, false);
  const moved = B.markStale({ root: rt, id, observedFingerprint: "fp-different" });
  assert.equal(moved.stale, true);
  assert.equal(moved.bridge.state, "stale");
  assert.equal(B.continuationPlan(moved.bridge).action, "hold");
});

/* ── Health ───────────────────────────────────────────────────────────────── */

await test("NC19 — a completed request with a still-blocked provider is a control-plane failure", () => {
  const v = B.bridgeHealthViolations({
    bridges: [{ id: "b1", lane_id: "l", state: "waiting_decision", governed_request_id: "gar_x", content_fingerprint: "f", updated_at: new Date().toISOString() }],
    governedActions: [{ request_id: "gar_x", status: "complete" }],
  });
  assert.ok(v.some((x) => x.kind === "request_complete_provider_still_blocked"));
});

await test("duplicate live bridges for one operation are detected", () => {
  const now = new Date().toISOString();
  const v = B.bridgeHealthViolations({
    bridges: [
      { id: "b1", lane_id: "l", state: "waiting_decision", governed_request_id: "g1", content_fingerprint: "same", updated_at: now },
      { id: "b2", lane_id: "l", state: "waiting_decision", governed_request_id: "g2", content_fingerprint: "same", updated_at: now },
    ],
    governedActions: [],
  });
  assert.ok(v.some((x) => x.kind === "duplicate_active_bridges"));
});

await test("a terminal bridge raises no violations", () => {
  assert.equal(B.bridgeHealthViolations({
    bridges: [{ id: "b1", lane_id: "l", state: "resolved", content_fingerprint: "f", updated_at: new Date().toISOString() }],
    governedActions: [],
  }).length, 0);
});

await test("NC11 — the bridge carries only canonical evidence, never prompt-supplied inputs", () => {
  const rt = root();
  const r = resolveReal(repoWith());
  const out = openReal(r, rt);
  // Everything executable comes from the resolver's canonical_inputs, which are
  // derived from git and the registry — never from text the provider printed.
  assert.deepEqual(Object.keys(out.bridge.canonical_inputs).sort(),
    ["environment", "expectedSha", "migrations", "repository"]);
  assert.match(out.bridge.canonical_inputs.expectedSha, /^[0-9a-f]{40}$/);
});

await test("NC1b — mentioning a migration is not attempting one", () => {
  // A surviving mutation replaced the structural psql test with a prose match on
  // the word "migration". Every NC1 command avoided that word, so the mutation
  // lived. Resolution must key on the OPERATION, never on vocabulary.
  const repo = repoWith();
  for (const cmd of [
    `cat ${MIGRATION}`,                                   // reads the exact file
    `ls supabase/migrations/`,                            // lists the exact directory
    `git log --oneline -- ${MIGRATION}`,                  // history of the exact file
    `echo "apply the health facts migration to cert"`,    // describes it in prose
    `grep -n "person_health_facts" ${MIGRATION}`,         // searches inside it
    `wc -l supabase/migrations/20260826120000_h1_person_health_facts.sql`,
    // THE ONE THAT MATTERS. Names the migration AND the cert stack, so the
    // environment resolves — only the structural psql test can reject it. The
    // earlier cases were all saved by environment resolution failing, which
    // meant they passed for the wrong reason and a prose-matching mutation
    // survived them.
    `docker exec -i supabase_db_alloy-cert cat ${MIGRATION}`,
    `docker exec -i supabase_db_alloy-cert ls supabase/migrations/`,
  ]) {
    const r = C.resolveProviderCapability({ command: cmd, repoRoot: repo, registeredCapabilities: CAPS });
    assert.notEqual(r.resolution, "registered_governed_capability", `must not resolve: ${cmd}`);
  }
  // And the genuine apply still does.
  assert.equal(C.resolveProviderCapability({ command: REAL_CMD, repoRoot: repo, registeredCapabilities: CAPS }).resolution,
    "registered_governed_capability");
});
