#!/usr/bin/env node
/**
 * A NOTIFICATION MUST NOT ASK FOR A TRANSITION THE STATE MACHINE REFUSES.
 *
 * MEASURED, lane_db3431e755a8. Run erun_0ef763c4a6a8e491 went
 * QUEUED -> EXECUTING (admission_delivered) -> FAILED (delivery_unacknowledged,
 * governor) in 30 seconds, and the lane's `current_run_id` was left null. Three
 * notifications followed: one asserting "The current Execution Run is still
 * open", and two instructing `vac run-status <run> complete`. Every attempt was
 * refused `illegal_transition (FAILED -> COMPLETE)`.
 *
 * The refusal was correct. The instruction was the defect: the success builder
 * appended a close command whenever the record carried a run id, and the
 * failure builder asserted openness unconditionally. Neither had ever read the
 * run.
 *
 * These controls hold the boundary in both directions — the guidance must
 * appear when it is true, and must not appear when it is not — and they hold
 * the state machine itself, because "make FAILED -> COMPLETE legal" is the
 * wrong way to make a sentence come true.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-run-notif-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });

const G = await import("../lib/vacilando/governed-action-request.mjs");
const { EXECUTION_RUN_SCHEMA, isLegalRunTransition } = await import("../lib/vacilando/execution-run.mjs");

const LANE = "lane_db3431e755a8";
const RUN = "erun_0ef763c4a6a8e491";

/**
 * The run store as the incident left it. Written directly so the controls
 * exercise the real readers — `getExecutionRun` and `activeRunForLane` — rather
 * than a stub of them.
 */
function store({ state, currentRunId, transitions = [] }) {
  writeFileSync(join(ROOT, "vacilando", "execution-runs", "runs.json"), `${JSON.stringify({
    schema_version: EXECUTION_RUN_SCHEMA,
    lanes: {
      [LANE]: {
        current_run_id: currentRunId,
        runs: [{
          schema_version: EXECUTION_RUN_SCHEMA,
          run_id: RUN, lane_id: LANE, state, transitions,
        }],
      },
    },
  }, null, 2)}\n`, "utf8");
}

const REC = Object.freeze({
  request_id: "gar_8cb6e92d505e82",
  action_key: "repository.merge_pull_request",
  target: "staging",
  run_id: RUN,
  lane_id: LANE,
  failure_code: "execution_failed",
  failure_reason: "required_checks_pending",
});

const GOVERNOR_FAILURE = [
  { from_state: null, to_state: "QUEUED", occurred_at: "2026-09-11T21:22:11.066Z", reason: "operator_send", origin: "operator" },
  { from_state: "QUEUED", to_state: "EXECUTING", occurred_at: "2026-09-11T21:22:22.678Z", reason: "admission_delivered", origin: "governor" },
  { from_state: "EXECUTING", to_state: "FAILED", occurred_at: "2026-09-11T21:22:41.953Z", reason: "delivery_unacknowledged", origin: "governor" },
];

const CLOSE_COMMAND = /run-status\s+\S+\s+complete/;

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const bothNotices = (rec = REC) => [
  G.continuationTextForGovernedAction(rec, { id: "tha_x", result: {} }, { root: ROOT }),
  G.continuationTextForFailedGovernedAction(rec, { root: ROOT }),
];

// ── the guidance appears when it is true ─────────────────────────────────────
test("N1. an EXECUTING run the lane owns gets valid completion guidance", () => {
  store({ state: "EXECUTING", currentRunId: RUN });
  const g = G.runClosureGuidance(REC, { root: ROOT });
  assert.equal(g.state, "EXECUTING");
  assert.equal(g.lane_owns_run, true);
  assert.equal(g.may_report_complete, true);
  assert.match(g.lines.join("\n"), CLOSE_COMMAND, "an open run the lane owns is closed by the lane");
  assert.match(g.lines.join("\n"), new RegExp(`--lane ${LANE}`), "and the lane is named");
  assert.match(G.continuationTextForGovernedAction(REC, { id: "tha_x", result: {} }, { root: ROOT }), CLOSE_COMMAND);
});

// ── and must not when it is not ──────────────────────────────────────────────
test("N2. a FAILED run is never told to report complete", () => {
  store({ state: "FAILED", currentRunId: RUN, transitions: GOVERNOR_FAILURE });
  const g = G.runClosureGuidance(REC, { root: ROOT });
  assert.equal(g.may_report_complete, false);
  assert.equal(CLOSE_COMMAND.test(g.lines.join("\n")), false, "FAILED -> COMPLETE is refused; asking for it strands the operator");
  for (const text of bothNotices()) {
    assert.equal(CLOSE_COMMAND.test(text), false, "neither notice may carry the close command");
    assert.match(text, /already terminated/i, "and both must say the run has ended");
  }
});

