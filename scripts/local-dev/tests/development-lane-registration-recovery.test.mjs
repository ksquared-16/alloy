#!/usr/bin/env node
/**
 * A LANE THAT HAS A WORKTREE MUST END UP REGISTERED, WHATEVER CREATED IT.
 *
 * THE DEFECT. The Access & Identity lane was created through the Vacilando
 * wizard while all twelve managed slots were held. It got a git worktree at
 * .../alloy-worktrees/access-identity, the branch agent/access-identity, tmux
 * session alloy-access-and-identity, pane %24 running claude.exe in that
 * directory — and no registration, because `registerCreatedWorktree` refused
 * outright on `no_free_slot` and creation carried on regardless. Every message
 * was then refused `lane_worktree_unregistered`, whose text names neither the
 * cause nor the remedy, so what the operator saw was a brand-new lane that
 * "says it is unregistered" with an agent sitting in it, running.
 *
 * This is the SAME end state as the Financials incident, reached through a
 * different door. Two things were wrong.
 *
 * ONE — registration was gated on a free slot. Registration is IDENTITY: it is
 * how the fleet knows whose worktree that is, and dispatch requires it. A SLOT
 * is a RESOURCE — a port and a managed QA environment — which only the
 * environment actions need, and which `assertManagedLaneEnvironment` already
 * refuses separately. `resolveLaneWorktree` has always modelled the middle
 * state (registered, slotless, dispatchable); what was missing was a writer.
 *
 * TWO — registration happened only at creation, only on the `new_worktree`
 * branch, and only if it worked first time. `connect_existing` never attempted
 * it, and a durable restore onto a new host carries lanes but not the
 * host-local slot registry. So it is now repaired at the POINT OF USE: a
 * creation path can be missed, a send cannot.
 *
 * What is NOT repaired here is anything ambiguous. A missing directory, a
 * finished registration, a mismatched slot or a worktree two open lanes claim
 * are reported and left alone — adopting through those is how a lane quietly
 * takes over another lane's work.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-lane-reg-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "Code", "alloy-worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
// Stated, never inherited: these controls count slots.
process.env.ALLOY_MAX_AGENTS = "2";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const {
  createDurableLane, bindDurableLane, getDurableLane, resetDevelopmentLanesForTests,
} = await import("../lib/vacilando/development-lane.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  L.resetRegisterImplForTests();
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  // Directories persist across tests otherwise, and "the worktree is gone" is
  // one of the conditions under test.
  rmSync(join(ROOT, "Code"), { recursive: true, force: true });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

function metaPath(name) { return join(ROOT, "metadata", `${name}.env`); }

function writeRegistration(name, { slot = null, path = null, branch = "agent/x", lifecycle = "active" } = {}) {
  const p = path || join(ROOT, "Code", "alloy-worktrees", name);
  writeFileSync(metaPath(name), [
    `ALLOY_WORKTREE_NAME="${name}"`,
    ...(slot == null ? [] : [`ALLOY_WORKTREE_SLOT="${slot}"`, `PORT="${3010 + Number(slot)}"`]),
    `ALLOY_WORKTREE_PATH="${p}"`,
    `ALLOY_WORKTREE_BRANCH="${branch}"`,
    `ALLOY_AGENT="claude"`,
    `ALLOY_WORKER_LIFECYCLE="${lifecycle}"`,
    "",
  ].join("\n"), "utf8");
}

/**
 * The registration seam, standing in for the `alloy-worktree-adopt` subprocess
 * and writing what it writes. Registration has to actually LAND for these — a
 * stub that only records the call would let "registered" be asserted about a
 * file that does not exist, which is the whole class of defect under test.
 */
function adoptSeam() {
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => {
    calls.push({ cmd, args });
    const slotless = args[0] === "--no-slot";
    const name = slotless ? args[1] : args[1];
    const slot = slotless ? null : Number(args[0]);
    writeRegistration(name, { slot, branch: "agent/access-identity" });
    return { status: 0, stdout: "" };
  });
  return calls;
}

