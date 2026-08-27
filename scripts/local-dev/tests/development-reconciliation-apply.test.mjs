/**
 * S7 governed reconciliation apply.
 *
 * DOCTRINE UNDER TEST: reality corrects metadata; metadata never kills reality.
 * The controls below are the substance — this executor's whole value is what it
 * REFUSES to touch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const R = await import("../lib/vacilando/reconciliation-apply.mjs");

const root = () => mkdtempSync(join(tmpdir(), "vac-rec-"));
const portObs = (over = {}) => ({
  port: 3011, registered: "wt1", recorded_worktree: "wt1", recorded_pid: 4242,
  alive: false, serving_pid: null, observed_owner: null, verdict: "stale_record", ...over,
});
const obs = (ports = [], worktrees = []) => ({ ports, worktrees });

await test("SOURCE GUARD — the executor cannot signal, stop or delete anything", () => {
  const src = readFileSync(new URL("../lib/vacilando/reconciliation-apply.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of [
    "SIGTERM", "SIGKILL", "execSync", "spawnSync", "execFileSync",
    "worktree remove", "rm -rf", "rmSync", "rimraf", "branch -D", "push --delete",
  ]) {
    assert.ok(!code.includes(forbidden), `the apply executor must not contain ${forbidden}`);
  }
  // process.kill appears exactly once and ONLY as a signal-0 liveness probe,
  // which sends nothing. Bounding it is stronger than banning the substring and
  // then quietly needing an exception: any real signal fails this.
  const kills = code.match(/process\.kill\([^)]*\)/g) || [];
  assert.equal(kills.length, 1, "only the liveness probe may reference process.kill");
  assert.match(kills[0], /process\.kill\(pid,\s*0\)/, "and it must send signal 0, never a real signal");
  // It may unlink a PID RECORD, and that is the only unlink permitted.
  assert.equal((code.match(/unlinkSync\(/g) || []).length, 1, "exactly one metadata unlink is allowed");
  assert.match(code, /unlinkSync\(pidFile\)/, "and it must be the pid record");
});

await test("NC4/NC11 — destructive kinds can never enter the safe apply set", () => {
  for (const k of R.WITHHELD_CORRECTION_KINDS) assert.equal(R.isSafeCorrection(k), false, k);
  for (const k of ["retire_worktree", "delete_branch", "stop_server", "kill_process", "reassign_port"]) {
    assert.equal(R.isSafeCorrection(k), false, k);
    const out = R.applyCorrection({ kind: k, path: "wt9", port: 3011 }, { root: root(), observation: obs() });
    assert.equal(out.ok, false);
    assert.equal(out.skipped, "not_in_safe_allowlist");
  }
  assert.ok(Object.isFrozen(R.SAFE_CORRECTION_KINDS));
  assert.equal(R.SAFE_CORRECTION_KINDS.length, 4, "this slice adds no new correction classes");
});

await test("NC2/NC3 — foreign-owner and ambiguous ports are withheld, never corrected", () => {
  const plan = R.buildReconciliationPlan(obs([
    portObs({ port: 3012, verdict: "foreign_owner", observed_owner: "wt-other", serving_pid: 111 }),
    portObs({ port: 3013, verdict: "ambiguous", serving_pid: 222 }),
  ]));
  assert.equal(plan.corrections.length, 0, "neither may produce an applicable correction");
  const kinds = plan.withheld.map((w) => w.kind);
  assert.ok(kinds.includes("reassign_port"));
  assert.ok(kinds.includes("any_correction"));
  assert.ok(plan.withheld.every((w) => w.reason), "every withholding must state why");
});

await test("NC7 — a dead-pid clear cannot target a now-live pid or a now-served port", () => {
  const r = root();
  mkdirSync(join(r, "pids"), { recursive: true });
  writeFileSync(join(r, "pids", "wt1.pid"), "4242");
  // Now alive.
  let out = R.applyCorrection({ kind: "clear_dead_pid_record", port: 3011 },
    { root: r, observation: obs([portObs({ alive: true })]) });
  assert.equal(out.ok, false); assert.equal(out.skipped, "recorded_pid_is_alive");
  // Now served by a live process.
  out = R.applyCorrection({ kind: "clear_dead_pid_record", port: 3011 },
    { root: r, observation: obs([portObs({ serving_pid: 777 })]) });
  assert.equal(out.ok, false); assert.equal(out.skipped, "a_live_process_now_serves_this_port");
  // No longer classified stale.
  out = R.applyCorrection({ kind: "clear_dead_pid_record", port: 3011 },
    { root: r, observation: obs([portObs({ verdict: "matched" })]) });
  assert.equal(out.ok, false); assert.equal(out.skipped, "no_longer_stale");
  assert.ok(existsSync(join(r, "pids", "wt1.pid")), "the record must survive every refusal");
  // And the genuine case works.
  out = R.applyCorrection({ kind: "clear_dead_pid_record", port: 3011 }, { root: r, observation: obs([portObs()]) });
  assert.equal(out.ok, true);
  assert.equal(existsSync(join(r, "pids", "wt1.pid")), false, "only the dead RECORD is removed");
});

await test("NC8 — a directory git does not list is never adopted as a worktree", () => {
  const r = root();
  for (const inGit of [false, null, undefined]) {
    const out = R.applyCorrection({ kind: "adopt_unmanaged_worktree", path: "wt-ghost" },
      { root: r, observation: obs([], [{ path: "wt-ghost", managed: false, in_git_worktree_list: inGit, state: "unmanaged" }]) });
    assert.equal(out.ok, false, String(inGit));
    assert.equal(out.skipped, "not_in_git_worktree_list");
  }
  // Unknown is not yes: only an explicit true adopts.
  const ok = R.applyCorrection({ kind: "adopt_unmanaged_worktree", path: "wt-real" },
    { root: r, observation: obs([], [{ path: "wt-real", managed: false, in_git_worktree_list: true, state: "unmanaged" }]) });
  assert.equal(ok.ok, true);
});

await test("NC6 — adoption records DISCOVERED provenance and never claims managed", () => {
  const r = root();
  R.applyCorrection({ kind: "adopt_unmanaged_worktree", path: "wt-real" },
    { root: r, observation: obs([], [{ path: "wt-real", managed: false, in_git_worktree_list: true, state: "unmanaged" }]) });
  const rec = JSON.parse(readFileSync(join(r, "reconciliation", "worktree-wt-real.json"), "utf8"));
  assert.equal(rec.provenance, "discovered");
  assert.equal(rec.managed, false, "adoption must never claim Vacilando created it");
  assert.equal(rec.retirement_state, null, "no retirement state may be inferred");
  R.applyCorrection({ kind: "adopt_observed_server", port: 3011 },
    { root: r, observation: obs([portObs({ verdict: "unregistered_server", serving_pid: 555, registered: null })]) });
  const prec = JSON.parse(readFileSync(join(r, "reconciliation", "port-3011.json"), "utf8"));
  assert.equal(prec.provenance, "discovered");
  assert.equal(prec.managed, false);
});

await test("NC1/NC9 — a stale plan applies NOTHING, not even its still-valid parts", () => {
  const r = root();
  mkdirSync(join(r, "pids"), { recursive: true });
  writeFileSync(join(r, "pids", "wt1.pid"), "4242");
  const before = obs([portObs(), portObs({ port: 3012, registered: "wt2", verdict: "stale_record" })]);
  const plan = R.buildReconciliationPlan(before);
  assert.equal(plan.corrections.length, 2);
  // One port comes back to life between approval and execution.
  const after = obs([portObs({ alive: true }), portObs({ port: 3012, registered: "wt2", verdict: "stale_record" })]);
  const out = R.applyReconciliationPlan(plan, { root: r, freshObservation: after });
  assert.equal(out.ok, false);
  assert.equal(out.error, "stale_plan");
  assert.equal(out.reason, "observed_state_changed");
  assert.deepEqual(out.applied, [], "a stale plan must apply nothing at all");
  assert.ok(existsSync(join(r, "pids", "wt1.pid")), "and must touch no metadata");
  assert.notEqual(out.expected_fingerprint, out.actual_fingerprint);
});

await test("NC10 — one correction cannot authorize a different correction", () => {
  const r = root();
  const observation = obs([portObs({ verdict: "unregistered_server", serving_pid: 5, registered: null })]);
  // A plan approved for an adoption cannot be used to clear a pid record.
  const out = R.applyCorrection({ kind: "clear_dead_pid_record", port: 3011 }, { root: r, observation });
  assert.equal(out.ok, false, "the port's own precondition governs, not the plan's membership");
  assert.equal(out.skipped, "no_longer_stale");
});

await test("FINGERPRINT — covers the correction set AND the safety state it rests on", () => {
  const base = obs([portObs()]);
  const p1 = R.buildReconciliationPlan(base);
  // Same corrections, different liveness underneath.
  const p2 = R.buildReconciliationPlan(obs([portObs({ recorded_pid: 9999 })]));
  assert.notEqual(p1.fingerprint, p2.fingerprint, "safety state must be bound, not just the action list");
  // Deterministic for identical input.
  assert.equal(p1.fingerprint, R.buildReconciliationPlan(base).fingerprint);
  assert.match(p1.fingerprint, /^[0-9a-f]{32}$/);
  assert.equal(p1.policy_version, R.RECONCILIATION_POLICY_VERSION);
  assert.ok(p1.plan_id && p1.generated_at);
});

await test("VERDICT NORMALISATION — the probe's hyphenated verdicts still plan", () => {
  // The observer emits stale-record / unregistered-server; the classifier
  // switches on stale_record / unregistered_server. Unnormalised, every plan
  // came back empty and reconciliation silently did nothing.
  const plan = R.buildReconciliationPlan(obs([
    { ...portObs(), verdict: "stale-record" },
    { ...portObs({ port: 3012, registered: null, serving_pid: 8 }), verdict: "unregistered-server" },
  ]));
  assert.equal(plan.corrections.length, 2, "hyphenated verdicts must still produce corrections");
  assert.deepEqual(plan.corrections.map((c) => c.kind).sort(), ["adopt_observed_server", "clear_dead_pid_record"]);
});

await test("UNSUPPORTED — a planner action with no apply implementation is surfaced, not applied", () => {
  const plan = R.buildReconciliationPlan(obs([], [{ path: "wt-old", managed: false, state: "retirable" }]));
  assert.equal(plan.corrections.length, 0);
  assert.ok(plan.withheld.some((w) => w.kind === "retire_worktree"), "retirement stays an operator decision");
});

await test("NC-SPLIT — an action outside the allowlist can never become applicable", () => {
  // Behavioural, not a source check: today every planner action happens to be
  // allowlisted, so the filter is a no-op no control could see fail. Feeding a
  // synthetic unsafe action proves the split itself.
  const out = R.applicableCorrections([
    { kind: "clear_dead_pid_record", port: 3011 },
    { kind: "retire_worktree", path: "wt-old" },
    { kind: "stop_server", port: 3012 },
    { kind: "adopt_unmanaged_worktree", path: "wt-new" },
  ]);
  assert.deepEqual(out.corrections.map((c) => c.kind), ["clear_dead_pid_record", "adopt_unmanaged_worktree"]);
  assert.deepEqual(out.unsupported.map((c) => c.kind), ["retire_worktree", "stop_server"]);
  // And nothing unsupported survives into a built plan.
  assert.equal(R.applicableCorrections([{ kind: "rm_rf_everything" }]).corrections.length, 0);
});
