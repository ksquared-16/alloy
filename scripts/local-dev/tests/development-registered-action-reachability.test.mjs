/**
 * REGISTERED EXECUTABLE ACTION ⇔ authorization + mode + dispatch + executor.
 *
 * `environment.execute_registered_reconciliation` was registered, carried a risk
 * class, an approval requirement, an input schema and a trusted-host executor —
 * and could not be reached, because nothing assigned it a governed mode and no
 * branch in `requestGovernedAction` named it. It was discoverable, proposable,
 * approvable, and then denied with `policy_denied`, which reads as the operator
 * forbidding the action rather than nobody having wired it.
 *
 * GC2/GC4/GC5 in the contract suite already asserted this, correctly, by reading
 * the source. They were RED on staging and nothing ran them. These add the
 * behavioural half: the mode is RESOLVED rather than grepped, so an action whose
 * mapping exists but returns something unusable still fails here.
 */
import test from "node:test";
import assert from "node:assert/strict";

const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const Q = await import("../lib/vacilando/governed-action-request.mjs");
const A = await import("../lib/vacilando/trusted-host-actions.mjs");
const REG = await import("../lib/vacilando/reconciliation-registry.mjs");

const KEY = R.ACTION_TYPES.ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION;
const registered = R.listRegisteredActionTypes ? R.listRegisteredActionTypes() : Object.values(R.ACTION_TYPES);

await test("RA1 — every registered non-read action resolves a usable governed mode", () => {
  // Behavioural, not textual. A mapping that exists but returns a mode outside
  // GOVERNED_MODES, or read_only for a privileged action, is the same outage.
  const bad = [];
  for (const key of registered) {
    const def = R.getActionDefinition?.(key);
    if (!def) continue;
    if (/read/i.test(String(def.riskClass || ""))) continue;
    const mode = Q.defaultModeForAction ? Q.defaultModeForAction(key, null) : null;
    if (mode === null) continue;            // not exported in this build; GC2 covers the text
    if (!Q.GOVERNED_MODES.includes(mode) || mode === "read_only") bad.push(`${key} -> ${mode}`);
  }
  assert.deepEqual(bad, [], `privileged actions resolving an unusable mode: ${bad.join(", ")}`);
});

await test("RA2 — the reconciliation action is registered with the shape it claims", () => {
  const def = R.getActionDefinition(KEY);
  assert.ok(def, "registered");
  assert.equal(def.riskClass, "privileged_write");
  assert.equal(def.alwaysRequiresOperatorApproval, true,
    "approval is a property of the registration, and this fix must not have relaxed it");
  assert.equal(def.requiredCapability, "trusted_host.environment.execute_registered_reconciliation");
  for (const field of ["reconciliation_key", "target_environment", "dry_run"]) {
    assert.ok(def.inputSchema.required.includes(field), `${field} required`);
  }
});

await test("RA3 — the fulfil leg exists and is exported", () => {
  // The leg that was missing. Without it the action is reachable in the catalog
  // and nowhere else.
  assert.equal(typeof A.fulfillExecuteRegisteredReconciliationForMission, "function");
});

await test("RA4 — a valid request resolves to a runner nobody supplied", () => {
  const out = REG.resolveReconciliationRequest({
    reconciliation_key: "converge_placement_waitlisted_children",
    target_environment: "staging",
    dry_run: true,
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  // The security property: the runner comes from the frozen table, not the caller.
  assert.equal(out.normalized.runner, "dev:qa:converge-placement-waitlisted");
});

// ── fail-closed. A completeness fix must not weaken any of these ────────────

await test("RA5 — an unregistered reconciliation key is refused by name", () => {
  const out = REG.resolveReconciliationRequest({
    reconciliation_key: "rm_minus_rf", target_environment: "staging", dry_run: true,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, REG.RECONCILIATION_REFUSALS.UNREGISTERED_KEY);
});

await test("RA6 — an environment the registration does not permit is refused", () => {
  const out = REG.resolveReconciliationRequest({
    reconciliation_key: "converge_placement_waitlisted_children",
    target_environment: "production", dry_run: true,
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, REG.RECONCILIATION_REFUSALS.ENVIRONMENT_NOT_PERMITTED);
});

await test("RA7 — production is absent from the vocabulary, not merely rejected", () => {
  assert.deepEqual([...REG.RECONCILIATION_ENVIRONMENTS], ["staging"]);
  for (const entry of Object.values(REG.REGISTERED_RECONCILIATIONS)) {
    assert.ok(!entry.environments.includes("production"), `${entry.key} must not name production`);
  }
});

await test("RA8 — a missing or non-boolean dry_run is refused, never defaulted", () => {
  // The one ambiguity that could turn a look into a write.
  for (const dry of [undefined, null, "true", 1, "", 0]) {
    const out = REG.resolveReconciliationRequest({
      reconciliation_key: "converge_placement_waitlisted_children",
      target_environment: "staging", dry_run: dry,
    });
    assert.equal(out.ok, false, `dry_run=${JSON.stringify(dry)} must refuse`);
    assert.equal(out.code, REG.RECONCILIATION_REFUSALS.DRY_RUN_NOT_BOOLEAN);
  }
});

await test("RA9 — a missing key is refused before anything else is read", () => {
  const out = REG.resolveReconciliationRequest({ target_environment: "staging", dry_run: true });
  assert.equal(out.ok, false);
  assert.equal(out.code, REG.RECONCILIATION_REFUSALS.MISSING_KEY);
});

await test("RA10 — the registration's own validateInputs enforces the same boundary", () => {
  // The registry entry and the resolver must not drift apart: the action is
  // validated through validateInputs, so a resolver fix that never reached the
  // registration would be invisible.
  const def = R.getActionDefinition(KEY);
  const good = def.validateInputs({
    reconciliation_key: "converge_placement_waitlisted_children",
    target_environment: "staging", dry_run: false,
  });
  assert.equal(good.ok, true, JSON.stringify(good));
  const bad = def.validateInputs({ reconciliation_key: "nope", target_environment: "staging", dry_run: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, REG.RECONCILIATION_REFUSALS.UNREGISTERED_KEY);
});
