#!/usr/bin/env node
/**
 * A HELD SLOT IS NOT THE SAME AS A USED ONE.
 *
 * THE DEFECT. The managed pool is fixed, so a fleet at capacity hands every new
 * lane a slotless registration: dispatchable, but with no port, no dev server
 * and no browser session. The operator saw it as lanes "missing" the tailnet
 * address. Measured on the live host: twelve slots, ELEVEN held by lanes, ONE
 * held by a registration no durable lane owned at all, and two lanes waiting
 * with nothing. The pool was not out of capacity; it was out of FREE capacity,
 * which is a different thing and has a different remedy.
 *
 * THE OPERATOR'S DECISION, which this implements: "if there are slots not being
 * actively used, they should be giving theirs up to one the user is trying to
 * use… we could offer the user a chance to select which they'd like to replace
 * (ideally we show the offline or inactive group first)."
 *
 * So this ranks and explains; it decides nothing. The choice goes back.
 *
 * WHY IT IS SAFE TO OFFER AT ALL. A slot is a PORT, not a life. Reclaiming one
 * closes no lane, deletes no worktree, touches no branch and discards no work:
 * the donor keeps its registration and becomes SLOTLESS, a supported and
 * dispatchable state. It keeps chatting; it loses localhost and the QA route.
 * That is the difference between reallocation and `alloy-sprint-finish`.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-slot-reclaim-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.ALLOY_WORKTREE_ROOT = join(ROOT, "Code", "alloy-worktrees");
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.ALLOY_MAX_AGENTS = "3";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });

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
  rmSync(join(ROOT, "Code"), { recursive: true, force: true });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const metaPath = (n) => join(ROOT, "metadata", `${n}.env`);
function writeRegistration(name, { slot = null, lifecycle = "active" } = {}) {
  const p = join(ROOT, "Code", "alloy-worktrees", name);
  writeFileSync(metaPath(name), [
    `ALLOY_WORKTREE_NAME="${name}"`,
    ...(slot == null ? [] : [`ALLOY_WORKTREE_SLOT="${slot}"`, `PORT="${3010 + Number(slot)}"`]),
    `ALLOY_WORKTREE_PATH="${p}"`,
    `ALLOY_WORKTREE_BRANCH="agent/${name}"`,
    `ALLOY_AGENT="claude"`,
    `ALLOY_WORKER_LIFECYCLE="${lifecycle}"`, "",
  ].join("\n"), "utf8");
}
/** The seam standing in for `alloy-worktree-adopt`, writing what it writes. */
function adoptSeam() {
  const calls = [];
  L.setRegisterImplForTests((cmd, args) => {
    calls.push(args);
    const slotless = args[0] === "--no-slot";
    const name = args[1];
    if (!slotless && existsSync(metaPath(name)) && !args.includes("--force")) {
      return { status: 1, stderr: `metadata already exists for ${name}` };
    }
    writeRegistration(name, { slot: slotless ? null : Number(args[0]) });
    return { status: 0, stdout: "" };
  });
  return calls;
}
function seedLane(name, worktree, { slot = null, makeDir = true, close = false } = {}) {
  const made = createDurableLane({ name, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const path = join(ROOT, "Code", "alloy-worktrees", worktree);
  if (makeDir) mkdirSync(path, { recursive: true });
  bindDurableLane(laneId, {
    type: "alloy_local", worktree_path: path, worktree_name: worktree,
    branch: `agent/${worktree}`, tmux_session: `alloy-${worktree}`, slot, provider: "claude",
  }, { root: ROOT });
  if (slot != null) writeRegistration(worktree, { slot });
  if (close) {
    // Closing goes through the lifecycle owner, which retires the worktree; the
    // store is edited directly here so the fixture is a CLOSED lane that still
    // holds its registration — which is exactly the state worth reclaiming.
    const sp = join(ROOT, "vacilando", "lanes", "lanes.json");
    const store = JSON.parse(readFileSync(sp, "utf8"));
    store.lanes[laneId].status = "CLOSED";
    writeFileSync(sp, JSON.stringify(store, null, 2), "utf8");
  }
  return { laneId, path };
}
const idle = () => false;
const busy = () => true;

// ---------------------------------------------------------------------------
// C — RANKING: least given up, first.
// ---------------------------------------------------------------------------

await test("C1. an unowned registration ranks first — nothing is given up at all", async () => {
  seedLane("Working", "wt-work", { slot: 1 });
  writeRegistration("wt-orphan", { slot: 2 });          // no durable lane owns it
  const { candidates } = await L.slotReclaimCandidates({ root: ROOT, activeRun: idle });
  assert.equal(candidates[0].group, "unowned");
  assert.equal(candidates[0].worktree, "wt-orphan");
  assert.equal(candidates[0].holder_kind, "orphan");
  assert.match(candidates[0].reason, /No Development Lane owns/);
});

await test("C2. the operator's groups, in the operator's order", async () => {
  writeRegistration("wt-orphan", { slot: 1 });
  seedLane("Closed", "wt-closed", { slot: 2, close: true });
  seedLane("Quiet", "wt-quiet", { slot: 3 });
  const { candidates } = await L.slotReclaimCandidates({ root: ROOT, activeRun: idle });
  // A CLOSED lane's registration is unowned too — listDurableLanes excludes
  // retired lanes, so nothing LIVE owns that slot. It ranks with the orphans,
  // which is right, and it must SAY which of the two it is.
  assert.deepEqual(candidates.map((c) => c.group), ["unowned", "unowned", "inactive"]);
  const closed = candidates.find((c) => c.worktree === "wt-closed");
  assert.equal(closed.holder_kind, "closed_lane");
  assert.match(closed.reason, /is closed and still holds slot 2/);
  const orphan = candidates.find((c) => c.worktree === "wt-orphan");
  assert.equal(orphan.holder_kind, "orphan");
  assert.match(orphan.reason, /No Development Lane owns/);
});

await test("C3. within a group, least recently active first", async () => {
  const a = seedLane("Older", "wt-a", { slot: 1 });
  const b = seedLane("Newer", "wt-b", { slot: 2 });
  // Touch B so it is the more recent of the two.
  bindDurableLane(b.laneId, { worktree_name: "wt-b", worktree_path: join(ROOT, "Code", "alloy-worktrees", "wt-b") }, { root: ROOT });
  const { candidates } = await L.slotReclaimCandidates({ root: ROOT, activeRun: idle });
  const inactive = candidates.filter((c) => c.group === "inactive").map((c) => c.worktree);
  assert.deepEqual(inactive, ["wt-a", "wt-b"], "the least recently active is offered first");
});

await test("C4. a lane mid-turn is SHOWN but never reclaimable", async () => {
  seedLane("Busy", "wt-busy", { slot: 1 });
  const { candidates } = await L.slotReclaimCandidates({ root: ROOT, activeRun: busy });
  const c = candidates.find((x) => x.worktree === "wt-busy");
  assert.equal(c.group, "active");
  assert.equal(c.reclaimable, false, "the operator sees the whole pool; this one cannot be taken");
  assert.match(c.reason, /run in flight/);
});

await test("C5. an unreadable run store makes lanes look BUSY, never free", async () => {
  // Guessing "idle" is precisely how a lane mid-turn loses its dev server.
  seedLane("Unknown", "wt-unknown", { slot: 1 });
  const { candidates } = await L.slotReclaimCandidates({
    root: ROOT, activeRun: () => { throw new Error("run store unreadable"); },
  });
  assert.equal(candidates.find((x) => x.worktree === "wt-unknown").reclaimable, false);
});

await test("C6. a lane whose worktree is gone is offline, not merely quiet", async () => {
  seedLane("Gone", "wt-gone", { slot: 1, makeDir: false });
  const { candidates } = await L.slotReclaimCandidates({ root: ROOT, activeRun: idle });
  const c = candidates.find((x) => x.worktree === "wt-gone");
  assert.equal(c.group, "offline");
  assert.match(c.reason, /no worktree on disk/);
});

// ---------------------------------------------------------------------------
// R — REASSIGNMENT: a port moves, a lane does not end.
// ---------------------------------------------------------------------------

await test("R1. the donor keeps its registration and stays dispatchable", async () => {
  // THE SAFETY PROPERTY THE WHOLE FEATURE RESTS ON. Reclaiming a slot must not
  // close a lane or retire a worktree — the donor becomes slotless, which is a
  // supported state: it can still be sent instructions, it just has no port.
  adoptSeam();
  const donor = seedLane("Donor", "wt-donor", { slot: 1 });
  seedLane("Recipient", "wt-recipient", { slot: null });
  writeRegistration("wt-recipient", { slot: null });

  const out = await L.reassignSlot({ fromWorktree: "wt-donor", toWorktree: "wt-recipient", root: ROOT });
  assert.equal(out.ok, true, out.error || "");
  assert.equal(out.slot, 1);

  const donorReg = L.registrationForWorktree("wt-donor");
  assert.ok(donorReg, "the donor is STILL REGISTERED — it was not retired");
  assert.equal(donorReg.slot ?? "", "", "and it no longer holds the slot");
  assert.equal(L.assertLaneDispatchable(donor.laneId, { root: ROOT }).ok, true,
    "a slotless donor can still be sent instructions");
  assert.equal(L.registrationForWorktree("wt-recipient").slot, "1");
});

await test("R2. a donor mid-turn is refused by name", async () => {
  adoptSeam();
  seedLane("Busy", "wt-busy", { slot: 1 });
  seedLane("Wanting", "wt-wanting", { slot: null });
  const out = await L.reassignSlot({
    fromWorktree: "wt-busy", toWorktree: "wt-wanting", root: ROOT,
    activeRun: busy,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "donor_active");
  assert.match(out.detail, /run in flight/);
  assert.equal(L.registrationForWorktree("wt-busy").slot, "1", "and it keeps its slot");
});

await test("R3. every ambiguity is refused rather than guessed", async () => {
  adoptSeam();
  seedLane("Held", "wt-held", { slot: 1 });
  seedLane("AlsoHeld", "wt-also", { slot: 2 });
  const cases = [
    [{ fromWorktree: "", toWorktree: "x" }, "missing_worktree_name"],
    [{ fromWorktree: "wt-held", toWorktree: "wt-held" }, "same_worktree"],
    [{ fromWorktree: "wt-nothere", toWorktree: "wt-x" }, "donor_not_registered"],
    [{ fromWorktree: "wt-held", toWorktree: "wt-also" }, "recipient_already_slotted"],
  ];
  for (const [inputs, expected] of cases) {
    const out = await L.reassignSlot({ ...inputs, root: ROOT, activeRun: idle });
    assert.equal(out.ok, false, `${expected} should refuse`);
    assert.equal(out.error, expected);
  }
});

await test("R4. a donor with no slot has nothing to give", async () => {
  adoptSeam();
  writeRegistration("wt-slotless", { slot: null });
  const out = await L.reassignSlot({ fromWorktree: "wt-slotless", toWorktree: "wt-x", root: ROOT, activeRun: idle });
  assert.equal(out.ok, false);
  assert.equal(out.error, "donor_has_no_slot");
});

await test("R5. the canonical writer is used, twice, and nothing else writes the registry", async () => {
  const calls = adoptSeam();
  seedLane("Donor", "wt-donor", { slot: 1 });
  writeRegistration("wt-recipient", { slot: null });
  await L.reassignSlot({ fromWorktree: "wt-donor", toWorktree: "wt-recipient", root: ROOT, activeRun: idle });
  assert.equal(calls.length, 2, "exactly two adopt calls");
  assert.deepEqual(calls[0].slice(0, 2), ["--no-slot", "wt-donor"], "the donor is demoted FIRST");
  assert.ok(calls[0].includes("--force"), "re-adopting an existing record requires --force");
  assert.deepEqual(calls[1].slice(0, 2), ["1", "wt-recipient"], "then the recipient takes the freed slot");
  const src = readFileSync(new URL("../lib/vacilando/lane-worktree-lifecycle.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function reassignSlot"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(!/writeFileSync|metadata.*\.env/.test(body), "reassignment must not write the registry itself");
  assert.ok(!/releaseSprintSlot|finishSprint/.test(body), "and must never retire the donor's worktree");
});

await test("R6. explicit slotless is not the same as 'pick one for me'", async () => {
  // `slot: null` is the ordinary creation call and means "choose a free slot".
  // Reclamation needs to say "register this WITHOUT one" unambiguously.
  const calls = adoptSeam();
  await L.registerCreatedWorktree({ worktreeName: "wt-auto", root: ROOT });
  assert.notEqual(calls[0][0], "--no-slot", "slot:null still picks a free slot");
  const out = await L.registerCreatedWorktree({ worktreeName: "wt-explicit", slotless: true, root: ROOT });
  assert.equal(calls[1][0], "--no-slot");
  assert.equal(out.slot, null);
  assert.equal(out.reason, "slotless_requested", "and it is not reported as an exhausted pool");
});

// ---------------------------------------------------------------------------
// U — THE OFFER: what the operator is actually shown.
// ---------------------------------------------------------------------------

const V = await import("../apps/vacilando/public/gateway-view.mjs");
const sample = [
  { worktree: "wt-orphan", slot: 10, port: 3020, group: "unowned", reclaimable: true, reason: "No Development Lane owns wt-orphan.", lane_name: null },
  { worktree: "wt-closed", slot: 9, port: 3019, group: "offline", reclaimable: true, reason: "Old Lane is closed and still holds slot 9.", lane_name: "Old Lane" },
  { worktree: "payments", slot: 7, port: 3017, group: "inactive", reclaimable: true, reason: "Payments is open with nothing running.", lane_name: "Payments" },
  { worktree: "wt5", slot: 5, port: 3015, group: "active", reclaimable: false, reason: "Backend has a run in flight.", lane_name: "Backend" },
];
const CONSEQUENCE = { loses: "its localhost address and QA browser session", keeps: "its branch, worktree, messages and work", summary: "Nothing else changes." };

await test("U1. the offer names the slot, the holder, the ranking reason and the cost", () => {
  const html = V.renderSlotReclaimSheet({ laneLabel: "Access & Identity", candidates: sample, consequence: CONSEQUENCE });
  assert.match(html, /Slot 7/, "which slot");
  assert.match(html, /Payments/, "who holds it");
  assert.match(html, /open with nothing running/, "why it is ranked there");
  assert.match(html, /localhost address and QA browser session/, "what the donor loses");
  assert.match(html, /branch, worktree, messages/, "what the donor keeps");
});

await test("U2. groups appear in the operator's order, unowned first", () => {
  const html = V.renderSlotReclaimSheet({ candidates: sample, consequence: CONSEQUENCE });
  const order = [...html.matchAll(/data-gw-reclaim-group="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["unowned", "offline", "inactive", "active"]);
});

await test("U3. an active candidate is VISIBLE and disabled, never hidden", () => {
  // Seeing the whole pool is how the operator understands why the offered ones
  // are the offered ones.
  const html = V.renderSlotReclaimSheet({ candidates: sample, consequence: CONSEQUENCE });
  assert.match(html, /Backend/, "the busy lane is shown");
  assert.match(html, /data-gw-reclaim-pick="wt5"[^>]*disabled/, "and its control is disabled");
  assert.match(html, /Cannot be taken/);
});

await test("U4. nothing is preselected, and confirm is inert until a choice is made", () => {
  // Taking a port from another lane is a deliberate act; a pre-ticked radio is
  // how a deliberate act becomes an accidental one.
  const html = V.renderSlotReclaimSheet({ candidates: sample, consequence: CONSEQUENCE });
  assert.ok(!/checked/.test(html), "no candidate is preselected, not even the unowned one");
  assert.match(html, /data-gw-reclaim-confirm disabled/);
});

await test("U5. choosing shows the consequence before confirming", () => {
  const html = V.renderSlotReclaimSheet({ candidates: sample, consequence: CONSEQUENCE, selected: "payments", laneLabel: "Access & Identity" });
  assert.match(html, /data-gw-reclaim-preview/);
  assert.match(html, /Payments<\/strong> loses/);
  assert.match(html, /Access &amp; Identity<\/strong> takes slot 7/);
  assert.ok(!/data-gw-reclaim-confirm disabled/.test(html), "and confirm becomes available");
});

await test("U6. declining is a real answer, not a dead end", () => {
  const html = V.renderSlotReclaimSheet({ candidates: sample, consequence: CONSEQUENCE });
  assert.match(html, /data-gw-reclaim-cancel[^>]*>Leave it without a slot/);
});

await test("U7. the API delegates; it does not re-implement ranking or mutation", async () => {
  const src = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url), "utf8");
  const i = src.indexOf('path === "/api/lanes/slots/reclaim-candidates"');
  const j = src.indexOf('path === "/api/lanes/create"');
  const routes = src.slice(i, j);
  assert.match(routes, /slotReclaimCandidates\(/, "ranking comes from the owner");
  assert.match(routes, /reassignSlot\(/, "mutation comes from the owner");
  assert.ok(!/SLOT_RECLAIM_GROUPS|writeFileSync|adopt/.test(routes), "no second copy of the rules");
  // A refusal must hand back the CURRENT ranking, not the stale one.
  assert.match(routes, /409/, "a refused reclaim is a conflict, not a 500");
  assert.match(routes.slice(routes.indexOf("if (!out.ok)")), /slotReclaimCandidates\(/, "and re-ranks for the next choice");
});

await test("U8. the flow is reachable ONLY from a slotless creation", async () => {
  const src = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  assert.match(src, /j\.workspace\?\.slotless === true/, "opened by the creation result");
  assert.ok(!/#\/slots|route.*reclaim/.test(src), "there is no route to it");
  // Cancelling must not mutate anything.
  const close = src.slice(src.indexOf("function closeSlotReclaim"), src.indexOf("async function confirmSlotReclaim"));
  assert.ok(!/fetch|gwFetch|reclaim/.test(close), "cancel changes nothing at all");
});

await test("U9. a server refusal replaces the list and clears the stale choice", async () => {
  const src = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function confirmSlotReclaim"), src.indexOf("async function fetchCandidates"));
  assert.match(fn, /st\.candidates = j\.candidates/, "the current ranking replaces the stale one");
  assert.match(fn, /st\.selected = null/, "and the stale selection is cleared");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
