#!/usr/bin/env node
/**
 * ONE PRODUCER OF CURRENT OPERATOR STATE, AND THE API IS IT.
 *
 * `/api/v2/lanes` composed a lane from a chain of `attach*` helpers and attached
 * no operator state at all. So the list, the header, the bell, the approval card
 * and the composer each derived their own from `lane.execution_run` — five
 * readers, five rules, and the only way to find out they disagreed was to look
 * at two of them at once. That is how one lane came to show "Accepted" on the
 * card and "Needs you" in the header at the same moment.
 *
 * The semantic model was already correct and promoted; this is the wiring. A
 * surface may map or re-word what the API returns. It may not compute it again,
 * and S-G below is the guard that keeps it that way.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  attachLaneOperatorState, operatorAttentionCount, laneOperatorState,
} from "../lib/vacilando/lane-operator-state.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const lane = (id, run) => ({ lane_id: id, execution_run: run });
const asked = (lane_id, id = "g1") => ({ request_id: id, lane_id, status: "awaiting_operator" });
const answered = (lane_id, id = "g1", decision = "approved") =>
  ({ ...asked(lane_id, id), operator_approval: { decision, at: "2026-09-13T10:00:00.000Z" } });

/* ── THE PAYLOAD ─────────────────────────────────────────────────────────── */

test("A1. every lane the API returns carries the canonical state", () => {
  const [row] = attachLaneOperatorState([lane("a", { state: "EXECUTING", run_id: "r1" })], { requests: [] });
  for (const field of [
    "operator_state", "operator_tone", "needs_you", "needs_you_count",
    "primary_status", "secondary_status", "lane_operator_state",
  ]) {
    assert.ok(field in row, `the payload must carry ${field}`);
  }
  assert.equal(row.operator_state, "WORKING");
  assert.equal(row.primary_status, "Working");
  assert.equal(row.needs_you, false);
});

test("A2. THE DEFECT: a pending request makes exactly its own lane actionable", () => {
  const rows = attachLaneOperatorState(
    [lane("a", { state: "EXECUTING", run_id: "r1" }), lane("b", { state: "WAITING_RESOURCE" })],
    { requests: [asked("b")] },
  );
  const [a, b] = rows;
  assert.equal(a.needs_you, false, "another lane's decision is not this lane's obligation");
  assert.equal(a.needs_you_count, 0);
  assert.equal(b.needs_you, true);
  assert.equal(b.needs_you_count, 1);
  assert.equal(b.primary_status, "Needs you");
});

test("A3. an accepted approval leaves no residue anywhere in the payload", () => {
  const [row] = attachLaneOperatorState(
    [lane("b", { state: "EXECUTING", run_id: "r1" })], { requests: [answered("b")] },
  );
  assert.equal(row.needs_you, false);
  assert.equal(row.needs_you_count, 0);
  assert.equal(row.operator_state, "WORKING");
  assert.deepEqual(row.pending_request_ids, []);
});

test("A4. a denied approval also ends it", () => {
  const [row] = attachLaneOperatorState(
    [lane("b", { state: "READY" })], { requests: [answered("b", "g1", "denied")] },
  );
  assert.equal(row.needs_you, false);
  assert.equal(row.needs_you_count, 0);
});

test("A5. a failed action with no request is Blocked, not Needs You", () => {
  const [row] = attachLaneOperatorState(
    [lane("b", { state: "NEEDS_INPUT", state_reason: "not_retirable_now" })], { requests: [] },
  );
  assert.equal(row.operator_state, "BLOCKED");
  assert.equal(row.needs_you, false);
  assert.equal(row.secondary_status, "not_retirable_now", "it still says what stopped");
});

test("A6. working without a run attached is Working, with a note", () => {
  const [row] = attachLaneOperatorState([lane("a", { state: "EXECUTING" })], { requests: [] });
  assert.equal(row.operator_state, "WORKING");
  assert.equal(row.operator_tone, "active", "one word, one tone");
  assert.equal(row.secondary_status, "Execution tracking is connecting");
  assert.equal(row.needs_you, false);
});

test("A7. the list and the header cannot disagree, because there is one field", () => {
  // Both surfaces read `operator_state`. Agreement is structural, not a rule
  // two components are each asked to remember.
  const [row] = attachLaneOperatorState([lane("b", { state: "WAITING_RESOURCE" })], { requests: [asked("b")] });
  const direct = laneOperatorState({ laneId: "b", runState: "WAITING_RESOURCE", requests: [asked("b")] });
  assert.equal(row.operator_state, direct.state);
  assert.equal(row.primary_status, direct.label);
  assert.equal(row.operator_tone, direct.tone);
});

test("A8. history never reaches the payload as a current summary", () => {
  const [row] = attachLaneOperatorState(
    [{ ...lane("a", { state: "COMPLETE" }), summary: "The run waited on null past its bound." }],
    { requests: [] },
  );
  assert.equal(row.operator_state, "READY");
  assert.equal(row.operator_summary, null);
});

