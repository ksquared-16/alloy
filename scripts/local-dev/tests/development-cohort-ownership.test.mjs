#!/usr/bin/env node
/**
 * THE COHORT MUST INVALIDATE ON WHAT IT CANNOT SEE.
 *
 * A capacity level is a claim about exactly N servers. Every way that claim can
 * be false has to invalidate the window, and the two that used to slip through
 * are the dangerous ones: a listener whose ownership could not be read (counted
 * as absent, shrinking the level silently) and an expected port held by the
 * WRONG worktree (counted as present, because something was listening). The
 * second is the Financials-on-3011 collision — N listeners, one of them serving
 * another lane.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const C = await import("../lib/vacilando/capacity-cohort.mjs");
const O = await import("../lib/vacilando/dev-server-ownership.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const members = [
  { lane_id: "l4", worktree: "wt4", slot: 4, port: 3014, pid: 34930, ready: true },
  { lane_id: "l5", worktree: "wt5", slot: 5, port: 3015, pid: 88425, ready: true },
];
const cohort = C.defineCohort({ level: 2, members });
const good = [
  { port: 3014, pid: 34930, attributable: true, ready: true, worktree: "wt4" },
  { port: 3015, pid: 88425, attributable: true, ready: true, worktree: "wt5" },
];

test("a clean cohort is valid", () => {
  const s = C.assessSample(cohort, good);
  assert.equal(s.valid, true, JSON.stringify(s.problems));
  assert.equal(s.observed_count, 2);
});

test("an unattributable listener invalidates the sample", () => {
  const s = C.assessSample(cohort, [
    { ...good[0], attributable: false },
    good[1],
  ]);
  assert.equal(s.valid, false);
  assert.equal(s.problems[0].reason, C.INVALID_REASONS.UNATTRIBUTABLE);
});

test("a missing expected member invalidates the sample", () => {
  const s = C.assessSample(cohort, [good[1]]);
  assert.equal(s.valid, false);
  assert.equal(s.problems[0].reason, C.INVALID_REASONS.MISSING);
});

test("a replaced PID invalidates the sample", () => {
  const s = C.assessSample(cohort, [{ ...good[0], pid: 99999 }, good[1]]);
  assert.equal(s.valid, false);
  assert.equal(s.problems[0].reason, C.INVALID_REASONS.PID_CHANGED);
});

test("an unexpected extra server invalidates the sample", () => {
  const s = C.assessSample(cohort, [...good, { port: 3016, pid: 11412, attributable: true, ready: true, worktree: "wt6" }]);
  assert.equal(s.valid, false);
  assert.equal(s.problems.some((p) => p.reason === C.INVALID_REASONS.FOREIGN), true);
});

test("an expected port held by the wrong worktree is a foreign owner, not a restart", () => {
  // The collision: something IS listening on 3014, so a naive counter sees two
  // servers and calls the level clean. It belongs to wt2.
  const s = C.assessSample(cohort, [
    { port: 3014, pid: 55555, attributable: true, ready: true, worktree: "wt2" },
    good[1],
  ]);
  assert.equal(s.valid, false);
  const p = s.problems[0];
  assert.equal(p.reason, C.INVALID_REASONS.FOREIGN_OWNER,
    "a foreign owner must not be reported as a restarted member");
  assert.equal(p.observed_worktree, "wt2");
  assert.equal(p.observed_pid, 55555);
});

test("ownership discovery is not duplicated inside the cohort", () => {
  // One producer. The cohort judges observations; it must not learn to make one.
  const src = readFileSync(new URL("../lib/vacilando/capacity-cohort.mjs", import.meta.url), "utf8");
  // Match an INVOCATION, not the word: the module's own comment names lsof in
  // order to forbid it, and a test that cannot tell those apart would force the
  // explanation out of the file.
  assert.doesNotMatch(src, /lsof\s+-/, "capacity-cohort must not invoke lsof");
  assert.doesNotMatch(src, /execFileSync|spawnSync|execSync/, "capacity-cohort must not probe processes");
  assert.doesNotMatch(src, /child_process/, "capacity-cohort must not reach for a process API");
});

test("the observer reports three states and never calls unknown free", () => {
  assert.equal(O.OWNERSHIP_STATES.UNATTRIBUTABLE, "unattributable_listener");
  assert.equal(O.OWNERSHIP_STATES.FOREIGN_PORT_OWNER, "foreign_port_owner");
  // A port number that cannot be probed must not come back as stopped.
  const bad = O.observeMember({ port: -1, worktreesRoot: "/tmp" });
  assert.equal(bad.attributable, false);
  assert.equal(bad.state, O.OWNERSHIP_STATES.UNATTRIBUTABLE);
});

test("worktree attribution refuses a path outside the worktrees root", () => {
  assert.equal(O.worktreeOfPath("/tmp/elsewhere/web", "/Users/x/alloy-worktrees"), null);
  assert.equal(O.worktreeOfPath("/Users/x/alloy-worktrees/wt6/web", "/Users/x/alloy-worktrees"), "wt6");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
