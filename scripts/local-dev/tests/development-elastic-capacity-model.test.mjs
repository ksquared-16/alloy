#!/usr/bin/env node
/**
 * LANE ≠ ACTIVE EXECUTION ≠ DEVELOPMENT SLOT.
 *
 * Three layers, independent by contract:
 *
 *   lane              persistent identity; many may exist
 *   active execution  independently bounded provider concurrency
 *   slot              a temporary local dev/QA resource: worktree + port + QA
 *
 * THE DEFECT WAS NEVER IN ENFORCEMENT. The scheduler already had this right:
 * `alloy-dev-adapter` blocks on `activeProviders >= maxProviders` and nothing
 * else, and comments in the same struct that a full slot table "does not mean
 * the machine cannot hold another lane, another worktree, or another agent".
 *
 * What disagreed with it were the DECLARATIONS and the REPORTING:
 *
 *   - CAPACITY_LIMITS marked ALLOY_MAX_ACTIVE_PROVIDERS `bounded_by_slots`, so
 *     the slot topology could move execution concurrency;
 *   - its header asserted "servers and providers are bounded by the six managed
 *     slots; there is no seventh place to put one" — false on a host running
 *     thirteen lanes, twelve slots and EIGHT providers, one of them slotless;
 *   - its `max` was 6, below the enforced value of 8, so the override parser
 *     could not express the ceiling already in force;
 *   - operator output printed the HARDWARE ADVISORY (4) as the provider number
 *     while the enforced ceiling was 8, giving two answers to one question;
 *   - policies.mjs still published "Permanent slots 6 (1–6)".
 *
 * These controls pin the contract, not the implementation of the scheduler.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = mkdtempSync(join(tmpdir(), "vac-elastic-"));
const CONFIG = join(DIR, "config");
writeFileSync(CONFIG, 'ALLOY_MAX_ACTIVE_PROVIDERS="8"\nALLOY_MAX_RUNNING_SERVERS="8"\n', "utf8");

const C = await import("../lib/vacilando/capacity-precedence.mjs");
const P = await import("../lib/vacilando/capacity-policy.mjs");
const { managedSlotCount } = await import("../lib/vacilando/managed-slots.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** A host env with a chosen managed-slot topology and the real config file. */
const env = (slots, extra = {}) => ({
  ALLOY_CONFIG_FILE: CONFIG, ALLOY_MAX_AGENTS: String(slots), ...extra,
});

// ── 1. the load-bearing invariant ────────────────────────────────────────────
await test("E1. shrinking the slot topology does not shrink provider concurrency", () => {
  const wide = C.capacityValue("ALLOY_MAX_ACTIVE_PROVIDERS", env(12));
  const narrow = C.capacityValue("ALLOY_MAX_ACTIVE_PROVIDERS", env(6));
  const tiny = C.capacityValue("ALLOY_MAX_ACTIVE_PROVIDERS", env(1));
  assert.equal(wide, 8, "12 slots");
  assert.equal(narrow, 8, "6 slots — the Director's stated example");
  assert.equal(tiny, 8, "1 slot: execution concurrency is simply not this axis");
});

await test("E2. a provider override survives a topology smaller than the ceiling", () => {
  // The old bound was managedSlotCount(), so this exact case was refused.
  const o = C.parseCapacityOverride(env(6, {
    ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_ACTIVE_PROVIDERS=8",
    ALLOY_CAPACITY_OVERRIDE_REASON: "eight agents, six slots",
  }));
  assert.deepEqual(o.refusals, [], "no refusal");
  assert.equal(o.applied.ALLOY_MAX_ACTIVE_PROVIDERS, 8);
});

