#!/usr/bin/env node
/**
 * AN IDLE RESIDENT LANE MAY YIELD ITS DEVELOPMENT SLOT.
 *
 * THE DEFECT. A slot was protected whenever its agent session was alive, so a
 * lane that had stopped working kept its port indefinitely and the operator had
 * to run `alloy-sprint-finish` — ending a sprint — merely to free local
 * capacity. Lane lifetime and slot lifetime were welded together.
 *
 * They are not the same thing. A Development Slot owns a deterministic port,
 * the dev server on it, and the browser QA context keyed to it. It does not own
 * the lane, the branch, the worktree or the agent process, and
 * development-slot-yield-session-survival proves that directly: a real tmux
 * session survives a real reassignment with the same pane process.
 *
 * So protection follows the ENVIRONMENT, not the session:
 *
 *   active  run in flight | stack lease | owned_running server | live QA browser
 *           | evidence unreadable
 *   warm    resident session, environment idle — takeable, taken last
 *
 * `ownership_state`, never `observed_state`: the observer distinguishes a
 * server this lane owns from a FOREIGN process holding the port, and treating
 * the second as this lane's use would let a stray process pin a slot open
 * forever. That was a real wrong turn during implementation and it has its own
 * control below.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-warm-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
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

function reg(name, slot) {
  writeFileSync(join(ROOT, "metadata", `${name}.env`), [
    `ALLOY_WORKTREE_NAME="${name}"`,
    ...(slot == null ? [] : [`ALLOY_WORKTREE_SLOT="${slot}"`, `PORT="${3910 + slot}"`]),
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
  if (slot != null) reg(worktree, slot);
  return id;
}
/** Rank with a stated world. Nothing here touches the machine it runs on. */
const rank = (o = {}) => L.slotReclaimCandidates({
  root: ROOT,
  activeRun: o.run ?? (() => false),
  sessionAlive: o.session ?? (() => false),
  leaseHeld: o.lease ?? (() => false),
  environmentInUse: o.env ?? (() => false),
});
const of = (r, wt) => r.candidates.find((c) => c.worktree === wt);

// ── protection claims ────────────────────────────────────────────────────────
await test("W1. owned_running dev server protects the donor", async () => {
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true, env: () => "it owns a running dev server on its port" });
  assert.equal(of(r, "wt-a").group, "active");
  assert.equal(of(r, "wt-a").reclaimable, false);
  assert.match(of(r, "wt-a").reason, /owns a running dev server/);
});

await test("W2. a FOREIGN port owner does NOT protect the donor", async () => {
  // The whole point of ownership_state. A stray process holding the port is not
  // this lane's use, and must not pin its slot open.
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true, env: () => false });
  assert.equal(of(r, "wt-a").group, "warm", "foreign/absent server leaves the lane warm");
  assert.equal(of(r, "wt-a").reclaimable, true);
});

await test("W3. unreadable environment fails closed", async () => {
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true, env: () => "its local environment could not be read" });
  assert.equal(of(r, "wt-a").group, "active");
  assert.match(of(r, "wt-a").reason, /could not be read/);
});

await test("W4. a live QA browser protects the donor", async () => {
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true, env: () => "a QA browser is open on its slot" });
  assert.equal(of(r, "wt-a").reclaimable, false);
});

await test("W5. a run in flight overrides warm", async () => {
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true, run: () => true });
  assert.equal(of(r, "wt-a").group, "active");
  assert.match(of(r, "wt-a").reason, /run in flight/);
});

await test("W6. a protected stack lease overrides warm", async () => {
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true, lease: () => true });
  assert.equal(of(r, "wt-a").group, "active");
  assert.match(of(r, "wt-a").reason, /shared local stack/);
});

// ── warm classification and ranking ──────────────────────────────────────────
await test("W7. resident session + idle environment classifies WARM, not active", async () => {
  lane("A", "wt-a", 1);
  const r = await rank({ session: () => true });
  const c = of(r, "wt-a");
  assert.equal(c.group, "warm");
  assert.equal(c.reclaimable, true);
  assert.match(c.reason, /keeps running, registered and dispatchable/);
});

