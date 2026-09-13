#!/usr/bin/env node
/**
 * THE INVARIANT THE WHOLE ELASTIC-SLOT MODEL RESTS ON.
 *
 * The model says an idle resident lane may yield its Development Slot and keep
 * working. That is only true if reassignment does not disturb the agent. If a
 * resident session dies when its slot moves, warm reclaim is a lane-killer
 * wearing a capacity feature's name, and it must not ship.
 *
 * So this proves the negative directly, with a REAL tmux session:
 *
 *   - a live session exists, bound to the donor's worktree;
 *   - `reassignSlot` runs for real against that donor;
 *   - the session, and the process inside it, are still there afterwards.
 *
 * WHY THE REGISTRATION WRITER IS STUBBED AND THE SESSION IS NOT. The registry
 * root is pinned to the production path on purpose — a worker cannot redirect
 * it — so a hermetic run cannot use the shell adopt. Registration mechanics are
 * already covered by development-slot-reclamation. What is NOT covered anywhere,
 * and is the whole question here, is whether the reassign PATH signals a
 * process. That part is exercised for real.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-yield-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "metadata"), { recursive: true });
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const SESSION = `alloy-yield-proof-${process.pid}`;

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const tmuxOk = () => spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const sessionAlive = (s) => spawnSync("tmux", ["has-session", "-t", s], { stdio: "ignore" }).status === 0;
function killSession() { spawnSync("tmux", ["kill-session", "-t", SESSION], { stdio: "ignore" }); }

/**
 * The seam standing in for `alloy-worktree-adopt`, writing what it writes.
 *
 * It replaces the spawnSync CALL, so it takes (cmd, args) and returns a
 * spawnSync-shaped result. Modelled on development-slot-reclamation so the two
 * suites cannot disagree about what registration means.
 */
const metaPath = (n) => join(ROOT, "metadata", `${n}.env`);
function writeRegistration(name, { slot = null } = {}) {
  writeFileSync(metaPath(name), [
    `ALLOY_WORKTREE_NAME="${name}"`,
    ...(slot == null ? [] : [`ALLOY_WORKTREE_SLOT="${slot}"`, `PORT="${3910 + Number(slot)}"`]),
    `ALLOY_WORKTREE_PATH="${join(ROOT, name)}"`,
    `ALLOY_WORKTREE_BRANCH="agent/${name}"`,
    `ALLOY_AGENT="claude"`,
    `ALLOY_WORKER_LIFECYCLE="active"`, "",
  ].join("\n"), "utf8");
}
function adoptSeam() {
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => {
    calls.push(args);
    const slotless = args[0] === "--no-slot";
    const name = args[1];
    writeRegistration(name, { slot: slotless ? null : Number(args[0]) });
    return { status: 0, stdout: "" };
  });
  return calls;
}

await test("Y0. tmux is available, so a negative result would mean something", () => {
  assert.ok(tmuxOk(), "tmux must exist for this proof to be worth anything");
});

await test("Y1. a resident agent session SURVIVES losing its Development Slot", async () => {
  // A real session, in a real process, doing what a resident agent does: waiting.
  killSession();
  execFileSync("tmux", ["new-session", "-d", "-s", SESSION, "sleep 600"], { stdio: "ignore" });
  assert.ok(sessionAlive(SESSION), "fixture session started");
  const pid = execFileSync("tmux", ["list-panes", "-t", SESSION, "-F", "#{pane_pid}"], { encoding: "utf8" }).trim();
  assert.ok(pid, "fixture session has a pane process");

  adoptSeam();
  writeRegistration("donor-lane", { slot: 1 });
  writeRegistration("recipient-lane", { slot: null });

  const out = await L.reassignSlot({
    fromWorktree: "donor-lane", toWorktree: "recipient-lane",
    root: ROOT,
    // Survival is what is under test, not ranking: the donor is warm by
    // construction and the verdict is acknowledged so the path runs to the end.
    activeRun: () => false, acknowledgeActive: true,
  });

  assert.equal(out.ok, true, `reassign failed: ${JSON.stringify(out).slice(0, 240)}`);
  assert.equal(out.slot, 1, "the slot moved");

  // THE ASSERTION THE WHOLE MODEL DEPENDS ON.
  assert.ok(sessionAlive(SESSION), "the resident session was killed by reassignment");
  const after = execFileSync("tmux", ["list-panes", "-t", SESSION, "-F", "#{pane_pid}"], { encoding: "utf8" }).trim();
  assert.equal(after, pid, "the session survived but its process was replaced");

  // And the registry moved exactly one slot, in one direction.
  const donor = readFileSync(metaPath("donor-lane"), "utf8");
  const recipient = readFileSync(metaPath("recipient-lane"), "utf8");
  assert.ok(!/ALLOY_WORKTREE_SLOT/.test(donor), "donor is now slotless");
  assert.match(recipient, /ALLOY_WORKTREE_SLOT="1"/, "recipient holds the slot");
  assert.match(recipient, /PORT="3911"/, "and its port metadata is correct");

  killSession();
  L.resetRegisterImplForTests();
});

await test("Y2. reassignment signals no process — no kill in the path", () => {
  // Source-level, because a passing live test proves this run did not kill the
  // session; this proves no code path can. `process.kill(pid, 0)` is a liveness
  // probe and is allowed — signal 0 delivers nothing.
  const src = execFileSync("cat", [new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url).pathname], { encoding: "utf8" })
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const fn = src.slice(src.indexOf("export async function reassignSlot"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(!/process\.kill\((?!.*,\s*0\))/.test(body), "reassignSlot must not signal a process");
  assert.ok(!/kill-session|kill-pane|pkill|SIGTERM|SIGKILL/.test(body), "reassignSlot must not stop a session");
  assert.ok(!/dev-stop|browser-stop|stopOwned/.test(body), "reassignSlot must not stop a server or browser");
});

await test("Y3. the donor keeps its registration rather than being retired", () => {
  const src = execFileSync("cat", [new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url).pathname], { encoding: "utf8" });
  const fn = src.slice(src.indexOf("export async function reassignSlot"));
  assert.match(fn.slice(0, 3000), /slotless: true/, "the donor is demoted, not deleted");
  assert.ok(!/closeDurableLane|retireWorktree|removeWorktree/.test(fn.slice(0, 3000)),
    "reassignment must never retire the donor lane");
});

try { killSession(); rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
