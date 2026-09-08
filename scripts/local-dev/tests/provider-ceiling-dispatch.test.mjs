/**
 * The ceiling action must be REACHABLE, not merely registered.
 *
 * capacity.set_provider_ceiling was registered, mode-mapped, policy-covered,
 * capability-granted and operator-approved, and still failed
 * `action_unavailable` on execution: the mission dispatch had no branch for it,
 * so it fell through to a guard whose error names the registry. The executor
 * half (fulfillSetProviderCeilingForMission) had existed since the action
 * shipped — it was never imported or dispatched, so the action had never once
 * been executable.
 *
 * These assertions are structural on purpose. A dispatch branch is exactly the
 * kind of wiring that is invisible until an operator has already approved
 * something that cannot run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
const ACTIONS = await import("../lib/vacilando/trusted-host-actions.mjs");
const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");

test("the executor half exists and is exported", () => {
  assert.equal(typeof ACTIONS.fulfillSetProviderCeilingForMission, "function");
});

test("the ceiling action is imported into the dispatcher", () => {
  assert.match(SRC, /fulfillSetProviderCeilingForMission,/,
    "an executor nobody imports is an action nobody can run");
});

test("the ceiling action has a mission dispatch branch", () => {
  assert.match(SRC, /rec\.action_key === ACTION_TYPES\.CAPACITY_SET_PROVIDER_CEILING/);
});

test("every registered privileged_write action has a dispatch branch", () => {
  // The general form of the bug. Registration, authorization and dispatch are
  // three separate lists, and only the third one actually runs anything.
  const dispatched = new Set();
  for (const m of SRC.matchAll(/rec\.action_key === ACTION_TYPES\.([A-Z_]+)/g)) dispatched.add(m[1]);
  // Census is dispatched through its own guarded tail rather than an equality branch.
  dispatched.add("DATABASE_READ_CENSUS");

  // Empty, and it must stay that way. It briefly held host.install_toolkit,
  // which this very test caught: registered with gates and a policy, and no
  // executor, so it would have failed `action_unavailable` exactly as the
  // ceiling did. An unreachable action is invisible until an operator approves
  // one, which is why this guard is structural rather than per-action.
  const KNOWN_UNREACHABLE = [];

  const missing = [];
  for (const [constName, actionType] of Object.entries(R.ACTION_TYPES)) {
    const def = R.getActionDefinition(actionType);
    if (!def || def.riskClass !== "privileged_write") continue;
    if (!dispatched.has(constName)) missing.push(actionType);
  }
  assert.deepEqual(missing.filter((a) => !KNOWN_UNREACHABLE.includes(a)), [],
    `registered but unreachable: ${missing.join(", ")}`);
  // The baseline may not grow stale in the other direction either: an entry
  // that became reachable must be removed from the list.
  for (const a of KNOWN_UNREACHABLE) {
    assert.ok(missing.includes(a), `${a} is now dispatched — remove it from KNOWN_UNREACHABLE`);
  }
});

test("the toolkit install is reachable end to end", () => {
  assert.equal(typeof ACTIONS.fulfillInstallToolkitForMission, "function");
  assert.equal(typeof ACTIONS.executeInstallToolkitTrustedHostAction, "function");
  assert.match(SRC, /fulfillInstallToolkitForMission,/);
  assert.match(SRC, /rec\.action_key === ACTION_TYPES\.HOST_INSTALL_TOOLKIT/);
});

test("every action's validateInputs returns the `normalized` the request layer reads", () => {
  /*
   * requestTrustedHostAction reads `validated.normalized.dedupeKey` as soon as
   * validation succeeds, and stores `validated.normalized` as the action's
   * inputs. host.install_toolkit returned {ok, evidence, plan} with no
   * `normalized`, so that read threw a TypeError and the governed request
   * failed with `execution_threw` BEFORE any trusted-host action existed —
   * which is why the failure carried no action id to inspect.
   *
   * Registration, dispatch and the validate contract are three separate things
   * that must agree. The other tests here cover the first two.
   */
  const samples = {
    "capacity.set_provider_ceiling": { expected_ceiling: 4, requested_ceiling: 5, rollback_ceiling: 4, reason: "round trip" },
    "host.install_toolkit": null, // validated live below; it reads real host state
    "lane.dispatch_measurement_instruction": {
      purpose: "capacity_provider_certification", target_lane_id: "lane_abc123",
      measurement_id: "m1", source_mission_id: "msn_x",
      instruction: "CAPACITY V2 PROVIDER CERTIFICATION — READ-ONLY. DO NOT MODIFY PRODUCT STATE.\n\nInspect and report.",
    },
  };
  for (const [actionType, inputs] of Object.entries(samples)) {
    if (inputs === null) continue;
    const def = R.getActionDefinition(actionType);
    assert.ok(def, `${actionType} must be registered`);
    const v = def.validateInputs(inputs);
    assert.equal(v.ok, true, `${actionType} sample inputs should validate: ${JSON.stringify(v)}`);
    assert.ok(v.normalized, `${actionType}.validateInputs must return normalized — the request layer reads it`);
    assert.ok(v.normalized.dedupeKey || v.normalized.queryHash,
      `${actionType}.normalized needs a dedupeKey or queryHash`);
  }
});

test("host.install_toolkit honours the same contract against live host state", async () => {
  const T = await import("../lib/vacilando/toolkit-convergence.mjs");
  const v = T.validateInstallToolkitInputs({
    expected_staging_sha: T.measureToolkitConvergence().promoted_staging_sha,
    reason: "contract check against real host state",
  });
  assert.equal(v.ok, true, `should validate: ${JSON.stringify(v)}`);
  assert.ok(v.normalized, "normalized must be present or the request layer throws");
  assert.match(v.normalized.dedupeKey, /^toolkit_install:origin\/staging:[0-9a-f]{12}$/);
  assert.match(v.normalized.expectedStagingSha, /^[0-9a-f]{12}$/);
});
