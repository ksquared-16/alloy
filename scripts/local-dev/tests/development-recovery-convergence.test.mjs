#!/usr/bin/env node
/**
 * A TERMINAL STALE CLAIM MUST CONVERGE, AND THEN BE QUIET.
 *
 * THE SEPTEMBER 11 INCIDENT, reproduced. Four stale PID claims survived their
 * processes. Targeted Governor reconciliation runs every 30 seconds, and for
 * each claim every pass emitted:
 *
 *     recovery_detected → recovery_classified → recovery_exhausted
 *
 * indefinitely — 24 recovery events per minute, an 82,671-line ledger, and a
 * ~25 MB file. Removing only the four proven-dead claims by hand took growth to
 * exactly zero. The manual deletion was never the product fix.
 *
 * Still live when this was written: on this host, gateway/pids/wt5-vacilando.pid
 * emitted 2487 events between 14:06 and 21:15 — detected ≈ classified ≈
 * exhausted, with almost no attempts among them.
 *
 * TWO CAUSES, and the second is worse than the noise.
 *
 *   1. `recovery_detected` and `recovery_classified` were emitted at function
 *      entry, ABOVE the budget check — so a resource the code had already
 *      decided not to act on still cost three appends per pass.
 *
 *   2. The budget episode was keyed by policy + TARGET. For stale_slot_pid the
 *      target is a path, and the budget is 1. So the first stale pid file at a
 *      path spent it, and every LATER stale claim at that path — a different
 *      dead process — found the budget exhausted and was never repaired.
 *      Recovery worked exactly once per path, for the life of the budget store.
 *
 * These controls hold both, and hold the safety rule that must survive them:
 * ambiguous ownership is never terminalized.
 */
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-recovery-conv-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_PIDS_DIR = join(ROOT, "pids");
mkdirSync(join(ROOT, "pids"), { recursive: true });
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });

const R = await import("../lib/vacilando/execution-recovery.mjs");
const { reconcileGovernor } = await import("../lib/vacilando/execution-reconcile.mjs");

const EVENTS = R.recoveryEventsPath(ROOT);
const BUDGETS = R.recoveryBudgetPath(ROOT);

/** A pid that is dead for certain: claimed, then reaped, then never reused here. */
const DEAD_PID = 2147480000;

