#!/usr/bin/env node
/**
 * "NO SLOT" MUST NEVER COME OUT SOUNDING LIKE "NO LANE".
 *
 * Fourteen durable lanes and twelve slots is a permanent, intended gap. What
 * these lock down is that a lane in the gap loses nothing, and — the sharper
 * half — that it is never handed runtime facts it does not have. An invented
 * port is worse than an absent one: absent is legible, invented sends someone
 * to a URL that will never answer.
 */
import assert from "node:assert/strict";
import { classifyLane, classifyLanes, PLACEMENT, isClosedLane } from "../lib/vacilando/lane-placement.mjs";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vac-place-"));
  mkdirSync(join(root, "wt-placed"), { recursive: true });
  mkdirSync(join(root, "wt-parked"), { recursive: true });
  return root;
}
const lane = (id, wt) => ({ lane_id: id, title: id, status: "ACTIVE", binding: wt ? { worktree_name: wt } : {} });

test("1. a registered slot is what makes a lane PLACED", () => {
  const root = fixture();
  const regs = new Map([["wt-placed", { slot: 3, port: 3013, branch: "b" }]]);
  const r = classifyLane(lane("l1", "wt-placed"), { registrations: regs, worktreesRoot: root });
  assert.equal(r.placement, PLACEMENT.PLACED);
  assert.equal(r.slot, 3);
  assert.equal(r.port, 3013);
  rmSync(root, { recursive: true, force: true });
});

test("2. a worktree with no registration is PARKED, not broken", () => {
  const root = fixture();
  const r = classifyLane(lane("l2", "wt-parked"), { registrations: new Map(), worktreesRoot: root });
  assert.equal(r.placement, PLACEMENT.PARKED);
  assert.equal(r.placement_eligible, true);
  rmSync(root, { recursive: true, force: true });
});

test("3. a PARKED lane is given NO slot, port or runtime fact", () => {
  // The failure this prevents is a plausible-looking port on a lane that has
  // none. Null is the honest answer and the legible one.
  const root = fixture();
  const r = classifyLane(lane("l3", "wt-parked"), { registrations: new Map(), worktreesRoot: root });
  assert.equal(r.slot, null);
  assert.equal(r.port, null);
  rmSync(root, { recursive: true, force: true });
});

test("4. a PARKED lane keeps everything that makes it resumable", () => {
  const root = fixture();
  const r = classifyLane(lane("l4", "wt-parked"), { registrations: new Map(), worktreesRoot: root });
  for (const kept of ["lane identity", "branch", "worktree", "history", "runs", "uncommitted work", "placement eligibility"]) {
    assert.ok(r.retains.includes(kept), `parked must retain ${kept}`);
  }
  rmSync(root, { recursive: true, force: true });
});

test("5. NO_WORKTREE is its own condition, not a flavour of parked", () => {
  // Parked means "not on the host right now". No-worktree means "there is
  // nothing to put on it". The dispositions are different, so the states are.
  const root = fixture();
  const named = classifyLane(lane("l5", "wt-gone"), { registrations: new Map(), worktreesRoot: root });
  assert.equal(named.placement, PLACEMENT.NO_WORKTREE);
  assert.equal(named.placement_eligible, false, "there is nothing to place");
  assert.equal(named.disposition_required, true);
  const unnamed = classifyLane(lane("l6", null), { registrations: new Map(), worktreesRoot: root });
  assert.equal(unnamed.placement, PLACEMENT.NO_WORKTREE);
  rmSync(root, { recursive: true, force: true });
});

test("6. a placed lane whose server is stopped is still placed", () => {
  // Placement is slot ownership, not a listening port. Otherwise stopping a
  // server would silently hand someone else the slot.
  const root = fixture();
  const regs = new Map([["wt-placed", { slot: 3, port: 3013, branch: "b" }]]);
  const r = classifyLane(lane("l7", "wt-placed"), { registrations: regs, worktreesRoot: root });
  assert.equal(r.placement, PLACEMENT.PLACED, "no process was consulted, and none should be");
  rmSync(root, { recursive: true, force: true });
});

