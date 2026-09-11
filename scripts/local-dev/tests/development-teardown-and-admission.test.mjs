#!/usr/bin/env node
/**
 * G — TEARDOWN MUST BE VERIFIED, AND HOST HEALTH MUST REACH ADMISSION.
 *
 * TWO GAPS, both found by auditing the existing owners rather than assumed.
 *
 *   closeDurableLane released capacity, retired the worktree registration and
 *   marked the lane closed — then returned, having never looked. "I asked for it
 *   to stop" and "it stopped" are different claims, and only the second one makes
 *   a completed lane's resources genuinely free.
 *
 *   Admission asked exactly one question: are there free provider seats? So a
 *   host under real pressure looked identical to an idle one as long as a seat
 *   was free, and Vacilando kept starting heavy work into it. Nothing anywhere
 *   fed CPU, memory, previous-generation ownership or recovery backlog into a
 *   scheduling decision.
 *
 * Both are built on the owners that already exist — the lane lifecycle owner and
 * the control-plane health owner — and on the runtime generation from F. No new
 * lifecycle authority, no watchdog, no second registry.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-teardown-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "pids"), { recursive: true });
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const C = await import("../lib/vacilando/control-plane-health.mjs");
const R = await import("../lib/vacilando/execution-recovery.mjs");

const LANE = "lane_teardown0001";
const DEAD_PID = 2147480000;

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const noPort = () => false;
const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ── teardown verification ────────────────────────────────────────────────────
test("T1. a clean teardown proves zero survivors, and says what it checked", () => {
  R.registerOwnedProcess({ id: "gone-1", lane_id: LANE, pid: DEAD_PID, kind: "dev_server" }, ROOT);
  const out = L.verifyLaneTeardown(LANE, { root: ROOT, slot: 5, port: 3015, worktreeName: "wt-gone", portInUseImpl: noPort });
  assert.equal(out.ok, true);
  assert.deepEqual(out.survivors, []);
  // "No survivors" must never be inferred from an empty list that nothing could
  // check — the claim has to say what was actually looked at.
  assert.deepEqual(out.checked, { owned_processes: true, pid_claim: true, port: true });
});

test("T2. a surviving owned process is reported, with what it is", () => {
  R.registerOwnedProcess({ id: "alive-1", lane_id: LANE, pid: process.pid, kind: "test_runner" }, ROOT);
  const out = L.verifyLaneTeardown(LANE, { root: ROOT, slot: 5, port: 3015, worktreeName: "wt-x", portInUseImpl: noPort });
  assert.equal(out.ok, false);
  const s = out.survivors.find((x) => x.kind === "owned_process");
  assert.ok(s, "the survivor is named");
  assert.equal(s.pid, process.pid);
  assert.equal(s.process_kind, "test_runner", "and its type, so the operator knows what is still up");
});

test("T3. another lane's surviving process is NOT this lane's finding", () => {
  R.registerOwnedProcess({ id: "other-1", lane_id: "lane_somebody_else", pid: process.pid, kind: "dev_server" }, ROOT);
  const out = L.verifyLaneTeardown("lane_quiet0002", { root: ROOT, port: null, worktreeName: null, portInUseImpl: noPort });
  assert.equal(out.ok, true, "a lane is only answerable for what it owns");
});

test("T4. a live PID claim and a still-listening port are survivors", () => {
  writeFileSync(join(ROOT, "pids", "wt-live.pid"), `${process.pid}\n`, "utf8");
  const out = L.verifyLaneTeardown("lane_empty0003", {
    root: ROOT, slot: 4, port: 3014, worktreeName: "wt-live",
    portInUseImpl: (p) => p === 3014,
  });
  assert.equal(out.ok, false);
  assert.ok(out.survivors.some((s) => s.kind === "pid_claim" && s.pid === process.pid));
  assert.ok(out.survivors.some((s) => s.kind === "port" && s.port === 3014));
});

test("T5. verification reports and never kills", () => {
  const text = src("../lib/vacilando/lane-worktree-lifecycle.mjs");
  const fn = text.slice(text.indexOf("export function verifyLaneTeardown"), text.indexOf("function spawnSyncText"));
  assert.ok(!/process\.kill\([^,]+,\s*["']SIG|kill\(-|killall|SIGKILL|SIGTERM/.test(fn),
    "killing arbitrary processes is prohibited; a survivor is a fact, not a licence");
  assert.ok(!/execFileSync\(\s*["']ps["']|readdirSync/.test(fn),
    "and the checks stay cheap — no ps fan-out, no filesystem walk");
});

test("T5b. the lifecycle owner does not import the recovery module", () => {
  /*
   * A static import of execution-recovery from here creates a cycle -
   * lane-worktree-lifecycle -> execution-recovery -> execution-resource - whose
   * symptom is "Cannot access 'reclaimHook' before initialization" at module
   * init. Four suites crashed on exactly that before it was backed out, and the
   * crash is far from the import that caused it, so it is worth a control.
   */
  const text = src("../lib/vacilando/lane-worktree-lifecycle.mjs");
  assert.ok(!/^import .*from "\.\/execution-recovery\.mjs";$/m.test(text),
    "the owned-process store is read directly here; registerOwnedProcess stays its only writer");
});

