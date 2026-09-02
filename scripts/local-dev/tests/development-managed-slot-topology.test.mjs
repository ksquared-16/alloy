#!/usr/bin/env node
/**
 * ONE OWNER FOR HOW MANY SLOTS EXIST.
 *
 * THE DEFECT. The shell treats the managed slot count as configuration —
 * ALLOY_MAX_AGENTS drives slot validation, agent enumeration and port loops, and
 * every port derives as ALLOY_FIRST_AGENT_PORT + slot - 1. The JS control plane
 * re-encoded the same fact as the literal six, twenty-four times across ten
 * files: lane lifecycle, the Gateway free-slot picker and six of its bad_slot
 * route guards, the scheduler, the command registry, the dev-server adapter, the
 * lane validator, day-ops, the mission rail, capacity policy and capacity
 * precedence.
 *
 * They agreed at six by coincidence. That is the same shape as the capacity
 * override defect this lane already fixed — four call sites, four
 * implementations, all returning 3, agreeing by accident while the reasoning did
 * not. The practical cost is that a bounded experiment could not raise the pool:
 * ALLOY_MAX_AGENTS=12 would move the shell and leave the Gateway refusing to
 * allocate slot 7, the census skipping it and health unable to see it. A split
 * brain, not a topology change.
 *
 * These prove the topology is now derived everywhere from one value, that it
 * fails closed onto six, and that shrinking it cannot silently orphan a live
 * lane. Production stays at six throughout.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_DEV = join(HERE, "..");

const T = await import("../lib/vacilando/managed-slots.mjs");
const P = await import("../lib/vacilando/capacity-policy.mjs");
const C = await import("../lib/vacilando/capacity-precedence.mjs");

/** No host config: isolate from whatever this machine happens to be set to. */
const NONE = { ALLOY_CONFIG_FILE: "/nonexistent/alloy-config" };
const SIX = { ...NONE, ALLOY_MAX_AGENTS: "6" };
const TWELVE = { ...NONE, ALLOY_MAX_AGENTS: "12" };

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

test("PRODUCTION DEFAULT: six slots, ports 3011-3016", () => {
  assert.equal(T.DEFAULT_MANAGED_SLOT_COUNT, 6);
  const t = T.managedSlotTopology(SIX);
  assert.deepEqual(t.slots, [1, 2, 3, 4, 5, 6]);
  assert.equal(t.first_port, 3011);
  assert.equal(t.last_port, 3016);
  assert.equal(T.portForSlot(1, SIX), 3011);
  assert.equal(T.portForSlot(6, SIX), 3016);
  assert.equal(T.portForSlot(7, SIX), null, "slot 7 does not exist at six");
});