test("A9. a transcript failure does not overturn a finished lane", () => {
  const [row] = attachLaneOperatorState(
    [{ ...lane("a", { state: "COMPLETE" }), summary: "FAILED session transcript" }],
    { requests: [answered("a")] },
  );
  assert.equal(row.operator_state, "READY");
  assert.notEqual(row.operator_tone, "blocking");
});

/* ── THE BADGE ───────────────────────────────────────────────────────────── */

test("A10. the badge is the number of decisions outstanding, and nothing else", () => {
  assert.equal(operatorAttentionCount([]), 0, "no residue at zero");
  assert.equal(operatorAttentionCount([answered("a"), answered("b", "g2", "denied")]), 0);
  assert.equal(operatorAttentionCount([asked("a", "g1")]), 1);
  assert.equal(operatorAttentionCount([asked("a", "g1"), asked("b", "g2"), answered("c", "g3")]), 2);
  // Not runs in NEEDS_INPUT, not failed actions, not historical approvals.
  assert.equal(operatorAttentionCount([{ lane_id: "a", request_id: "g9", status: "failed" }]), 0);
  assert.equal(operatorAttentionCount([{ lane_id: "a", request_id: "g8", status: "complete" }]), 0);
});

test("A11. consuming an approval decrements it immediately", () => {
  const before = [asked("a", "g1"), asked("b", "g2")];
  assert.equal(operatorAttentionCount(before), 2);
  const after = [answered("a", "g1"), asked("b", "g2")];
  assert.equal(operatorAttentionCount(after), 1, "the moment a decision is recorded");
});

/* ── THE GUARD ───────────────────────────────────────────────────────────── */

test("A-G. the API asks the canonical producer, and nothing else derives it", () => {
  /*
   * The centralization guard. Not a lint framework — one assertion that the one
   * endpoint calls the one producer, and that the chain it used to end with no
   * longer decides this on its own.
   */
  const api = readFileSync(new URL("../lib/vacilando/v2-api.mjs", import.meta.url), "utf8");
  const lanesRoute = api.slice(api.indexOf('if (path === "/api/v2/lanes"'));
  const body = lanesRoute.slice(0, lanesRoute.indexOf('if (path === "/api/v2/lane-folders"'));
  assert.match(body, /attachLaneOperatorState\(/, "the lane list must ask the canonical producer");
  assert.match(body, /lane-operator-state\.mjs/, "and import it rather than reimplement it");
  // A second, independent rule appearing in this route is the regression.
  assert.doesNotMatch(body, /awaiting_operator/,
    "the route must not decide what needs the operator; that is laneOperatorState's job");
  assert.doesNotMatch(body, /NEEDS_INPUT/,
    "nor infer an obligation from a run state");
});

/* ── THE RENDERED SURFACE ────────────────────────────────────────────────── */

const V = await import("../apps/vacilando/public/gateway-view.mjs");
const parked = (over = {}) => ({
  lane_id: "a", execution_run: { state: "NEEDS_INPUT", state_reason: "not_retirable_now" }, ...over,
});

test("U1. THE DEFECT, IN THE UI: a parked run is not an operator obligation", () => {
  /*
   * `canonicalLaneWorkState` read `run?.state === "NEEDS_INPUT"` and called it
   * "Needs input" — and `deriveLaneExecutionPosture` inferred the same thing
   * independently, so there were TWO UI-side producers of the claim. Both now
   * defer to the API when it has spoken.
   */
  const st = V.canonicalLaneWorkState(parked({ needs_you: false, secondary_status: "not_retirable_now" }));
  assert.equal(st.label, "Blocked");
  assert.notEqual(st.key, "needs_input");
  assert.equal(st.hint, "not_retirable_now", "it still says what stopped");
  // Still in the band a person looks at. Surfaced, not claimed as owed.
  assert.equal(st.group, "needs_input");
});

test("U2. a real pending decision still renders Needs input", () => {
  const st = V.canonicalLaneWorkState(parked({ needs_you: true }));
  assert.equal(st.key, "needs_input");
  assert.equal(st.label, "Needs input");
  assert.equal(st.tone, "needs");
});

test("U3. an older Gateway payload still renders sensibly", () => {
  // The field is absent before this promotion. The old inference survives for
  // exactly that case and nothing else.
  const st = V.canonicalLaneWorkState(parked({}));
  assert.equal(st.key, "needs_input");
});

test("U4. the UI maps the API rather than re-deriving it", () => {
  // The guard, at the surface end: the rendered state must change when the API
  // changes its answer, with the run state held constant.
  const run = { state: "NEEDS_INPUT", state_reason: "not_retirable_now" };
  const yes = V.canonicalLaneWorkState({ lane_id: "a", execution_run: run, needs_you: true });
  const no = V.canonicalLaneWorkState({ lane_id: "a", execution_run: run, needs_you: false });
  assert.notEqual(yes.key, no.key, "same run, different API answer, different render");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
