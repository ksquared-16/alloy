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
const { observeReconciliation } = await import("../lib/vacilando/reconciliation-observe.mjs");
const { buildReconciliationPlan } = await import("../lib/vacilando/reconciliation-plan.mjs");

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
  // The apply executor is now provably incapable of touching a process at all.
  // Observation was split out precisely so this guard needs NO exception —
  // an exception is what makes such a guard worthless.
  assert.ok(!code.includes("process.kill"), "the apply executor must not reference process.kill at all");
  assert.ok(!code.includes("execFileSync"), "and must not shell out");
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

await test("NC6 — adoption records DISCOVERED provenance and never claims managed", async () => {
  const r = root();
  R.applyCorrection({ kind: "adopt_unmanaged_worktree", path: "wt-real" },
    { root: r, observation: obs([], [{ path: "wt-real", managed: false, in_git_worktree_list: true, state: "unmanaged" }]) });
  // Asserted through the OWNER, not a storage path. A consumer that has to
  // know where registration lives is the coupling this slice removed.
  const W = await import("../lib/vacilando/worktree-registration.mjs");
  const reg = W.resolveWorktreeRegistration({ root: r, name: "wt-real", repositoryId: "repo_alloy" });
  assert.equal(reg.known, true, "adoption must make the worktree KNOWN");
  assert.equal(reg.provenance, "discovered");
  assert.equal(reg.managed, false, "adoption must never claim Vacilando created it");
  for (const f of ["slot", "port", "agent"]) assert.ok(reg[f] == null, `${f} must not be fabricated`);
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


await test("SOURCE GUARD — the OBSERVER may read reality but never change it", async () => {
  const fsx = await import("node:fs");
  const src = fsx.readFileSync(new URL("../lib/vacilando/reconciliation-observe.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // It shells out on purpose — that is why it is a separate module — but only
  // to READ. Every git invocation here must be a read-only subcommand.
  const gitCalls = code.match(/execFileSync\("git",\s*\[[^\]]*\]/g) || [];
  assert.ok(gitCalls.length > 0, "the observer is expected to read git");
  for (const call of gitCalls) {
    assert.match(call, /"(status|rev-parse|merge-base|worktree)"/, `non-read git call: ${call}`);
    for (const w of ["remove", "prune", "checkout", "reset", "clean", "branch", "push", "rm"]) {
      assert.ok(!call.includes(`"${w}"`), `observer must not run git ${w}`);
    }
  }
  for (const forbidden of ["SIGTERM", "SIGKILL", "rm -rf", "rmSync", "unlinkSync", "writeFileSync"]) {
    assert.ok(!code.includes(forbidden), `the observer must not contain ${forbidden}`);
  }
  // Liveness probing is allowed, and only at signal 0.
  const kills = code.match(/process\.kill\([^)]*\)/g) || [];
  assert.ok(kills.every((k) => /process\.kill\(pid,\s*0\)/.test(k)), "only signal-0 liveness probes are permitted");
});

await test("CLI — the request surface cannot apply anything", async () => {
  const fsx = await import("node:fs");
  const src = fsx.readFileSync(new URL("../vac-reconcile.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // It must not import a single apply verb. Provable absence beats a promise.
  assert.ok(!code.includes("reconciliation-apply.mjs"), "the CLI must not import the apply module at all");
  for (const verb of ["applyReconciliationPlan", "applyCorrection", "writeDiscovered", "unlinkSync", "writeFileSync"]) {
    assert.ok(!code.includes(verb), `the CLI must not reference ${verb}`);
  }
  // --apply FILES a governed request; it does not execute one.
  assert.match(code, /requestGovernedAction\(/, "--apply must file a governed action");
  assert.match(code, /action_key: "vacilando\.apply_reconciliation_plan"/);
  assert.match(code, /planFingerprint: plan\.fingerprint/, "the request must bind the canonical planner's fingerprint");
  assert.match(code, /title: "Apply Vacilando reconciliation metadata"/, "human work name, not an action key");

  // No hidden force mode, and an unknown option cannot fall through to apply.
  assert.ok(!/--force/.test(code), "there must be no force mode");
  assert.match(code, /unknown option/, "an unrecognised option must be refused");
  assert.match(code, /process\.exit\(2\)/, "and must exit before any request is filed");

  // Read-only is the default: --apply must be explicitly present.
  assert.match(code, /const apply = args\.includes\("--apply"\)/);
});

await test("CLI — corrections come from the planner, never from the caller", async () => {
  const fsx = await import("node:fs");
  const code = fsx.readFileSync(new URL("../vac-reconcile.mjs", import.meta.url), "utf8");
  // The correction list handed to the request is the planner's own output.
  assert.match(code, /corrections: plan\.corrections/, "the CLI may not assemble its own correction list");
  assert.match(code, /withheld: plan\.withheld/);
  assert.ok(!/corrections:\s*\[/.test(code), "no literal correction array may be constructed");
  // And the executor re-derives regardless, so a forged list is not executable.
  const ex = fsx.readFileSync(new URL("../lib/vacilando/trusted-host-actions.mjs", import.meta.url), "utf8");
  const fn = ex.slice(ex.indexOf("executeApplyReconciliationPlanTrustedHostAction"), ex.indexOf("export function fulfillApplyReconciliationPlanForMission"));
  assert.match(fn, /buildReconciliationPlan\(/, "the executor must rebuild the plan itself");
  assert.match(fn, /rebuilt\.fingerprint !== action\.inputs\?\.planFingerprint/, "and refuse on fingerprint mismatch");
  assert.match(fn, /stale_plan/);
});

await test("EXECUTOR — re-observation gathers reality, never accepts it from inputs", async () => {
  // Live certification caught this: the executor called observeReconciliation
  // with `inputs.processes || []`, so it modelled a host with no running
  // servers, every port reclassified, and the plan could never match its own
  // fingerprint — a PERMANENT stale_plan that no correct plan could survive.
  // A re-observation that depends on the caller supplying reality is not one.
  const fsx = await import("node:fs");
  const src = fsx.readFileSync(new URL("../lib/vacilando/trusted-host-actions.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("executeApplyReconciliationPlanTrustedHostAction"),
    src.indexOf("export function fulfillApplyReconciliationPlanForMission"));
  assert.match(fn, /gatherObservation\(/, "the executor must gather observation itself");
  assert.ok(!/processes:\s*action\.inputs/.test(fn), "it must not take the process table from inputs");
  assert.ok(!/gitWorktrees:\s*action\.inputs/.test(fn), "nor the git worktree list");
  // And it still refuses on a genuine mismatch.
  assert.match(fn, /stale_plan/);
  const O = await import("../lib/vacilando/reconciliation-observe.mjs");
  assert.equal(typeof O.gatherObservation, "function");
});

await test("CONVERGENCE — a durable assignment with no server is not a correction", () => {
  // The defect: registered + no pid file was called stale_record, so every
  // stopped dev server looked like corruption AND clear_dead_pid_record
  // proposed itself forever — removing the pid file left the assignment
  // registered and the verdict unchanged. stale_record now means only what it
  // says: metadata CLAIMS a live runtime that reality disproves.
  const registeredNoServer = obs([portObs({ has_runtime_claim: false, recorded_pid: null, alive: false, serving_pid: null, verdict: "registered_inactive" })]);
  const plan = R.buildReconciliationPlan(registeredNoServer);
  assert.equal(plan.corrections.length, 0, "a stopped server with a durable assignment needs no correction");
  assert.equal(plan.withheld.length, 0, "and is not withheld either — it is simply correct");

  // A genuine stale CLAIM still produces one.
  const staleClaim = obs([portObs({ has_runtime_claim: true, recorded_pid: 4242, alive: false, serving_pid: null, verdict: "stale_record" })]);
  assert.deepEqual(R.buildReconciliationPlan(staleClaim).corrections.map((c) => c.kind), ["clear_dead_pid_record"]);
});

await test("CONVERGENCE — an applied correction does not reappear in the next plan", () => {
  // THE INVARIANT THE PREVIOUS IMPLEMENTATION VIOLATED: apply reported 36 of 36
  // written and the very next canonical plan proposed all 36 again. A write is
  // not success; a changed observation is.
  const r = root();
  mkdirSync(join(r, "pids"), { recursive: true });
  writeFileSync(join(r, "pids", "wt1.pid"), "4242");

  const before = obs([portObs({ has_runtime_claim: true, recorded_pid: 4242, alive: false, serving_pid: null, verdict: "stale_record" })]);
  const p1 = R.buildReconciliationPlan(before);
  assert.equal(p1.corrections.length, 1);

  const out = R.applyReconciliationPlan(p1, { root: r, freshObservation: before });
  assert.equal(out.applied.length, 1, "the correction applies");
  assert.equal(existsSync(join(r, "pids", "wt1.pid")), false, "and the runtime claim is gone");

  // Re-observe the SAME external reality: the claim no longer exists, so the
  // port is a durable assignment at rest and proposes nothing.
  const after = obs([portObs({ has_runtime_claim: false, recorded_pid: null, alive: false, serving_pid: null, verdict: "registered_inactive" })]);
  const p2 = R.buildReconciliationPlan(after);
  const appliedIds = out.applied.map((a) => `${a.kind}:${a.port ?? a.path}`);
  const stillProposed = p2.corrections.map((c) => `${c.kind}:${c.port ?? c.path}`).filter((id) => appliedIds.includes(id));
  assert.deepEqual(stillProposed, [], "a successfully applied correction must not be re-proposed");
});

await test("CONVERGENCE — changed reality may legitimately create a NEW correction", () => {
  // Convergence must not mean silence. If a server dies after apply, the next
  // plan should say so.
  const settled = obs([portObs({ has_runtime_claim: false, verdict: "registered_inactive" })]);
  assert.equal(R.buildReconciliationPlan(settled).corrections.length, 0);
  const died = obs([portObs({ has_runtime_claim: true, recorded_pid: 777, alive: false, serving_pid: null, verdict: "stale_record" })]);
  assert.equal(R.buildReconciliationPlan(died).corrections.length, 1, "new reality, new correction");
});

await test("CONVERGENCE — the OBSERVER derives the verdict, not the fixture", async () => {
  // The three convergence tests above hand-set `verdict`, so they exercise the
  // planner and never the classification logic — two mutations to the observer
  // survived them. This one builds a real runtime root and lets the observer
  // decide, which is the only way the distinction can actually fail.
  const O = await import("../lib/vacilando/reconciliation-observe.mjs");
  const r = root();
  mkdirSync(join(r, "metadata"), { recursive: true });
  mkdirSync(join(r, "pids"), { recursive: true });
  writeFileSync(join(r, "metadata", "wt9.env"), 'ALLOY_WORKTREE_NAME="wt9"\nPORT="3011"\n');

  // Durable assignment, NO pid record, nothing serving.
  let ports = O.observeReconciliation({ root: r, processes: [] }).ports;
  let p = ports.find((x) => x.port === 3011);
  assert.equal(p.verdict, "registered_inactive", "a stopped server keeps its assignment and is not stale");
  assert.equal(p.has_runtime_claim, false);
  assert.equal(R.buildReconciliationPlan({ ports, worktrees: [] }).corrections.length, 0);

  // Now a pid RECORD claiming a process that does not exist.
  writeFileSync(join(r, "pids", "wt9.pid"), "999999");
  ports = O.observeReconciliation({ root: r, processes: [] }).ports;
  p = ports.find((x) => x.port === 3011);
  assert.equal(p.verdict, "stale_record", "a runtime claim reality disproves IS stale");
  assert.equal(p.has_runtime_claim, true);
  const plan = R.buildReconciliationPlan({ ports, worktrees: [] });
  assert.deepEqual(plan.corrections.map((c) => c.kind), ["clear_dead_pid_record"]);

  // Apply, then re-observe the same external reality: it must converge.
  R.applyReconciliationPlan(plan, { root: r, freshObservation: { ports, worktrees: [] } });
  const after = O.observeReconciliation({ root: r, processes: [] }).ports;
  assert.equal(after.find((x) => x.port === 3011).verdict, "registered_inactive");
  assert.equal(R.buildReconciliationPlan({ ports: after, worktrees: [] }).corrections.length, 0,
    "the applied correction must not be re-proposed");
  // And the durable assignment survived.
  assert.ok(existsSync(join(r, "metadata", "wt9.env")), "durable configuration must never be destroyed");
});

await test("REGISTRATION OWNER — discovery never mints management", async () => {
  const W = await import("../lib/vacilando/worktree-registration.mjs");
  const r = root();
  for (const field of W.MANAGEMENT_ONLY_FIELDS) {
    const out = W.registerDiscoveredWorktree({ root: r, name: "wt-a", extra: { [field]: 1 } });
    assert.equal(out.ok, false, field);
    assert.equal(out.error, "discovery_may_not_assign_management");
  }
  const ok = W.registerDiscoveredWorktree({ root: r, name: "wt-a", repositoryId: "repo_alloy" });
  assert.equal(ok.registration.provenance, "discovered");
  assert.equal(ok.registration.managed, false);
  for (const f of ["slot", "port", "agent"]) assert.ok(ok.registration[f] == null, `${f} must not be fabricated`);
  // Known is not managed.
  assert.equal(W.isManagedWorktree({ root: r, name: "wt-a" }), false);
  assert.equal(W.registrationProvenance({ root: r, name: "wt-a" }), "discovered");
  // Unknown is a real answer.
  assert.equal(W.resolveWorktreeRegistration({ root: r, name: "wt-nope" }).provenance, "unknown");
});

await test("REGISTRATION OWNER — repository-aware identity does not collide", async () => {
  const W = await import("../lib/vacilando/worktree-registration.mjs");
  const r = root();
  W.registerDiscoveredWorktree({ root: r, name: "wt-same", repositoryId: "repo_alloy" });
  assert.equal(W.resolveWorktreeRegistration({ root: r, name: "wt-same", repositoryId: "repo_alloy" }).known, true);
  assert.equal(W.resolveWorktreeRegistration({ root: r, name: "wt-same", repositoryId: "repo_other" }).known, false,
    "the same name in another repository is a different worktree");
  assert.notEqual(W.registrationKey({ repositoryId: "a", name: "w" }), W.registrationKey({ repositoryId: "b", name: "w" }));
});

await test("REGISTRATION OWNER — migration preserves audit and never invents presence", async () => {
  const W = await import("../lib/vacilando/worktree-registration.mjs");
  const r = root();
  mkdirSync(join(r, "reconciliation"), { recursive: true });
  writeFileSync(join(r, "reconciliation", "worktree-wt-live.json"), JSON.stringify({ kind: "adopt_unmanaged_worktree", path: "wt-live", provenance: "discovered", managed: false, adopted_at: "2026-01-01T00:00:00Z" }));
  writeFileSync(join(r, "reconciliation", "worktree-wt-gone.json"), JSON.stringify({ kind: "adopt_unmanaged_worktree", path: "wt-gone", provenance: "discovered", managed: false }));
  writeFileSync(join(r, "reconciliation", "worktree-wt-bogus.json"), JSON.stringify({ kind: "adopt_unmanaged_worktree", path: "wt-bogus", provenance: "managed", managed: true }));
  const out = W.migrateAdoptionRecords({ root: r, existsInGit: (p) => p === "wt-live" });
  assert.deepEqual(out.migrated.map((m) => m.name), ["wt-live"]);
  const reasons = out.rejected.map((x) => x.reason);
  assert.ok(reasons.includes("worktree_absent_from_git"), "a record for a vanished worktree must not register it");
  assert.ok(reasons.includes("record_claims_management"), "a record claiming management must not be migrated");
  assert.equal(W.resolveWorktreeRegistration({ root: r, name: "wt-gone" }).known, false);
  assert.equal(W.resolveWorktreeRegistration({ root: r, name: "wt-bogus" }).managed, false);
  // Audit evidence survives.
  assert.equal(W.resolveWorktreeRegistration({ root: r, name: "wt-live" }).evidence.adopted_at, "2026-01-01T00:00:00Z");
});

await test("CONVERGENCE — worktree adoption disappears from the next plan", async () => {
  const O = await import("../lib/vacilando/reconciliation-observe.mjs");
  const r = root();
  const parent = mkdtempSync(join(tmpdir(), "wts-"));
  mkdirSync(join(parent, "wt-alpha"), { recursive: true });
  const git = [join(parent, "wt-alpha")];
  const obs1 = O.observeReconciliation({ root: r, processes: [], worktreeParent: parent, gitWorktrees: git });
  const p1 = R.buildReconciliationPlan(obs1);
  assert.deepEqual(p1.corrections.map((c) => c.kind), ["adopt_unmanaged_worktree"]);
  const out = R.applyReconciliationPlan(p1, { root: r, freshObservation: obs1 });
  assert.equal(out.applied.length, 1);
  const obs2 = O.observeReconciliation({ root: r, processes: [], worktreeParent: parent, gitWorktrees: git });
  assert.deepEqual(R.buildReconciliationPlan(obs2).corrections, [], "the applied adoption must not be re-proposed");
  assert.equal(obs2.worktrees[0].provenance, "discovered");
  assert.equal(obs2.worktrees[0].managed, false, "known is not managed");
});

/* ── Port ownership is asked, never re-derived ───────────────────────────────
 *
 * These reproduce the live S7 convergence failure. Port 3011 was assigned to
 * wt1-r2-true-cold-work-unit while wt1-access-identity-v2 actually served it.
 * The observer's own verdict ladder had no foreign_owner case, so it reported
 * unregistered_server, the plan proposed adopt_observed_server, and adoption
 * wrote a discovered record that could not change owner/alive/serving. The
 * correction therefore recurred on every single plan, forever.
 */

test("a live server on a port assigned to someone else is foreign_owner, not unregistered", () => {
  const r = root();
  mkdirSync(join(r, "metadata"), { recursive: true });
  writeFileSync(join(r, "metadata", "wt-owner.env"), 'PORT="3011"\n', "utf8");
  const obs = observeReconciliation({
    root: r,
    processes: [{ pid: 4242, command: "next dev -p 3011", worktree: "wt-intruder" }],
    gitWorktrees: [],
  });
  const p = obs.ports.find((x) => x.port === 3011);
  assert.equal(p.verdict, "foreign_owner");
  assert.notEqual(p.verdict, "unregistered_server");
});

test("a foreign owner proposes NO correction — it is withheld, so it cannot recur", () => {
  const r = root();
  mkdirSync(join(r, "metadata"), { recursive: true });
  writeFileSync(join(r, "metadata", "wt-owner.env"), 'PORT="3011"\n', "utf8");
  const obs = observeReconciliation({
    root: r,
    processes: [{ pid: 4242, command: "next dev -p 3011", worktree: "wt-intruder" }],
    gitWorktrees: [],
  });
  const plan = buildReconciliationPlan(obs, { nowMs: 1 });
  assert.equal(plan.corrections.filter((c) => c.port === 3011).length, 0);
  assert.ok(plan.withheld.some((w) => w.port === 3011));
});

test("a serving port whose owner cannot be proven is ambiguous, never adopted on a guess", () => {
  const r = root();
  mkdirSync(join(r, "metadata"), { recursive: true });
  const obs = observeReconciliation({
    root: r,
    processes: [{ pid: 4242, command: "next dev -p 3011", worktree: null }],
    gitWorktrees: [],
  });
  const p = obs.ports.find((x) => x.port === 3011);
  assert.equal(p.verdict, "ambiguous");
  const plan = buildReconciliationPlan(obs, { nowMs: 1 });
  assert.equal(plan.corrections.filter((c) => c.port === 3011).length, 0);
});

test("a genuinely unowned live server is still adopted as discovered", () => {
  const r = root();
  mkdirSync(join(r, "metadata"), { recursive: true });
  const obs = observeReconciliation({
    root: r,
    processes: [{ pid: 4242, command: "next dev -p 3011", worktree: "wt-nobody" }],
    gitWorktrees: [],
  });
  const p = obs.ports.find((x) => x.port === 3011);
  assert.equal(p.verdict, "unregistered_server");
  const plan = buildReconciliationPlan(obs, { nowMs: 1 });
  assert.ok(plan.corrections.some((c) => c.kind === "adopt_observed_server" && c.port === 3011));
});