test("EXPERIMENTAL 12: slots 1-12, ports 3011-3022, deterministic and disjoint", () => {
  const t = T.managedSlotTopology(TWELVE);
  assert.deepEqual(t.slots, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(t.first_port, 3011);
  assert.equal(t.last_port, 3022);
  const ports = t.slots.map((s) => T.portForSlot(s, TWELVE));
  assert.deepEqual(ports, [3011, 3012, 3013, 3014, 3015, 3016, 3017, 3018, 3019, 3020, 3021, 3022]);
  assert.equal(new Set(ports).size, 12, "no two slots share a port");
  // Slots 1-6 keep exactly the ports they had. Existing lanes must not move.
  for (const s of [1, 2, 3, 4, 5, 6]) {
    assert.equal(T.portForSlot(s, TWELVE), T.portForSlot(s, SIX), `slot ${s} port must not change`);
  }
  // And the round trip holds.
  for (const s of t.slots) assert.equal(T.slotForPort(T.portForSlot(s, TWELVE), TWELVE), s);
});

test("slot 7-12 validation follows the topology, in both directions", () => {
  for (const s of [7, 9, 12]) {
    assert.equal(T.isManagedSlot(s, SIX), false, `slot ${s} must not exist at six`);
    assert.equal(T.isManagedSlot(s, TWELVE), true, `slot ${s} must exist at twelve`);
  }
  assert.equal(T.isManagedSlot(13, TWELVE), false);
  assert.equal(T.isManagedSlot(0, TWELVE), false);
  assert.equal(T.isManagedSlot(1.5, TWELVE), false);
  assert.equal(T.isManagedSlot("3", TWELVE), false, "a string is not a slot");
});

test("FAIL-SAFE: every bad configuration lands on six, never on something bigger", () => {
  const bad = [
    [{ ...NONE }, "default"],
    [{ ...NONE, ALLOY_MAX_AGENTS: "" }, "malformed_default"],
    [{ ...NONE, ALLOY_MAX_AGENTS: "abc" }, "malformed_default"],
    [{ ...NONE, ALLOY_MAX_AGENTS: "0" }, "invalid_default"],
    [{ ...NONE, ALLOY_MAX_AGENTS: "-4" }, "invalid_default"],
    [{ ...NONE, ALLOY_MAX_AGENTS: "6.5" }, "invalid_default"],
    [{ ...NONE, ALLOY_MAX_AGENTS: "9999" }, "above_hard_max_default"],
  ];
  for (const [env, source] of bad) {
    const r = T.resolveManagedSlotCount(env);
    assert.equal(r.count, 6, JSON.stringify(env.ALLOY_MAX_AGENTS));
    assert.equal(r.source, source, JSON.stringify(env.ALLOY_MAX_AGENTS));
  }
  // A resolver that failed OPEN would hand out slots with no ports, no
  // registrations and no memory behind them.
  assert.equal(T.managedSlotCount({ ...NONE, ALLOY_MAX_AGENTS: "9999" }), 6);
});

test("port range cannot overflow into the certification fixture range", () => {
  // Fixtures live at 3911+. The hard max keeps the managed range clear of them.
  const t = T.managedSlotTopology({ ...NONE, ALLOY_MAX_AGENTS: String(T.MANAGED_SLOT_HARD_MAX) });
  assert.equal(t.slot_count, T.MANAGED_SLOT_HARD_MAX);
  assert.ok(t.last_port < 3911, `last port ${t.last_port} must stay below the 3911 fixture range`);
});

test("SHRINKING must not silently orphan a live slot", () => {
  // Narrowing the range would make a live slot 9 — its registration, port,
  // server and bound lane — invisible to the census while still consuming the
  // host. That is the stale-registration defect, reintroduced by arithmetic.
  const unsafe = T.assessTopologyChange({ from: 12, to: 6, occupiedSlots: [3, 9, 11] });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.error, "live_slots_above_new_ceiling");
  assert.deepEqual(unsafe.stranded, [9, 11]);
  assert.match(unsafe.detail, /release or retire them first/);

  const safe = T.assessTopologyChange({ from: 12, to: 6, occupiedSlots: [1, 3, 6] });
  assert.equal(safe.ok, true, "nothing above the new ceiling is safe to shrink onto");
  assert.deepEqual(safe.stranded, []);
  assert.equal(T.assessTopologyChange({ from: 6, to: 12, occupiedSlots: [1, 2] }).direction, "grow");
  assert.equal(T.assessTopologyChange({ from: 6, to: 6 }).direction, "unchanged");
});

test("capacity POLICY derives its slot bound from the topology", () => {
  const cap = { logical_cores: 12, memory_total_gb: 48 };
  const six = P.computeCapacityPolicy(cap);
  assert.equal(six.axes.dev_server_capacity.by_slots, 6);
  // At 48 GB and 8 GB per server, memory allows 6 — so six is slot-bounded and
  // twelve becomes memory-bounded. The point is that the SLOT term moved.
  const prev = process.env.ALLOY_MAX_AGENTS;
  process.env.ALLOY_MAX_AGENTS = "12";
  try {
    const twelve = P.computeCapacityPolicy(cap);
    assert.equal(twelve.axes.dev_server_capacity.by_slots, 12, "the slot bound must follow topology");
    assert.equal(twelve.axes.dev_server_capacity.bounded_by, "memory",
      "at twelve slots the binding constraint becomes RAM, which is the honest answer");
  } finally {
    if (prev == null) delete process.env.ALLOY_MAX_AGENTS; else process.env.ALLOY_MAX_AGENTS = prev;
  }
});

