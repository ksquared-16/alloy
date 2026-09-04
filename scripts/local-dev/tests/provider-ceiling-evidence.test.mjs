/**
 * The ceiling gates must be MEASURED, not merely named.
 *
 * routine_provider_ceiling_experiment_v1 named six gates and nothing collected
 * any of them, so every ceiling move escalated with "required gates were not
 * measured" and the operator approved it by reading exactly what
 * `vac capacity provider-observe` already prints. That is the same defect the
 * merge policy had, and the same fix: build the collector, then remove the click.
 */
import test from "node:test";
import assert from "node:assert/strict";

const P = await import("../lib/vacilando/trusted-host-provider-ceiling.mjs");
const DA = await import("../lib/vacilando/director-authority.mjs");

const observation = (over = {}) => () => ({
  ceilings: { derived: 4, configured: 4, enforced: 4, owners_agree: true, ...(over.ceilings || {}) },
  host: { cores: 12, load: [3.6, 3.9, 3.1], pressure_level: 1, pressure_readable: true, gateway_http: 200, ...(over.host || {}) },
});

const INPUTS = { expected_ceiling: 4, requested_ceiling: 5, rollback_ceiling: 4 };

test("all six gates are measured from the canonical reader", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: observation() });
  assert.equal(ev.ceiling_key, "ALLOY_MAX_ACTIVE_PROVIDERS");
  assert.equal(ev.live_ceiling, 4);
  assert.equal(ev.host_headroom_ok, true);
  assert.equal(ev.unvalidated_ceiling_active, false);
  for (const k of ["expected_ceiling", "requested_ceiling", "rollback_ceiling"]) {
    assert.equal(typeof ev[k], "number");
  }
});

test("measured evidence auto-approves without an operator click", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: observation() });
  const d = DA.evaluateDirectorAuthority({
    request: { action_key: "capacity.set_provider_ceiling", target: "development_certification" },
    evidence: { ...ev, governance_exception_active: false, operator_hold: false },
  });
  assert.equal(d.decision, "director_approved");
  assert.equal(d.matched_policy, "routine_provider_ceiling_experiment_v1");
});

test("a host under pressure has no headroom, and escalates", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: observation({ host: { pressure_level: 3 } }) });
  assert.equal(ev.host_headroom_ok, false);
  const d = DA.evaluateDirectorAuthority({
    request: { action_key: "capacity.set_provider_ceiling", target: "development_certification" },
    evidence: { ...ev, governance_exception_active: false, operator_hold: false },
  });
  assert.equal(d.decision, "policy_denied");
});

test("load at or above core count is not headroom", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: observation({ host: { load: [12.5, 9, 8] } }) });
  assert.equal(ev.host_headroom_ok, false);
});

test("configured and enforced disagreeing is an unvalidated ceiling", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: observation({ ceilings: { enforced: 6 } }) });
  assert.equal(ev.unvalidated_ceiling_active, true);
});

test("owners disagreeing is an unvalidated ceiling", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: observation({ ceilings: { owners_agree: false } }) });
  assert.equal(ev.unvalidated_ceiling_active, true);
});

test("compare-and-set reads CONFIGURED, so a stale prediction is refused", () => {
  const ev = P.measureProviderCeilingGates(
    { ...INPUTS, expected_ceiling: 6 }, { observe: observation() },
  );
  assert.equal(ev.live_ceiling, 4);
  const d = DA.evaluateDirectorAuthority({
    request: { action_key: "capacity.set_provider_ceiling", target: "development_certification" },
    evidence: { ...ev, governance_exception_active: false, operator_hold: false },
  });
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("ceiling_expectation_measured"));
});

test("an unreadable observation measures nothing and therefore escalates", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, { observe: () => { throw new Error("no reader"); } });
  assert.equal(ev.live_ceiling, undefined);
  const d = DA.evaluateDirectorAuthority({
    request: { action_key: "capacity.set_provider_ceiling", target: "development_certification" },
    evidence: { ...ev, governance_exception_active: false, operator_hold: false },
  });
  assert.equal(d.decision, "operator_approval_required");
});

test("LIVE — this host measures its own ceiling gates", () => {
  const ev = P.measureProviderCeilingGates(INPUTS);
  assert.equal(ev.live_ceiling, 4, "the certified live ceiling is 4");
  assert.equal(typeof ev.host_headroom_ok, "boolean");
});

/* ── The two halves must agree on field names ────────────────────────────── */

const R2 = await import("../lib/vacilando/trusted-host-action-registry.mjs");

test("validated inputs survive into the executor without becoming NaN", () => {
  // THE BUG THIS CATCHES. validateProviderCeilingInputs rewrites the request
  // into {expected, requested, rollbackTo}; that normalized object is what gets
  // stored as action.inputs. The executor read expected_ceiling/expectedCeiling
  // only, so it got undefined, Number(undefined) is NaN, and every ceiling move
  // ran `--expected NaN --to NaN`, hit the CLI usage banner and exited with no
  // stdout. The caller reported command_failed and the number never moved.
  const def = R2.getActionDefinition("capacity.set_provider_ceiling");
  const v = def.validateInputs({
    expected_ceiling: 4, requested_ceiling: 5, rollback_ceiling: 4, reason: "round trip",
  });
  assert.equal(v.ok, true);

  const stored = v.normalized;
  let seen = null;
  P.executeProviderCeiling(
    {
      expected: Number(stored.expected ?? stored.expected_ceiling ?? stored.expectedCeiling),
      requested: Number(stored.requested ?? stored.requested_ceiling ?? stored.requestedCeiling),
      rollbackTo: Number(stored.rollbackTo ?? stored.rollback_ceiling ?? stored.rollbackCeiling),
      reason: stored.reason,
    },
    { runner: (_bin, args) => { seen = args; throw Object.assign(new Error("stub"), { stdout: "" }); } },
  );
  assert.ok(seen, "the executor must have built a command");
  for (const a of seen) {
    assert.notEqual(a, "NaN", `argument list contains NaN: ${seen.join(" ")}`);
  }
  assert.deepEqual(seen.slice(0, 8), [
    "capacity", "set-provider-ceiling", "--expected", "4", "--to", "5", "--rollback-to", "4",
  ]);
});

test("gateway liveness is not a headroom gate — it was a self-deadlock", () => {
  // provider-observe measures gateway_http by curling the Gateway's own health
  // endpoint. This action runs inside the Gateway and shells out synchronously,
  // blocking its event loop, so the Gateway cannot answer its own probe. Making
  // that a required gate meant the gate could never pass where it mattered.
  const ev = P.measureProviderCeilingGates(INPUTS, {
    observe: observation({ host: { gateway_http: null } }),
  });
  assert.equal(ev.host_headroom_ok, true, "an unanswerable self-probe must not block headroom");
  assert.equal(ev.gateway_http_observed, null, "it is retained as an observation");
});

test("real host pressure still blocks, with gateway_http absent", () => {
  const ev = P.measureProviderCeilingGates(INPUTS, {
    observe: observation({ host: { gateway_http: null, pressure_level: 3 } }),
  });
  assert.equal(ev.host_headroom_ok, false, "pressure is the thing headroom actually measures");
});
