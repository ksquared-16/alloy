#!/usr/bin/env node
/**
 * A SLOTLESS LANE ASKED TO START WORK ACQUIRES A SLOT, RATHER THAN FAILING.
 *
 * Yield made slots movable and the ranking made choosing one safe, but the
 * trigger stayed manual: a slotless lane asked to start a dev server hit
 * `metadata missing ALLOY_WORKTREE_SLOT` and an operator had to find it capacity
 * by hand. This is only the trigger.
 *
 * Every judgement is delegated to the promoted owners — `freeSlots`,
 * `slotReclaimCandidates`, `reassignSlot`. Nothing here decides safety, and
 * these controls are written to FAIL if it starts to.
 *
 * THE LINE THAT MATTERS MOST: `acknowledgeActive` is never passed. An automatic
 * acquirer that could override `donor_active` would be a lane-killer wearing a
 * convenience name, so a donor that turns active between ranking and mutation
 * keeps its slot and the caller is refused.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-acquire-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.ALLOY_MAX_AGENTS = "3";
mkdirSync(join(ROOT, "metadata"), { recursive: true });
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const { createDurableLane, bindDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  L.resetRegisterImplForTests();
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const metaPath = (n) => join(ROOT, "metadata", `${n}.env`);
function reg(name, slot) {
  writeFileSync(metaPath(name), [
    `ALLOY_WORKTREE_NAME="${name}"`,
    ...(slot == null ? [] : [`ALLOY_WORKTREE_SLOT="${slot}"`, `PORT="${3010 + slot}"`]),
    `ALLOY_WORKTREE_PATH="${join(ROOT, name)}"`,
    `ALLOY_WORKTREE_BRANCH="agent/${name}"`, `ALLOY_AGENT="claude"`,
    `ALLOY_WORKER_LIFECYCLE="active"`, "",
  ].join("\n"), "utf8");
}
function lane(name, worktree, slot) {
  const made = createDurableLane({ name, root: ROOT });
  const id = made.lane?.lane_id || made.lane_id;
  const p = join(ROOT, worktree);
  mkdirSync(p, { recursive: true });
  bindDurableLane(id, {
    type: "alloy_local", worktree_path: p, worktree_name: worktree,
    branch: `agent/${worktree}`, tmux_session: `alloy-${worktree}`, slot, provider: "claude",
  }, { root: ROOT });
  reg(worktree, slot);
  return id;
}
function adoptSeam() {
  L.setRegisterImplForTests((cmd, args) => {
    reg(args[1], args[0] === "--no-slot" ? null : Number(args[0]));
    return { status: 0, stdout: "" };
  });
}
const idle = { activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false, environmentInUse: () => false };

// ── the three acquisition routes ─────────────────────────────────────────────
await test("A1. a lane that already holds a slot keeps it and moves nothing", async () => {
  lane("Has", "wt-has", 1);
  adoptSeam();
  const got = await L.ensureLaneSlot({ worktreeName: "wt-has", root: ROOT, ...idle });
  assert.equal(got.ok, true);
  assert.equal(got.slot, 1);
  assert.equal(got.acquired, "already_held", "no reclamation for a lane that is already placed");
});

await test("A2. a FREE slot is preferred over taking one from anybody", async () => {
  lane("Donor", "wt-donor", 1);          // idle, would be reclaimable
  lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await L.ensureLaneSlot({ worktreeName: "wt-wanting", root: ROOT, ...idle });
  assert.equal(got.ok, true);
  assert.equal(got.acquired, "free", "an unused slot must always win over a reclaim");
  assert.notEqual(got.slot, 1, "and it must not be the donor's");
  // The donor is untouched.
  assert.match(execFileSync("cat", [metaPath("wt-donor")], { encoding: "utf8" }), /ALLOY_WORKTREE_SLOT="1"/);
});

await test("A3. with no free slot, the highest-ranked SAFE candidate is reclaimed", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await L.ensureLaneSlot({ worktreeName: "wt-wanting", root: ROOT, ...idle });
  assert.equal(got.ok, true);
  assert.equal(got.acquired, "reclaimed");
  assert.ok(got.donor?.worktree, "the donor is named");
  assert.equal(got.donor.group, "inactive", "and it came from the least costly group");
});

// ── what it must never do ────────────────────────────────────────────────────
await test("A4. every slot busy → refuses, and the instruction stays durable", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await L.ensureLaneSlot({
    worktreeName: "wt-wanting", root: ROOT,
    activeRun: () => true, sessionAlive: () => true, leaseHeld: () => false, environmentInUse: () => false,
  });
  assert.equal(got.ok, false);
  assert.equal(got.error, "no_safe_slot");
  assert.match(got.detail, /instruction is preserved/i, "refusing is a correct outcome, not a crash");
  // Nothing moved.
  for (const s of [1, 2, 3]) {
    assert.match(execFileSync("cat", [metaPath(`wt-${s}`)], { encoding: "utf8" }), new RegExp(`ALLOY_WORKTREE_SLOT="${s}"`));
  }
});

await test("A5. an owned dev server is never taken", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await L.ensureLaneSlot({
    worktreeName: "wt-wanting", root: ROOT,
    activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false,
    environmentInUse: () => "it owns a running dev server on its port",
  });
  assert.equal(got.ok, false, "a lane serving its port keeps its slot");
  assert.equal(got.error, "no_safe_slot");
});

await test("A6. an unreadable environment is never taken", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await L.ensureLaneSlot({
    worktreeName: "wt-wanting", root: ROOT,
    activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false,
    environmentInUse: () => "its local environment could not be read",
  });
  assert.equal(got.ok, false, "unknown must never be taken from");
});

await test("A7. it NEVER acknowledges an active donor — source-level", () => {
  const src = execFileSync("cat", [new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url).pathname], { encoding: "utf8" })
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = src.slice(src.indexOf("export async function ensureLaneSlot"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(!/acknowledgeActive/.test(body),
    "an automatic acquirer must not be able to override donor_active");
  // And it delegates rather than re-deciding.
  assert.match(body, /slotReclaimCandidates\(/, "ranking is delegated");
  assert.match(body, /reassignSlot\(/, "the move is delegated");
  assert.match(body, /freeSlots\(/, "free-slot detection is delegated");
  assert.ok(!/ownership_state|owned_running|tmux|has-session/.test(body),
    "it must not re-implement any protection claim");
});

await test("A8. a warm donor is acceptable — the elastic case end to end", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await L.ensureLaneSlot({
    worktreeName: "wt-wanting", root: ROOT,
    activeRun: () => false, sessionAlive: () => true,   // resident everywhere
    leaseHeld: () => false, environmentInUse: () => false,
  });
  assert.equal(got.ok, true, "a resident-but-idle lane may yield to a lane that needs the slot");
  assert.equal(got.acquired, "reclaimed");
  assert.equal(got.donor.group, "warm");
});

// ── the trigger is wired where a slot is actually required ───────────────────
await test("A9. the dev-server start path acquires before invoking the CLI", () => {
  const src = execFileSync("cat", [new URL("../lib/vacilando/mission-local-server.mjs", import.meta.url).pathname], { encoding: "utf8" });
  const fn = src.slice(src.indexOf("export async function controlMissionLocalServer"));
  assert.match(fn, /ensureLaneSlot/, "the start path acquires a slot");
  const acquireAt = fn.indexOf("ensureLaneSlot");
  const spawnAt = fn.indexOf("spawn(bin");
  assert.ok(acquireAt < spawnAt, "and does so BEFORE spawning the server");
  assert.match(fn, /no_development_slot_available/, "and refuses legibly when it cannot");
});

await test("A10. its caller awaits it — an async result must not become the body", () => {
  const src = execFileSync("cat", [new URL("../lib/vacilando/v2-api.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.match(src, /await controlMissionLocalServer\(/,
    "without await the body is a Promise and every start answers 409");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