test("capacity PRECEDENCE bounds an override by the slots that exist", () => {
  // An override may never ask for a server with nowhere to run — at any topology.
  const at6 = C.parseCapacityOverride({
    ...SIX, ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_RUNNING_SERVERS=7", ALLOY_CAPACITY_OVERRIDE_REASON: "x",
  });
  assert.equal(at6.active, false);
  assert.equal(at6.refusals[0].error, "above_hard_ceiling");
  assert.equal(at6.refusals[0].max, 6);

  const at12 = C.parseCapacityOverride({
    ...TWELVE, ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_RUNNING_SERVERS=7", ALLOY_CAPACITY_OVERRIDE_REASON: "x",
  });
  assert.deepEqual(at12.applied, { ALLOY_MAX_RUNNING_SERVERS: 7 });

  const tooFar = C.parseCapacityOverride({
    ...TWELVE, ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_RUNNING_SERVERS=13", ALLOY_CAPACITY_OVERRIDE_REASON: "x",
  });
  assert.equal(tooFar.refusals[0].max, 12, "still bounded, just at the new topology");
});

test("REVERSION: twelve back to six restores exactly the original slot set", () => {
  const before = T.managedSlotTopology(SIX);
  T.managedSlotTopology(TWELVE);
  const after = T.managedSlotTopology(SIX);
  assert.deepEqual(after, before, "no residue from having resolved twelve");
  // Nothing is cached or written; resolution is a pure read of the environment.
  assert.deepEqual(T.managedSlots(SIX), [1, 2, 3, 4, 5, 6]);
});

test("NO CONSUMER RETAINS A HARD-CODED SIX-SLOT INTERPRETATION", () => {
  // The guard that fails if a slot-range literal is reintroduced. Each of these
  // files carried one; a new one is the defect coming back.
  const owners = [
    "lib/vacilando/lane-worktree-lifecycle.mjs",
    "lib/vacilando/alloy-dev-adapter.mjs",
    "lib/vacilando/lanes.mjs",
    "lib/vacilando/day-ops.mjs",
    "lib/vacilando/scheduler.mjs",
    "lib/vacilando/commands/registry.mjs",
    "lib/vacilando/presentation/slot-mission-rail.mjs",
    "lib/vacilando-server.mjs",
  ];
  const literalArray = /\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*,\s*6\s*\]/;
  const literalBound = /slot\s*[<>]=?\s*6\b|slot\s*>\s*6\b/;
  for (const rel of owners) {
    const src = readFileSync(join(LOCAL_DEV, rel), "utf8");
    // Comments describing the defect are allowed; code is not.
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    assert.ok(!literalArray.test(code), `${rel} reintroduced a literal [1..6] slot array`);
    assert.ok(!literalBound.test(code), `${rel} reintroduced a literal six-slot bound`);
    assert.match(src, /managed-slots\.mjs/, `${rel} must read the one topology owner`);
  }
});

test("the shell and the control plane read the SAME value", () => {
  // Shell truth != Gateway truth is the failure this converges. The shell reads
  // ALLOY_MAX_AGENTS; so must this module — not a second key of its own.
  const src = readFileSync(join(LOCAL_DEV, "lib/vacilando/managed-slots.mjs"), "utf8");
  assert.match(src, /ALLOY_MAX_AGENTS/, "must read the shell's own key");
  assert.match(src, /ALLOY_FIRST_AGENT_PORT/, "and the shell's own port base");
  const common = readFileSync(join(LOCAL_DEV, "lib/common.sh"), "utf8");
  assert.match(common, /ALLOY_FIRST_AGENT_PORT \+ slot - 1/, "port derivation stays the shell's rule");
  // No second registry, no second config key.
  assert.ok(!/MANAGED_SLOT_COUNT=/.test(src), "must not invent a parallel config key");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
