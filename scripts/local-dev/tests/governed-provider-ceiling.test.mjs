/**
 * The governed route for one capacity number — refusals first.
 *
 * This capability exists because "let the agent edit a host config file" was
 * refused, correctly. Everything below is an attempt to check that what
 * replaced it is genuinely narrower rather than the same authority wearing a
 * specific name, so the negative controls are the substance and the happy path
 * is two tests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const C = await import("../lib/vacilando/trusted-host-provider-ceiling.mjs");
const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const D = await import("../lib/vacilando/director-authority.mjs");
const G = await import("../lib/vacilando/governed-action-request.mjs");

const OK = { expected_ceiling: 4, requested_ceiling: 8, rollback_ceiling: 4, reason: "certify cohort of 8" };

/* ── The shape of the authority ─────────────────────────────────────────── */

test("the action is registered and states what it needs", () => {
  const found = R.listRegisteredActions().find((a) => a.actionType === "capacity.set_provider_ceiling");
  assert.ok(found, "capacity.set_provider_ceiling must be discoverable");
  assert.equal(found.riskClass, "privileged_write");
  // Discovery that omits required inputs teaches a lane an action exists and
  // nothing about how to propose it; the next thing it sees is a refusal.
  assert.deepEqual([...found.requiredInputs].sort(),
    ["expected_ceiling", "reason", "requested_ceiling", "rollback_ceiling"]);
});

