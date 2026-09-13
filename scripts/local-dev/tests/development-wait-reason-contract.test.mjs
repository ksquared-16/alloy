#!/usr/bin/env node
/**
 * A CAPTION IS NOT A CLASSIFICATION KEY.
 *
 * MEASURED across the fleet: 21 runs in 6 lanes failed `unknown_wait_reason`
 * and 3 more `missing_wait_reason` — Surfaces 8, Financials 4, Backend 3,
 * Attendance 3, Access & Identity 2, Documentation 1. Every one was healthy.
 * During the authoritative soak alone, 26 runs carrying real work died this
 * way, and four lanes had their "NORMAL WORK RESUMED" instruction killed on
 * delivery, which is why they then looked idle.
 *
 * Every layer behaved as designed. `attachRunWait` set the run's
 * `state_reason` to `presentationForGovernedAction(rec).wait_label` — a human
 * caption such as "Waiting on Director — branch push". `waitReasonFor` handed
 * that caption to `describeWait`, which looked it up in `WAIT_REASONS`, did not
 * find it, and returned `bound_policy: "invalid"`. `reconcileWait` then
 * correctly failed an invalid descriptor.
 *
 * The semantic code was present the whole time. The same call writes
 * `resource_wait` from `waitProjection`, whose reason is `needs_operator_input`
 * with policy `human_indefinite` — hold for as long as it takes.
 * erun_5a070693f25078fc carries exactly that descriptor and was killed anyway,
 * because the caption won.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const W = await import("../lib/vacilando/run-wait.mjs");
const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const CAPTIONS = [
  "Waiting on Director — branch push",
  "Waiting on Director — staging merge",
  "Waiting on Director — promotion pull request",
  "Waiting on Director — QA session restore",
  "Waiting on Director",
  "Pre-apply hosted census awaiting Director confirmation",
];

test("V1. the declared vocabulary is machine codes, and every entry is complete", () => {
  const codes = W.declaredWaitReasons();
  assert.ok(codes.length >= 14, `expected the full table, got ${codes.length}`);
  for (const c of codes) {
    assert.match(c, /^[a-z][a-z0-9_]*$/, `"${c}" is a caption, not a code`);
    const spec = W.WAIT_REASONS[c];
    assert.ok(spec.owner, `${c} declares no resume owner`);
    assert.ok(W.BOUND_POLICIES.includes(spec.policy), `${c} has no valid bound policy`);
    if (spec.policy === "bounded") assert.ok(Number.isFinite(spec.bound_ms) && spec.bound_ms > 0, `${c} is bounded with no timeout source`);
    if (spec.policy === "human_indefinite") assert.ok(spec.bound_ms == null, `${c} is HUMAN_INDEFINITE and must not carry a timeout`);
  }
});

test("V2. no caption is accepted as a semantic key", () => {
  for (const c of CAPTIONS) {
    assert.equal(W.isDeclaredWaitReason(c), false, `"${c}" must never be a key`);
  }
  // Exact, never fuzzy: a near-miss is still not a key.
  assert.equal(W.isDeclaredWaitReason("needs_operator_input "), false);
  assert.equal(W.isDeclaredWaitReason("NEEDS_OPERATOR_INPUT"), false);
  assert.equal(W.isDeclaredWaitReason("needs_operator"), false);
  assert.equal(W.isDeclaredWaitReason("needs_operator_input"), true);
  assert.equal(W.isDeclaredWaitReason(null), false);
  assert.equal(W.isDeclaredWaitReason(undefined), false);
});

test("V3. THE INCIDENT: a caption used as the key fails an otherwise healthy wait", () => {
  // The old behaviour, reproduced through the classifier itself.
  const viaCaption = W.describeWait({ reason: "Waiting on Director — branch push", waiting_since: Date.now() });
  assert.equal(viaCaption.bound_policy, "invalid");
  assert.equal(viaCaption.invalid_because, "unknown_wait_reason");
  assert.equal(W.reconcileWait(viaCaption).action, "fail", "which is what killed 21 runs");

  // The semantic code the SAME producer already wrote, on the same wait.
  const viaCode = W.describeWait({ reason: "needs_operator_input", waiting_since: Date.now() });
  assert.equal(viaCode.bound_policy, "human_indefinite");
  assert.equal(viaCode.deadline, null, "a human wait has no deadline by design");
  assert.equal(W.reconcileWait(viaCode).action, "hold", "and is held, not collected");
});

test("V4. the classifier prefers the semantic code over the caption", () => {
  const text = src("../lib/vacilando/execution-stale.mjs");
  const fn = text.slice(text.indexOf("function waitReasonFor(run)"), text.indexOf("\n}", text.indexOf("function waitReasonFor(run)")));
  const rwAt = fn.indexOf("resource_wait?.reason");
  const srAt = fn.indexOf("state_reason");
  assert.ok(rwAt > 0, "it reads the producer's semantic code");
  assert.ok(rwAt < srAt, "BEFORE it considers state_reason");
  assert.match(fn, /isDeclaredWaitReason\(run\.state_reason\)/,
    "and state_reason is only usable when it is itself a declared code");
  // The old line must be gone: a bare fallback to state_reason is the defect.
  assert.equal(/return run\.state_reason \|\| null;/.test(fn), false,
    "an unguarded state_reason fallback is exactly what let a caption become the key");
});

test("V5. an unknown first-party code still fails closed", () => {
  const d = W.describeWait({ reason: "waiting_for_something_nobody_declared", waiting_since: Date.now() });
  assert.equal(d.bound_policy, "invalid");
  assert.equal(W.reconcileWait(d).action, "fail", "unknown must never be held open on a guess");
  const missing = W.describeWait({ reason: null, waiting_since: Date.now() });
  assert.equal(missing.invalid_because, "missing_wait_reason");
});

test("V6. an autonomous wait is never collected as a human-abandonment", () => {
  // Bounded system waits expire on their OWN bound, with their own failure
  // reason — never as "no human clicked".
  for (const code of ["waiting_for_resource_lease", "waiting_for_executor_authority", "provider_provisioning"]) {
    const spec = W.WAIT_REASONS[code];
    assert.equal(spec.policy, "bounded", `${code} is system-owned and must be bounded`);
    const old = W.describeWait({ reason: code, waiting_since: Date.now() - (spec.bound_ms + 60_000) });
    const decision = W.reconcileWait(old);
    assert.equal(decision.action, "fail");
    assert.match(decision.failure_reason, new RegExp(`^${code}_(bound_exceeded|impossible)$`),
      "it fails as its own reason, not as needs_input_without_operator_input");
    assert.notEqual(decision.failure_reason, "needs_input_without_operator_input");
  }
});

test("V7. a genuine human wait is held for as long as it takes", () => {
  const ancient = W.describeWait({ reason: "needs_operator_input", waiting_since: Date.now() - 30 * 24 * 3600_000 });
  const d = W.reconcileWait(ancient);
  assert.equal(d.action, "hold", "thirty days is healthy for a human wait");
  assert.equal(d.reason, "explicit_human_wait_policy");
  assert.equal(ancient.deadline, null);
});

test("V8. every producer of a wait emits a declared code", () => {
  // Mechanical: scan first-party emitters for resource_wait reasons and prove
  // each is in the table. A producer inventing a code fails here, in
  // certification, before it can kill a run in production.
  const files = [
    "../lib/vacilando/governed-action-request.mjs",
    "../lib/vacilando/execution-run-send.mjs",
    "../lib/vacilando/execution-admission.mjs",
    "../lib/vacilando/execution-resource.mjs",
  ];
  const declared = new Set(W.declaredWaitReasons());
  const emitted = new Set();
  for (const f of files) {
    for (const m of src(f).matchAll(/describeWait\(\{\s*\n?\s*reason:\s*"([^"]+)"/g)) emitted.add(m[1]);
  }
  assert.ok(emitted.size > 0, "at least one producer was found");
  for (const e of emitted) {
    assert.ok(declared.has(e), `producer emits undeclared wait reason "${e}"`);
  }
});

test("V9. the caption survives as presentation, and only as presentation", () => {
  const gar = src("../lib/vacilando/governed-action-request.mjs");
  const fn = gar.slice(gar.indexOf("function waitProjection"), gar.indexOf("function resolveStoreRoot"));
  assert.match(fn, /reason: "needs_operator_input"/, "the descriptor carries the semantic code");
  assert.match(fn, /summary: presentation\.wait_label/, "and the caption stays in a presentation field");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
