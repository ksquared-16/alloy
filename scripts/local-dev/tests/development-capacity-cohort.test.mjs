#!/usr/bin/env node
/**
 * INTENDED CONCURRENCY IS NOT MEASURED CONCURRENCY.
 *
 * THE DEFECT. The Phase 2 capacity staircase started N servers, labelled the
 * window "Level N", and averaged every sample in it. The per-sample listener
 * counts recorded alongside told a different story:
 *
 *   Level 3   3, 3, 2, 2, 3, 3, 3, 3
 *   Level 4   4, 3
 *
 * Runtime Performance's server on 3011 stopped twice on its own mid-experiment.
 * Nothing was wrong with the host — another lane was managing its own dev
 * server, which is its business. But the resulting "Level 3" and "Level 4"
 * figures are averages over an unknown mixture, and they look authoritative.
 * That is worse than no number.
 *
 * These assert that membership is checked at every sample, that a contaminated
 * sample is excluded rather than averaged, that a level with no clean unbroken
 * window cannot be classified, and that the staircase refuses to advance past
 * one. The point is not to make levels pass; it is to make an invalid level say
 * so.
 */
import assert from "node:assert/strict";

const C = await import("../lib/vacilando/capacity-cohort.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const COHORT = C.defineCohort({
  level: 3,
  members: [
    { lane_id: "lane_rp", worktree: "wt1-work-unit-grade-a", slot: 1, port: 3011, pid: 111, ready: true },
    { lane_id: "lane_tr", worktree: "wt4-enrollment", slot: 4, port: 3014, pid: 444, ready: true },
    { lane_id: "lane_sf", worktree: "wt6-surfaces-faacca", slot: 6, port: 3016, pid: 666, ready: true },
  ],
});

const intact = [
  { port: 3011, pid: 111, ready: true, attributable: true },
  { port: 3014, pid: 444, ready: true, attributable: true },
  { port: 3016, pid: 666, ready: true, attributable: true },
];
const at = (n) => new Date(Date.parse("2026-09-02T20:00:00.000Z") + n * 150_000).getTime();

test("the cohort records identity, not just a count", () => {
  assert.equal(COHORT.expected_count, 3);
  assert.deepEqual(COHORT.members.map((m) => m.port), [3011, 3014, 3016]);
  // PID matters: a restart mid-window is a cold module graph wearing the same
  // port, and averaging it into a steady-state number hides a warm-up.
  assert.deepEqual(COHORT.members.map((m) => m.pid), [111, 444, 666]);
  assert.equal(COHORT.members[0].worktree, "wt1-work-unit-grade-a");
});

test("an intact cohort is a VALID sample", () => {
  const s = C.assessSample(COHORT, intact);
  assert.equal(s.valid, true);
  assert.equal(s.observed_count, 3);
  assert.equal(s.expected_count, 3);
  assert.deepEqual(s.problems, []);
});

test("THE ORIGINAL CONTAMINATION: a missing member invalidates the sample", () => {
  // This is literally the 3,3,2,2,3,3,3,3 case — 3011 gone.
  const s = C.assessSample(COHORT, intact.filter((o) => o.port !== 3011));
  assert.equal(s.valid, false);
  assert.equal(s.observed_count, 2);
  assert.equal(s.problems[0].reason, C.INVALID_REASONS.MISSING);
  assert.equal(s.problems[0].port, 3011);
  assert.equal(s.problems[0].worktree, "wt1-work-unit-grade-a", "the report names WHICH server left");
});

test("a member restarted onto a new PID is not continuous membership", () => {
  const s = C.assessSample(COHORT, [
    { port: 3011, pid: 999, ready: true, attributable: true },
    ...intact.slice(1),
  ]);
  assert.equal(s.valid, false);
  assert.equal(s.problems[0].reason, C.INVALID_REASONS.PID_CHANGED);
  assert.equal(s.problems[0].expected_pid, 111);
  assert.equal(s.problems[0].observed_pid, 999);
});

test("an EXTRA server outside the cohort also invalidates", () => {
  // "N servers plus something" is not a measurement of N.
  const s = C.assessSample(COHORT, [...intact, { port: 3015, pid: 555, ready: true, attributable: true }]);
  assert.equal(s.valid, false);
  assert.equal(s.problems.some((p) => p.reason === C.INVALID_REASONS.FOREIGN && p.port === 3015), true);
});