await test("W8. no session at all is inactive, and ranks BEFORE warm", async () => {
  lane("A", "wt-a", 1);
  lane("B", "wt-b", 2);
  const r = await rank({ session: (s) => s === "alloy-wt-a" });
  assert.equal(of(r, "wt-a").group, "warm");
  assert.equal(of(r, "wt-b").group, "inactive");
  const order = r.candidates.map((c) => c.group);
  assert.ok(order.indexOf("inactive") < order.indexOf("warm"),
    `inactive must be offered first: ${order.join(",")}`);
});

await test("W9. the group ladder is ordered least-costly first", () => {
  assert.deepEqual([...L.SLOT_RECLAIM_GROUPS], ["unowned", "offline", "inactive", "warm", "active"]);
});

// ── the wrong-field regression, at source level ──────────────────────────────
await test("W10. the server test reads ownership_state, never observed_state", () => {
  const src = execFileSync("cat", [new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url).pathname], { encoding: "utf8" })
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = src.slice(src.indexOf("async function slotEnvironmentProbe"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /ownership_state === "owned_running"/, "ownership is the discriminator");
  assert.ok(!/observed_state/.test(body),
    "observed_state cannot tell an owned server from a foreign one holding the port");
});

await test("W11. the fleet is observed ONCE per ranking, not once per lane", () => {
  const src = execFileSync("cat", [new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url).pathname], { encoding: "utf8" })
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = src.slice(src.indexOf("export async function slotReclaimCandidates"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.equal((body.match(/slotEnvironmentProbe\(/g) || []).length, 1, "one probe construction");
  const loop = body.slice(body.indexOf("for (const l of audit.lanes)"));
  assert.ok(!/slotEnvironmentProbe\(/.test(loop), "the probe must not be built inside the lane loop");
  assert.ok(!/observeServerFleet/.test(loop), "the fleet must not be walked inside the lane loop");
});

// ── elastic rotation, twice, with both safe donor classes ────────────────────
await test("W12. ELASTIC ROTATION — an inactive donor yields to a slotless lane", async () => {
  lane("Donor", "wt-donor", 1);
  lane("Wanting", "wt-wanting", null);
  reg("wt-wanting", null);
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => {
    calls.push(args);
    reg(args[0] === "--no-slot" ? args[1] : args[1], args[0] === "--no-slot" ? null : Number(args[0]));
    return { status: 0, stdout: "" };
  });
  const out = await L.reassignSlot({
    fromWorktree: "wt-donor", toWorktree: "wt-wanting", root: ROOT,
    activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false, environmentInUse: () => false,
  });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 180));
  assert.equal(out.slot, 1);
  assert.equal(out.from.group, "inactive", "donor class was inactive");
});

await test("W13. ELASTIC ROTATION — a WARM donor yields, and no sprint is finished", async () => {
  lane("Donor", "wt-donor", 1);
  lane("Wanting", "wt-wanting", null);
  reg("wt-wanting", null);
  L.setRegisterImplForTests((cmd, args) => {
    reg(args[1], args[0] === "--no-slot" ? null : Number(args[0]));
    return { status: 0, stdout: "" };
  });
  const out = await L.reassignSlot({
    fromWorktree: "wt-donor", toWorktree: "wt-wanting", root: ROOT,
    activeRun: () => false, sessionAlive: () => true, leaseHeld: () => false, environmentInUse: () => false,
  });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 180));
  assert.equal(out.from.group, "warm", "donor class was warm — a resident lane yielded its slot");
  assert.equal(out.slot, 1);
});

await test("W14. an ACTIVE donor is still refused without acknowledgement", async () => {
  lane("Donor", "wt-donor", 1);
  lane("Wanting", "wt-wanting", null);
  reg("wt-wanting", null);
  L.setRegisterImplForTests(() => ({ status: 0, stdout: "" }));
  const out = await L.reassignSlot({
    fromWorktree: "wt-donor", toWorktree: "wt-wanting", root: ROOT,
    activeRun: () => true,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "donor_active", "a working lane is never taken from silently");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