test("T6. closeDurableLane verifies before it returns", () => {
  const text = src("../lib/vacilando/lane-worktree-lifecycle.mjs");
  const fn = text.slice(text.indexOf("export async function closeDurableLane"));
  const body = fn.slice(0, fn.indexOf("\nexport function verifyLaneTeardown"));
  assert.match(body, /verifyLaneTeardown\(/, "the close path looks");
  assert.match(body, /teardown_verified/, "and reports the verdict to its caller");
  assert.match(body, /a failed verification must never undo a completed close/,
    "while a failed check cannot un-close a lane that is closed");
});

// ── host health admission ────────────────────────────────────────────────────
test("H1. an idle host is HEALTHY and admits work", () => {
  const h = C.hostAdmissionHealth({ root: ROOT, loadavg: 0.2, freeMemRatio: 0.9, rssBytes: 200 * 1024 ** 2 });
  assert.equal(h.state, "HEALTHY");
  assert.equal(h.admits_new_work, true);
  assert.deepEqual(h.reasons, []);
  assert.ok(h.signals.runtime_generation, "the verdict carries the generation it was computed under");
});

test("H2. load and memory raise the state, and CONSTRAINED stops new work", () => {
  const cpus = C.hostAdmissionHealth({ root: ROOT, loadavg: 0, freeMemRatio: 1, rssBytes: 0 }).signals.cpu_count;
  const pressured = C.hostAdmissionHealth({ root: ROOT, loadavg: 1.2 * cpus, freeMemRatio: 0.9, rssBytes: 0 });
  assert.equal(pressured.state, "PRESSURED");
  assert.equal(pressured.admits_new_work, true, "PRESSURED sheds speculative work, it does not refuse legitimate work");

  const constrained = C.hostAdmissionHealth({ root: ROOT, loadavg: 2.5 * cpus, freeMemRatio: 0.9, rssBytes: 0 });
  assert.equal(constrained.state, "CONSTRAINED");
  assert.equal(constrained.admits_new_work, false);

  const critical = C.hostAdmissionHealth({ root: ROOT, loadavg: 0, freeMemRatio: 0.01, rssBytes: 0 });
  assert.equal(critical.state, "CRITICAL");
  assert.equal(critical.admits_new_work, false);
  assert.ok(critical.reasons.some((r) => /free memory/.test(r)), "and it says which signal decided");
});

test("H3. previous-generation ownership is a pressure signal — F feeding G", () => {
  R.registerOwnedProcess({ id: "stale-gen-1", lane_id: LANE, pid: DEAD_PID, runtime_generation: "gen_from_a_dead_gateway" }, ROOT);
  const h = C.hostAdmissionHealth({ root: ROOT, loadavg: 0.1, freeMemRatio: 0.9, rssBytes: 0 });
  assert.ok(h.signals.stale_generation_ownership >= 1, "records from a previous incarnation are counted");
  assert.equal(h.state, "PRESSURED");
  assert.ok(h.reasons.some((r) => /previous-generation/.test(r)));
});

test("H4. the signals are cheap — no scan may become an admission input", () => {
  const text = src("../lib/vacilando/control-plane-health.mjs");
  const fn = text.slice(text.indexOf("export function hostAdmissionHealth"), text.indexOf("export function getControlPlaneHealth"));
  for (const forbidden of [/["']du["']/, /--porcelain/, /readdirSync/, /execFileSync/, /spawnSync/, /["']docker["']/]) {
    assert.ok(!forbidden.test(fn), `an admission gate that runs ${forbidden} causes the pressure it measures`);
  }
  assert.match(fn, /os\.loadavg|os\.freemem/, "it uses kernel counters");
});

test("H5. admission consults it, and an unreadable signal never blocks work", () => {
  const text = src("../lib/vacilando/execution-admission.mjs");
  const fn = text.slice(text.indexOf("async function canProvisionNow"), text.indexOf("async function provisionBinding"));
  assert.match(fn, /hostAdmissionHealth/, "the capacity verdict now includes host health");
  assert.match(fn, /host_under_pressure/, "and says why it declined");
  assert.match(fn, /catch \{ \/\* an unreadable health signal must never be the thing that blocks work/,
    "a broken gauge must not become a stop signal");
  // The health block must only decline to START. Freeing a seat held by a parked
  // conversation is the pre-existing behaviour above it and is not this gate's.
  // Comments are stripped: this block's own prose says it never kills anything,
  // and a control that matched its own documentation would prove nothing.
  const gate = fn.slice(fn.indexOf("HOST HEALTH IS AN ADMISSION INPUT"), fn.indexOf("an unreadable health signal"))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^[\s\S]*?\*\//, "");
  assert.ok(fn.includes("HOST HEALTH IS AN ADMISSION INPUT"), "the gate is where the control expects it");
  assert.ok(!/kill|cancel|abort|terminate|suspend/i.test(gate),
    "the host-health gate never stops work that is already running");
  assert.match(gate, /admits_new_work/, "it only answers whether to start MORE");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.exit(fail ? 1 : 0);
