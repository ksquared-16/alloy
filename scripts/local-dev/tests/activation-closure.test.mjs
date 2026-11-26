#!/usr/bin/env node
/**
 * FINAL ACTIVATION CLOSURE — the three lifecycle seams that shipped a decider
 * with no executor.
 *
 * WHAT THESE CONTROLS ARE FOR. Every defect closed here has the same shape, and
 * it is a shape that passes review: a correct owner, a correct decision, a
 * correct refusal — and nothing that carries the decision out. Each one measured
 * green in its own tests and did nothing on the live host.
 *
 *   1. `gateway_host_mutation` refused a competing install correctly, and
 *      `cleanupRunResources` released it when the requesting run completed —
 *      hours before the 24-hour soak it was protecting had finished.
 *   2. `install-vacilando-gateway.sh` resolved the Gateway runtime root, wrote it
 *      into the plist, and never exported it — so its own guard read a different
 *      store and reported a held host as free.
 *   3. `run-wait.mjs` declared every wait's owner and bound and returned "fail,
 *      via the canonical failure path", `vac health` reported the breach, and no
 *      caller existed — a run sat QUEUED for thirteen hours on a ten-minute bound.
 *   4. DevOps 8 shipped the instruction baseline hash, the drift detector and the
 *      readers, and no writer at all.
 *
 * So these controls assert EFFECTS, never intentions: what the store says after
 * a run completes, what the shell script does with its environment, what a lane
 * record contains. A control that only checked the decision would have passed on
 * every one of these defects.
 *
 * Isolated runtime only. Nothing here touches the live Gateway root.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_DEV = join(HERE, "..");

const ROOT = mkdtempSync(join(tmpdir(), "vac-activation-"));
const GATEWAY = join(ROOT, "gateway");
process.env.ALLOY_RUNTIME_ROOT = GATEWAY;
mkdirSync(join(GATEWAY, "vacilando", "execution-runs"), { recursive: true });

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const R = await import("../lib/vacilando/execution-resource.mjs");
const G = await import("../lib/vacilando/gateway-host-mutation.mjs");
const DL = await import("../lib/vacilando/development-lane.mjs");
const LB = await import("../lib/vacilando/lane-bootstrap.mjs");
const AC = await import("../lib/vacilando/agent-configuration.mjs");
const ER = await import("../lib/vacilando/execution-run.mjs");
const ES = await import("../lib/vacilando/execution-stale.mjs");
const RW = await import("../lib/vacilando/run-wait.mjs");
const BC = await import("../lib/vacilando/lane-bootstrap-contract.mjs");

/* ── fixtures ────────────────────────────────────────────────────────────── */

function worktree(name, instruction = "# lane instructions\n") {
  const p = join(ROOT, name);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "CLAUDE.md"), instruction);
  return p;
}

function lane(name, wt) {
  const out = DL.createDurableLane({ name, binding: { worktree_path: wt }, root: GATEWAY });
  assert.equal(out.ok, true, `lane ${name}: ${out.error}`);
  return out.lane;
}

/**
 * A run in the store, created through the canonical writer.
 *
 * Age is set by CREATING the run in the past rather than by editing timestamps
 * afterwards: `patchRunFields` deliberately allowlists what may be written and
 * stamps `updated_at` itself, so a fixture that reached around it would be
 * testing a record shape the system cannot actually produce.
 */
function run(laneId, { reason = null, ageMs = 0 } = {}) {
  const at = Date.now() - ageMs;
  const made = ER.createQueuedRun({ laneId, instruction: "fixture", origin: "operator", nowMs: at, root: GATEWAY });
  assert.ok(made?.ok, `createQueuedRun refused: ${made?.error}`);
  if (reason) ER.patchRunFields(made.run.run_id, { state_reason: reason }, { nowMs: at, root: GATEWAY });
  return ER.getExecutionRun(made.run.run_id, GATEWAY);
}

/**
 * A fresh lane with one run. One run per lane on purpose: the registry refuses a
 * second active run on a lane, which is correct, so every case gets its own.
 */
let laneSeq = 0;
function laneWithRun(label, opts = {}) {
  laneSeq += 1;
  const wt = worktree(`wt-${label}-${laneSeq}`);
  const l = lane(`${label} ${laneSeq}`, wt);
  return { lane: l, run: run(l.lane_id, opts) };
}

