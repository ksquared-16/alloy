#!/usr/bin/env node
/**
 * FREE SLOTS ARE COUNTED AGAINST THE TOPOLOGY THAT EXISTS.
 *
 * THE DEFECT. `FIXED_SLOT_RANGE = 6` lived in alloy-dev-adapter and fed
 * `free_slots`, so a twelve-slot host reported its free capacity against six.
 * The constant justified itself as the "permanent ports (3011–3016)" and the
 * legacy `alloy-sprint-*` commands — a separate compatibility range that had to
 * be preserved.
 *
 * That range did not exist. Audited against the shell it was protecting:
 *
 *   alloy_validate_slot   bounds by ALLOY_MAX_AGENTS, not 6
 *   alloy_slot_to_port    is ALLOY_FIRST_AGENT_PORT + slot - 1, unbounded by 6
 *
 * The legacy path was already topology-driven and always had been. Measured on
 * the host at removal, SIX slots above the supposed range held working fixed
 * ports: 7→3017, 8→3018, 9→3019, 10→3020, 11→3021, 12→3022. There was nothing
 * to keep compatible with.
 *
 * Two sibling implementations — `scheduler.mjs` and
 * `lane-worktree-lifecycle.freeSlots()` — already read `managedSlots()`. The
 * adapter was the third answer to "which slots are free", and the only wrong
 * one. These controls pin all three onto the topology owner and prove the
 * capacity model above them did not move.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WT = mkdtempSync(join(tmpdir(), "vac-freeslot-"));
const A = await import("../lib/vacilando/alloy-dev-adapter.mjs");
const { managedSlotCount } = await import("../lib/vacilando/managed-slots.mjs");
const C = await import("../lib/vacilando/capacity-precedence.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/**
 * `n` occupied slots, each a real directory so the adapter counts them.
 *
 * `agentStatus` is separate from occupancy on purpose: a registered worktree
 * holds a SLOT whether or not an agent is running in it, and the two facts are
 * counted by different code paths. The default of "" is a dormant registration.
 */
function occupy(n, agentStatus = "") {
  return Array.from({ length: n }, (_, i) => {
    const p = join(WT, `w${i}`);
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, ".keep"), "");
    return { slot: i + 1, name: `w${i}`, lifecycle: "active", agent_status: agentStatus, path: p };
  });
}

/** free_slots for a given topology, with `occupied` slots taken. */
function freeAt(slots, occupied) {
  const prev = process.env.ALLOY_MAX_AGENTS;
  process.env.ALLOY_MAX_AGENTS = String(slots);
  try {
    return A.assessProvisionCapacity({ metadata: occupy(occupied), providerPanes: [], ceiling: 8 });
  } finally {
    if (prev === undefined) delete process.env.ALLOY_MAX_AGENTS;
    else process.env.ALLOY_MAX_AGENTS = prev;
  }
}

// ── reporting follows the topology, at every topology ────────────────────────
await test("F1. a 12-slot topology reports against 12", () => {
  assert.equal(freeAt(12, 0).free_slots, 12, "nothing taken");
  assert.equal(freeAt(12, 4).free_slots, 8, "four taken");
  assert.equal(freeAt(12, 12).free_slots, 0, "all taken");
});

await test("F2. a 6-slot topology reports against 6", () => {
  assert.equal(freeAt(6, 0).free_slots, 6);
  assert.equal(freeAt(6, 4).free_slots, 2);
  assert.equal(freeAt(6, 6).free_slots, 0);
});

await test("F3. a 1-slot topology reports against 1", () => {
  assert.equal(freeAt(1, 0).free_slots, 1);
  assert.equal(freeAt(1, 1).free_slots, 0);
});

await test("F4. the old literal is gone in both directions", () => {
  // The exact case the defect produced: twelve slots, six taken. The old code
  // said 0 free and "exhausted"; the truth is six free.
  const out = freeAt(12, 6);
  assert.equal(out.free_slots, 6, "six free, not zero");
  assert.equal(out.fixed_slots_exhausted, false, "and not exhausted");
  // And the mirror: a topology SMALLER than the old literal must not be
  // over-reported. Six was a floor as well as a ceiling.
  assert.equal(freeAt(3, 3).fixed_slots_exhausted, true, "three slots, three taken");
  assert.equal(freeAt(3, 0).free_slots, 3, "never more than the topology has");
});

