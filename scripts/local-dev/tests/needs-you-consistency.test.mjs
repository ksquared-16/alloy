/**
 * Needs You: one collection, one revision, four surfaces.
 *
 * THE DEFECT. Four surfaces answered "how much needs you" from three places:
 * rows from the governed-action projection, badge from the notification store's
 * counts.actionable, and paintNav from
 *
 *     Number(G.attentionCount) || (G.home?.approvals?.length || 0)
 *
 * where a genuine loaded ZERO is falsy — so an authoritative empty state fell
 * back to a stale snapshot from a different collection. The surfaces were not
 * slow to converge; they were reading different things, and one of them could
 * not tell "no items" from "no data".
 *
 * Every case below is a deterministic fixture. NO governed request is filed.
 */
import test from "node:test";
import assert from "node:assert/strict";

const V = await import("../apps/vacilando/public/gateway-view.mjs");

const approval = (id, status = "awaiting_operator") => ({
  request_id: id, status, action_key: "repository.push", title: `Push ${id}`,
});

/** The four surfaces, each read the way the app reads them. */
function surfaces(vm) {
  const bar = V.renderPendingApprovalsBar(vm.items);
  const headingMatch = bar.match(/gw-approvals-badge">(\d+)</);
  const rowMatch = bar.match(/data-count="(\d+)"/);
  return {
    badge: V.needsYouCount(vm),
    control: V.needsYouCount(vm),
    heading: headingMatch ? Number(headingMatch[1]) : 0,
    rows: rowMatch ? Number(rowMatch[1]) : 0,
  };
}

const agree = (vm, n) => {
  const s = surfaces(vm);
  assert.deepEqual(s, { badge: n, control: n, heading: n, rows: n },
    `all four surfaces must read ${n}, got ${JSON.stringify(s)}`);
  assert.equal(vm.count, vm.items.length, "count IS items.length");
};

/* ── the transition matrix ───────────────────────────────────────────────── */

test("LOADED EMPTY — all four are zero, authoritatively", () => {
  agree(V.buildNeedsYouViewModel({ approvals: [], revision: 1 }), 0);
});

test("FIRST ACTIONABLE ARRIVES", () => {
  agree(V.buildNeedsYouViewModel({ approvals: [approval("gar_1")], revision: 2 }), 1);
});

test("SECOND ACTIONABLE ARRIVES", () => {
  agree(V.buildNeedsYouViewModel({ approvals: [approval("gar_1"), approval("gar_2")], revision: 3 }), 2);
});

test("ONE RESOLVES", () => {
  agree(V.buildNeedsYouViewModel({ approvals: [approval("gar_2")], revision: 4 }), 1);
});

test("LAST RESOLVES", () => {
  agree(V.buildNeedsYouViewModel({ approvals: [], revision: 5 }), 0);
});

test("RELOAD WITH EMPTY CANONICAL SET", () => {
  agree(V.buildNeedsYouViewModel({ approvals: [], revision: 6, loaded: true }), 0);
});

/* ── the properties the matrix alone would not catch ─────────────────────── */

test("loaded-empty never falls back to a stale snapshot", () => {
  // The original bug in one assertion: zero is falsy, and the old nav read
  // `Number(count) || fallback`. A loaded zero must stay zero.
  const vm = V.buildNeedsYouViewModel({ approvals: [], revision: 7 });
  assert.equal(vm.loaded, true);
  assert.equal(V.needsYouCount(vm), 0);
  assert.equal(Number(vm.count) || 99, 99, "count is genuinely falsy-zero — the guard must not use ||");
});

test("NOT loaded is distinct from loaded-empty", () => {
  const notLoaded = V.buildNeedsYouViewModel({ approvals: null, revision: 8 });
  assert.equal(notLoaded.loaded, false);
  assert.equal(notLoaded.count, 0);
  // Both render zero, but only one of them is an answer. The flag is what lets
  // a failed fetch avoid presenting itself as an authoritative empty state.
  assert.notEqual(notLoaded.loaded, V.buildNeedsYouViewModel({ approvals: [], revision: 9 }).loaded);
});

test("terminal and non-actionable states never enter the collection", () => {
  const vm = V.buildNeedsYouViewModel({
    approvals: [
      approval("gar_done", "complete"), approval("gar_failed", "failed"),
      approval("gar_exec", "executing"), approval("gar_req", "requested"),
      approval("gar_live", "awaiting_operator"),
    ],
    revision: 10,
  });
  agree(vm, 1);
  assert.deepEqual(vm.items.map((i) => i.request_id), ["gar_live"]);
});

test("a resolved item cannot resurrect", () => {
  const live = V.buildNeedsYouViewModel({ approvals: [approval("gar_1")], revision: 11 });
  agree(live, 1);
  const resolved = V.buildNeedsYouViewModel({ approvals: [approval("gar_1", "complete")], revision: 12 });
  agree(resolved, 0);
});

test("duplicate source events do not duplicate rows", () => {
  const vm = V.buildNeedsYouViewModel({
    approvals: [approval("gar_1"), approval("gar_1"), approval("gar_1")], revision: 13,
  });
  agree(vm, 1);
});

test("every actionable status in the whitelist counts, and only those", () => {
  for (const status of V.OPERATOR_ACTIONABLE_STATUSES) {
    agree(V.buildNeedsYouViewModel({ approvals: [approval("gar_x", status)], revision: 14 }), 1);
  }
  for (const status of ["complete", "failed", "requested", "executing", "awaiting_director", ""]) {
    agree(V.buildNeedsYouViewModel({ approvals: [approval("gar_x", status)], revision: 15 }), 0);
  }
});

test("opening or closing the panel changes nothing — the VM is the only state", () => {
  const vm = V.buildNeedsYouViewModel({ approvals: [approval("gar_1"), approval("gar_2")], revision: 16 });
  const before = surfaces(vm);
  // Rendering the panel twice is what open/close does; membership is a property
  // of the committed revision, not of whether anything is on screen.
  V.renderPendingApprovalsBar(vm.items);
  V.renderPendingApprovalsBar(vm.items);
  assert.deepEqual(surfaces(vm), before);
  assert.equal(vm.count, 2);
});

test("count and items cannot drift, whatever the input", () => {
  for (const n of [0, 1, 2, 5, 17]) {
    const vm = V.buildNeedsYouViewModel({
      approvals: Array.from({ length: n }, (_, i) => approval(`gar_${i}`)), revision: 20 + n,
    });
    assert.equal(vm.count, vm.items.length);
    agree(vm, n);
  }
});
