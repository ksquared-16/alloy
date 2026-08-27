/**
 * A governed wait must be an S6 wait, not a caption.
 *
 * The defect this pins: the governed producer emitted presentation fields only
 * — resource_key, label, summary — with no schema, reason, owner,
 * waiting_since, deadline or bound policy. describeWait answers a missing
 * reason with bound_policy "invalid", which is how health came to report
 * "Waiting on Director — staging merge" as an unowned wait nothing could own
 * or resolve. And nothing released the wait on SUCCESS, so terminal runs kept
 * wait text for work that had already landed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const W = await import("../lib/vacilando/run-wait.mjs");
const SRC = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");

await test("1 — the governed wait reason exists in the canonical S6 table", () => {
  const spec = W.WAIT_REASONS.needs_operator_input;
  assert.ok(spec, "needs_operator_input must be a canonical reason");
  assert.equal(spec.owner, "director");
  assert.equal(spec.policy, "human_indefinite");
  assert.equal(spec.bound_ms, null, "a question for a person has no deadline");
});

await test("2 — the producer builds the descriptor through describeWait, not by hand", () => {
  const proj = SRC.slice(SRC.indexOf("function waitProjection"), SRC.indexOf("function attachRunWait"));
  assert.match(proj, /describeWait\(\{/, "the envelope must come from the canonical constructor");
  assert.match(proj, /reason: "needs_operator_input"/);
  assert.match(proj, /resource_id: rec\.request_id/);
  // The presentation fields may remain, but they are no longer the whole wait.
  assert.match(proj, /\.\.\.descriptor/);
});

await test("3 — a governed wait is never invalid or unowned", () => {
  const d = W.describeWait({ reason: "needs_operator_input", resource_id: "gar_x", waiting_since: Date.now() });
  assert.equal(d.schema_version, W.RUN_WAIT_SCHEMA);
  assert.equal(d.reason, "needs_operator_input");
  assert.equal(d.owner, "director");
  assert.equal(d.bound_policy, "human_indefinite");
  assert.notEqual(d.bound_policy, "invalid");
  assert.equal(d.deadline, null);
  assert.ok(d.waiting_since);
  assert.equal(d.resolution_state, "waiting");
});

await test("4 — an explicit human wait is NEVER counted stale, however old", () => {
  const ancient = Date.now() - 30 * 24 * 3600 * 1000;
  const d = W.describeWait({ reason: "needs_operator_input", resource_id: "gar_x", waiting_since: ancient });
  const status = W.waitStatus(d, Date.now());
  const s = typeof status === "string" ? status : (status.status || status.state);
  assert.notEqual(s, "expired", "a human_indefinite wait must not expire");
  assert.notEqual(s, "invalid");
});

await test("5 — a wait with no reason IS invalid, so the guard has teeth", () => {
  const d = W.describeWait({ resource_id: "gar_x", waiting_since: Date.now() });
  assert.equal(d.bound_policy, "invalid");
  assert.equal(d.owner, null);
  assert.equal(d.invalid_because, "missing_wait_reason");
  const unknown = W.describeWait({ reason: "waiting_on_vibes", resource_id: "x", waiting_since: Date.now() });
  assert.equal(unknown.bound_policy, "invalid");
  assert.equal(unknown.invalid_because, "unknown_wait_reason");
});

await test("6 — a RESOLVED governed action releases the run's wait, not only a failed one", () => {
  // The failure path always released it; success did not, which is how
  // terminal runs came to carry live-looking wait text.
  const idx = SRC.indexOf('appendAudit(rec, "complete"');
  assert.ok(idx > -1, "the completion audit point must exist");
  const after = SRC.slice(idx, idx + 700);
  assert.match(after, /patchRunResourceWait\(rec\.run_id, null, root\)/,
    "completion must release the wait");
  // And the failure path must still do so.
  const fail = SRC.slice(SRC.indexOf("function releaseRunAfterGovernedFailure"), SRC.indexOf("function failRequest"));
  assert.match(fail, /patchRunResourceWait\(rec\.run_id, null, root\)/);
});

await test("7 — a machine wait still carries a deadline", () => {
  for (const reason of ["waiting_for_agent_session", "waiting_for_execution_capacity", "send_in_progress", "waiting_for_executor_authority"]) {
    const d = W.describeWait({ reason, resource_id: "r", waiting_since: Date.now() });
    assert.equal(d.bound_policy, "bounded", reason);
    assert.ok(d.deadline, `${reason} must be bounded by a deadline`);
    assert.ok(d.owner, `${reason} must name an owner`);
  }
});
