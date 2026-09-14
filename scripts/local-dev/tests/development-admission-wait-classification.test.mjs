#!/usr/bin/env node
/**
 * A RUN THAT HAS JUST BEEN QUEUED IS NOT A WAIT WITHOUT A REASON.
 *
 * QUEUED belongs in WAITING_RUN_STATES: a run that never started was the one
 * shape nothing collected, and one sat QUEUED on `provider_provisioning` for
 * over thirteen hours. But a run is QUEUED from the instant it is created,
 * BEFORE any writer could declare anything, and in that window the classifier
 * returned null. `describeWait(null)` is `bound_policy: "invalid"`, and
 * `reconcileWait` fails an invalid descriptor IMMEDIATELY - there is no bound
 * to exceed - so the governor killed healthy runs on its first sweep.
 *
 * Measured across 181 runs in the live store: 4 runs in 3 lanes died this way,
 * at 0.239s, 0.374s, 0.627s, and one at -0.041s - failed before its own QUEUED
 * transition timestamp. All four had resource_wait null and
 * delivery.acknowledged true, and all four were told "The run waited longer
 * than allowed and was stopped. It never reached a provider." Nothing waited,
 * and the provider had acknowledged.
 *
 * These cases hold both halves: the healthy admission window survives, and a
 * send that genuinely never lands is still collected under a named bound.
 */
import assert from "node:assert/strict";
import { waitReasonFor, WAITING_RUN_STATES } from "../lib/vacilando/execution-stale.mjs";
import {
  describeWait, reconcileWait, waitStatus, isDeclaredWaitReason, WAIT_REASONS,
} from "../lib/vacilando/run-wait.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const NOW = 1_800_000_000_000;
const queued = (over = {}) => ({ run_id: "erun_probe", state: "QUEUED", resource_wait: null, state_reason: null, ...over });
const decide = (run, ageMs, now = NOW) => {
  const reason = waitReasonFor(run);
  const d = describeWait({ reason, resource_id: run.run_id, waiting_since: now - ageMs, now });
  return { reason, descriptor: d, decision: reconcileWait(d, { now }), status: waitStatus(d, now) };
};

/* ── 1: the live specimen ─────────────────────────────────────────────────── */

test("1 — a run queued 627ms ago is held, not collected", () => {
  // erun_05631cdf39aa08a9, the run that was executing this repair.
  const { decision, reason } = decide(queued(), 627);
  assert.equal(reason, "send_in_progress");
  assert.equal(decision.action, "hold",
    "this exact shape was failed missing_wait_reason 627ms after creation");
});

test("1a — and so is one at 374ms, 239ms, and zero", () => {
  for (const age of [374, 239, 0]) {
    assert.equal(decide(queued(), age).decision.action, "hold", `age ${age}ms`);
  }
});

test("1b — even a clock artifact that puts the sweep BEFORE the transition", () => {
  // erun_d33750ff97320fc4 failed 41ms before its own QUEUED timestamp.
  assert.equal(decide(queued(), -41).decision.action, "hold");
});

/* ── 2: the classification itself ─────────────────────────────────────────── */

test("2 — a fresh QUEUED run classifies to a DECLARED reason", () => {
  const reason = waitReasonFor(queued());
  assert.ok(isDeclaredWaitReason(reason),
    "an undeclared reason is what made describeWait invalid in the first place");
  assert.equal(WAIT_REASONS[reason].policy, "bounded",
    "admission must never become an indefinite wait");
});

test("2a — the descriptor is never invalid, which is what failed immediately", () => {
  const { descriptor, status } = decide(queued(), 100);
  assert.notEqual(descriptor.bound_policy, "invalid");
  assert.equal(descriptor.invalid_because, undefined);
  assert.notEqual(status, "invalid");
});

/* ── 3: the thirteen-hour case must stay closed ───────────────────────────── */

test("3 — a send that never lands is still collected, under a named bound", () => {
  const { decision } = decide(queued(), 6 * 60 * 1000);
  assert.equal(decision.action, "fail");
  assert.equal(decision.failure_reason, "send_in_progress_bound_exceeded",
    "collection must name the bound it exceeded, not report a missing reason");
});

test("3a — a QUEUED run that DECLARES its own reason keeps it", () => {
  // The thirteen-hour specimen: QUEUED on provider_provisioning, a 10min bound.
  const run = queued({ resource_wait: { reason: "provider_provisioning" } });
  assert.equal(waitReasonFor(run), "provider_provisioning",
    "a derived fallback must never override a declared reason");
  assert.equal(decide(run, 11 * 60 * 1000).decision.failure_reason, "provider_provisioning_bound_exceeded");
});

test("3b — QUEUED stays in the swept states", () => {
  assert.ok(WAITING_RUN_STATES.includes("QUEUED"),
    "removing it would reopen the run nothing owned");
});

/* ── 4: the other states are untouched ────────────────────────────────────── */

test("4 — NEEDS_INPUT is still the one deliberate indefinite wait", () => {
  const r = decide({ run_id: "e", state: "NEEDS_INPUT" }, 40 * 24 * 3600 * 1000);
  assert.equal(r.reason, "needs_operator_input");
  assert.equal(r.decision.action, "hold");
});

test("4a — RECOVERING and WAITING_RESOURCE classify as before", () => {
  assert.equal(waitReasonFor({ state: "RECOVERING" }), "recovering");
  assert.equal(
    waitReasonFor({ state: "WAITING_RESOURCE", resource_wait: { reason: "waiting_for_resource_lease" } }),
    "waiting_for_resource_lease",
  );
});

test("4b — a WAITING_RESOURCE run with no declared reason still fails closed", () => {
  // The fallback is scoped to admission. An undeclared wait elsewhere must NOT
  // be quietly given a reason it did not earn.
  const r = decide({ run_id: "e", state: "WAITING_RESOURCE", resource_wait: null, state_reason: null }, 1000);
  assert.equal(r.reason, null);
  assert.equal(r.decision.action, "fail");
  assert.equal(r.decision.failure_reason, "missing_wait_reason");
});

/* ── 5: classification is derived, never parsed ───────────────────────────── */

test("5 — a human caption in state_reason does not become a classification", () => {
  const run = queued({ state_reason: "Waiting on Director — branch push" });
  assert.equal(waitReasonFor(run), "send_in_progress",
    "the caption must be ignored, and the state's own derived reason used");
});

test("5a — an unknown machine-looking string is not adopted either", () => {
  assert.equal(waitReasonFor(queued({ state_reason: "waiting_for_something_invented" })), "send_in_progress");
  assert.equal(
    waitReasonFor({ state: "WAITING_RESOURCE", state_reason: "waiting_for_something_invented", resource_wait: null }),
    null,
  );
});

/* ── 6: the governor race the brief asked about ───────────────────────────── */

test("6 — the fastest possible observation already has a reason", () => {
  // There is no writer to lose a race against: the reason is derived from the
  // state, so it exists at the instant the state does.
  const atCreation = decide(queued(), 0);
  assert.ok(isDeclaredWaitReason(atCreation.reason));
  assert.equal(atCreation.decision.action, "hold");
});

test("6a — no observable QUEUED state has a wait status of invalid", () => {
  for (const age of [-41, 0, 1, 100, 627, 60_000, 299_999]) {
    assert.notEqual(decide(queued(), age).status, "invalid", `age ${age}ms`);
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
