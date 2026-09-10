#!/usr/bin/env node
/**
 * CREATING A WORKTREE IS NOT PROVISIONING A LANE.
 *
 * THE DEFECT. The Director created a lane through the wizard. It got a git
 * worktree, a branch, a durable binding, a tmux session and a running Claude —
 * and no slot and no registration. Every message was then refused
 * `lane_worktree_unregistered`, so what the operator saw was an agent that
 * "never became available". The agent was fine; nothing could reach it.
 *
 * Measured on the Financials lane: worktree at .../alloy-worktrees/financials on
 * agent/financials, tmux pane %17 running claude.exe in that directory,
 * `slot: null`, and no metadata/financials.env at all.
 *
 * ROOT CAUSE: a worktree can come into existence two ways — `alloy-sprint-start`
 * / `alloy-worktree-adopt` in the shell, which register it, and Vacilando's own
 * lane wizard in JS, which did not. Only one of them wrote the slot registry.
 *
 * These assert that lane creation registers what it creates, calls the canonical
 * writer rather than inventing a second one, and refuses to call a lane
 * provisioned when it is not usable.
 *
 * TOPOLOGY IS PINNED HERE ON PURPOSE. This file read the host's ALLOY_MAX_AGENTS
 * and asserted six slots, so it began failing the moment the host moved to
 * twelve — and it failed in the direction that matters: with twelve slots and
 * six registered, "no free slot" could not be provoked at all, so the control
 * for the exhausted-pool case was silently testing the opposite case. A test
 * whose outcome depends on the machine it runs on is not a control.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-provision-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
// Six, stated, not inherited: every slot assertion below counts on it.
process.env.ALLOY_MAX_AGENTS = "6";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  L.resetRegisterImplForTests();
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
function register(name, slot, lifecycle = "active") {
  writeFileSync(join(ROOT, "metadata", `${name}.env`), [
    `ALLOY_WORKTREE_SLOT=${slot}`,
    `ALLOY_WORKTREE_PATH=${join(ROOT, "worktrees", name)}`,
    `ALLOY_WORKTREE_BRANCH=agent/claude/${slot}-x`,
    `PORT=${3010 + slot}`, `ALLOY_WORKER_LIFECYCLE=${lifecycle}`, "",
  ].join("\n"), "utf8");
}
function clearRegistry() {
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
}

await test("free slots are the managed slots no live registration holds", () => {
  clearRegistry();
  assert.deepEqual(L.freeSlots({}), [1, 2, 3, 4, 5, 6]);
  register("a", 1); register("b", 3); register("c", 6);
  assert.deepEqual(L.freeSlots({}), [2, 4, 5]);
  // A finished registration is not holding its slot.
  register("d", 4, "finished");
  assert.deepEqual(L.freeSlots({}), [2, 4, 5]);
});

await test("a created worktree is registered through the CANONICAL writer", async () => {
  clearRegistry();
  register("taken", 1);
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: "" }; });
  const out = await L.registerCreatedWorktree({ worktreeName: "financials", provider: "claude" });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.slot, 2, "the lowest free slot");
  assert.equal(out.port, 3012);
  assert.equal(calls.length, 1, "exactly one registration call");
  assert.match(calls[0].cmd, /alloy-worktree-adopt$/, "the canonical writer, not a second registry");
  assert.deepEqual(calls[0].args, ["2", "financials", "--provider", "claude"]);
});

await test("an explicit slot is honoured", async () => {
  clearRegistry();
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => { calls.push(args); return { status: 0, stdout: "" }; });
  const out = await L.registerCreatedWorktree({ worktreeName: "x", slot: 5 });
  assert.equal(out.slot, 5);
  assert.equal(calls[0][0], "5");
});

await test("no free slot registers the worktree ANYWAY, without a slot", async () => {
  // THE CONTRACT THIS REPLACES, AND WHY. It used to assert that an exhausted
  // pool registered NOTHING. That is what left the Access & Identity lane with
  // a worktree, a branch, a tmux session and a live Claude that no instruction
  // could reach: the host was out of PORTS, and the answer was to stop knowing
  // whose worktree that was. Registration is identity and a slot is a resource;
  // running out of the second is no reason to give up the first.
  clearRegistry();
  for (const s of [1, 2, 3, 4, 5, 6]) register(`w${s}`, s);
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => { calls.push({ cmd, args }); return { status: 0, stdout: "" }; });
  const out = await L.registerCreatedWorktree({ worktreeName: "seventh" });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.slot, null, "no slot was invented");
  assert.equal(out.port, null, "and therefore no port");
  assert.equal(out.slotless, true);
  assert.equal(out.reason, "no_free_slot");
  assert.equal(calls.length, 1, "still exactly one registration call");
  assert.match(calls[0].cmd, /alloy-worktree-adopt$/, "still the canonical writer");
  assert.deepEqual(calls[0].args, ["--no-slot", "seventh", "--provider", "claude"]);
  // And it says what the lane does NOT have, so nobody reads this as a port.
  assert.match(out.detail, /no port, no dev server/);
});

await test("an exhausted pool names who is holding the slots", async () => {
  // "All slots are taken" is not actionable. Which ones, and is any of them a
  // leftover? On the live host slot 10 was held by a registration no durable
  // lane owned, and it looked exactly like the eleven that were in use.
  clearRegistry();
  for (const s of [1, 2, 3, 4, 5, 6]) register(`w${s}`, s);
  L.setRegisterImplForTests(() => ({ status: 0, stdout: "" }));
  const out = await L.registerCreatedWorktree({ worktreeName: "seventh" });
  assert.match(out.detail, /Slots: 1=w1/, "each holder is named with its slot");
  // None of these have an owning lane in this fixture, so all six are called out
  // as reclaimable rather than presented as immovable.
  assert.match(out.detail, /no owning lane/);
  assert.match(out.detail, /alloy-sprint-finish/, "and the operator is told how to free one");
});

await test("a failing registration surfaces the failure", async () => {
  clearRegistry();
  L.setRegisterImplForTests(() => ({ status: 1, stderr: "slot already assigned" }));
  const out = await L.registerCreatedWorktree({ worktreeName: "y" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "registration_failed");
  assert.match(out.detail, /slot already assigned/);
  assert.equal(out.slot, 1, "and says which slot it tried");
});

await test("a worktree name is required", async () => {
  const out = await L.registerCreatedWorktree({});
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_worktree_name");
});

await test("lane creation calls registration and reports provisioned honestly", () => {
  // Structural: the creation path must register what it creates, and must not
  // call a lane provisioned when registration failed. That second half is the
  // part that hid this defect — the lane reported success while being unusable.
  const src = readFileSync(new URL("../lib/vacilando/lane-identity-api.mjs", import.meta.url), "utf8");
  assert.match(src, /registerCreatedWorktree\(/, "creation must register the worktree it creates");
  assert.match(src, /provisioned: registered\.ok/, "provisioned must mean usable");
  assert.ok(!/provisioned: true,\s*\n\s*worktree_path: made\.worktree_path/.test(src),
    "provisioned must no longer be hardcoded true for a bare worktree");
  // And it must not grow a second registry writer of its own.
  assert.ok(!/metadata.*\.env/.test(src), "creation must not write registration files itself");
});

import { readFileSync } from "node:fs";

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