test("7. a registration whose worktree is gone does not count as placed", () => {
  const root = fixture();
  const regs = new Map([["wt-gone", { slot: 9, port: 3019, branch: "b" }]]);
  const r = classifyLane(lane("l8", "wt-gone"), { registrations: regs, worktreesRoot: root });
  assert.equal(r.placement, PLACEMENT.NO_WORKTREE);
  assert.equal(r.slot, null, "a slot recorded for a directory that does not exist is not a slot anyone holds");
  rmSync(root, { recursive: true, force: true });
});

test("8. two lanes claiming one slot is surfaced as a registry fault", () => {
  const root = fixture();
  mkdirSync(join(root, "wt-b"), { recursive: true });
  const regs = new Map([["wt-placed", { slot: 3, port: 3013 }], ["wt-b", { slot: 3, port: 3013 }]]);
  const c = classifyLanes({
    lanes: [lane("l9", "wt-placed"), lane("l10", "wt-b")],
    registrations: regs, worktreesRoot: root,
  });
  assert.equal(c.rollup.slot_conflicts.length, 1);
  assert.deepEqual(c.rollup.slot_conflicts[0].lane_ids.sort(), ["l10", "l9"]);
  rmSync(root, { recursive: true, force: true });
});

test("9. the rollup counts every lane exactly once", () => {
  const root = fixture();
  const regs = new Map([["wt-placed", { slot: 1, port: 3011 }]]);
  const c = classifyLanes({
    lanes: [lane("a", "wt-placed"), lane("b", "wt-parked"), lane("c", "wt-gone"), lane("d", null)],
    registrations: regs, worktreesRoot: root,
  });
  const { durable, placed, parked, no_worktree } = c.rollup;
  assert.equal(durable, 4);
  assert.equal(placed + parked + no_worktree, durable, "every lane must land in exactly one condition");
  assert.deepEqual([placed, parked, no_worktree], [1, 1, 2]);
  rmSync(root, { recursive: true, force: true });
});

test("10. more durable lanes than slots is a supported state", () => {
  const root = fixture();
  const lanes = Array.from({ length: 14 }, (_, i) => lane(`l${i}`, "wt-parked"));
  const c = classifyLanes({ lanes, registrations: new Map(), worktreesRoot: root });
  assert.equal(c.rollup.durable, 14);
  assert.equal(c.rollup.parked, 14, "fourteen lanes and no slots is legal, not an error");
  rmSync(root, { recursive: true, force: true });
});

test("11. a closed lane is history, not inventory", () => {
  // The first cut counted every record as durable, so ten retired lanes made
  // the fleet read 19 durable / 11 NO_WORKTREE when the truth was 9 and 1.
  const root = fixture();
  const closed = { lane_id: "z", status: "CLOSED", binding: { worktree_name: "wt-gone" } };
  const r = classifyLane(closed, { registrations: new Map(), worktreesRoot: root });
  assert.equal(r.placement, PLACEMENT.CLOSED);
  assert.equal(r.disposition_required, false, "a retired lane already had its disposition");
  rmSync(root, { recursive: true, force: true });
});

test("12. closed lanes are counted separately and never inflate durable", () => {
  const root = fixture();
  const regs = new Map([["wt-placed", { slot: 1, port: 3011 }]]);
  const c = classifyLanes({
    lanes: [lane("a", "wt-placed"), { ...lane("b", "wt-parked"), status: "CLOSED" }, { ...lane("c", null), status: "CLOSED" }],
    registrations: regs, worktreesRoot: root,
  });
  assert.equal(c.rollup.durable, 1, "only the lane you can still act on");
  assert.equal(c.rollup.closed, 2);
  assert.equal(c.rollup.parked, 0, "a closed lane is not parked");
  rmSync(root, { recursive: true, force: true });
});

test("13. closed lanes are kept, not hidden", () => {
  const root = fixture();
  const c = classifyLanes({
    lanes: [{ ...lane("gone", "wt-parked"), status: "CLOSED" }],
    registrations: new Map(), worktreesRoot: root,
  });
  assert.equal(c.lanes.length, 1, "history must remain readable");
  assert.equal(isClosedLane({ status: "closed" }), true, "status match is case-insensitive");
  assert.equal(isClosedLane({ status: "ACTIVE" }), false);
  rmSync(root, { recursive: true, force: true });
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
