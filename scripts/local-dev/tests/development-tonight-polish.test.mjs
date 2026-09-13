#!/usr/bin/env node
/**
 * THE LAST MILE: WORDS, A CLOCK THAT IS NOT A SCHEDULER, AND FOUR BLANK LINES.
 *
 * None of this is architecture. All of it is what an operator actually reads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OPERATING_REPORT_SCHEDULE, reportIsDue, reportId,
} from "../lib/vacilando/operating-report.mjs";
import {
  governedRequestRetentionCap, retainGovernedRequests,
} from "../lib/vacilando/governed-action-request.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const V = await import("../apps/vacilando/public/gateway-view.mjs");

/* ── A: THE SENTENCE SAID THE VERB TWICE ─────────────────────────────────── */

test("P1. THE DEFECT: a label that is only a verb does not become the noun", () => {
  // "Authorize authorized. Director is executing."
  const t = V.governedDecisionNotice({
    approve: true, approveLabel: "Authorize", actionKey: "platform.register_developer_application",
  }).text;
  assert.equal(t, "Application registration approved. Director is executing.");
  assert.doesNotMatch(t, /Authorize authorized/i);
});

test("P2. a label that carries a noun keeps it, capitalised", () => {
  // "merge authorized" — right word, wrong case, wrong verb.
  const t = V.governedDecisionNotice({
    approve: true, approveLabel: "Authorize merge", actionKey: "repository.merge_pull_request",
  }).text;
  assert.equal(t, "Merge approved. Director is executing.");
});

test("P3. the newer actions have nouns of their own", () => {
  for (const [key, noun] of [
    ["vacilando.retire_worktree", "Worktree retirement"],
    ["host.install_toolkit", "Toolkit install"],
    ["environment.execute_registered_reconciliation", "Reconciliation"],
  ]) {
    const t = V.governedDecisionNotice({ approve: true, approveLabel: "Authorize", actionKey: key }).text;
    assert.equal(t, `${noun} approved. Director is executing.`);
  }
});

test("P4. denial and refusal copy is untouched", () => {
  assert.equal(V.governedDecisionNotice({ approve: false }).text, "Denied.");
  assert.equal(
    V.governedDecisionNotice({ error: "self_approval_refused" }).text,
    "This lane cannot approve its own request.",
  );
});

/* ── B: THE SAME GAP AT BOTH ENDS OF A TURN ──────────────────────────────── */

const idleRun = (over = {}) => ({
  lane_id: "a", provider_activity: { activity: "ready" },
  execution_run: { state: "EXECUTING", run_id: "r1", started_at: "2026-09-13T22:00:00.000Z" },
  ...over,
});

test("P5. a run that has produced nothing yet is Starting, not Finalizing", () => {
  const st = V.canonicalLaneWorkState(idleRun({ last_activity_ms: Date.parse("2026-09-13T21:59:00.000Z") }));
  assert.equal(st.label, "Starting");
  assert.equal(st.turn_phase, "starting");
});

test("P6. a run that has produced and gone quiet is still Finalizing", () => {
  const st = V.canonicalLaneWorkState(idleRun({ last_activity_ms: Date.parse("2026-09-13T22:05:00.000Z") }));
  assert.equal(st.label, "Finalizing");
  assert.equal(st.turn_phase, "finalizing");
});

test("P7. when it cannot be told apart, it does not guess", () => {
  /*
   * Finalizing is the cautious half: it tells an operator not to send yet.
   * Being early with that warning costs less than being late with it.
   */
  const st = V.canonicalLaneWorkState(idleRun({}));
  assert.equal(st.label, "Finalizing");
  assert.equal(st.turn_phase, "unknown");
});

test("P8. PRESENTATION ONLY — the state itself did not move", () => {
  const starting = V.canonicalLaneWorkState(idleRun({ last_activity_ms: Date.parse("2026-09-13T21:59:00.000Z") }));
  const finalizing = V.canonicalLaneWorkState(idleRun({ last_activity_ms: Date.parse("2026-09-13T22:05:00.000Z") }));
  for (const f of ["key", "group", "tone", "source", "live", "stale"]) {
    assert.deepEqual(starting[f], finalizing[f], `${f} must not change with the wording`);
  }
  assert.equal(starting.key, "finalizing");
  assert.equal(starting.source, "agent_idle_run_open");
});

/* ── C: RESTART REQUIRED IS NOT REQUIRED OF YOU ──────────────────────────── */