// ── 2. and the half that IS slot-shaped stays that way ───────────────────────
await test("E3. running-server capacity remains slot-clamped — a server needs a port", () => {
  const o = C.parseCapacityOverride(env(6, {
    ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_RUNNING_SERVERS=8",
    ALLOY_CAPACITY_OVERRIDE_REASON: "more servers than ports",
  }));
  assert.equal(o.applied.ALLOY_MAX_RUNNING_SERVERS, undefined, "not applied");
  assert.equal(o.refusals[0]?.error, "above_hard_ceiling");
  assert.equal(o.refusals[0]?.max, 6, "clamped by the six managed slots, correctly");
});

await test("E4. the two ceilings genuinely move on different axes", () => {
  const six = env(6);
  assert.equal(C.CAPACITY_LIMITS.ALLOY_MAX_RUNNING_SERVERS.bounded_by_slots, true,
    "servers stay bounded by slots");
  assert.ok(!C.CAPACITY_LIMITS.ALLOY_MAX_ACTIVE_PROVIDERS.bounded_by_slots,
    "providers must not be");
  // Same topology, same config, different answers — which is the whole point.
  const serverRefused = C.parseCapacityOverride({
    ...six, ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_RUNNING_SERVERS=8",
    ALLOY_CAPACITY_OVERRIDE_REASON: "r",
  }).refusals.length;
  const providerRefused = C.parseCapacityOverride({
    ...six, ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_ACTIVE_PROVIDERS=8",
    ALLOY_CAPACITY_OVERRIDE_REASON: "r",
  }).refusals.length;
  assert.equal(serverRefused, 1);
  assert.equal(providerRefused, 0);
});

// ── 3. the declared range can express what is enforced ───────────────────────
await test("E5. the override parser can represent the configured ceiling of 8", () => {
  assert.ok(C.CAPACITY_LIMITS.ALLOY_MAX_ACTIVE_PROVIDERS.max >= 8,
    "a declared max below the enforced value is a contradiction");
  const o = C.parseCapacityOverride(env(12, {
    ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_ACTIVE_PROVIDERS=8",
    ALLOY_CAPACITY_OVERRIDE_REASON: "the value already in force",
  }));
  assert.equal(o.applied.ALLOY_MAX_ACTIVE_PROVIDERS, 8);
  // Still bounded: this raised the range, it did not remove it.
  const tooMany = C.parseCapacityOverride(env(12, {
    ALLOY_CAPACITY_OVERRIDE: "ALLOY_MAX_ACTIVE_PROVIDERS=99",
    ALLOY_CAPACITY_OVERRIDE_REASON: "no",
  }));
  assert.equal(tooMany.refusals[0]?.error, "above_hard_ceiling");
});

// ── 4. one answer to "how many agents may work at once?" ─────────────────────
await test("E6. the hardware estimate is labelled advisory and names its authority", () => {
  const axis = P.computeCapacityPolicy({ logical_cores: 12, memory_total_gb: 48 })
    .axes.provider_capacity;
  assert.equal(axis.advisory, true, "must be explicitly advisory");
  assert.equal(axis.enforced_by, "ALLOY_MAX_ACTIVE_PROVIDERS",
    "and must name what actually gates");
});

await test("E7. the advisory cannot gate: enforcement ignores it even when lower", () => {
  const capacity = P.computeCapacityPolicy({ logical_cores: 12, memory_total_gb: 48 });
  assert.ok(capacity.axes.provider_capacity.ceiling < 8,
    "fixture is only meaningful while the advisory is BELOW the enforced value");
  const resolved = C.resolveCapacity("ALLOY_MAX_ACTIVE_PROVIDERS", { env: env(12), derived: capacity });
  assert.equal(resolved.value, 8, "the enforced ceiling wins");
  assert.equal(resolved.source, "host-config", "and says so");
  assert.equal(resolved.tiers.derived, capacity.axes.provider_capacity.ceiling,
    "the advisory is still reported, just not obeyed");
});