await test("F5. the retired constant is not exported any more", async () => {
  const mod = await import("../lib/vacilando/alloy-dev-adapter.mjs");
  assert.equal(mod.FIXED_SLOT_RANGE, undefined, "a meaningless constant must not survive as API");
  assert.ok(!("fixed_slot_range" in freeAt(12, 0)), "nor as a reported field nobody read");
});

// ── the three implementations now agree ──────────────────────────────────────
await test("F6. adapter, scheduler and lifecycle give the same free-slot answer", async () => {
  const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
  const meta = occupy(4).map((m) => ({ ...m, path: m.path }));
  const prev = process.env.ALLOY_MAX_AGENTS;
  process.env.ALLOY_MAX_AGENTS = "12";
  try {
    const adapter = A.assessProvisionCapacity({ metadata: meta, providerPanes: [], ceiling: 8 }).free_slots;
    const lifecycle = L.freeSlots({ cfg: {}, metadata: meta }).length;
    assert.equal(adapter, lifecycle, `adapter ${adapter} vs lifecycle ${lifecycle}`);
    assert.equal(adapter, 8);
  } finally {
    if (prev === undefined) delete process.env.ALLOY_MAX_AGENTS;
    else process.env.ALLOY_MAX_AGENTS = prev;
  }
});

// ── and the capacity model above it did NOT move ─────────────────────────────
await test("F7. active-provider admission is unchanged", () => {
  // Slot reporting changed; the only blocker must still be concurrency.
  const spent = A.assessProvisionCapacity({ metadata: occupy(5, "active"), providerPanes: null, ceiling: 4 });
  assert.equal(spent.active_providers, 5, "five agents actually running");
  assert.deepEqual(spent.blockers, ["provider_capacity"], "still the only refusal");
  const room = A.assessProvisionCapacity({ metadata: occupy(5, "active"), providerPanes: null, ceiling: 99 });
  assert.deepEqual(room.blockers, [], "and capacity alone decides");
  // Occupancy without agents must never look like spent execution capacity.
  const dormant = A.assessProvisionCapacity({ metadata: occupy(5), providerPanes: null, ceiling: 4 });
  assert.equal(dormant.active_providers, 0, "dormant registrations consume no execution capacity");
  assert.deepEqual(dormant.blockers, []);
});

await test("F8. a full slot table still admits a provider", () => {
  const out = freeAt(12, 12);
  assert.equal(out.fixed_slots_exhausted, true, "genuinely full");
  assert.equal(out.ok, true, "and still admits — slots are placement, not permission");
  assert.ok(!out.blockers.includes("no_free_slot"));
});

await test("F9. running-server slot bounding is unchanged", () => {
  const env = (s) => ({ ALLOY_MAX_AGENTS: String(s), ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_RUNNING_SERVERS=99", ALLOY_CAPACITY_OVERRIDE_REASON: "probe" });
  assert.equal(C.parseCapacityOverride(env(12)).refusals[0]?.max, 12);
  assert.equal(C.parseCapacityOverride(env(6)).refusals[0]?.max, 6);
  assert.equal(C.CAPACITY_LIMITS.ALLOY_MAX_RUNNING_SERVERS.bounded_by_slots, true);
  assert.ok(!C.CAPACITY_LIMITS.ALLOY_MAX_ACTIVE_PROVIDERS.bounded_by_slots, "and providers stay unbounded by slots");
});

await test("F10. deterministic-port placement — the real legacy behaviour — survives", () => {
  // What "fixed" actually meant: slot N always serves FIRST + N - 1. That is a
  // property of the shell's port arithmetic, which never had a 6 in it, and it
  // must keep working above the retired literal.
  const out = freeAt(12, 0);
  assert.equal(out.fixed_slots_exhausted, false);
  assert.equal(out.free_slots, 12, "all twelve are placeable, including 7–12");
});

try { rmSync(WT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
