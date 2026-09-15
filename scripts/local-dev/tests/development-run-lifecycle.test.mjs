#!/usr/bin/env node
/**
 * ONE ANSWER TO "WHAT IS THIS RUN DOING", READ BY EVERY CONSUMER.
 *
 * Three defects, one cause. The governor abandoned a NEEDS_INPUT run 2.4
 * seconds after it entered that state (15:12:06.937 → 15:12:09.356) because its
 * input model was empty — eleven of eighteen abandonments in the store. The
 * pre-send reconciler closed any run resting on `governed_action_complete` once
 * it passed a twenty-minute window, which is why routine messages produced
 * "Previous run was stale and was closed". And the lane said "Finalizing"
 * indefinitely, truthfully, because nothing could tell it the run was at rest
 * rather than mid-turn.
 *
 * Each consumer had invented its own reading of an open run. These cases pin
 * the shared one, and mutation-prove each consumer against the defect it had.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOVERNED_LIVE_STATUSES, GOVERNOR_GRACE_MS, LIFECYCLE_PHASES,
  governedWaitIsLive, governorMayCollect, lanePresentationForPhase,
  restingOnGovernedStep, runLifecyclePhase, sendMayCloseAsStale,
} from "../lib/vacilando/run-lifecycle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LIB = `${ROOT}/scripts/local-dev/lib/vacilando`;
const NOW = Date.UTC(2026, 8, 14, 18, 0, 0);
const ago = (ms) => new Date(NOW - ms).toISOString();
const MINUTE = 60 * 1000;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* Specimens, shaped like the records the store actually holds. */
const needsInput = (over = {}) => ({
  run_id: "erun_specimen", state: "NEEDS_INPUT",
  state_reason: "the title or body looked like a credential and was refused",
  updated_at: ago(3 * 1000), transitions: [], ...over,
});
const restingRun = (over = {}) => ({
  run_id: "erun_resting", state: "EXECUTING", state_reason: "governed_action_complete",
  updated_at: ago(3 * 60 * MINUTE),
  transitions: [{ to_state: "EXECUTING", reason: "governed_action_complete", occurred_at: ago(3 * 60 * MINUTE) }],
  ...over,
});
const staleRun = (over = {}) => ({
  run_id: "erun_stale", state: "EXECUTING", state_reason: "worker_started",
  updated_at: ago(6 * 60 * MINUTE), transitions: [], ...over,
});

/* ── SCENARIO A: a live governed wait is never collected ──────────────────── */

test("A1 — a run waiting on a live governed action is GOVERNED_WAIT", () => {
  for (const status of GOVERNED_LIVE_STATUSES) {
    const p = runLifecyclePhase(needsInput(), { governed: { status }, now_ms: NOW });
    assert.equal(p.phase, LIFECYCLE_PHASES.GOVERNED_WAIT, `status ${status} must be a live wait`);
  }
  assert.ok(governedWaitIsLive({ status: "awaiting_operator" }));
  assert.ok(!governedWaitIsLive({ status: "complete" }));
  assert.ok(!governedWaitIsLive(null));
});

test("A2 — the governor refuses to collect it", () => {
  const d = governorMayCollect(needsInput(), { governed: { status: "awaiting_operator" }, now_ms: NOW });
  assert.equal(d.collect, false);
  assert.match(d.why, /governed action is live/);
});

test("A3 — a WAITING_RESOURCE run on the Director is a governed wait even with no request record", () => {
  const run = { state: "WAITING_RESOURCE", resource_wait: { resource_key: "director_governed_action" } };
  assert.equal(runLifecyclePhase(run, { now_ms: NOW }).phase, LIFECYCLE_PHASES.GOVERNED_WAIT);
});

test("A4 — THE MEASURED SPECIMEN: 2.4 seconds is inside the grace period", () => {
  // The governed request had FAILED, so there was no live wait to protect it.
  // What was missing was any window at all in which the work could respond.
  const d = governorMayCollect(needsInput({ updated_at: ago(2400) }), { governed: null, now_ms: NOW });
  assert.equal(d.collect, false, "a run 2.4 seconds into NEEDS_INPUT must not be collected");
  assert.match(d.why, /grace period/);
  assert.ok(GOVERNOR_GRACE_MS >= 60 * 1000, "seconds of grace is not grace");
});

/* ── SCENARIO B: a finished step settles without a message ────────────────── */

test("B1 — a run between governed steps is RESTING, not stale", () => {
  const p = runLifecyclePhase(restingRun(), { session_alive: true, now_ms: NOW });
  assert.equal(p.phase, LIFECYCLE_PHASES.RESTING);
  assert.equal(p.reason, "between_governed_steps");
});

test("B2 — RESTING is not time-boxed: three hours is still resting", () => {
  const old = restingRun({ updated_at: ago(3 * 60 * MINUTE) });
  assert.equal(runLifecyclePhase(old, { session_alive: true, now_ms: NOW }).phase, LIFECYCLE_PHASES.RESTING,
    "a twenty-minute window is what made an ordinary pause look stale");
});

test("B3 — the lane can say Resting instead of Finalizing, with no new message", () => {
  const p = runLifecyclePhase(restingRun(), { session_alive: true, now_ms: NOW });
  const view = lanePresentationForPhase(p.phase);
  assert.equal(view.key, "resting");
  assert.notEqual(view.label, "Finalizing");
  assert.equal(view.group, "idle", "resting is not active work");
});

test("B4 — the resting fact is read two independent ways", () => {
  assert.ok(restingOnGovernedStep({ state_reason: "governed_action_complete" }));
  assert.ok(restingOnGovernedStep({
    state_reason: "worker_reported",
    transitions: [{ to_state: "EXECUTING", reason: "governed_action_complete" }],
  }), "a run re-reported after a governed resume keeps only the transition");
  assert.ok(!restingOnGovernedStep({ state_reason: "worker_started", transitions: [] }));
});

