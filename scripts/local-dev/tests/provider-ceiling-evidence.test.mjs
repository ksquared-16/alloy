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
