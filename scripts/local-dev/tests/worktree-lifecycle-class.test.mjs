#!/usr/bin/env node
/**
 * Worktree lifecycle classification, retention and slot ownership.
 *
 * WHAT IS AND IS NOT UNDER TEST. Vacilando already owns worktree retirement: the
 * fourteen safety gates, the fleet observer, branch durability, the removal path
 * with re-measurement, the Host Steward cadence and the read-only preview. None
 * of that is re-implemented and none of it is re-tested here.
 *
 * What is tested is the layer this mission adds — a derived lifecycle class, a
 * retention window, explicit promotion-candidate protection, and the invariant
 * that one managed slot has at most one lane owner.
 *
 * THE CONTROL THAT EARNED ITS PLACE is "the evaluator's own field names". The
 * first cut of the classifier read `failed_gates`, which does not exist on the
 * record: the blocked set was always empty, every obstacle was invisible, and 21
 * of 31 live worktrees classified as RECLAIMABLE against a preview that said 13.
 * A classifier that silently sees no obstacles is the worst failure this module
 * can have, so the shape is now asserted rather than assumed.
 *
 * Isolated. No repository, worktree or lane store is touched.
 */
import assert from "node:assert/strict";

const L = await import("../lib/vacilando/worktree-lifecycle.mjs");
const H = await import("../lib/vacilando/health.mjs");
const R = await import("../lib/vacilando/worktree-retirement.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** An evaluation in the shape `observeRetirementCandidates` actually produces. */
function evaluation({
  name = "wt-example",
  branch = "agent/claude/1-thing",
  durability = "merged",
  blocked_by = [],
  unmeasured = [],
  state = "candidate",
  protected_branch = false,
  full_path = "/Users/x/Code/alloy-worktrees/wt-example",
} = {}) {
  return {
    schema_version: "vacilando.worktree_retirement.v1",
    path: name, full_path, branch, durability, state, blocked_by, unmeasured, protected_branch,
  };
}

const classify = (e, opts = {}) => L.classifyWorktreeLifecycle(e, opts);

// ── The shape contract, which a silent mismatch would defeat ─────────────────

test("the classifier reads the evaluator's real field names, including unmeasured", () => {
  // `blocked_by` AND `unmeasured` both block. The retirement subsystem's rule is
  // that a null gate does not pass, because a permissive unknown fails silently
  // and irreversibly — reading only `blocked_by` would reintroduce exactly that.
  assert.equal(classify(evaluation({ blocked_by: ["tree_clean_or_handled"] })).state, L.WORKTREE_LIFECYCLE.BLOCKED_DIRTY);
  assert.equal(classify(evaluation({ unmeasured: ["branch_durability_proven"] })).state, L.WORKTREE_LIFECYCLE.BLOCKED_UNDURABLE);
  // And a field name that does NOT exist must not accidentally clear obstacles.
  const wrong = { ...evaluation(), failed_gates: ["tree_clean_or_handled"] };
  assert.notEqual(classify(wrong).state, L.WORKTREE_LIFECYCLE.BLOCKED_DIRTY,
    "this asserts the old bug is impossible to reintroduce silently: failed_gates is not a real field");
});

// ── 1, 2. Active is retained; clean durable idle is reclaimable ──────────────

test("1 — an actively used worktree is ACTIVE and never reclaimable", () => {
  for (const gate of ["no_live_provider", "no_live_dev_server", "no_active_execution_run",
    "no_active_governed_action", "no_active_lane", "no_managed_slot_binding"]) {
    const r = classify(evaluation({ blocked_by: [gate] }));
    assert.equal(r.state, L.WORKTREE_LIFECYCLE.ACTIVE, `${gate} must mean ACTIVE`);
    assert.equal(r.reclaimable, false);
  }
});

test("2 — a clean, durable, idle worktree is RECLAIMABLE", () => {
  const r = classify(evaluation({ durability: "merged" }), { idleHours: 48 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.RECLAIMABLE);
  assert.equal(r.reclaimable, true);
  assert.equal(r.durable, true);
});

test("2b — the same worktree inside the retention window is PARKED, not reclaimable", () => {
  // The retirement evaluator has NO time dimension: without this, a branch
  // becomes removable the instant it merges, and the operator who merges at
  // 16:00 and comes back at 16:10 finds their checkout gone.
  const r = classify(evaluation({ durability: "merged" }), { idleHours: 1 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.PARKED);
  assert.equal(r.reclaimable, false);
  assert.equal(r.retain_until_hours, L.RETENTION_POLICY.park_hours);
});

// ── 3–6. Nothing unique, dirty, undurable or ambiguous is reclaimable ────────

test("3 — a dirty worktree refuses reclamation", () => {
  const r = classify(evaluation({ blocked_by: ["tree_clean_or_handled"] }), { idleHours: 9000 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.BLOCKED_DIRTY);
  assert.equal(r.reclaimable, false, "no amount of idleness makes dirty safe");
});

test("4 — untracked unique content refuses reclamation", () => {
  const r = classify(evaluation({ blocked_by: ["no_untracked_unreproducible"] }), { idleHours: 9000 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.BLOCKED_DIRTY);
  assert.equal(r.reclaimable, false);
});

test("5 — commits that exist only here refuse reclamation", () => {
  for (const durability of ["unique_local_commits", "unknown"]) {
    const r = classify(
      evaluation({ durability, blocked_by: ["branch_durability_proven", "unique_commits_recoverable"] }),
      { idleHours: 9000 },
    );
    assert.equal(r.state, L.WORKTREE_LIFECYCLE.BLOCKED_UNDURABLE);
    assert.equal(r.reclaimable, false);
    assert.equal(r.durable, false);
  }
});

test("5b — undurable is checked before dirty, because it is the unrecoverable one", () => {
  const r = classify(evaluation({
    durability: "unique_local_commits",
    blocked_by: ["tree_clean_or_handled", "branch_durability_proven"],
  }), { idleHours: 9000 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.BLOCKED_UNDURABLE);
});

test("6 — ambiguity and holds refuse reclamation", () => {
  assert.equal(classify(evaluation({ blocked_by: ["not_self_retirement"] })).state, L.WORKTREE_LIFECYCLE.BLOCKED_SHARED);
  assert.equal(classify(evaluation({ blocked_by: ["no_operator_hold"] })).state, L.WORKTREE_LIFECYCLE.BLOCKED_SHARED);
  assert.equal(classify(evaluation({ blocked_by: ["no_governance_exception"] })).state, L.WORKTREE_LIFECYCLE.BLOCKED_SHARED);
  assert.equal(classify(evaluation({ protected_branch: true, branch: "staging" })).state, L.WORKTREE_LIFECYCLE.PROTECTED_BRANCH);
});

// ── 7, 8. Promotion candidates ───────────────────────────────────────────────

test("7 — a promotion candidate awaiting landing is PROTECTED, explicitly", () => {
  // Today these survive only because branch durability happens to refuse them.
  // Protection that works by accident stops working the day the accident changes.
  const r = classify(evaluation({
    branch: "promote/devops-3-worktrees", durability: "pushed_not_merged",
  }), { idleHours: 9000 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.PROMOTION_PROTECTED);
  assert.equal(r.reclaimable, false);
  assert.equal(r.candidate.state, "awaiting_landing");
});

test("7b — a promotion worktree is recognised by path as well as by branch", () => {
  const r = classify(evaluation({
    branch: "some/other/name", durability: "pushed_not_merged",
    full_path: "/Users/x/Code/alloy-promotions/thing",
  }), { idleHours: 9000 });
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.PROMOTION_PROTECTED);
});

test("8 — a LANDED promotion candidate becomes reclaimable, and quickly", () => {
  // A promotion checkout whose candidate is in staging has no reason to exist.
  // 13 of the 31 live worktrees are exactly this.
  const landed = evaluation({ branch: "promote/old-thing", durability: "merged" });
  assert.equal(classify(landed, { idleHours: 3 }).state, L.WORKTREE_LIFECYCLE.RECLAIMABLE);
  // But still inside its own, much shorter, window.
  assert.equal(classify(landed, { idleHours: 0.5 }).state, L.WORKTREE_LIFECYCLE.PARKED);
  assert.ok(L.RETENTION_POLICY.promotion_park_hours < L.RETENTION_POLICY.park_hours);
});

test("8b — supersession is never inferred, only reported", () => {
  // From git alone a superseded candidate is indistinguishable from one still
  // waiting. Guessing is how an unlanded candidate gets deleted.
  const waiting = evaluation({ branch: "promote/x", durability: "pushed_not_merged" });
  assert.equal(classify(waiting, { idleHours: 9000 }).state, L.WORKTREE_LIFECYCLE.PROMOTION_PROTECTED);
  const superseded = classify(waiting, { idleHours: 9000, supersededBy: "promote/x-v2" });
  assert.equal(superseded.state, L.WORKTREE_LIFECYCLE.SUPERSEDED);
  assert.equal(superseded.reclaimable, true);
  assert.equal(superseded.superseded_by, "promote/x-v2");
});

test("8c — supersession still cannot override a blocking gate", () => {
  const r = classify(
    evaluation({ branch: "promote/x", durability: "unique_local_commits", blocked_by: ["branch_durability_proven"] }),
    { idleHours: 9000, supersededBy: "promote/x-v2" },
  );
  assert.equal(r.state, L.WORKTREE_LIFECYCLE.BLOCKED_UNDURABLE, "superseded is a retention hint, not a safety override");
});

// ── 13. Preview and execution share one evaluator ───────────────────────────

test("13 — the inventory classifies the same evaluations the executor re-measures", () => {
  // There is no separate preview arithmetic: the inventory consumes the exact
  // records the retirement subsystem produces, so a count shown to an operator
  // and the set a removal acts on cannot diverge.
  const evaluations = [
    evaluation({ name: "a", durability: "merged" }),
    evaluation({ name: "b", blocked_by: ["tree_clean_or_handled"] }),
    evaluation({ name: "c", branch: "promote/live", durability: "pushed_not_merged" }),
  ];
  const inv = L.inventoryWorktreeLifecycle({
    evaluations,
    idleHoursByWorktree: { a: 100, b: 100, c: 100 },
    diskSizes: { a: 512 },
  });
  assert.equal(inv.worktrees, 3);
  assert.equal(inv.by_state.RECLAIMABLE, 1);
  assert.equal(inv.by_state.BLOCKED_DIRTY, 1);
  assert.equal(inv.by_state.PROMOTION_PROTECTED, 1);
  assert.equal(inv.reclaimable, 1);
  assert.equal(inv.reclaimable_disk_mb, 512);
});

test("unknown disk is reported as unknown, never counted as zero", () => {
  // A total that silently treated unknown as zero would understate the estimate
  // and never say so.
  const inv = L.inventoryWorktreeLifecycle({
    evaluations: [evaluation({ name: "a", durability: "merged" }), evaluation({ name: "b", durability: "merged" })],
    idleHoursByWorktree: { a: 100, b: 100 },
    diskSizes: { a: 100 },
  });
  assert.equal(inv.reclaimable, 2);
  assert.equal(inv.reclaimable_disk_mb, 100);
  assert.equal(inv.reclaimable_disk_unknown, 1);
});

test("17 — classification is idempotent and reads nothing it can mutate", () => {
  const e = evaluation({ durability: "merged" });
  const before = JSON.stringify(e);
  const a = classify(e, { idleHours: 100 });
  const b = classify(e, { idleHours: 100 });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(e), before, "the evaluation must not be mutated by classifying it");
});

// ── 15, 16. The slot invariant ──────────────────────────────────────────────

test("15 — one managed slot with two lane owners is detected", () => {
  // The live defect: slot 8 claimed by Troubleshooting and Documentation & API.
  const out = L.detectSlotOwnershipConflicts({
    lanes: [
      { lane_id: "lane_1", name: "Troubleshooting", status: "ACTIVE", binding: { slot: 8, worktree_name: "troubleshooting" } },
      { lane_id: "lane_2", name: "Documentation & API", status: "ACTIVE", binding: { slot: 8, worktree_name: "documentation-api" } },
      { lane_id: "lane_3", name: "Other", status: "ACTIVE", binding: { slot: 3, worktree_name: "other" } },
    ],
    registrySlots: { 8: "documentation-api", 3: "other" },
  });
  assert.equal(out.conflicts.length, 1);
  const c = out.conflicts[0];
  assert.equal(c.slot, 8);
  assert.equal(c.registry_holder, "documentation-api");
  assert.equal(c.repairable, true);
  assert.deepEqual(c.stale_claims.map((x) => x.name), ["Troubleshooting"]);
});

test("16 — a conflict the registry does not arbitrate is NOT repairable", () => {
  // If the authority backs none of the claims, there is nothing to converge
  // toward, and picking one would be inventing an owner.
  const out = L.detectSlotOwnershipConflicts({
    lanes: [
      { lane_id: "a", name: "A", binding: { slot: 5, worktree_name: "wt-a" } },
      { lane_id: "b", name: "B", binding: { slot: 5, worktree_name: "wt-b" } },
    ],
    registrySlots: {},
  });
  assert.equal(out.conflicts[0].repairable, false);
  assert.deepEqual(out.conflicts[0].stale_claims, []);
});

test("15b — a slot with one owner, and a slotless lane, are both fine", () => {
  const out = L.detectSlotOwnershipConflicts({
    lanes: [
      { lane_id: "a", name: "A", binding: { slot: 4, worktree_name: "wt-a" } },
      { lane_id: "b", name: "B", binding: {} },
      { lane_id: "c", name: "C" },
    ],
    registrySlots: { 4: "wt-a" },
  });
  assert.equal(out.conflicts.length, 0);
  assert.equal(out.slots_claimed, 1);
});

// ── The health projection ───────────────────────────────────────────────────

test("the checks live in the existing health framework", () => {
  assert.ok(H.CHECKS.includes("worktrees.lifecycle"));
  assert.ok(H.CHECKS.includes("slots.ownership"));
  assert.equal(H.checkWorktreeLifecycle({ inventory: null }).incomplete, true);
  assert.equal(H.checkSlotOwnership({ conflicts: null }).incomplete, true);
});

test("undurable is a problem; reclaimable is not a fault", () => {
  const row = (state, extra = {}) => ({ name: "w", state, reclaimable: state === "RECLAIMABLE", ...extra });
  // Reclaimable worktrees are the system WORKING. Scoring them as a fault would
  // teach the operator to ignore the check.
  assert.equal(H.checkWorktreeLifecycle({ inventory: { rows: [row("RECLAIMABLE")], by_state: {} } }).severity, "healthy");
  // Commits that exist in one place, on one disk, are a real risk of losing work.
  assert.equal(H.checkWorktreeLifecycle({ inventory: { rows: [row("BLOCKED_UNDURABLE")], by_state: {} } }).severity, "problem");
});

test("a duplicate slot claim is always a problem", () => {
  assert.equal(H.checkSlotOwnership({ conflicts: { slots_claimed: 3, conflicts: [] } }).severity, "healthy");
  const bad = H.checkSlotOwnership({
    conflicts: { slots_claimed: 3, conflicts: [{ slot: 8, claimants: [{ name: "A" }, { name: "B" }], registry_holder: "wt-b", repairable: true, stale_claims: [{ name: "A" }] }] },
  });
  assert.equal(bad.severity, "problem");
  assert.match(bad.evidence[0], /slot 8/);
  assert.match(bad.suggested_action, /reconcileLaneSlotBinding/);
});

// ── 14. Nothing here can destroy anything ───────────────────────────────────

test("14 — this module contains no removal path and no git mutation", () => {
  // The classifier is a pure function over records. Removal stays with the
  // existing trusted-host retirement executor, which re-measures every gate.
  const src = Object.values(L).filter((v) => typeof v === "function").map((f) => f.toString()).join("\n");
  for (const verb of ["rm -rf", "reset --hard", "clean -fd", "worktree remove", "--force", "unlinkSync", "rmSync"]) {
    assert.ok(!src.includes(verb), `the lifecycle classifier must never contain ${verb}`);
  }
});

test("durability vocabulary comes from the retirement owner, not a copy", () => {
  // Two definitions of "durable" is how a worktree gets removed for satisfying
  // one of them.
  assert.ok(R.DURABLE_STATES.includes("merged"));
  assert.equal(classify(evaluation({ durability: "pushed_not_merged" }), { idleHours: 100 }).durable, true);
  assert.equal(classify(evaluation({ durability: "unique_local_commits" }), { idleHours: 100 }).durable, false);
});

// ── 16b, 10, 11. Convergence through the canonical authority ────────────────

const { mkdtempSync, mkdirSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const STORE_ROOT = mkdtempSync(join(tmpdir(), "vac-wtl-"));
process.env.ALLOY_RUNTIME_ROOT = join(STORE_ROOT, "gateway");
mkdirSync(join(STORE_ROOT, "gateway", "vacilando"), { recursive: true });
const DL = await import("../lib/vacilando/development-lane.mjs");
const LWL = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");

test("16b — a stale slot claim is cleared by the canonical reconciler, and only that", () => {
  // THE LIVE DEFECT. Troubleshooting's lane record claimed slot 8 while the
  // registry gave slot 8 to documentation-api and Troubleshooting's own
  // registration carried no slot line at all. The claim was a cached copy of a
  // binding it no longer held, and the reconciler previously REFUSED — it could
  // converge a lane onto a slot the registry declares, but had nothing to say
  // when the registry declares none.
  const wt = join(STORE_ROOT, "wt-stale");
  mkdirSync(wt, { recursive: true });
  const made = DL.createDurableLane({ name: "Stale Claim", binding: { worktree_path: wt, worktree_name: "wt-stale" } });
  assert.equal(made.ok, true, made.error);
  const laneId = made.lane.lane_id;

  // Give it a slot the registry will not back.
  DL.bindDurableLane(laneId, { worktree_path: wt, worktree_name: "wt-stale", slot: 8, port: 3018 });
  assert.equal(DL.getDurableLane(laneId).binding.slot, 8);

  const out = LWL.reconcileLaneSlotBinding(laneId, {
    // The metadata registry, in its real shape: an ARRAY of records keyed by
    // `worktree`. This one knows the worktree and gives it no slot — exactly
    // troubleshooting.env, which carries a name and a path and no slot line.
    metadata: [{ worktree: "wt-stale", path: wt, slot: null, branch_expected: null }],
  });

  assert.equal(out.ok, true, out.error);
  assert.equal(out.changed, true);
  assert.equal(out.cleared_stale_slot, 8);
  assert.equal(out.slot, null);

  const after = DL.getDurableLane(laneId);
  assert.equal(after.binding.slot, null, "the stale claim is gone");
  // 10 & 11 — THE LANE SURVIVES. A lane is not its slot and not its worktree.
  assert.equal(after.status, "ACTIVE", "clearing a slot must never close the lane");
  assert.equal(after.lane_id, laneId);
  assert.equal(after.binding.worktree_path, wt, "the worktree binding is untouched");
  assert.equal(after.name, "Stale Claim");
});

test("16c — the reconciler refuses every unresolvable state that is NOT a stale claim", () => {
  // Clearing a binding on an unknown is how a lane loses a slot it really holds,
  // so the repair is deliberately the narrowest possible one.
  const out = LWL.reconcileLaneSlotBinding("lane_ffffffffffff", {});
  assert.equal(out.ok, false);
  assert.ok(out.error, "an unknown lane is refused, not repaired");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