await test("E8. operator output gives ONE execution-concurrency answer", () => {
  const src = readFileSync(new URL("../vac-health.mjs", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const line = src.split("\n").find((l) => l.includes("capacity   providers"));
  assert.ok(line, "the capacity line still exists");
  assert.match(line, /enforced/, "the enforced ceiling is the answer");
  assert.ok(!/providers \$\{A\.provider_capacity\.current\}\/\$\{A\.provider_capacity\.ceiling\}/.test(line),
    "the advisory must not be printed as THE provider ceiling");
  assert.match(line, /advisory/, "and the hardware estimate is shown as advisory");
});

// ── 4b. a slotless lane may still execute ────────────────────────────────────
await test("E11. a FULL slot table does not block admitting a provider", async () => {
  // The layer-1/layer-2 independence, at the admission point rather than in the
  // declarations: every slot occupied, execution capacity still free.
  const A = await import("../lib/vacilando/alloy-dev-adapter.mjs");
  const full = Array.from({ length: managedSlotCount() }, (_, i) => ({
    slot: i + 1, path: process.cwd(), lifecycle: "active", agent_status: "active",
    name: `wt${i + 1}`,
  }));
  const out = A.assessProvisionCapacity({
    cfg: {}, metadata: full, providerPanes: [], ceiling: 8,
  });
  assert.equal(out.fixed_slots_exhausted, true, "fixture really has no free slot");
  assert.ok(!out.blockers.includes("fixed_slots_exhausted"), "slot exhaustion is reported, never a blocker");
  assert.equal(out.ok, true, "and a provider may still be admitted");
});

await test("E12. slots free, execution full — the refusal is concurrency, not placement", async () => {
  // The mirror of E11 and the sharper half of the contract: FOUR slots sit
  // empty while the execution ceiling is spent, and admission still refuses.
  // Placement availability and permission to work are different questions.
  const A = await import("../lib/vacilando/alloy-dev-adapter.mjs");
  // Free slots are counted against the managed topology, so five occupied
  // leaves the rest free while the ceiling of four is already spent.
  const busy = Array.from({ length: 5 }, (_, i) => ({
    slot: i + 1, path: process.cwd(), lifecycle: "active", agent_status: "active",
    name: `wt${i + 1}`,
  }));
  const out = A.assessProvisionCapacity({ cfg: {}, metadata: busy, ceiling: 4 });
  assert.equal(out.fixed_slots_exhausted, false, "slots remain available");
  assert.ok(out.free_slots > 0, `free slots: ${out.free_slots}`);
  assert.equal(out.active_providers, 5);
  assert.deepEqual(out.blockers, ["provider_capacity"], "the only refusal is concurrency");
  assert.equal(out.ok, false);
});

// ── 5. no historical literal left in the touched path ────────────────────────
await test("E9. no hardcoded historical slot count in the touched ownership path", () => {
  for (const f of ["lib/vacilando/policies.mjs", "lib/vacilando/capacity-precedence.mjs"]) {
    const code = readFileSync(new URL(`../${f}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/6 \(1[–-]6\)/.test(code), `${f} still publishes a literal slot range`);
    assert.ok(!/1 Product · 2 Architecture/.test(code), `${f} still hardcodes six slot roles`);
  }
  const pol = readFileSync(new URL("../lib/vacilando/policies.mjs", import.meta.url), "utf8");
  assert.match(pol, /managedSlotCount\(\)/, "the slot row derives from the topology owner");
});

await test("E10. the false slot/provider premise is gone from the declaration", () => {
  const src = readFileSync(new URL("../lib/vacilando/capacity-precedence.mjs", import.meta.url), "utf8");
  assert.ok(!/providers are\s*\n?\s*\*?\s*bounded by the six managed slots/.test(src.replace(/\s+/g, " ")),
    "the premise that a provider needs a slot must not survive");
  assert.match(src, /A SERVER NEEDS A SLOT\. A PROVIDER DOES NOT\./,
    "and the real model is stated in its place");
});

try { rmSync(DIR, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