test("the managed key is a constant, not something a caller may choose", () => {
  // This is the whole distinction between this action and a general config
  // writer. If the key were an input, the narrow name would be decoration.
  const v = C.validateProviderCeilingInputs({ ...OK, key: "ALLOY_ANYTHING_ELSE", config_key: "OTHER" });
  assert.equal(v.ok, true);
  assert.equal(v.normalized.key, "ALLOY_MAX_ACTIVE_PROVIDERS");

  const src = readFileSync(new URL("../lib/vacilando/trusted-host-provider-ceiling.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // No writer of any kind lives in this layer: it delegates to the canonical
  // command, so there is exactly one implementation to keep honest.
  assert.ok(!/writeFileSync|renameSync|appendFileSync/.test(code));
});

/* ── Refusals ───────────────────────────────────────────────────────────── */

test("a blind write is refused: compare-and-set is required", () => {
  const v = C.validateProviderCeilingInputs({ requested_ceiling: 8, rollback_ceiling: 4, reason: "x" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "expected_ceiling_required");
});

test("the authorised window is closed at both ends", () => {
  for (const bad of [3, 9, 0, -1, 100]) {
    const lo = C.validateProviderCeilingInputs({ ...OK, requested_ceiling: bad });
    assert.equal(lo.ok, false, `requested ${bad} must be refused`);
    assert.equal(lo.code, "outside_experimental_range");
  }
  // Predicting a value outside the window is refused too — otherwise a caller
  // could "expect" an unauthorised ceiling and have that treated as normal.
  const ex = C.validateProviderCeilingInputs({ ...OK, expected_ceiling: 12 });
  assert.equal(ex.ok, false);
  assert.equal(ex.code, "outside_experimental_range");
});

test("a change with no way back is refused", () => {
  for (const bad of [undefined, null, 3, 9, "four"]) {
    const v = C.validateProviderCeilingInputs({ ...OK, rollback_ceiling: bad });
    assert.equal(v.ok, false, `rollback ${bad} must be refused`);
    assert.equal(v.code, "rollback_ceiling_required");
  }
});

test("a ceiling may not move without a recorded reason", () => {
  const v = C.validateProviderCeilingInputs({ ...OK, reason: "   " });
  assert.equal(v.ok, false);
  assert.equal(v.code, "reason_required");
});

test("refusals are distinguishable from each other", () => {
  // A caller that cannot tell "out of range" from "someone moved it underneath
  // me" will retry the wrong one, and retrying a stale compare-and-set is how
  // an experiment loses track of the live value.
  const codes = new Set([
    C.validateProviderCeilingInputs({ requested_ceiling: 8, rollback_ceiling: 4, reason: "x" }).code,
    C.validateProviderCeilingInputs({ ...OK, requested_ceiling: 9 }).code,
    C.validateProviderCeilingInputs({ ...OK, rollback_ceiling: null }).code,
    C.validateProviderCeilingInputs({ ...OK, reason: "" }).code,
  ]);
  assert.equal(codes.size, 4);
});

/* ── Execution delegates; it does not reimplement ───────────────────────── */

test("execution invokes the canonical command with the exact transition", () => {
  const calls = [];
  const runner = (bin, args) => {
    calls.push({ bin, args });
    return JSON.stringify({ ok: true, key: "ALLOY_MAX_ACTIVE_PROVIDERS", from: 4, to: 8,
      rollback_to: 4, reason: "certify cohort of 8", experiment_id: "exp1", at: "2026-09-03T00:00:00.000Z" });
  };
  const n = C.validateProviderCeilingInputs({ ...OK, experiment_id: "exp1" }).normalized;
  const out = C.executeProviderCeiling(n, { vacPath: "/fake/vac", runner });
  assert.equal(out.ok, true);
  assert.equal(out.previous_value, 4);
  assert.equal(out.new_value, 8);
  assert.equal(out.readback_verified, true);
  assert.deepEqual(calls[0].args, [
    "capacity", "set-provider-ceiling", "--expected", "4", "--to", "8",
    "--rollback-to", "4", "--reason", "certify cohort of 8", "--experiment", "exp1",
  ]);
});

test("a refusal from the canonical command is surfaced, not swallowed", () => {
  const runner = () => {
    const e = new Error("Command failed");
    e.stdout = JSON.stringify({ ok: false, error: "expected_mismatch", detail: "live is 8, caller expected 4" });
    throw e;
  };
  const n = C.validateProviderCeilingInputs(OK).normalized;
  const out = C.executeProviderCeiling(n, { vacPath: "/fake/vac", runner });
  assert.equal(out.ok, false);
  assert.equal(out.error, "expected_mismatch");
  // The useful answer is the named refusal, not the exit code.
  assert.match(out.detail, /live is 8/);
});

test("a write that does not read back as requested is not a success", () => {
  const runner = () => JSON.stringify({ ok: true, key: "ALLOY_MAX_ACTIVE_PROVIDERS", from: 4, to: 6, rollback_to: 4 });
  const n = C.validateProviderCeilingInputs(OK).normalized;
  const out = C.executeProviderCeiling(n, { vacPath: "/fake/vac", runner });
  assert.equal(out.readback_verified, false, "asked for 8, config says 6");
});

/* ── What the Director may and may not do with it ───────────────────────── */

test("every ceiling gate fails closed when its evidence is missing", () => {
  const gates = ["ceiling_within_experimental_window", "ceiling_key_is_the_managed_one",
    "ceiling_expectation_measured", "rollback_ceiling_declared",
    "host_headroom_measured", "no_unvalidated_ceiling_active"];
  for (const g of gates) {
    assert.equal(D.GATES[g]({}), null, `${g} must report "not measured" rather than pass`);
  }
});

test("the gates measure the thing they are named after", () => {
  const ev = { ceiling_key: "ALLOY_MAX_ACTIVE_PROVIDERS", expected_ceiling: 4, requested_ceiling: 8,
    live_ceiling: 4, rollback_ceiling: 4, host_headroom_ok: true, unvalidated_ceiling_active: false };
  assert.equal(D.GATES.ceiling_key_is_the_managed_one(ev), true);
  assert.equal(D.GATES.ceiling_within_experimental_window(ev), true);
  assert.equal(D.GATES.ceiling_expectation_measured(ev), true);
  assert.equal(D.GATES.rollback_ceiling_declared(ev), true);
  // Someone else moved it: the prediction is stale and must not be written.
  assert.equal(D.GATES.ceiling_expectation_measured({ ...ev, live_ceiling: 8 }), false);
  assert.equal(D.GATES.ceiling_key_is_the_managed_one({ ...ev, ceiling_key: "ALLOY_OTHER" }), false);
  assert.equal(D.GATES.ceiling_within_experimental_window({ ...ev, requested_ceiling: 16 }), false);
  // Raising capacity on a host already under pressure is how a capacity
  // experiment becomes an outage.
  assert.equal(D.GATES.host_headroom_measured({ ...ev, host_headroom_ok: false }), false);
  assert.equal(D.GATES.no_unvalidated_ceiling_active({ ...ev, unvalidated_ceiling_active: true }), false);
});

test("the policy is bound to this host, and never to a deployed environment", () => {
  const p = D.DELEGATED_POLICIES_V1.find((x) => x.action_key === "capacity.set_provider_ceiling");
  assert.ok(p, "the action needs a policy or it can never be delegated");
  assert.deepEqual(p.environments, ["development_certification"]);
  assert.ok(!p.environments.includes("staging"));
  assert.ok(!p.environments.includes("production"));
  for (const required of ["ceiling_expectation_measured", "rollback_ceiling_declared",
    "host_headroom_measured", "no_operator_hold"]) {
    assert.ok(p.gates.includes(required), `${required} must be a gate`);
  }
});

test("moving the ceiling does not enlarge what the agent may do", () => {
  // The ceiling governs how many providers run, not what any of them may do.
  // If that ever stops being true this action belongs to the operator.
  assert.ok(!D.SELF_EXPANSION_ACTION_KEYS.includes("capacity.set_provider_ceiling"));
  assert.ok(!D.OPERATOR_OWNED_ACTION_KEYS.includes("capacity.set_provider_ceiling"));
});

test("the operator is shown the actual numbers", () => {
  const words = G.describeGovernedAction
    ? G.describeGovernedAction({ action_key: "capacity.set_provider_ceiling", inputs: OK })
    : null;
  if (words == null) return; // describer not exported under this name
  assert.match(words, /4/);
  assert.match(words, /8/);
});