test("N3. FAILED with current_run_id null gets terminal/recovery wording only", () => {
  store({ state: "FAILED", currentRunId: null, transitions: GOVERNOR_FAILURE });
  const g = G.runClosureGuidance(REC, { root: ROOT });
  assert.equal(g.lane_owns_run, false);
  assert.equal(g.may_report_complete, false);
  const text = g.lines.join("\n");
  assert.equal(CLOSE_COMMAND.test(text), false);
  assert.match(text, /no longer owns an open Execution Run/i, "the lane is told it has nothing to close");
  assert.match(text, /new Execution Run carries the work forward/i, "and where recovery actually comes from");
});

test("N4. a governor delivery_unacknowledged failure names its cause, not a closeout", () => {
  store({ state: "FAILED", currentRunId: null, transitions: GOVERNOR_FAILURE });
  const text = G.continuationTextForFailedGovernedAction(REC, { root: ROOT });
  assert.equal(CLOSE_COMMAND.test(text), false, "no bogus closeout instruction");
  assert.match(text, /delivery_unacknowledged/, "the operator is told WHY the run ended");
  assert.match(text, /governor/, "and who ended it");
  // The false assertion this replaced.
  assert.equal(/Execution Run is still open/i.test(text), false,
    "a notice must not assert a run state it never read");
});

test("N5. an already COMPLETE run is not asked to close again", () => {
  store({ state: "COMPLETE", currentRunId: null });
  const g = G.runClosureGuidance(REC, { root: ROOT });
  assert.equal(g.may_report_complete, false);
  assert.equal(CLOSE_COMMAND.test(g.lines.join("\n")), false);
  assert.match(g.lines.join("\n"), /already COMPLETE/);
  for (const text of bothNotices()) assert.equal(CLOSE_COMMAND.test(text), false);
});

// ── the remaining ways a close command could be wrong ────────────────────────
test("N6. a run the canonical store has never heard of is not given a command", () => {
  store({ state: "EXECUTING", currentRunId: RUN });
  const g = G.runClosureGuidance({ ...REC, run_id: "erun_ghost0000000000" }, { root: ROOT });
  assert.equal(g.may_report_complete, false);
  assert.equal(CLOSE_COMMAND.test(g.lines.join("\n")), false);
  assert.match(g.lines.join("\n"), /not in the canonical run store/i);
});

test("N7. a non-terminal run the lane no longer owns is not this lane's to close", () => {
  writeFileSync(join(ROOT, "vacilando", "execution-runs", "runs.json"), `${JSON.stringify({
    schema_version: EXECUTION_RUN_SCHEMA,
    lanes: {
      [LANE]: {
        current_run_id: "erun_05f2787e4a3cb02c",
        runs: [
          { run_id: RUN, lane_id: LANE, state: "EXECUTING", transitions: [] },
          { run_id: "erun_05f2787e4a3cb02c", lane_id: LANE, state: "EXECUTING", transitions: [] },
        ],
      },
    },
  }, null, 2)}\n`, "utf8");
  const g = G.runClosureGuidance(REC, { root: ROOT });
  assert.equal(g.may_report_complete, false);
  assert.equal(CLOSE_COMMAND.test(g.lines.join("\n")), false);
  assert.match(g.lines.join("\n"), /erun_05f2787e4a3cb02c/, "the run the lane DOES own is named");
});

test("N8. a record with no run id says nothing about runs at all", () => {
  store({ state: "EXECUTING", currentRunId: RUN });
  const { run_id: _drop, ...noRun } = REC;
  const g = G.runClosureGuidance(noRun, { root: ROOT });
  assert.deepEqual(g.lines, []);
  assert.equal(CLOSE_COMMAND.test(G.continuationTextForGovernedAction(noRun, { id: "t", result: {} }, { root: ROOT })), false);
});

// ── the state machine is preserved, not bent to fit the copy ─────────────────
test("N9. FAILED -> COMPLETE stays illegal", () => {
  assert.equal(isLegalRunTransition("FAILED", "COMPLETE"), false,
    "the fix is the sentence, never a transition invented to make it true");
  assert.equal(isLegalRunTransition("EXECUTING", "COMPLETE"), true);
});

test("N10. no builder emits a close command without consulting the run", () => {
  // Comments are stripped: the incident sentences are quoted in the comments
  // deliberately, so that the next reader knows what these controls are for.
  const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // Every occurrence of the close command in this file must be inside the one
  // function that reads the run state first.
  const guidance = src.slice(src.indexOf("export function runClosureGuidance"));
  const guidanceBody = guidance.slice(0, guidance.indexOf("\nexport function continuationTextForGovernedAction"));
  const occurrences = src.match(/run-status \$\{[A-Za-z.]*runId\} complete|run-status \$\{rec\.run_id\} complete/g) || [];
  assert.equal(occurrences.length, 1, `exactly one builder may produce the close command; found ${occurrences.length}`);
  assert.match(guidanceBody, /run-status \$\{runId\} complete/, "and it is the state-derived one");
  assert.match(guidanceBody, /isTerminalRunState\(state\)/, "which refuses terminal runs");
  assert.match(guidanceBody, /laneOwnsRun/, "and requires the lane to still own the run");
  // The unconditional assertion that started this.
  assert.equal(/The current Execution Run is still open/.test(src), false,
    "no notice may assert a run state it never read");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
