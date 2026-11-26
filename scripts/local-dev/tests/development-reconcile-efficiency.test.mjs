#!/usr/bin/env node
/**
 * THE CHEAP RECONCILE MUST BE CHEAP.
 *
 * MEASURED, against live-sized state (4.15 MB runs.json copied from the host):
 * one "cheap" Governor pass took 1016 ms — p95 1043 ms, against a <25 ms target —
 * and performed 127 large JSON.parse calls per pass: 517.7 MB of text, 488 ms of
 * it inside JSON.parse alone. Every one was the SAME runs.json, because
 * `getExecutionRun` reads the whole store to find one run and is called once per
 * run per helper.
 *
 * That pass runs every ten seconds. Roughly a second of CPU every ten, plus the
 * GC churn — the `fs ReadFileUtf8 → UTF-8 decode → JSON.parse → allocation → GC`
 * hot path the September 11 sampler caught, and the residual full-core burst
 * that SURVIVED moving Engineering Health off this event loop.
 *
 * After: 22.7 ms median, warm p95 21.8 ms, 5 parses, 11.2 MB.
 *
 * These controls hold the mechanism rather than the clock, so they mean the same
 * thing on a slower machine: the number of times the store is re-parsed, and the
 * rule that makes it safe — the write path is never memoized.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-reconcile-eff-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });

const E = await import("../lib/vacilando/execution-run.mjs");
const STORE = join(ROOT, "vacilando", "execution-runs", "runs.json");
const LANE = "lane_efficiency0001";

function writeStoreFile(runs) {
  writeFileSync(STORE, `${JSON.stringify({
    schema_version: E.EXECUTION_RUN_SCHEMA,
    lanes: { [LANE]: { current_run_id: runs[0]?.run_id || null, runs } },
  }, null, 2)}\n`, "utf8");
}

/** Count full parses of the run store by counting reads of its bytes. */
function countingParses(fn) {
  const real = JSON.parse;
  let n = 0;
  JSON.parse = function (text, ...rest) {
    if (typeof text === "string" && text.includes(`"${LANE}"`)) n += 1;
    return real.call(this, text, ...rest);
  };
  try { fn(); } finally { JSON.parse = real; }
  return n;
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  E.resetExecutionRunStoreMemoForTests();
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const RUNS = Array.from({ length: 40 }, (_, i) => ({
  schema_version: E.EXECUTION_RUN_SCHEMA,
  run_id: `erun_eff${String(i).padStart(12, "0")}`,
  lane_id: LANE,
  state: i === 0 ? "EXECUTING" : "COMPLETE",
  transitions: [],
}));

test("E1. repeated lookups of unchanged bytes parse the store ONCE", () => {
  writeStoreFile(RUNS);
  const parses = countingParses(() => {
    for (const r of RUNS) E.getExecutionRun(r.run_id, ROOT);
  });
  assert.equal(parses, 1, `40 lookups must cost one parse, not 40; cost ${parses}`);
  // And the answers are still right — a memo that returns the wrong run is not
  // an optimisation.
  assert.equal(E.getExecutionRun(RUNS[7].run_id, ROOT).run_id, RUNS[7].run_id);
  assert.equal(E.getExecutionRun("erun_nosuchrun000", ROOT), null);
});

test("E2. a write invalidates it — the next read sees what was just written", () => {
  writeStoreFile(RUNS);
  // RUNS[0] is the EXECUTING one; COMPLETE is irreversible and cannot be moved.
  assert.equal(E.getExecutionRun(RUNS[0].run_id, ROOT).state, "EXECUTING", "primed");
  const out = E.transitionExecutionRun(RUNS[0].run_id, "NEEDS_INPUT", {
    reason: "test", origin: "system", root: ROOT,
  });
  assert.equal(out?.ok ?? true, true, `the transition itself still works: ${out?.error || ""}`);
  assert.equal(E.getExecutionRun(RUNS[0].run_id, ROOT).state, "NEEDS_INPUT",
    "a stale memo after a write would be the worst failure this could have");
});

test("E3. a write from ANOTHER process invalidates it too", () => {
  writeStoreFile(RUNS);
  E.getExecutionRun(RUNS[0].run_id, ROOT);                     // prime
  const edited = RUNS.map((r) => (r.run_id === RUNS[0].run_id ? { ...r, state: "NEEDS_INPUT" } : r));
  writeStoreFile(edited);                                      // stands in for `vac run-status`
  assert.equal(E.getExecutionRun(RUNS[0].run_id, ROOT).state, "NEEDS_INPUT",
    "identity is (size, mtime, inode), so a foreign write misses on the next stat");
});

test("E4. the MUTATION path is never memoized", () => {
  const src = readFileSync(new URL("../lib/vacilando/execution-run.mjs", import.meta.url), "utf8");
  const guarded = src.slice(src.indexOf("export function readExecutionRunStoreGuarded"),
    src.indexOf("function readStoreForMutation"));
  assert.ok(!/runStoreMemo/.test(guarded),
    "a write computed from memoized bytes could overwrite a change it never saw");
  const mutation = src.slice(src.indexOf("function readStoreForMutation"), src.indexOf("function writeStore"));
  assert.match(mutation, /readExecutionRunStoreGuarded\(root\)/, "mutations always re-read");
  const writer = src.slice(src.indexOf("function writeStore"), src.indexOf("function iso("));
  assert.match(writer, /invalidateRunStoreMemo\(\)/, "and every write drops the memo on the way out");
});

test("E5. an unreadable store is never memoized", () => {
  writeFileSync(STORE, "{ this is not json", "utf8");
  const first = E.readExecutionRunStore(ROOT);
  assert.deepEqual(first.lanes, {}, "an unreadable store reads as empty for lenient callers");
  writeStoreFile(RUNS);
  assert.ok(E.getExecutionRun(RUNS[0].run_id, ROOT), 
    "caching 'I could not read it' would hold the empty answer for the whole max age");
});

test("E6. no reconciliation guarantee was traded away for the speed", () => {
  const src = readFileSync(new URL("../lib/vacilando/execution-reconcile.mjs", import.meta.url), "utf8");
  // The cheap pass must still perform every repair it did before. Widening the
  // timer or dropping a repair would have made the number go down too.
  for (const guarantee of [
    "reconcileAgentSessionsWithoutRuntime",
    "reconcileNeedsInputWithoutInput",
    "reconcileStaleExecutionRuns",
    "reconcileUndeliveredRuns",
    "evaluateAdmissionQueue",
    "reconcilePendingOrientation",
    "reconcileStuckStartingSessions",
  ]) {
    assert.match(src, new RegExp(guarantee), `${guarantee} is still on the cheap path`);
  }
  const server = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url), "utf8");
  assert.match(server, /maybeReconcileGovernor\(\{ reason: "periodic", depth: "cheap" \}\)[\s\S]{0,40}\}, 10000\)/,
    "the cheap cadence is unchanged at 10s — the cost was removed, not hidden behind a longer interval");
  assert.match(server, /reconcileGovernor\(\{ reason: "periodic", depth: "targeted" \}\)[\s\S]{0,40}\}, 30000\)/,
    "and the targeted cadence is unchanged at 30s");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