/* ── 1-3: the soak resource lifetime follows the soak, not the run ───────── */

test("a claim with no process owner still dies with its run (unchanged behaviour)", () => {
  const { lane: L, run: r } = laneWithRun("runscoped");
  const got = G.acquireGatewayHostMutation({ runId: r.run_id, laneId: L.lane_id, root: GATEWAY });
  assert.equal(got.granted, true);
  R.cleanupRunResources(r.run_id, { root: GATEWAY });
  assert.equal(G.gatewayHostMutationHolder(GATEWAY), null, "a run-scoped claim must not survive its run");
});

test("a claim owned by a LIVE process survives the run that requested it", () => {
  const { lane: L, run: r } = laneWithRun("livesoak");
  const got = G.acquireGatewayHostMutation({
    runId: r.run_id,
    laneId: L.lane_id,
    // This test process is the stand-in owner: it is unambiguously alive.
    processOwner: { pid: process.pid, started_at: liveStart(process.pid), kind: "host_soak" },
    root: GATEWAY,
  });
  assert.equal(got.granted, true);
  R.cleanupRunResources(r.run_id, { root: GATEWAY });
  const holder = G.gatewayHostMutationHolder(GATEWAY);
  assert.ok(holder, "the soak's protection must outlive the convergence run");
  assert.equal(holder.owner.health, R.OWNER_HEALTH.LIVE);
  assert.equal(holder.survived_run.run_id, r.run_id);
  // Leave the fixture clean for the cases below.
  G.releaseGatewayHostMutation({ runId: r.run_id, root: GATEWAY });
  assert.equal(G.gatewayHostMutationHolder(GATEWAY), null, "an explicit release must free the host");
});

test("a DEAD process owner cannot hold the host for ever", () => {
  const { lane: L, run: r } = laneWithRun("deadsoak");
  const dead = deadPid();
  const got = G.acquireGatewayHostMutation({
    runId: r.run_id, laneId: L.lane_id,
    processOwner: { pid: dead, started_at: "Fri Sep 12 00:00:00 2026", kind: "host_soak" },
    root: GATEWAY,
  });
  assert.equal(got.granted, true);
  R.cleanupRunResources(r.run_id, { root: GATEWAY });
  // The very reader that would be refused performs the reclaim, so a crashed
  // soak frees the host without a sweeper existing at all.
  assert.equal(G.gatewayHostMutationHolder(GATEWAY), null, "a crashed owner must not survive as a claim");
  assert.equal(G.assertGatewayHostMutationAllowed({ runId: "erun_other", root: GATEWAY }).ok, true);
});

test("a reused pid is stale, not live", () => {
  const health = R.processOwnerHealth({
    process_owner: { pid: process.pid, started_at: "Thu Jan 01 00:00:00 1970" },
  });
  assert.equal(health.health, R.OWNER_HEALTH.STALE, "a pid whose start time disagrees is a different process");
});

test("an owner whose start time cannot be read holds rather than being collected", () => {
  const health = R.processOwnerHealth({ process_owner: { pid: process.pid, started_at: null } });
  assert.equal(health.health, R.OWNER_HEALTH.UNVERIFIED);
  assert.equal(R.processOwnerHolds({ process_owner: { pid: process.pid, started_at: null } }), true,
    "refusing to confirm is not evidence of death");
});

/* ── 4: a competing governed install is refused while the soak holds ─────── */

test("a competing run is refused while a live soak owns the host, and the owner is not", () => {
  const { lane: L, run: r } = laneWithRun("competing");
  G.acquireGatewayHostMutation({
    runId: r.run_id, laneId: L.lane_id,
    processOwner: { pid: process.pid, started_at: liveStart(process.pid), kind: "host_soak" },
    root: GATEWAY,
  });
  R.cleanupRunResources(r.run_id, { root: GATEWAY });

  const competitor = G.assertGatewayHostMutationAllowed({ runId: "erun_competing", root: GATEWAY });
  assert.equal(competitor.ok, false);
  assert.equal(competitor.error, "gateway_host_mutation_held");
  assert.equal(competitor.holder.run_id, r.run_id, "the refusal must name who holds it");

  const owner = G.assertGatewayHostMutationAllowed({ runId: r.run_id, root: GATEWAY });
  assert.equal(owner.ok, true, "the holder is not refused its own resource");
  G.releaseGatewayHostMutation({ runId: r.run_id, root: GATEWAY });
});

