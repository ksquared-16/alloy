#!/usr/bin/env node
/**
 * WHAT A PRIVILEGED WRITE IS ALLOWED - AND REQUIRED - TO TELL YOU.
 *
 * Trusted-host result allowlists are deliberate safety boundaries and must stay
 * explicit: nothing here argues for passing the producer through. But an
 * explicit list has a second failure mode, and it has now cost three incidents.
 * The executor's provenance, the toolkit convergence block, and
 * gateway_executing_sha were each produced correctly for weeks and dropped by a
 * list nobody thought to extend. Every one had a passing test at the producer.
 *
 * P1 in the propagation contracts locked install_toolkit against exactly this.
 * These generalize it to the rest of the privileged actions, because five
 * allowlisted fields had no test of any kind - rollback_value, plan_fingerprint,
 * dependents_at_deletion, deleted_head_sha, state_before/state_after - and each
 * is the forensic record of a destructive or privileged write. They propagate
 * today. Nothing stopped the next edit from quietly removing them.
 *
 * The assertion is REQUIRED-PRESENT, never allowlist-equals-producer: adding a
 * field to a producer must not fail a gate, and dropping one the operator needs
 * must.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const src = readFileSync(new URL("../lib/vacilando/trusted-host-actions.mjs", import.meta.url), "utf8");

/** The result-shaping block for one action, located by its producer call. */
function resultBlockFor(producer) {
  const call = src.indexOf(`= ${producer}(`) >= 0 ? src.indexOf(`= ${producer}(`) : src.indexOf(`${producer}(`);
  assert.notEqual(call, -1, `producer ${producer} is not called here any more`);
  const after = src.slice(call);
  const start = after.search(/(?:return completeTrustedAction\(action, \{|action\.result = \{)/);
  assert.notEqual(start, -1, `no result block follows ${producer}`);
  const from = after.slice(start);
  const end = from.indexOf("\n  };") >= 0 ? from.indexOf("\n  };") : from.indexOf("\n  }");
  return from.slice(0, end);
}

/*
 * Each entry: the fields an OPERATOR or a later investigator needs in order to
 * understand what a privileged write did. Not every field the producer returns.
 */
const CONTRACT = [
  ["executeToolkitInstall", [
    "installed_sha", "previous_sha", "already_converged", "readback_verified",
    "rollback_target", "gateway_restart_required",
    // restart required FROM what, TO what. Dropped once; found by audit.
    "gateway_executing_sha",
    // says the drift episode owns the restart, so it does not read as "required of you"
    "convergence",
  ]],
  ["executeWorktreeRetirement", [
    // A DESTRUCTIVE action. postconditions is the proof it actually happened,
    // branch_deleted is a guarantee rather than an omission, and
    // safety_fingerprint is what ties the result to the thing inspected.
    "worktree", "path", "branch", "head_sha", "safety_fingerprint",
    "applied", "postconditions", "removal_method", "branch_deleted",
  ]],
  ["deleteRemoteBranch", [
    // Destructive and irreversible from here: which sha died, and what still
    // pointed at it when it did.
    "repository", "branch", "deleted", "deleted_head_sha", "dependents_at_deletion",
  ]],
  ["executeProviderCeiling", [
    // rollback_value is how the change is undone. It had no test at all.
    "key", "previous_value", "new_value", "rollback_value",
    "readback_verified", "reason", "experiment_id", "audited_at",
  ]],
  ["applyReconciliationPlan", [
    "plan_id", "plan_fingerprint", "requested", "applied", "skipped",
    "withheld", "unsupported",
  ]],
  ["runRegisteredReconciliation", [
    "reconciliation_key", "target_environment", "exit_code", "counts",
    "dry_run", "stdout_tail",
    // which registered thing actually ran - dropped once already
    "provenance",
  ]],
];

for (const [producer, required] of CONTRACT) {
  test(`${producer}: every operator-required field survives the allowlist`, () => {
    const block = resultBlockFor(producer);
    const missing = required.filter((f) => !new RegExp(`(^|[\\s,{])${f}\\s*:`, "m").test(block));
    assert.deepEqual(missing, [],
      `${producer} result drops ${missing.join(", ")} - produced correctly and never delivered`);
  });
}

test("every privileged result states that no credential escaped", () => {
  for (const [producer] of CONTRACT) {
    const block = resultBlockFor(producer);
    assert.match(block, /credentialsExposed:\s*false/,
      `${producer} must assert it exposed no credential, not leave it unsaid`);
  }
});

test("no allowlist has quietly grown a secret-bearing field", () => {
  // The boundary stays explicit in BOTH directions: required fields cannot be
  // dropped, and credential-shaped ones cannot be added. "key" is deliberately
  // not in this list - a provider ceiling key is a config name, not material.
  const forbidden = /\b(token|secret|password|passwd|credential|authorization|bearer|private_key|api_key)\s*:/i;
  for (const [producer] of CONTRACT) {
    const block = resultBlockFor(producer);
    assert.doesNotMatch(block, forbidden, `${producer} result names a credential-shaped field`);
  }
});

test("the one spread result is safe because its PRODUCER is the allowlist", () => {
  /*
   * executeLaneDispatch's result is `{ ...out }` rather than an explicit list.
   * That is acceptable only while the producer itself returns a closed shape -
   * so this asserts the property that makes it safe, and will fail the day the
   * dispatch result starts echoing its inputs.
   */
  const dispatch = readFileSync(new URL("../lib/vacilando/lane-dispatch.mjs", import.meta.url), "utf8");
  const fn = dispatch.slice(dispatch.indexOf("export function executeLaneDispatch"));
  // The SUCCESS return, not the early refusal returns above it.
  const okAt = fn.indexOf("return {\n    ok: true");
  assert.notEqual(okAt, -1, "the dispatch success return moved");
  const ret = fn.slice(okAt, fn.indexOf("\n  };", okAt));
  assert.doesNotMatch(ret, /\binstruction\b/,
    "a spread result must not carry the instruction text back out");
  for (const f of ["target_lane_id", "run_id", "origin", "mutated_target_state"]) {
    assert.match(ret, new RegExp(`${f}\\s*:`), `dispatch result must still state ${f}`);
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
