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

  // Known-unreachable, and this list must only ever shrink. host.install_toolkit
  // is registered with gates and a policy but has no executor wired yet, so it
  // would fail `action_unavailable` exactly as the ceiling did. Recorded here
  // rather than hidden, because the whole point of this test is that an
  // unreachable action is invisible until an operator approves one.
  const KNOWN_UNREACHABLE = ["host.install_toolkit"];

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
