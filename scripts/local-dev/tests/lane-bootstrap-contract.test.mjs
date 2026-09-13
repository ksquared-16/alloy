#!/usr/bin/env node
/**
 * The canonical lane bootstrap contract.
 *
 * WHAT THESE CONTROLS ARE FOR. The claim this mission makes is not "lanes are
 * configured" — it is that every lane resolves the SAME contract, that what
 * differs between them is declared rather than accumulated, and that asking the
 * question costs nothing. Each of those is falsifiable, so each is asserted.
 *
 * THE ONE THAT MATTERS MOST is `bootstrap acquires nothing`. A consistency check
 * that started a server, claimed a Development Slot or woke a provider would be
 * unusable in exactly the situation you most want it — a loaded host — and would
 * make "are my lanes consistent?" a question nobody could afford to ask. It is
 * asserted by injection rather than by inspection, because a comment promising
 * it is not a control.
 *
 * Isolated runtime only. Every case builds its own lane store.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-bootstrap-"));
process.env.ALLOY_RUNTIME_ROOT = join(ROOT, "gateway");
mkdirSync(join(ROOT, "gateway", "vacilando"), { recursive: true });

// Two real worktree directories, so worktree/instruction resolution is measured
// rather than mocked away.
const WT_A = join(ROOT, "wt-a");
const WT_B = join(ROOT, "wt-b");
for (const d of [WT_A, WT_B]) {
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "CLAUDE.md"), "# lane instructions\n");
}
// A toolkit generation the fixture can actually resolve. Without it every lane
// reports `toolkit:generation_unknown`, which is correct behaviour on a host
// with no toolkit and would make these cases assert against an unrelated gap.
writeFileSync(join(ROOT, "INSTALL-MANIFEST"), "toolkit 0123456789ab\n");

const LB = await import("../lib/vacilando/lane-bootstrap.mjs");
const DL = await import("../lib/vacilando/development-lane.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/**
 * A lane created through the canonical writer — never hand-built.
 *
 * Each lane gets its OWN worktree directory. `createDurableLane` refuses a
 * second lane bound to a path another lane already holds, and it is right to:
 * two lanes sharing one worktree is the ambiguity the binding check exists to
 * prevent. Sharing a fixture path here would be testing against a shape the
 * registry does not permit.
 */
let laneSeq = 0;
function makeLane(name, worktreePath, extra = {}) {
  let path = null;
  if (worktreePath) {
    laneSeq += 1;
    path = join(ROOT, `wt-${laneSeq}`);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "CLAUDE.md"), "# lane instructions\n");
  }
  const out = DL.createDurableLane({
    name,
    binding: path ? { worktree_path: path, worktree_name: name } : null,
    ...extra,
  });
  assert.equal(out.ok, true, out.error);
  return out.lane;
}

/** Resolution with the owners stubbed, so nothing touches the host. */
function resolve(lane, { slot = null, qaIdentity = () => "qa@example.com", worktreeOk = true } = {}) {
  return LB.resolveLaneBootstrap(lane.lane_id, {
    getLane: () => lane,
    resolveWorktree: () => ({
      ok: worktreeOk,
      code: worktreeOk ? null : "lane_worktree_unregistered",
      worktree_path: lane.binding?.worktree_path || null,
      worktree_name: lane.binding?.worktree_name || null,
      branch: "agent/x",
      branch_expected: "agent/x",
      branch_actual: "agent/x",
      branch_drift: false,
      binding_slot: slot,
    }),
    qaIdentity,
    toolkitCurrent: ROOT,
  });
}

// ── Two independently created lanes get the same contract ────────────────────

test("two independently created lanes resolve the same baseline contract", () => {
  // THE HEADLINE CLAIM. Same contract version, same resolved shape, same
  // answers for everything that is not declared as an overlay.
  const a = makeLane("Lane A", WT_A);
  const b = makeLane("Lane B", WT_B);
  const ra = resolve(a);
  const rb = resolve(b);
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);
  assert.equal(ra.contract_version, rb.contract_version);
  assert.equal(ra.contract_version, LB.LANE_BOOTSTRAP_CONTRACT_VERSION);
  // Identical baseline SHAPE, and identical values everywhere that is not
  // lane-specific by construction.
  assert.deepEqual(Object.keys(ra.baseline).sort(), Object.keys(rb.baseline).sort());
  assert.equal(ra.baseline.provider.preferred, rb.baseline.provider.preferred);
  assert.equal(ra.baseline.work_class, rb.baseline.work_class);
  assert.equal(ra.baseline.instruction_pack.resolvable, rb.baseline.instruction_pack.resolvable);
  assert.equal(ra.baseline.development_slot.assigned, rb.baseline.development_slot.assigned);
  // And neither declares an overlay, because neither asked to differ.
  assert.deepEqual(ra.overlay, {});
  assert.deepEqual(rb.overlay, {});
});

