/**
 * Retention must never delete a question the operator has not answered.
 *
 * Section 16 asks for the pending-approval backlog to be migrated when policy
 * changes. That is only possible if the backlog still exists. The store kept
 * the newest 200 records unconditionally, so an approval still awaiting the
 * Director could be evicted by 200 unrelated requests arriving after it — and
 * a pending card that vanishes looks exactly like one that was resolved.
 */
import test from "node:test";
import assert from "node:assert/strict";

const G = await import("../lib/vacilando/governed-action-request.mjs");

const rec = (i, status) => ({ request_id: `gar_${String(i).padStart(4, "0")}`, status });
const settled = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => rec(from + i, i % 2 ? "complete" : "failed"));

test("under the cap nothing is dropped", () => {
  const rows = settled(10);
  assert.equal(G.retainGovernedRequests(rows, 200).length, 10);
});

test("settled records are trimmed oldest-first", () => {
  const out = G.retainGovernedRequests(settled(250), 200);
  assert.equal(out.length, 200);
  // The newest survive; the oldest 50 are gone.
  assert.equal(out.at(-1).request_id, "gar_0249");
  assert.equal(out[0].request_id, "gar_0050");
});

test("an unanswered request is never evicted by newer settled ones", () => {
  const pending = { request_id: "gar_pending", status: "awaiting_operator" };
  const rows = [pending, ...settled(400)];
  const out = G.retainGovernedRequests(rows, 200);
  assert.ok(out.some((r) => r.request_id === "gar_pending"),
    "the oldest record in the store is the one still awaiting a decision");
  assert.equal(out.length, 200);
});

test("every unsettled status survives, not just awaiting_operator", () => {
  const live = ["requested", "awaiting_director", "awaiting_operator", "executing"]
    .map((s, i) => ({ request_id: `gar_live_${i}`, status: s }));
  const out = G.retainGovernedRequests([...live, ...settled(400)], 200);
  for (const r of live) {
    assert.ok(out.some((x) => x.request_id === r.request_id), `${r.status} was evicted`);
  }
});

test("a backlog larger than the cap is kept whole rather than forgotten", () => {
  // An unbounded backlog is a problem to show the operator, never one to fix
  // by silently dropping the oldest half of it.
  const backlog = Array.from({ length: 260 }, (_, i) => ({
    request_id: `gar_b${i}`, status: "awaiting_operator",
  }));
  const out = G.retainGovernedRequests([...backlog, ...settled(50, 900)], 200);
  assert.equal(out.filter((r) => r.status === "awaiting_operator").length, 260);
  assert.equal(out.filter((r) => G.SETTLED_GOVERNED_STATUSES.includes(r.status)).length, 0,
    "settled records give way to unsettled ones, not the other way round");
});

test("settled vocabulary is exactly complete and failed", () => {
  assert.deepEqual([...G.SETTLED_GOVERNED_STATUSES].sort(), ["complete", "failed"]);
  // Anything else in the vocabulary is a state the operator may still be in.
  for (const s of G.GOVERNED_STATUSES) {
    if (G.SETTLED_GOVERNED_STATUSES.includes(s)) continue;
    const out = G.retainGovernedRequests([{ request_id: "gar_x", status: s }, ...settled(400)], 200);
    assert.ok(out.some((r) => r.request_id === "gar_x"), `${s} must survive retention`);
  }
});
