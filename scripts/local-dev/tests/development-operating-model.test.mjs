#!/usr/bin/env node
/**
 * A COMFORTING DASHBOARD IS WORSE THAN A BROKEN ONE.
 *
 * The two failures worth testing here are both about display honesty rather
 * than arithmetic: showing a number nobody measured, and recomputing a ceiling
 * so the screen can disagree with the policy actually being enforced. Both
 * produce a page that looks fine while the machine is not.
 */
import assert from "node:assert/strict";
import { capacityOperatingModel } from "../lib/vacilando/capacity-operating-model.mjs";
import { CAPACITY_POLICY_V1 } from "../lib/vacilando/capacity-policy.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function test(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-om-"));
  try { fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

const srv = (i, o = {}) => ({ slot: i, observed_state: "RUNNING", recovery_state: null, ...o });
const fleet = (n, extra = []) => ({
  servers: [...Array.from({ length: n }, (_, k) => srv(k + 1)), ...extra],
  rollup: { total_rss_mb: 1000 * n, with_active_run: 0 },
});
const OK = { readable: true, level: 1, level_label: "normal", thrashing: false };

test("1. an unreadable pressure probe shows as unknown, never as calm", (root) => {
  const m = capacityOperatingModel({ pressure: { readable: false, level: null }, policy: CAPACITY_POLICY_V1, root });
  assert.equal(m.pressure.state, "unknown");
  assert.equal(m.pressure.level, null);
  assert.match(m.pressure.why, /could not be read/);
});

test("2. a missing pressure reading is also unknown", (root) => {
  assert.equal(capacityOperatingModel({ policy: CAPACITY_POLICY_V1, root }).pressure.state, "unknown");
});

test("3. ceilings are passed through from the policy, never recomputed", (root) => {
  const m = capacityOperatingModel({ policy: CAPACITY_POLICY_V1, fleet: fleet(4), pressure: OK, root });
  assert.equal(m.servers.normal_ceiling, CAPACITY_POLICY_V1.dev_server_normal_ceiling);
  assert.equal(m.servers.burst_ceiling, CAPACITY_POLICY_V1.dev_server_burst_ceiling);
  assert.equal(m.servers.measured_knee, CAPACITY_POLICY_V1.dev_server_measured_knee);
  assert.equal(m.browsers.ceiling, CAPACITY_POLICY_V1.browser_concurrency_ceiling);
});

test("4. the obsolete three-server doctrine is nowhere in the surface", (root) => {
  const m = capacityOperatingModel({ policy: CAPACITY_POLICY_V1, fleet: fleet(4), pressure: OK, root });
  assert.notEqual(m.servers.normal_ceiling, 3);
  assert.equal(m.servers.normal_ceiling, 8);
});

test("5. burst use is a visible state, not something to infer from two numbers", (root) => {
  assert.equal(capacityOperatingModel({ policy: CAPACITY_POLICY_V1, fleet: fleet(4), pressure: OK, root }).servers.using_burst, 0);
  assert.equal(capacityOperatingModel({ policy: CAPACITY_POLICY_V1, fleet: fleet(9), pressure: OK, root }).servers.using_burst, 1);
});

test("6. RECOVERING and RESTART_EXHAUSTED are named by slot", (root) => {
  const m = capacityOperatingModel({
    policy: CAPACITY_POLICY_V1, pressure: OK, root,
    fleet: fleet(2, [srv(7, { recovery_state: "RECOVERING" }), srv(8, { recovery_state: "RESTART_EXHAUSTED" })]),
  });
  assert.deepEqual(m.servers.recovering, [7]);
  assert.deepEqual(m.servers.restart_exhausted, [8]);
});

test("7. a degraded provider count is shown as uncountable, not as free seats", (root) => {
  // assessProviderCapacity reports available:ceiling when blind. Rendering that
  // as three free seats is the display half of the same trap.
  const m = capacityOperatingModel({
    policy: CAPACITY_POLICY_V1, pressure: OK, root,
    providerCapacity: { counted_from: "unavailable", ceiling: 3, active: 0, available: 3 },
  });
  assert.equal(m.providers.countable, false);
  assert.equal(m.providers.active, null, "a number nobody measured must not be displayed");
});

test("8. lane conditions are surfaced separately and completely", (root) => {
  const m = capacityOperatingModel({
    policy: CAPACITY_POLICY_V1, pressure: OK, root,
    placement: { rollup: { durable: 14, placed: 8, parked: 3, no_worktree: 3, slot_conflicts: [] } },
  });
  assert.deepEqual(
    [m.lanes.durable, m.lanes.placed, m.lanes.parked, m.lanes.no_worktree],
    [14, 8, 3, 3],
  );
});

test("9. with no fleet observation, counts are unknown rather than zero", (root) => {
  // Zero running servers and an unobserved fleet must not look identical.
  const m = capacityOperatingModel({ policy: CAPACITY_POLICY_V1, pressure: OK, root });
  assert.equal(m.servers.running, null);
  assert.equal(m.servers.using_burst, null);
});

test("10. queues are part of the picture, empty or not", (root) => {
  const m = capacityOperatingModel({ policy: CAPACITY_POLICY_V1, pressure: OK, root });
  assert.deepEqual(m.queues.servers, []);
  assert.deepEqual(m.queues.providers, []);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