function seedLane(laneName, {
  worktree = "access-identity",
  branch = "agent/access-identity",
  makeDir = true,
  register = null,
} = {}) {
  const made = createDurableLane({ name: laneName, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const path = join(ROOT, "Code", "alloy-worktrees", worktree);
  if (makeDir) mkdirSync(path, { recursive: true });
  bindDurableLane(laneId, {
    type: "alloy_local",
    worktree_path: path,
    worktree_name: worktree,
    branch,
    tmux_session: `alloy-${worktree}`,
    slot: null,
    provider: "claude",
  }, { root: ROOT });
  if (register) writeRegistration(worktree, { ...register, path, branch });
  return { laneId, path, worktree };
}

// ---------------------------------------------------------------------------
// R — THE REPRODUCTION. The live shape, before anything is repaired.
// ---------------------------------------------------------------------------

await test("R1. the reproduction: bound worktree, live agent, no registration, no delivery", () => {
  const { laneId } = seedLane("Access & Identity");
  const resolved = L.resolveLaneWorktree(laneId, { root: ROOT });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, "lane_worktree_unregistered");
  assert.equal(resolved.registered, false);
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, false, "and so no instruction can enter it");
  assert.equal(guard.error, "lane_worktree_unregistered");
});

await test("R2. the point-of-use repair registers it and delivery becomes possible", async () => {
  const calls = adoptSeam();
  const { laneId } = seedLane("Access & Identity");
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.changed, true);
  assert.equal(calls.length, 1, "one registration, through the canonical writer");
  assert.match(calls[0].cmd, /alloy-worktree-adopt$/);
  assert.ok(existsSync(metaPath("access-identity")), "the registration actually landed on disk");
  assert.equal(L.assertLaneDispatchable(laneId, { root: ROOT }).ok, true,
    "the lane the operator could not message is now dispatchable");
});

await test("R3. with the pool exhausted it registers WITHOUT a slot, and says so", async () => {
  // ALLOY_MAX_AGENTS is 2 here, and both are held: the live Access & Identity
  // condition exactly.
  const calls = adoptSeam();
  writeRegistration("held-a", { slot: 1 });
  writeRegistration("held-b", { slot: 2 });
  const { laneId } = seedLane("Access & Identity");
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.slotless, true);
  assert.equal(out.slot, null, "no slot was taken from anybody");
  assert.deepEqual(calls[0].args, ["--no-slot", "access-identity", "--provider", "claude"]);
  // Registered without a slot is DISPATCHABLE...
  const guard = L.assertLaneDispatchable(laneId, { root: ROOT });
  assert.equal(guard.ok, true, guard.error);
  assert.equal(guard.slotless, true);
  // ...and still has no managed environment, which is the honest half.
  const env = L.assertManagedLaneEnvironment(laneId, { root: ROOT });
  assert.equal(env.ok, false, "a slotless lane has no port and no QA environment");
  assert.equal(env.error, "lane_slot_unregistered");
  // The two registrations that were already there are untouched.
  assert.match(readFileSync(metaPath("held-a"), "utf8"), /ALLOY_WORKTREE_SLOT="1"/);
  assert.match(readFileSync(metaPath("held-b"), "utf8"), /ALLOY_WORKTREE_SLOT="2"/);
});

await test("R4. a free slot is still used when there is one", async () => {
  const calls = adoptSeam();
  writeRegistration("held-a", { slot: 1 });
  const { laneId } = seedLane("Access & Identity");
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.slotless, false);
  assert.equal(out.slot, 2, "the lowest free slot, not a slotless fallback");
  assert.deepEqual(calls[0].args, ["2", "access-identity", "--provider", "claude"]);
  // And the slot reaches the lane's own binding rather than staying in the file.
  assert.equal(getDurableLane(laneId, ROOT).binding.slot, 2);
});

// ---------------------------------------------------------------------------
// N — IT DOES NOTHING WHEN THERE IS NOTHING TO DO.
// ---------------------------------------------------------------------------

await test("N1. an already-registered lane is not re-registered", async () => {
  const calls = adoptSeam();
  const { laneId } = seedLane("Access & Identity", { register: { slot: 1 } });
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.changed, false, "a healthy lane is untouched");
  assert.equal(calls.length, 0, "and costs no subprocess on the send path");
});

await test("N2. a lane with no worktree at all is left to admission", async () => {
  const calls = adoptSeam();
  const made = createDurableLane({ name: "Planning", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.changed, false);
  assert.equal(calls.length, 0, "an unprovisioned lane is not a broken one");
});

// ---------------------------------------------------------------------------
// A — AMBIGUITY IS REPORTED, NEVER ADOPTED THROUGH.
// ---------------------------------------------------------------------------

await test("A1. a worktree whose directory is gone is refused, not registered", async () => {
  const calls = adoptSeam();
  const { laneId } = seedLane("Access & Identity", { makeDir: false });
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "lane_worktree_missing");
  assert.equal(calls.length, 0, "adopt is never asked to register a path that is not there");
});

