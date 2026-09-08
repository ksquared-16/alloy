#!/usr/bin/env node
/**
 * VALIDATING WAS A ONE-WAY STATE.
 *
 * It sat in PROTECTIVE_STATES beside WAITING_RESOURCE and NEEDS_INPUT, whose
 * unconditional protection is justified because they wait on a PERSON. But
 * VALIDATING waits on a MACHINE, and a machine either holds a broker claim or
 * it does not. Nothing exited the state on its own, so a run that entered it
 * and never reported again stayed open forever.
 *
 * MEASURED: the Payments run entered VALIDATING at 19:47 and was still there
 * three hours later. Its pane read "Crunched for 58s · done" at an idle prompt,
 * there was no vitest, tsc, build or heavy process in its worktree, and ZERO
 * active resource claims existed on the host. Every check answered
 * `protective_state_validating`, so the Director was told "this lane still has
 * an open run" and offered manual stale-run surgery after an ordinary,
 * successful turn.
 *
 * What these lock down is the SHAPE of the correction: absence of a claim lifts
 * an unconditional BLOCK, and never by itself completes a run. Completion still
 * requires the full positive-evidence chain.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyExecutionRunStale, maybeCompleteIdleTurnFromLastOutput,
  setClaimsReaderForTests, resetClaimsReaderForTests, STALE_SETTLE_MS,
} from "../lib/vacilando/execution-stale.mjs";

const SRC = readFileSync(new URL("../lib/vacilando/execution-stale.mjs", import.meta.url), "utf8");
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
async function atest(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const NOW = Date.now();
const ago = (ms) => new Date(NOW - ms).toISOString();
const validating = (age) => ({
  run_id: "r1", lane_id: "lane_x", state: "VALIDATING",
  worktree_path: "/tmp/wt", updated_at: ago(age), started_at: ago(age + 60000),
  last_worker_report_at: ago(age), worker_report_count: 6, latest_progress: { summary: "s" },
});
const facts = (age) => ({ now_ms: NOW, session_alive: true, session_state: "ACTIVE",
  worker_report_ms: NOW - age, delivered_ms: NOW - age - 60000 });

test("1. a VALIDATING run with a live claim stays protected, however old", () => {
  setClaimsReaderForTests(() => [{ type: "cpu_heavy_job", resourceKey: "/tmp/wt" }]);
  try {
    const c = classifyExecutionRunStale(validating(6 * 3600e3), facts(6 * 3600e3));
    assert.equal(c.class, "active");
    assert.equal(c.reason, "protective_state_validating", "a real validation must never be disturbed");
  } finally { resetClaimsReaderForTests(); }
});

test("2. a VALIDATING run is protected before settle even with no claim", () => {
  // Silence is not proof. A validation that has not yet claimed the broker is
  // indistinguishable from one about to.
  setClaimsReaderForTests(() => []);
  try {
    const c = classifyExecutionRunStale(validating(60_000), facts(60_000));
    assert.equal(c.reason, "protective_state_validating");
  } finally { resetClaimsReaderForTests(); }
});

test("3. past settle with no claim it stops being UNCONDITIONALLY blocked", () => {
  setClaimsReaderForTests(() => []);
  try {
    const c = classifyExecutionRunStale(validating(3 * 3600e3), facts(3 * 3600e3));
    assert.notEqual(c.reason, "protective_state_validating");
    assert.notEqual(c.reason, "not_executing", "the second gate must not re-block it");
  } finally { resetClaimsReaderForTests(); }
});

test("4. lifting the block is NOT the same as declaring the run stale", () => {
  // The whole safety property. It becomes evaluable, not finished.
  setClaimsReaderForTests(() => []);
  try {
    const c = classifyExecutionRunStale(validating(3 * 3600e3), facts(3 * 3600e3));
    assert.notEqual(c.class, "stale", "absence of a claim is not evidence a run completed");
    assert.equal(c.class, "ambiguous");
  } finally { resetClaimsReaderForTests(); }
});

test("5. an unreadable claims store reads as no-claim, never throws", () => {
  setClaimsReaderForTests(() => { throw new Error("store unreadable"); });
  try {
    const c = classifyExecutionRunStale(validating(3 * 3600e3), facts(3 * 3600e3));
    assert.ok(c.class, "classification must survive an unreadable store");
  } finally { resetClaimsReaderForTests(); }
});

test("6. the settle window is the shared one, not a new shorter timeout", () => {
  // The instruction was explicit: do not solve this with a shorter stale
  // timeout. The fix reuses STALE_SETTLE_MS and adds positive claim evidence.
  assert.equal(STALE_SETTLE_MS, 20 * 60 * 1000);
  assert.match(SRC, /validationSettled/);
  assert.match(SRC, /validation_in_flight/);
});

test("7. VALIDATING is corrected the same way RECOVERING already was", () => {
  assert.match(SRC, /run\.state === "RECOVERING" && recoverySettled/);
  assert.match(SRC, /run\.state === "VALIDATING" && validationSettled/);
});

await atest("8. a settled VALIDATING run may now reach idle-turn completion", async () => {
  setClaimsReaderForTests(() => []);
  try {
    const lane = {
      execution_run: validating(3 * 3600e3),
      provider_activity: { activity: "ready", live_progress: { idle_result: true } },
    };
    const r = await maybeCompleteIdleTurnFromLastOutput(lane, { root: "/nonexistent", nowMs: NOW });
    assert.notEqual(r.skipped, "not_executing", "the state gate must no longer refuse it");
  } finally { resetClaimsReaderForTests(); }
});

await atest("9. widening the state gate did not weaken any evidence gate", async () => {
  setClaimsReaderForTests(() => []);
  try {
    // Idle pane but the turn did NOT finish: still refused, on the evidence.
    const unfinished = {
      execution_run: validating(3 * 3600e3),
      provider_activity: { activity: "ready", live_progress: { idle_result: false } },
    };
    assert.equal((await maybeCompleteIdleTurnFromLastOutput(unfinished, { root: "/nonexistent", nowMs: NOW })).skipped, "turn_not_finished");
    // Pane not idle at all: refused.
    const busy = {
      execution_run: validating(3 * 3600e3),
      provider_activity: { activity: "working", live_progress: { idle_result: true } },
    };
    assert.equal((await maybeCompleteIdleTurnFromLastOutput(busy, { root: "/nonexistent", nowMs: NOW })).skipped, "not_idle");
  } finally { resetClaimsReaderForTests(); }
});

await atest("10. a fresh VALIDATING run is still refused by the state gate", async () => {
  setClaimsReaderForTests(() => []);
  try {
    const lane = {
      execution_run: validating(60_000),
      provider_activity: { activity: "ready", live_progress: { idle_result: true } },
    };
    assert.equal((await maybeCompleteIdleTurnFromLastOutput(lane, { root: "/nonexistent", nowMs: NOW })).skipped, "not_executing");
  } finally { resetClaimsReaderForTests(); }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