test("a new lane is stamped with the current contract", () => {
  const a = makeLane("Stamped", WT_A);
  assert.equal(a.bootstrap?.contract_version, LB.LANE_BOOTSTRAP_CONTRACT_VERSION);
  assert.ok(a.bootstrap?.at);
  assert.equal(LB.laneBootstrapIsStale(a), false);
});

// ── An overlay changes only what it declares ─────────────────────────────────

test("an explicit overlay changes only its declared difference", () => {
  const plain = makeLane("Plain", WT_A);
  const overlaid = makeLane("Overlaid", WT_B, { preferred_provider: "cursor" });
  const rp = resolve(plain);
  const ro = resolve(overlaid);

  assert.deepEqual(ro.overlay, { preferred_provider: "cursor" }, "only the declared field is an overlay");
  assert.equal(ro.baseline.provider.preferred, "cursor");
  assert.equal(rp.baseline.provider.preferred, "claude");

  // EVERYTHING ELSE IS UNTOUCHED. This is the property that makes overlays safe:
  // declaring one difference must not quietly fork the rest of the baseline.
  // `lane_identity`, `worktree` and `instruction_pack` differ between ANY two
  // lanes — different ids, different paths — so they are lane-specific by
  // construction rather than by configuration. What must not move is everything
  // else, and for the instruction pack what must not move is whether it resolves.
  for (const key of Object.keys(rp.baseline)) {
    if (["provider", "lane_identity", "worktree", "instruction_pack"].includes(key)) continue;
    assert.deepEqual(ro.baseline[key], rp.baseline[key], `${key} must not move because provider was declared`);
  }
  assert.equal(
    ro.baseline.instruction_pack.resolvable,
    rp.baseline.instruction_pack.resolvable,
    "both lanes resolve an instruction pack; only its path is theirs",
  );
});

test("agreeing with the baseline is not an overlay", () => {
  // A lane that names "claude" has configured nothing; it has agreed. Reporting
  // that as an overlay would make every lane look customised and hide the ones
  // that actually are.
  const agreeing = makeLane("Agreeing", WT_A, { preferred_provider: "claude", work_class: "product" });
  assert.deepEqual(LB.laneBootstrapOverlay(agreeing), {});
});

test("the overlay surface is enumerated, not open", () => {
  // An overlay nobody wrote down becomes convention, and convention is what this
  // mission was called to remove. The list is the control.
  assert.ok(LB.LANE_OVERLAY_FIELDS.includes("preferred_provider"));
  assert.ok(LB.LANE_OVERLAY_FIELDS.includes("work_class"));
  assert.ok(!LB.LANE_OVERLAY_FIELDS.includes("binding"), "worktree binding is baseline, not overlay");
  assert.ok(!LB.LANE_OVERLAY_FIELDS.includes("status"), "lane status is not a configuration choice");
});

// ── Absent resources are not faults ──────────────────────────────────────────

test("a slotless lane is fully valid", () => {
  // Lanes may remain registered and dispatchable while slotless. The contract is
  // about what a lane RESOLVES, never about what it currently holds.
  const lane = makeLane("Slotless", WT_A);
  const r = resolve(lane, { slot: null });
  assert.equal(r.ok, true);
  assert.equal(r.baseline.development_slot.assigned, false);
  assert.equal(r.baseline.development_slot.slot, null);
  assert.equal(r.baseline.environment.resolvable, true, "no slot means no per-slot environment to resolve");
  assert.deepEqual(r.unresolved, [], "absence of a slot is not drift");
});

test("bootstrap implies no execution, no server, no browser", () => {
  const lane = makeLane("Quiet", WT_A);
  const r = resolve(lane);
  assert.equal(r.baseline.provider.execution_implied, false);
  // The contract has no concept of a running server or an open browser, which is
  // the point: resolving a baseline must not be a reason to start one.
  assert.ok(!("dev_server" in r.baseline));
  assert.ok(!("browser" in r.baseline));
});

test("bootstrap acquires nothing — no slot, no server, no provider, no browser", () => {
  // ASSERTED BY INJECTION, not by reading the source. Every canonical owner is
  // replaced with a recorder; a resolution that tried to allocate anything would
  // have to call something that is not on this list.
  const lane = makeLane("Untouched", WT_A);
  const calls = [];
  LB.resolveLaneBootstrap(lane.lane_id, {
    getLane: (id) => { calls.push(`getLane:${id}`); return lane; },
    resolveWorktree: (id) => {
      calls.push(`resolveWorktree:${id}`);
      return { ok: true, worktree_path: WT_A, branch: "agent/x", binding_slot: 4 };
    },
    qaIdentity: (s) => { calls.push(`qaIdentity:${s}`); return "qa@example.com"; },
    toolkitCurrent: ROOT,
  });
  assert.deepEqual(calls, [
    `getLane:${lane.lane_id}`,
    `resolveWorktree:${lane.lane_id}`,
    "qaIdentity:4",
  ], "resolution reads exactly three owners and allocates from none of them");
});