await test("A2. a worktree another open lane claims is refused, and nothing is written", async () => {
  const calls = adoptSeam();
  const first = seedLane("Trust Runtime", { register: { slot: 1 } });
  const second = createDurableLane({ name: "Access & Identity", root: ROOT });
  const secondId = second.lane?.lane_id || second.lane_id;
  // bindDurableLane REFUSES a worktree another lane already claims, so a
  // contested binding cannot be produced through it. It arrives the way durable
  // state actually arrives — restored, migrated, or hand-repaired — so the
  // store is written directly here. The point of the control is that the
  // repair, unlike creation, has no such guard of its own to lean on.
  const storePath = join(ROOT, "vacilando", "lanes", "lanes.json");
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  store.lanes[secondId].binding = {
    type: "alloy_local",
    worktree_path: first.path, worktree_name: first.worktree,
    branch: "agent/access-identity", provider: "claude", slot: null, status: "bound",
  };
  writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
  rmSync(metaPath(first.worktree), { force: true });

  const out = await L.ensureLaneWorktreeRegistered(secondId, { root: ROOT });
  assert.equal(out.ok, false, JSON.stringify(out).slice(0, 400));
  assert.equal(out.error, "worktree_claimed_by_another_lane");
  assert.match(out.detail, new RegExp(first.laneId));
  assert.equal(calls.length, 0, "ownership is never decided by whoever sends first");
  assert.equal(existsSync(metaPath(first.worktree)), false, "and nothing was written");
});

await test("A3. a FINISHED registration is not quietly resurrected", async () => {
  const calls = adoptSeam();
  const { laneId } = seedLane("Access & Identity", { register: { slot: 1, lifecycle: "finished" } });
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.changed, false);
  assert.equal(out.reason, "lane_worktree_not_managed",
    "a retired worktree is a decision someone made, not a missing step");
  assert.equal(calls.length, 0);
});

await test("A4. a slot mismatch is reported rather than overwritten", async () => {
  const calls = adoptSeam();
  const { laneId } = seedLane("Access & Identity", {
    register: { slot: 1 },
  });
  // The registration names a different path than the lane is bound to.
  writeRegistration("access-identity", {
    slot: 1, path: join(ROOT, "Code", "alloy-worktrees", "somewhere-else"), branch: "agent/access-identity",
  });
  const out = await L.ensureLaneWorktreeRegistered(laneId, { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.changed, false);
  assert.equal(out.reason, "lane_slot_mismatch");
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// S — STRUCTURAL. The repair has to be ON the paths that need it.
// ---------------------------------------------------------------------------

await test("S1. the send path repairs registration BEFORE the dispatch guard refuses", () => {
  const src = readFileSync(new URL("../lib/vacilando/execution-run-send.mjs", import.meta.url), "utf8");
  const ensureAt = src.indexOf("ensureLaneWorktreeRegistered(laneId");
  const guardAt = src.indexOf("assertLaneDispatchable(laneId");
  assert.ok(ensureAt > 0, "send must attempt registration");
  assert.ok(guardAt > 0, "and must still run the dispatch guard");
  assert.ok(ensureAt < guardAt, "repairing after the refusal would repair nothing");
});

await test("S2. BOTH creation paths register the worktree they bind", () => {
  const src = readFileSync(new URL("../lib/vacilando/lane-identity-api.mjs", import.meta.url), "utf8");
  // connect_existing bound a worktree and never registered it — the same
  // undeliverable end state, reached without even attempting registration.
  const connectAt = src.indexOf('workspaceMode === "connect_existing"');
  assert.ok(connectAt > 0, "the connect path still exists");
  const after = src.slice(connectAt);
  assert.match(after, /registerCreatedWorktree\(/, "connect_existing must register too");
  assert.equal((src.match(/registerCreatedWorktree\(/g) || []).length, 2,
    "both provisioning branches, and no third registry writer");
});

await test("S3. a slotless registration is not reported as unprovisioned", () => {
  // "provisioned" gates what the operator is told to go fix. A registered,
  // dispatchable, portless lane is working; calling it unprovisioned would send
  // them to repair a lane that needs nothing repaired.
  const src = readFileSync(new URL("../lib/vacilando/lane-identity-api.mjs", import.meta.url), "utf8");
  assert.match(src, /provisioned: registered\.ok/, "provisioned still means the registration succeeded");
  assert.match(src, /slotless: Boolean\(registered\.slotless\)/, "and slotlessness is reported on its own");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