/* ── 5-6: both entry points read the same root and the same store ────────── */

test("the canonical installer exports the runtime root it resolved", () => {
  const text = readFileSync(join(LOCAL_DEV, "install-vacilando-gateway.sh"), "utf8");
  const guardAt = text.indexOf('"$GUARD_JS" check');
  const exportAt = text.indexOf("export ALLOY_RUNTIME_ROOT");
  assert.ok(exportAt > -1, "the installer must export ALLOY_RUNTIME_ROOT");
  assert.ok(exportAt < guardAt,
    "the export must happen BEFORE the guard runs, or the guard reads a different store");
  assert.ok(/RUNTIME_ROOT="\$\{ALLOY_RUNTIME_ROOT:-/.test(text),
    "one root must be resolved once and used for both the plist and the guard");
});

test("the installer's guard and the governed executor observe the same holder", () => {
  const { lane: L, run: r } = laneWithRun("twoentry");
  G.acquireGatewayHostMutation({
    runId: r.run_id, laneId: L.lane_id,
    processOwner: { pid: process.pid, started_at: liveStart(process.pid), kind: "host_soak" },
    root: GATEWAY,
  });
  R.cleanupRunResources(r.run_id, { root: GATEWAY });

  // The shell entry point, invoked exactly as the installer invokes it, with
  // ONLY the root the installer exports. Not a mock: the real CLI, real exit code.
  const cli = spawnSync(process.execPath, [
    join(LOCAL_DEV, "lib", "vacilando", "gateway-host-mutation.mjs"), "check", "--run", "erun_competing",
  ], { encoding: "utf8", env: { ...process.env, ALLOY_RUNTIME_ROOT: GATEWAY }, timeout: 30_000 });
  assert.equal(cli.status, 3, `installer preflight must refuse; got ${cli.status}: ${cli.stdout}${cli.stderr}`);
  assert.match(cli.stderr, /REFUSED/);
  assert.ok(cli.stderr.includes(r.run_id), "the shell refusal must name the same holder");

  // And the governed executor's own call, on the same store, agrees.
  const executor = G.assertGatewayHostMutationAllowed({ runId: "erun_competing", root: GATEWAY });
  assert.equal(executor.ok, false);
  assert.equal(executor.holder.run_id, r.run_id);
  G.releaseGatewayHostMutation({ runId: r.run_id, root: GATEWAY });
});

/* ── 7: no second lock, no second store ──────────────────────────────────── */

test("ownership is one field on the governor's own request — no new store", () => {
  const guard = readFileSync(join(LOCAL_DEV, "lib", "vacilando", "gateway-host-mutation.mjs"), "utf8");
  const stripped = guard.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of ["writeFileSync", "mkdirSync", "appendFileSync", "openSync"]) {
    assert.ok(!stripped.includes(forbidden),
      `the guard must not write a store of its own (found ${forbidden})`);
  }
  const soak = readFileSync(join(LOCAL_DEV, "vacilando-host-soak.mjs"), "utf8");
  const soakStripped = soak.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\.lock|lockfile|flock/i.test(soakStripped),
    "the soak must take the governor's resource, not a lock of its own");
});

/* ── 8-13: exactly one canonical writer of the instruction baseline ──────── */

test("the instruction baseline has exactly one writer, and it is the lane record's owner", () => {
  const files = execFileSync("git", ["-C", LOCAL_DEV, "ls-files", "lib", "*.mjs"], { encoding: "utf8" })
    .split("\n").filter((f) => f.endsWith(".mjs"));
  const writers = [];
  for (const f of files) {
    if (f.includes("/tests/")) continue;
    const text = readFileSync(join(LOCAL_DEV, f), "utf8");
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // An ASSIGNMENT to the field is a write. A read is not.
    if (/\brec\.instruction_baseline\s*=|instruction_baseline:\s*instructionBaselineStampFor/.test(stripped)) {
      writers.push(f);
    }
  }
  assert.deepEqual([...new Set(writers)], ["lib/vacilando/development-lane.mjs"],
    `exactly one module may write the pointer; found ${writers.join(", ")}`);
});