// ── Drift is observable, and nothing is mutated ──────────────────────────────

test("a lane initialised before the contract reads stale, not broken", () => {
  const legacy = makeLane("Legacy", WT_A);
  delete legacy.bootstrap;
  assert.equal(LB.laneBootstrapIsStale(legacy), true);
  const r = resolve(legacy);
  assert.equal(r.stale, true);
  assert.equal(r.observed_contract_version, null);
  // Stale on its own is NOT an unresolved baseline. Conflating them would report
  // the whole fleet as damaged on the day the contract ships.
  assert.deepEqual(r.unresolved, []);
});

test("a lane on a superseded contract version reads stale", () => {
  const old = makeLane("Old", WT_A);
  old.bootstrap = { contract_version: "vacilando.lane_bootstrap.v0", at: new Date().toISOString() };
  assert.equal(LB.laneBootstrapIsStale(old), true);
  assert.equal(resolve(old).stale, true);
});

test("an unresolvable baseline is reported with the owner's own refusal code", () => {
  // Restating the lifecycle owner's refusal in this module's words is how two
  // vocabularies for one fact begin, so the code is carried verbatim.
  const lane = makeLane("Broken", WT_A);
  const r = resolve(lane, { worktreeOk: false });
  assert.equal(r.baseline.worktree.resolvable, false);
  assert.equal(r.baseline.worktree.code, "lane_worktree_unregistered");
  assert.ok(r.unresolved.includes("worktree:lane_worktree_unregistered"));
});

test("a slot with no QA identity is unresolved, and says which part", () => {
  const lane = makeLane("NoIdentity", WT_A);
  const r = resolve(lane, { slot: 4, qaIdentity: () => null });
  assert.equal(r.baseline.environment.resolvable, false);
  assert.ok(r.unresolved.includes("environment:qa_identity_missing"));
});

test("the fleet inventory reports without mutating", () => {
  // DevOps 2 inherits this. It must be able to see every lane's drift without
  // this mission having changed any of them.
  const before = DL.listDurableLanes().map((l) => JSON.stringify(l));
  const inv = LB.inventoryLaneBootstrap({});
  assert.equal(inv.contract_version, LB.LANE_BOOTSTRAP_CONTRACT_VERSION);
  assert.ok(inv.lanes >= 2);
  assert.ok(Array.isArray(inv.rows));
  const after = DL.listDurableLanes().map((l) => JSON.stringify(l));
  assert.deepEqual(after, before, "an inventory that mutates is not an inventory");
});

test("a lane that cannot be resolved at all still appears in the inventory", () => {
  // Dropping it would make the fleet look healthier than it is, which is the one
  // way a drift report can actively mislead.
  const inv = LB.inventoryLaneBootstrap({
    lanes: [{ lane_id: "lane_ffffffffffff", name: "Exploding" }],
    resolve: () => { throw new Error("boom"); },
  });
  assert.equal(inv.lanes, 1);
  assert.equal(inv.stale, 1);
  assert.match(inv.rows[0].unresolved[0], /resolve_failed/);
});

// ── The diagnostic reports through the existing doctor ───────────────────────

const H = await import("../lib/vacilando/health.mjs");

test("the check lives in the existing health framework", () => {
  // Not a second doctor: same registry, same finding shape, same severities.
  assert.ok(H.CHECKS.includes("lane.bootstrap"));
  const f = H.checkLaneBootstrap({ inventory: LB.inventoryLaneBootstrap({}) });
  assert.equal(f.check, "lane.bootstrap");
  assert.ok(H.SEVERITIES.includes(f.severity));
  assert.equal(f.owner_resource, "vacilando.development_lane");
});

test("stale is a watch; unresolved is a problem", () => {
  const healthy = H.checkLaneBootstrap({
    inventory: { contract_version: "v1", rows: [{ lane_id: "l1", stale: false, unresolved: [], overlay: {} }] },
  });
  assert.equal(healthy.severity, "healthy");

  const stale = H.checkLaneBootstrap({
    inventory: { contract_version: "v1", rows: [{ lane_id: "l1", stale: true, unresolved: [], overlay: {} }] },
  });
  assert.equal(stale.severity, "watch", "a fleet that predates the contract is not a broken fleet");
  assert.equal(stale.suggested_action, null, "DevOps 2 owns the refresh decision, so this proposes nothing");

  const broken = H.checkLaneBootstrap({
    inventory: { contract_version: "v1", rows: [{ lane_id: "l1", stale: true, unresolved: ["worktree:missing"], overlay: {} }] },
  });
  assert.equal(broken.severity, "problem");
});

test("a missing inventory is incomplete, never silently healthy", () => {
  const f = H.checkLaneBootstrap({ inventory: null });
  assert.equal(f.incomplete, true);
  assert.notEqual(f.severity, "healthy");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
