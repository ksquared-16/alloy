#!/usr/bin/env node
/**
 * THE CEILING HAS TO BE READ WHERE IT IS WRITTEN.
 *
 * Reported from the Attendance lane: a new lane was refused for capacity while
 * the configured ceiling was 8. Traced to four owners of one number disagreeing
 * — ~/.config/alloy-dev/config said 8, capacity-precedence said default 3 max 6,
 * the governed authority window said 4..8, and the line that actually refuses
 * admission said `Number(process.env.ALLOY_MAX_ACTIVE_PROVIDERS || 3)`.
 *
 * The Gateway is started by launchd and carries no such variable, so the
 * governed raise landed in the config file and the admission gate never saw it.
 * Measured on the host: config 8, process env unset, enforced 3.
 */
import assert from "node:assert/strict";
import test from "node:test";

const A = await import("../lib/vacilando/alloy-dev-adapter.mjs");

test("the governed config value is what the admission gate enforces", () => {
  assert.equal(A.resolveProviderCeiling({ env: {}, configCeiling: 8 }), 8,
    "a raise written by capacity.set_provider_ceiling actually takes effect");
});

test("an explicit environment variable still wins", () => {
  // A deliberate per-process override; the operator who sets it means it.
  assert.equal(A.resolveProviderCeiling({ env: { ALLOY_MAX_ACTIVE_PROVIDERS: "5" }, configCeiling: 8 }), 5);
});

test("an ABSENT environment variable no longer erases the governed value", () => {
  // This is the whole defect: absence used to mean 3, silently.
  assert.equal(A.resolveProviderCeiling({ env: {}, configCeiling: 8 }), 8);
  assert.notEqual(A.resolveProviderCeiling({ env: {}, configCeiling: 8 }), A.PROVIDER_CEILING_FLOOR);
});

test("the floor still applies when nothing is configured anywhere", () => {
  assert.equal(A.resolveProviderCeiling({ env: {}, configCeiling: null }), A.PROVIDER_CEILING_FLOOR);
  assert.equal(A.PROVIDER_CEILING_FLOOR, 3);
});

test("junk never widens the ceiling", () => {
  for (const bad of ["", "abc", "0", "-4", " "]) {
    assert.equal(A.resolveProviderCeiling({ env: { ALLOY_MAX_ACTIVE_PROVIDERS: bad }, configCeiling: null }),
      A.PROVIDER_CEILING_FLOOR, `refused: ${JSON.stringify(bad)}`);
  }
  assert.equal(A.resolveProviderCeiling({ env: {}, configCeiling: "nonsense" }), A.PROVIDER_CEILING_FLOOR);
});