test("P9. the install result names the convergence state in words", () => {
  /*
   * `gateway_restart_required: true` is a true statement about the Gateway and a
   * misleading one about the operator: the restart is already owned by the
   * TOOLKIT_DRIFT episode. Read from the source rather than by installing a
   * toolkit inside a test, which is not a thing a test may do.
   */
  const src = readFileSync(new URL("../lib/vacilando/toolkit-convergence.mjs", import.meta.url), "utf8");
  assert.match(src, /CONVERGENCE_SCHEDULED/);
  assert.match(src, /state: "CONVERGED"/);
  assert.match(src, /operator_action_required: false/);
  assert.match(src, /convergence,/, "and it is returned with the install result");
  // The flag stays for every existing reader.
  assert.match(src, /gateway_restart_required: restartRequired/);
});

/* ── D: A SCHEDULE, NOT A SCHEDULER ──────────────────────────────────────── */

test("P10. the cadence is declared data, at the configured times", () => {
  assert.equal(OPERATING_REPORT_SCHEDULE.daily.hour, 18);
  assert.equal(OPERATING_REPORT_SCHEDULE.daily.minute, 30);
  assert.equal(OPERATING_REPORT_SCHEDULE.daily.days, null, "every day");
  assert.equal(OPERATING_REPORT_SCHEDULE.weekly.hour, 18);
  assert.deepEqual([...OPERATING_REPORT_SCHEDULE.weekly.days], [0], "Sunday");
});

test("P11. a timer that fires late still finds it due; one that fires early does not", () => {
  const sunday = (h, m) => new Date(2026, 8, 13, h, m); // 2026-09-13 is a Sunday
  assert.equal(reportIsDue("daily", sunday(18, 30)).due, true);
  assert.equal(reportIsDue("daily", sunday(18, 55)).due, true, "within the grace window");
  assert.equal(reportIsDue("daily", sunday(18, 29)).due, false);
  assert.equal(reportIsDue("daily", sunday(19, 30)).due, false, "and not all evening");
});

test("P12. the weekly report is due only on its day", () => {
  assert.equal(reportIsDue("weekly", new Date(2026, 8, 13, 18, 30)).due, true, "Sunday");
  assert.equal(reportIsDue("weekly", new Date(2026, 8, 14, 18, 30)).due, false, "Monday");
});

test("P13. firing twice cannot produce two reports", () => {
  // Duplication is prevented by IDENTITY, not by timing.
  const a = reportId({ kind: "daily", windowStart: "2026-09-13T00:00:00.000Z", windowEnd: "2026-09-14T00:00:00.000Z" });
  const b = reportId({ kind: "daily", windowStart: "2026-09-13T00:00:00.000Z", windowEnd: "2026-09-14T00:00:00.000Z" });
  assert.equal(a, b);
});

/* ── E: A WEEK THAT CANNOT SEE ITSELF ────────────────────────────────────── */

test("P14. retention keeps a week, and still never evicts an unanswered request", () => {
  /*
   * 200 was fine for a queue and poor for history: one busy day produced 200
   * governed actions, so the weekly report's SHIPPING figures were identical to
   * the daily one - the week had no older records left to count.
   */
  assert.equal(governedRequestRetentionCap(), 1000);
  const many = Array.from({ length: 1500 }, (_, i) => ({ request_id: `g${i}`, status: "complete" }));
  many.push({ request_id: "pending", status: "awaiting_operator" });
  const kept = retainGovernedRequests(many);
  assert.equal(kept.length, 1000);
  assert.ok(kept.some((r) => r.request_id === "pending"), "an unanswered request is never disposable");
});

test("P15. the cap is a setting, not a number in the code", () => {
  const prev = process.env.VACILANDO_GOVERNED_REQUEST_RETENTION;
  try {
    process.env.VACILANDO_GOVERNED_REQUEST_RETENTION = "50";
    assert.equal(governedRequestRetentionCap(), 50);
    process.env.VACILANDO_GOVERNED_REQUEST_RETENTION = "nonsense";
    assert.equal(governedRequestRetentionCap(), 1000, "a bad value falls back rather than truncating history");
  } finally {
    if (prev === undefined) delete process.env.VACILANDO_GOVERNED_REQUEST_RETENTION;
    else process.env.VACILANDO_GOVERNED_REQUEST_RETENTION = prev;
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