test("an unattributable or unready member invalidates", () => {
  const unattributable = C.assessSample(COHORT, [
    { port: 3011, pid: 111, ready: true, attributable: false }, ...intact.slice(1),
  ]);
  assert.equal(unattributable.problems[0].reason, C.INVALID_REASONS.UNATTRIBUTABLE);

  const unready = C.assessSample(COHORT, [
    { port: 3011, pid: 111, ready: false, attributable: true }, ...intact.slice(1),
  ]);
  assert.equal(unready.problems[0].reason, C.INVALID_REASONS.NOT_READY);
});

test("a clean window is measured as an UNBROKEN run, not a majority", () => {
  // 6 of 8 samples valid, but the clean stretches are 2 and 4 — so the level
  // held for 4 samples, not 6. Averaging all 6 is the original defect.
  const samples = [true, true, false, false, true, true, true, true]
    .map((ok, i) => C.assessSample(COHORT, ok ? intact : intact.slice(1), { nowMs: at(i) }));
  const w = C.summariseWindow(samples, { minValidMs: 0, sampleIntervalMs: 150_000 });
  assert.equal(w.samples_total, 8);
  assert.equal(w.samples_valid, 6);
  assert.equal(w.longest_valid_run, 4, "the unbroken run is what counts");
  assert.deepEqual(w.valid_sample_indices, [4, 7]);
  assert.equal(w.valid_span_ms, 3 * 150_000);
});

test("every contamination is reported with when and what", () => {
  const samples = [true, false, true].map((ok, i) =>
    C.assessSample(COHORT, ok ? intact : intact.slice(1), { nowMs: at(i) }));
  const w = C.summariseWindow(samples, { sampleIntervalMs: 150_000 });
  assert.equal(w.contaminations.length, 1);
  assert.equal(w.contaminations[0].reason, C.INVALID_REASONS.MISSING);
  assert.equal(w.contaminations[0].port, 3011);
  assert.ok(w.contaminations[0].at, "a contamination without a timestamp cannot be chased");
});

test("a level with no clean hold is NOT CLASSIFIABLE", () => {
  // The real Level 4: two samples, 4 then 3. There is no window here at all.
  const samples = [
    C.assessSample(COHORT, intact, { nowMs: at(0) }),
    C.assessSample(COHORT, intact.slice(1), { nowMs: at(1) }),
  ];
  const w = C.summariseWindow(samples, { minValidMs: 20 * 60_000, sampleIntervalMs: 150_000 });
  assert.equal(w.classifiable, false);
  assert.equal(w.meets_hold, false);
  assert.equal(w.longest_valid_run, 1);
});

test("the staircase REFUSES to advance past an unclassifiable level", () => {
  const bad = C.summariseWindow(
    [C.assessSample(COHORT, intact, { nowMs: at(0) }), C.assessSample(COHORT, intact.slice(1), { nowMs: at(1) })],
    { minValidMs: 20 * 60_000, sampleIntervalMs: 150_000 },
  );
  const gate = C.mayAdvance(bad);
  assert.equal(gate.ok, false);
  assert.equal(gate.error, "level_not_classifiable");
  assert.match(gate.detail, /no valid hold window/);

  const good = C.summariseWindow(
    Array.from({ length: 10 }, (_, i) => C.assessSample(COHORT, intact, { nowMs: at(i) })),
    { minValidMs: 20 * 60_000, sampleIntervalMs: 150_000 },
  );
  assert.equal(good.classifiable, true, "10 samples over 22.5 minutes clears a 20-minute hold");
  assert.equal(C.mayAdvance(good).ok, true);
});

test("a single valid sample is never a hold", () => {
  // One good reading proves nothing about a sustained level.
  const w = C.summariseWindow([C.assessSample(COHORT, intact, { nowMs: at(0) })],
    { minValidMs: 0, sampleIntervalMs: 150_000 });
  assert.equal(w.longest_valid_run, 1);
  assert.equal(w.classifiable, false, "a hold needs more than one point");
  assert.equal(C.mayAdvance(w).ok, false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