test("a new lane records the current baseline at creation", () => {
  const wt = worktree("wt-new", "# instructions A\n");
  const l = lane("New Lane", wt);
  assert.ok(l.instruction_baseline, "a new lane must carry a baseline pointer");
  assert.equal(l.instruction_baseline.baseline_version, AC.instructionBaselineVersion("# instructions A\n"));
  assert.equal(l.instruction_baseline.source, "repository_claude_md");
});

test("the writer persists a pointer and never the instruction text", () => {
  const body = "# a long and specific instruction body that must never be copied\n";
  const wt = worktree("wt-pointer", body);
  const l = lane("Pointer Lane", wt);
  const serialized = JSON.stringify(l.instruction_baseline);
  assert.ok(!serialized.includes("must never be copied"), "the body must not reach the lane record");
  assert.match(l.instruction_baseline.baseline_version, /^ib_/);
  assert.equal(typeof l.instruction_baseline.bytes, "number");
});

test("a lane whose instruction cannot be measured stays UNRECORDED rather than guessing", () => {
  const bare = join(ROOT, "wt-bare");
  mkdirSync(bare, { recursive: true });
  const l = lane("Bare Lane", bare);
  assert.equal(l.instruction_baseline, null);
  const drift = AC.detectInstructionDrift({ lanes: [l], currentVersion: "ib_whatever" });
  assert.equal(drift.rows[0].state, "UNRECORDED");
});

test("a resumed lane revalidates its baseline when it is rebound", () => {
  const wt = worktree("wt-resume", "# first\n");
  const l = lane("Resume Lane", wt);
  const first = l.instruction_baseline.baseline_version;
  writeFileSync(join(wt, "CLAUDE.md"), "# second\n");
  const out = DL.bindDurableLane(l.lane_id, { worktree_path: wt }, { root: GATEWAY });
  assert.equal(out.ok, true);
  assert.equal(out.lane.instruction_baseline.baseline_version, AC.instructionBaselineVersion("# second\n"));
  assert.equal(out.lane.instruction_baseline.previous_version, first,
    "a revalidated pointer must say what it replaced");
});

test("an existing matching lane can be seeded, and a second seed writes nothing", () => {
  const wt = worktree("wt-seed", "# seedable\n");
  const l = lane("Seed Lane", wt);
  // Simulate a lane that predates the writer.
  const store = DL.readDevelopmentLaneStore(GATEWAY);
  delete store.lanes[l.lane_id].instruction_baseline;
  DL.writeDevelopmentLaneStore(store, GATEWAY);
  assert.equal(DL.getDurableLane(l.lane_id, GATEWAY).instruction_baseline, undefined);

  const first = DL.recordLaneInstructionBaseline(l.lane_id, { root: GATEWAY });
  assert.equal(first.state, DL.BASELINE_RECORD.RECORDED);
  assert.equal(first.written, true);
  const second = DL.recordLaneInstructionBaseline(l.lane_id, { root: GATEWAY });
  assert.equal(second.state, DL.BASELINE_RECORD.UNCHANGED);
  assert.equal(second.written, false, "an unchanged pointer must not churn the record");
});

test("seeding a baseline leaves durable history untouched", () => {
  const wt = worktree("wt-history", "# history\n");
  const l = lane("History Lane", wt);
  const store = DL.readDevelopmentLaneStore(GATEWAY);
  const rec = store.lanes[l.lane_id];
  rec.description = "a durable decision nobody may rewrite";
  rec.mission_id = "msn_fixed";
  delete rec.instruction_baseline;
  DL.writeDevelopmentLaneStore(store, GATEWAY);

  DL.recordLaneInstructionBaseline(l.lane_id, { root: GATEWAY });
  const after = DL.getDurableLane(l.lane_id, GATEWAY);
  assert.equal(after.description, "a durable decision nobody may rewrite");
  assert.equal(after.mission_id, "msn_fixed");
  assert.equal(after.created_at, rec.created_at);
});

/* ── 14: the bootstrap stamp requires an actual revalidation ─────────────── */

test("a bootstrap stamp without the resolver's proof is refused", () => {
  const wt = worktree("wt-stamp", "# stamp\n");
  const l = lane("Stamp Lane", wt);
  assert.equal(DL.stampLaneBootstrapContract(l.lane_id, { root: GATEWAY }).error, "revalidation_missing");
  assert.equal(
    DL.stampLaneBootstrapContract(l.lane_id, { root: GATEWAY, revalidation: { ok: true, lane_id: l.lane_id, contract_version: "wrong", unresolved: [] } }).error,
    "revalidation_contract_mismatch",
  );
});