let pass = 0;
let fail = 0;
async function test(name, fn) {
  R.resetRecoveryForTests(ROOT);
  R.setRecoveryIsolatedForTests(true);
  rmSync(join(ROOT, "pids"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "pids"), { recursive: true });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const eventLines = () => {
  try { return readFileSync(EVENTS, "utf8").split("\n").filter(Boolean); } catch { return []; }
};
const eventsOf = (policy) => eventLines().map((l) => JSON.parse(l)).filter((e) => !policy || e.policy === policy);
const claim = (name, pid) => {
  const p = join(ROOT, "pids", `${name}.pid`);
  writeFileSync(p, `${pid}\n`, "utf8");
  return p;
};
/** One targeted Governor pass — the thing that ran every 30 seconds all day. */
const targetedPass = () => reconcileGovernor({ root: ROOT, depth: "targeted", reason: "test" });
const stateFingerprint = () => {
  const out = {};
  for (const p of [EVENTS, BUDGETS]) {
    try { const st = statSync(p); out[p] = `${st.size}:${st.mtimeMs}`; } catch { out[p] = "absent"; }
  }
  return JSON.stringify(out);
};

// ── acceptance 1 ─────────────────────────────────────────────────────────────
await test("R1. a synthetic stale PID claim is reconciled once and converges", async () => {
  const path = claim("wt5-vacilando", DEAD_PID);
  assert.equal(existsSync(path), true);
  await targetedPass();
  assert.equal(existsSync(path), false, "the active stale claim is retired, not merely observed");
  const evts = eventsOf("stale_slot_pid");
  assert.deepEqual(
    evts.map((e) => e.type),
    ["recovery_detected", "recovery_classified", "recovery_attempted", "recovery_verified"],
    "one clean lifecycle: detect, classify, attempt, verify",
  );
});

// ── acceptance 2 ─────────────────────────────────────────────────────────────
await test("R2. ten further passes over the unchanged terminal condition emit nothing", async () => {
  /*
   * The incident shape exactly: a claim that CANNOT be repaired, so recovery
   * legitimately exhausts. Before this change that produced three appends per
   * pass forever. The budget for stale_slot_pid is 1, so pass 1 exhausts it.
   */
  const path = claim("financials", DEAD_PID);
  // Make the repair genuinely impossible WITHOUT making ownership ambiguous:
  // the file is inside the runtime root and its pid is provably dead, but the
  // directory is read-only so the unlink cannot succeed. That is the incident's
  // own shape — a claim recovery can see, is allowed to touch, and cannot fix.
  chmodSync(join(ROOT, "pids"), 0o500);
  try {
    await targetedPass();                     // attempt 1 — fails, consumes the budget
    assert.equal(existsSync(path), true, "the fixture must really be unrepairable");
    const afterFirst = eventsOf("stale_slot_pid");
    assert.ok(afterFirst.some((e) => e.type === "recovery_failed"), "the failure is recorded once");
    await targetedPass();                     // budget exhausted → emitted once, terminalized
    const exhausted = eventsOf("stale_slot_pid").filter((e) => e.type === "recovery_exhausted");
    assert.equal(exhausted.length, 1, "exhaustion is stated exactly once");
    const ep = R.readBudgetEpisode("stale_slot_pid", path, ROOT);
    assert.equal(ep?.terminal, true, "and the resource is now terminal, not merely out of budget");

    const beforeTen = eventsOf("stale_slot_pid").length;
    const fingerprintBefore = stateFingerprint();
    for (let i = 0; i < 10; i += 1) await targetedPass();
    const afterTen = eventsOf("stale_slot_pid").length;
    assert.equal(afterTen, beforeTen, `ten passes must append nothing; grew by ${afterTen - beforeTen}`);
    assert.equal(stateFingerprint(), fingerprintBefore, "and must not write to any recovery store");
  } finally {
    chmodSync(join(ROOT, "pids"), 0o700);
  }
});

// ── acceptance 4 ─────────────────────────────────────────────────────────────
await test("R3. a healthy no-op reconciliation performs zero persistent writes", async () => {
  claim("healthy", process.pid);              // a LIVE claim — nothing to recover
  await targetedPass();
  const fingerprint = stateFingerprint();
  for (let i = 0; i < 5; i += 1) await targetedPass();
  assert.equal(stateFingerprint(), fingerprint, "a healthy host writes nothing to the recovery stores");
  assert.equal(eventsOf("stale_slot_pid").length, 0, "and emits no recovery events at all");
});

// ── the defect behind the defect ─────────────────────────────────────────────
await test("R4. a NEW dead pid at the same path is a new fault and is repaired", async () => {
  /*
   * The budget was keyed by path alone, so this second claim used to be
   * unrepairable forever: same key, budget already spent. A dev server that
   * restarts and dies twice left its pid file on disk permanently.
   */
  const path = claim("recycled", DEAD_PID);
  await targetedPass();
  assert.equal(existsSync(path), false, "first claim converges");
  const afterFirst = eventsOf("stale_slot_pid").length;

  claim("recycled", DEAD_PID - 1);            // different dead process, same path
  await targetedPass();
  assert.equal(existsSync(path), false, "the SECOND stale claim is repaired too");
  assert.ok(eventsOf("stale_slot_pid").length > afterFirst,
    "and it is a genuinely new observation, so it is recorded");
  const verified = eventsOf("stale_slot_pid").filter((e) => e.type === "recovery_verified");
  assert.equal(verified.length, 2, "both faults verified — recovery is not once-per-path");
});

await test("R5. terminal is keyed to the evidence, so a changed claim re-arms", () => {
  const path = claim("rearm", DEAD_PID);
  R.executeRecovery("stale_slot_pid", { path, pid: String(DEAD_PID), root: ROOT, target: path });
  const first = R.readBudgetEpisode("stale_slot_pid", path, ROOT);
  assert.ok(first?.evidence, "the episode records what it saw");
  assert.match(first.evidence, new RegExp(`pid=${DEAD_PID}`), "including the pid that justified it");

  claim("rearm", DEAD_PID - 2);
  R.executeRecovery("stale_slot_pid", { path, pid: String(DEAD_PID - 2), root: ROOT, target: path });
  const second = R.readBudgetEpisode("stale_slot_pid", path, ROOT);
  assert.notEqual(second.evidence, first.evidence, "new evidence is a new episode");
  assert.notEqual(second.terminal, true, "and it is not born terminal");
});

// ── the safety rule that must survive all of it ──────────────────────────────
await test("R6. ambiguous ownership is never terminalized — it stays observed", () => {
  // A LIVE pid is not a stale claim. The handler refuses without consuming
  // budget, so it must never reach a terminal state: failing closed means the
  // fault keeps being looked at, not that it is written off.
  const path = claim("ambiguous", process.pid);
  for (let i = 0; i < 3; i += 1) {
    R.executeRecovery("stale_slot_pid", { path, pid: String(process.pid), root: ROOT, target: path });
  }
  const ep = R.readBudgetEpisode("stale_slot_pid", path, ROOT);
  assert.notEqual(ep?.terminal, true, "a live pid must never be marked terminal");
  assert.equal(existsSync(path), true, "and its claim is never removed");
});

await test("R7. a pid file outside the runtime root is refused, not terminalized", () => {
  const outside = join(tmpdir(), `vac-foreign-${process.pid}.pid`);
  writeFileSync(outside, `${DEAD_PID}\n`, "utf8");
  try {
    const out = R.executeRecovery("stale_slot_pid", { path: outside, pid: String(DEAD_PID), root: ROOT, target: outside });
    assert.equal(out.ok, false);
    assert.equal(out.error, "pid_file_outside_runtime", "foreign state is observe-only");
    const ep = R.readBudgetEpisode("stale_slot_pid", outside, ROOT);
    assert.notEqual(ep?.terminal, true, "and refusing is not the same as writing it off");
    assert.equal(existsSync(outside), true, "the foreign file is untouched");
  } finally { rmSync(outside, { force: true }); }
});

await test("R8. history is preserved — terminal is current state, never a deletion", async () => {
  const path = claim("history", DEAD_PID);
  await targetedPass();
  const lines = eventLines().length;
  assert.ok(lines > 0, "the lifecycle that happened is on the ledger");
  for (let i = 0; i < 5; i += 1) await targetedPass();
  assert.equal(eventLines().length, lines, "quiet means no NEW lines, not fewer old ones");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