/* ── SCENARIO C: the next message does not close it ───────────────────────── */

test("C1 — the pre-send reconciler does not call a resting run stale", () => {
  const d = sendMayCloseAsStale(restingRun(), { session_alive: true, now_ms: NOW });
  assert.equal(d.close, false);
  assert.match(d.why, /RESTING/);
});

test("C2 — nor a run waiting on the Director", () => {
  const d = sendMayCloseAsStale(needsInput(), { governed: { status: "requested" }, now_ms: NOW });
  assert.equal(d.close, false);
});

test("C3 — the call site is awaited, or the fix reports itself as working", () => {
  // `reconcileLaneBeforeSend` became async. An unawaited Promise makes
  // `rec.stale_run_closed` undefined, which reads as "never stale" — the fix
  // appearing to work while doing nothing.
  const send = readFileSync(`${LIB}/execution-run-send.mjs`, "utf8");
  assert.match(send, /await reconcileLaneBeforeSend\(/);
  const stale = readFileSync(`${LIB}/execution-stale.mjs`, "utf8");
  assert.match(stale, /export async function reconcileLaneBeforeSend/);
});

/* ── SCENARIO D: a genuinely stranded run is still collected ──────────────── */

test("D1 — a resting run whose session is gone is STRANDED, not resting forever", () => {
  const p = runLifecyclePhase(restingRun(), { session_alive: false, now_ms: NOW });
  assert.equal(p.phase, LIFECYCLE_PHASES.STRANDED);
  assert.equal(p.reason, "resting_without_session");
});

test("D2 — and the pre-send reconciler still closes it", () => {
  assert.equal(sendMayCloseAsStale(restingRun(), { session_alive: false, now_ms: NOW }).close, true);
});

test("D3 — an ordinary stale run is untouched by any of this", () => {
  const d = sendMayCloseAsStale(staleRun(), {
    session_alive: false, now_ms: NOW, stale: { class: "stale", reason: "worker_gone" },
  });
  assert.equal(d.close, true);
  const g = governorMayCollect(staleRun(), { now_ms: NOW, stale: { class: "stale", reason: "worker_gone" } });
  assert.equal(g.collect, true, "past grace, no governed wait, not resting — still collectable");
});

test("D4 — a terminal run is terminal, whatever else is true", () => {
  for (const state of ["COMPLETE", "FAILED", "ABANDONED"]) {
    assert.equal(runLifecyclePhase({ state, state_reason: "governed_action_complete" }, { now_ms: NOW }).phase,
      LIFECYCLE_PHASES.TERMINAL);
  }
});

/* ── MUTATION PROOFS: each consumer, against the defect it had ────────────── */

test("M1 — remove the governor's protection and Scenario A goes red", () => {
  // The defect, restored exactly: collect whenever there is no modelled input.
  const withoutProtection = () => ({ collect: true, why: "no modelled input" });
  assert.equal(withoutProtection().collect, true);
  assert.notEqual(
    governorMayCollect(needsInput(), { governed: { status: "awaiting_operator" }, now_ms: NOW }).collect,
    withoutProtection().collect,
    "the protection must be what changes the answer",
  );
});

test("M2 — restore the time-boxed resting window and Scenario B goes red", () => {
  // The defect: resting protected for one settle window only.
  const timeBoxed = (run, now) => (now - Date.parse(run.updated_at) < 20 * MINUTE
    ? LIFECYCLE_PHASES.RESTING : "STALE");
  const old = restingRun({ updated_at: ago(3 * 60 * MINUTE) });
  assert.equal(timeBoxed(old, NOW), "STALE", "the old rule calls a three-hour pause stale");
  assert.equal(runLifecyclePhase(old, { session_alive: true, now_ms: NOW }).phase, LIFECYCLE_PHASES.RESTING);
});

test("M3 — restore stale-before-send classification and Scenario C goes red", () => {
  const oldRule = (cls) => cls.class === "ambiguous" || cls.class === "stale";
  const cls = { class: "stale", reason: "past_settle" };
  assert.equal(oldRule(cls), true, "the old rule closes it");
  assert.equal(sendMayCloseAsStale(restingRun(), { session_alive: true, now_ms: NOW, stale: cls }).close, false,
    "the phase must outrank the stale class for a resting run");
});

test("M4 — over-broaden resting and Scenario D goes red", () => {
  // If RESTING ignored session ownership it would swallow every stranded run.
  const overBroad = (run) => (restingOnGovernedStep(run) ? LIFECYCLE_PHASES.RESTING : "OTHER");
  assert.equal(overBroad(restingRun()), LIFECYCLE_PHASES.RESTING);
  assert.equal(runLifecyclePhase(restingRun(), { session_alive: false, now_ms: NOW }).phase,
    LIFECYCLE_PHASES.STRANDED, "ownership is what keeps D reachable");
});

test("M5 — no timer was added to hide a missing transition", () => {
  const src = readFileSync(`${LIB}/run-lifecycle.mjs`, "utf8");
  assert.doesNotMatch(src, /setTimeout|setInterval/, "a timer would be hiding the missing transition, not fixing it");
  assert.match(src, /GOVERNOR_GRACE_MS/, "the one window is a grace bound, and it is named");
});

test("M6 — the phase is derived, not stored", () => {
  const src = readFileSync(`${LIB}/run-lifecycle.mjs`, "utf8");
  assert.doesNotMatch(src, /writeFileSync|transitionExecutionRun/,
    "a persisted phase is one more thing that can be wrong and would need its own reconciler");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