test("a lane with unresolved baseline gaps is never stamped", () => {
  const wt = worktree("wt-gap", "# gap\n");
  const l = lane("Gap Lane", wt);
  const out = DL.stampLaneBootstrapContract(l.lane_id, {
    root: GATEWAY,
    revalidation: {
      ok: true, lane_id: l.lane_id,
      contract_version: BC.LANE_BOOTSTRAP_CONTRACT_VERSION,
      unresolved: ["worktree:missing"],
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "lane_does_not_satisfy_contract");
  assert.deepEqual(out.unresolved, ["worktree:missing"]);
});

test("revalidation refuses to stamp an unsatisfied lane but still records its baseline", () => {
  const wt = worktree("wt-reval", "# reval\n");
  const l = lane("Reval Lane", wt);
  const out = LB.revalidateLaneBootstrap(l.lane_id, {
    root: GATEWAY,
    resolve: () => ({
      ok: true, lane_id: l.lane_id,
      contract_version: "vacilando.lane_bootstrap.v1",
      observed_contract_version: null,
      baseline: { instruction_pack: { baseline_version: "ib_measured" } },
      unresolved: ["branch:drift"],
    }),
  });
  assert.equal(out.state, LB.REVALIDATION.UNRESOLVED);
  assert.equal(out.bootstrap.written, false);
  assert.equal(out.bootstrap.state, "REFUSED");
  // The pointer is an observation and is recorded regardless; the stamp is a
  // compliance claim and is not.
  assert.ok(["RECORDED", "UNCHANGED", "UPDATED"].includes(out.instruction_baseline.state));
});

/* ── 15: the stale run converges through the existing owner ──────────────── */

test("an expired wait is collected through the canonical failure path", () => {
  const { run: r } = laneWithRun("stalerun", { reason: "provider_provisioning", ageMs: 13 * 60 * 60 * 1000 });
  const dry = ES.reconcileExpiredRunWaits({ root: GATEWAY, apply: false });
  const row = dry.decided.find((d) => d.run_id === r.run_id);
  assert.ok(row, "a 13-hour wait on a 10-minute bound must be decided");
  assert.equal(row.status, "expired");
  assert.equal(row.failure_reason, "provider_provisioning_bound_exceeded");
  assert.equal(row.applied, false, "a dry run must change nothing");
  assert.equal(ER.getExecutionRun(r.run_id, GATEWAY).state, "QUEUED");

  const applied = ES.reconcileExpiredRunWaits({ root: GATEWAY, apply: true });
  assert.ok(applied.collected >= 1);
  assert.equal(ER.getExecutionRun(r.run_id, GATEWAY).state, "FAILED");
});

test("a wait inside its bound is never collected", () => {
  const { run: r } = laneWithRun("freshrun", { reason: "provider_provisioning", ageMs: 60 * 1000 });
  const dry = ES.reconcileExpiredRunWaits({ root: GATEWAY, apply: false });
  assert.ok(!dry.decided.some((d) => d.run_id === r.run_id), "one minute into a ten minute bound is not stale");
});

test("the one deliberate human-indefinite wait is held for ever", () => {
  const d = RW.describeWait({ reason: "needs_operator_input", waiting_since: 0, now: Date.now() });
  assert.equal(d.bound_policy, "human_indefinite");
  assert.equal(RW.reconcileWait(d, { now: Date.now() }).action, "hold");
});

test("the collector rides the reconciliation pass that already exists", () => {
  const text = readFileSync(join(LOCAL_DEV, "lib", "vacilando", "execution-reconcile.mjs"), "utf8");
  assert.ok(text.includes("reconcileExpiredRunWaits"),
    "a collector nothing calls is the defect it was written to close");
});

/* ── helpers that need the real host ─────────────────────────────────────── */

function liveStart(pid) {
  try {
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch { return null; }
}

/** A pid that is certainly not running: allocated, exited, and reaped. */
function deadPid() {
  const r = spawnSync(process.execPath, ["-e", "process.exit(0)"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(r.status, 0);
  assert.ok(r.pid > 0);
  return r.pid;
}

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
