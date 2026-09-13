#!/usr/bin/env node
/**
 * AN OPERATING REPORT WHOSE FIGURES ARE SOMETIMES GUESSES IS ONE NOBODY CAN ACT ON.
 *
 * Every number here is derived from authoritative platform state. The tests that
 * matter are the ones about what the report REFUSES to say: a stage with no
 * samples is null rather than zero, operator time is never added to system time,
 * and a join that matches the wrong row is caught rather than published.
 *
 * Three real defects were found by looking at the output instead of trusting it:
 *
 *   - joining notifications on request id alone matched
 *     `governed_action_approval_required`, which is created BEFORE the thing it
 *     announces. P50 came out at MINUS 58 seconds. A negative latency is not a
 *     fast system, it is a join that matched the wrong row.
 *   - anchoring a run's terminal moment on `updated_at` measured from the last
 *     time anything touched the record, which for a resumed run is after its own
 *     notification. P50 minus 33 seconds.
 *   - classifying governance refusals with a regex over failure codes scored
 *     0 of 19, because the codes that actually occur contain none of the words a
 *     person would guess.
 */
import assert from "node:assert/strict";

import {
  buildOperatingReport, distribution, percentile, renderOperatingReport, reportId,
  GOVERNANCE_REFUSALS,
} from "../lib/vacilando/operating-report.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const WSTART = "2026-09-13T00:00:00.000Z";
const WEND = "2026-09-14T00:00:00.000Z";
const at = (s) => `2026-09-13T${s}.000Z`;

const req = (over = {}) => ({
  request_id: "gar_1", action_key: "repository.push", status: "complete",
  created_at: at("10:00:00"), updated_at: at("10:00:10"),
  decision_timing: {
    accepted_at: at("10:00:01"), execution_started_at: at("10:00:02"),
    execution_settled_at: at("10:00:08"), projection_visible_at: at("10:00:09"),
  },
  ...over,
});

test("N1. the same window always produces the same report id", () => {
  // A cadence that fires twice must not create a second "today".
  const a = reportId({ kind: "daily", windowStart: WSTART, windowEnd: WEND });
  const b = reportId({ kind: "daily", windowStart: WSTART, windowEnd: WEND });
  assert.equal(a, b);
  assert.notEqual(a, reportId({ kind: "weekly", windowStart: WSTART, windowEnd: WEND }));
  assert.notEqual(a, reportId({ kind: "daily", windowStart: "2026-09-12T00:00:00.000Z", windowEnd: WEND }));
});

test("N2. an unmeasured stage is null, never zero", () => {
  // Zero is a measurement. Reporting it for "we did not measure" is the lie
  // this report exists to avoid.
  assert.equal(percentile([], 0.5), null);
  assert.deepEqual(distribution([]), { n: 0, p50: null, p95: null, max: null });
  const r = buildOperatingReport({ windowStart: WSTART, windowEnd: WEND, requests: [] });
  assert.equal(r.speed.execution.p50, null);
  assert.equal(r.speed.execution.n, 0);
});

test("N3. operator time is never added to system time", () => {
  /*
   * The measured end-to-end P50 was 13.63s and the max 256s, almost all of it a
   * person deciding. Reporting that as platform latency would send the next
   * mission to optimise a queue already answering in 70ms.
   */
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND,
    requests: [req({ operator_approval: { decision: "approved", at: at("10:30:00") } })],
  });
  assert.equal(r.speed.execution.p50, 6, "system time is the executor's 6 seconds");
  assert.equal(r.speed.approval_operator_time.p50, 1800, "and the half hour is the operator's");
  assert.equal(r.speed.slowest_system_stage.stage, "execution",
    "the slowest SYSTEM stage never names an operator wait");
});

test("N4. a notification created before the outcome cannot measure the outcome", () => {
  // The minus-58-second join, locked.
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND,
    requests: [req()],
    notifications: [{ request_id: "gar_1", created_at: at("09:59:00"), event_type: "governed_action_approval_required" }],
  });
  assert.equal(r.speed.notification_settled_to_created.n, 0, "an earlier notification is not a sample");
  assert.equal(r.speed.notification_settled_to_created.p50, null, "and an unmeasurable stage stays null");
});

test("N5. a run's terminal moment is its terminal transition, not updated_at", () => {
  // The minus-33-second anchor, locked.
  const run = {
    run_id: "erun_1", state: "COMPLETE", created_at: at("09:00:00"), updated_at: at("12:00:00"),
    transitions: [{ to_state: "COMPLETE", occurred_at: at("10:00:00") }],
  };
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND, runs: [run],
    notifications: [{ run_id: "erun_1", event_type: "complete", created_at: at("10:00:02"), delivery: { at: at("10:00:03") } }],
  });
  assert.equal(r.speed.run_terminal_to_notified.p50, 2, "measured from the transition that made it terminal");
  assert.equal(r.speed.notification_created_to_delivered.p50, 1);
});

test("N6. a refusal is the system working, and is enumerated rather than guessed", () => {
  /*
   * The regex scored 0 of 19. These are the codes that actually occurred, and
   * none of them contains "denied", "policy" or "refus".
   */
  for (const code of ["result_validation_failed", "missing_expected_head_sha", "source_sha_not_reachable"]) {
    assert.ok(GOVERNANCE_REFUSALS.has(code), `${code} is a guard, not a breakage`);
  }
  assert.equal(GOVERNANCE_REFUSALS.has("execution_failed"), false, "and a real failure is still a failure");
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND,
    requests: [
      req({ request_id: "a", status: "failed", failure_code: "head_drift" }),
      req({ request_id: "b", status: "failed", failure_code: "execution_failed" }),
    ],
  });
  assert.equal(r.quality.failed, 2);
  assert.equal(r.quality.governance_refusals, 1, "one guard, one breakage");
});

test("N7. an unknown failure code counts as a failure, not as governance", () => {
  // The safe direction: a new guard reads as a failure until someone adds it,
  // rather than a new breakage quietly reading as the system working.
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND,
    requests: [req({ status: "failed", failure_code: "something_nobody_has_seen" })],
  });
  assert.equal(r.quality.governance_refusals, 0);
});

test("N8. autonomy counts who was ASKED, not who was told", () => {
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND,
    requests: [
      req({ request_id: "a" }),
      req({ request_id: "b", operator_approval: { decision: "approved", at: at("10:05:00") } }),
      req({ request_id: "c", operator_approval: { decision: "denied", at: at("10:05:00") } }),
    ],
  });
  assert.equal(r.autonomy.terminal_actions, 3);
  assert.equal(r.autonomy.autonomous, 1);
  assert.equal(r.autonomy.required_approval, 2);
  assert.equal(r.autonomy.approvals_denied, 1);
  assert.equal(r.autonomy.autonomous_pct, 33);
});

test("N9. work outside the window is not this report's work", () => {
  const r = buildOperatingReport({
    windowStart: WSTART, windowEnd: WEND,
    requests: [req({ updated_at: "2026-09-12T23:59:59.000Z" }), req({ request_id: "z" })],
  });
  assert.equal(r.quality.governed_actions, 1);
});

test("N10. the prose is rendered from the object, never computed twice", () => {
  const r = buildOperatingReport({ windowStart: WSTART, windowEnd: WEND, requests: [req()] });
  const text = renderOperatingReport(r);
  assert.match(text, new RegExp(r.report_id));
  assert.match(text, /P50 6s/, "the same number the object carries");
  assert.match(text, /no samples/, "and an empty stage says so rather than showing a zero");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
