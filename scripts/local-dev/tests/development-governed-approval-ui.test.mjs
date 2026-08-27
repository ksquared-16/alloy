#!/usr/bin/env node
/**
 * The operator's governed-approval control.
 *
 * REPRODUCED LIVE BEFORE ANY CODE CHANGED. With a real pending governed action
 * on the Vacilando lane, an authenticated browser watched that lane for SIXTY
 * SECONDS: posture stayed RUNNING and no Approve or Deny control ever appeared.
 *
 * WHY, EXACTLY. Everything existed except the connection. The approve/deny APIs
 * worked, the request projected onto the lane, the markup existed in
 * renderOperatorDecisionActions, and gateway.js carried a click handler. But
 * the surface was gated on the RUN: it required runState WAITING_RESOURCE, a
 * governed wait carried on the run, and status awaiting_operator — and a
 * request filed through `vac governed-action` sets NONE of them. The run stays
 * EXECUTING with resource_wait null, so the operator was told approval was
 * required and given nothing to press.
 *
 * A pending approval is a fact about the LANE, not about what the run happens
 * to be doing. That is what these fixtures hold.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const V = await import("../apps/vacilando/public/gateway-view.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** The exact live shape that rendered nothing for sixty seconds. */
const LIVE_SHAPE = {
  lane_id: "lane_db3431e755a8",
  name: "Vacilando",
  execution_run: { run_id: "erun_e371d25985ba5731", state: "EXECUTING", resource_wait: null },
  governed_action: {
    request_id: "gar_8934d2967989e8",
    status: "requested",
    operator_approval_required: true,
    action_key: "promotion.open_pr",
    target: "staging",
    title: "Open a staging pull request for agent/cursor/5-memory-fallback-removal",
    reason_worker_cannot_execute: "A managed worker cannot open a pull request: GitHub write is held by the trusted host.",
    purpose: "Promotion changes the shared runtime that every lane resolves through.",
    inputs: {
      repository: "ksquared-16/alloy", base: "staging",
      headBranch: "agent/cursor/5-memory-fallback-removal",
      expectedHeadSha: "43eabdeb2c0f1e9a7b",
    },
  },
};

await test("1 — the live shape that failed now renders an approval control", () => {
  const html = V.renderLaneRuntimeControls(LIVE_SHAPE);
  assert.match(html, /data-gw-governed-approve/);
  assert.match(html, /data-gw-governed-deny/);
  assert.match(html, /data-request-id="gar_8934d2967989e8"/);
  // The run is EXECUTING with no resource_wait — the state that used to suppress it.
  assert.equal(LIVE_SHAPE.execution_run.state, "EXECUTING");
  assert.equal(LIVE_SHAPE.execution_run.resource_wait, null);
});

await test("2 — approval is gated on the LANE, not on the run's wait state", () => {
  for (const runState of ["EXECUTING", "QUEUED", "WAITING_RESOURCE", "VALIDATING", "NEEDS_INPUT"]) {
    const lane = { ...LIVE_SHAPE, execution_run: { ...LIVE_SHAPE.execution_run, state: runState } };
    assert.match(V.renderLaneRuntimeControls(lane), /data-gw-governed-approve/, runState);
  }
  // And with no run at all.
  const noRun = { ...LIVE_SHAPE, execution_run: null };
  assert.match(V.renderLaneRuntimeControls(noRun), /data-gw-governed-approve/);
});

await test("3 — both pending states surface, because a request spends its first seconds in `requested`", () => {
  for (const status of ["requested", "awaiting_director", "awaiting_operator"]) {
    const lane = { ...LIVE_SHAPE, governed_action: { ...LIVE_SHAPE.governed_action, status } };
    assert.ok(V.laneAwaitingOperatorApproval(lane), status);
  }
});

await test("4 — nothing renders once the decision is made", () => {
  for (const done of [
    { status: "complete", operator_approval: { decision: "approved" } },
    { status: "failed" },
    { status: "requested", operator_approval_required: false },
    { status: "awaiting_operator", operator_approval: { decision: "approved" } },
  ]) {
    const lane = { ...LIVE_SHAPE, governed_action: { ...LIVE_SHAPE.governed_action, ...done } };
    const html = V.renderLaneRuntimeControls(lane);
    assert.equal(/data-gw-governed-approve/.test(html), false, JSON.stringify(done));
  }
  assert.equal(V.laneAwaitingOperatorApproval({ lane_id: "l" }), null, "no governed action at all");
});

await test("5 — the card answers what an operator needs before deciding", () => {
  const html = V.renderLaneRuntimeControls(LIVE_SHAPE);
  assert.match(html, /Approval required/);
  assert.match(html, /Open a staging pull request/);
  assert.match(html, /ksquared-16\/alloy/, "repository");
  assert.match(html, /staging/, "environment");
  assert.match(html, /43eabdeb2c0f/, "commit, truncated");
  assert.match(html, /Why approval is required/);
  assert.match(html, /Effect/);
});

await test("6 — the request id is present but SECONDARY, never the operator's concept", () => {
  const html = V.renderLaneRuntimeControls(LIVE_SHAPE);
  // Present for support.
  assert.match(html, /gw-approval-ref/);
  // But the headline is the human action, not the id.
  const title = html.match(/class="gw-approval-title">([^<]+)</)?.[1] || "";
  assert.equal(/^gar_/.test(title), false);
  assert.match(title, /pull request/i);
});

await test("7 — stale protection: the card carries the identity the SERVER issued", async () => {
  const G = await import("../lib/vacilando/governed-action-request.mjs");
  // The fingerprint is the server's, not the client's — a value the client
  // computed would only prove the client agreed with itself.
  const rec = {
    request_id: "gar_8934d2967989e8", action_key: "promotion.open_pr", target: "staging",
    status: "awaiting_operator", operator_approval_required: true,
    inputs: LIVE_SHAPE.governed_action.inputs,
  };
  const fp = G.governedContentFingerprint(rec);
  assert.ok(fp && fp.length > 0);
  const lane = { ...LIVE_SHAPE, governed_action: { ...LIVE_SHAPE.governed_action, content_fingerprint: fp } };
  assert.match(V.renderLaneRuntimeControls(lane), new RegExp(`data-content-fingerprint="${fp}"`));
  // A moved commit yields a different identity, so the old card is detectable.
  const moved = G.governedContentFingerprint({ ...rec, inputs: { ...rec.inputs, expectedHeadSha: "0000000000000000" } });
  assert.notEqual(fp, moved);
  // With no fingerprint issued, the card renders empty rather than inventing one.
  assert.match(V.renderLaneRuntimeControls(LIVE_SHAPE), /data-content-fingerprint=""/);
});

await test("8 — the controls are not hidden behind a disclosure or an overflow", () => {
  const html = V.renderLaneRuntimeControls(LIVE_SHAPE);
  assert.equal(/<details/.test(html), false, "not inside a details disclosure");
  assert.equal(/hidden|aria-hidden="true"/.test(html), false);
  // Both buttons are siblings in one visible action row.
  assert.match(html, /gw-approval-actions[\s\S]*data-gw-governed-approve[\s\S]*data-gw-governed-deny/);
});

await test("9 — the handler's selector and the markup's attribute are the same string", () => {
  // The original defect class: a handler looking for an attribute nothing
  // emitted. These must not drift apart again.
  const client = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  assert.match(client, /\[data-gw-governed-approve\]/, "handler selector");
  assert.match(client, /\[data-gw-governed-deny\]/);
  const html = V.renderLaneRuntimeControls(LIVE_SHAPE);
  assert.match(html, /data-gw-governed-approve/, "markup attribute");
  assert.match(html, /data-gw-governed-deny/);
});

// ── Server-side stale-content enforcement ────────────────────────────────────

await test("10 — the fingerprint binds CONTENT, not the request id", async () => {
  const G = await import("../lib/vacilando/governed-action-request.mjs");
  const base = {
    request_id: "gar_same", action_key: "promotion.open_pr", target: "staging",
    inputs: { repository: "ksquared-16/alloy", headBranch: "b", expectedHeadSha: "ABC123DEF" },
  };
  // Same id, moved commit — the whole point.
  const moved = { ...base, inputs: { ...base.inputs, expectedHeadSha: "999999999" } };
  assert.notEqual(G.governedContentFingerprint(base), G.governedContentFingerprint(moved));
  // Case and order must not manufacture a difference.
  assert.equal(G.governedContentFingerprint(base), G.governedContentFingerprint({ ...base, inputs: { ...base.inputs, expectedHeadSha: "abc123def" } }));
  const m1 = { ...base, inputs: { ...base.inputs, migrations: ["b.sql", "a.sql"] } };
  const m2 = { ...base, inputs: { ...base.inputs, migrations: ["a.sql", "b.sql"] } };
  assert.equal(G.governedContentFingerprint(m1), G.governedContentFingerprint(m2), "order-independent");
  // Environment is normalised, so aliases do not read as different content.
  assert.equal(G.governedContentFingerprint({ ...base, target: "STAGING " }), G.governedContentFingerprint(base));
});

await test("11 — a stale decision is REFUSED server-side, and returns the current request", async () => {
  const G = await import("../lib/vacilando/governed-action-request.mjs");
  const rec = {
    request_id: "gar_x", action_key: "promotion.open_pr", target: "staging", status: "awaiting_operator",
    inputs: { repository: "r", headBranch: "b", expectedHeadSha: "NEW" },
  };
  const oldCard = G.governedContentFingerprint({ ...rec, inputs: { ...rec.inputs, expectedHeadSha: "OLD" } });
  const refusal = G.rejectStaleDecision(rec, oldCard);
  assert.ok(refusal, "a moved commit is refused");
  assert.equal(refusal.error, "stale_content");
  assert.equal(refusal.ok, false);
  assert.equal(refusal.presented_fingerprint, oldCard);
  assert.equal(refusal.current_fingerprint, G.governedContentFingerprint(rec));
  // The operator gets the CURRENT request back so the card can redraw truthfully.
  assert.equal(refusal.request.request_id, "gar_x");
  // A matching card passes, and an absent fingerprint does not gate legacy callers.
  assert.equal(G.rejectStaleDecision(rec, G.governedContentFingerprint(rec)), null);
  assert.equal(G.rejectStaleDecision(rec, null), null);
});

await test("12 — both approve AND deny enforce it", async () => {
  const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
  const approve = src.slice(src.indexOf("export async function approveGovernedAction"), src.indexOf("export async function approveGovernedAction") + 1200);
  const deny = src.slice(src.indexOf("export function denyGovernedAction"), src.indexOf("export function denyGovernedAction") + 1200);
  assert.match(approve, /rejectStaleDecision\(rec, expectedFingerprint\)/);
  assert.match(deny, /rejectStaleDecision\(rec, expectedFingerprint\)/, "denying content the operator never read is still a wrong decision");
});

await test("13 — the card renders the SERVER's fingerprint, never one the client invented", () => {
  const lane = { ...LIVE_SHAPE, governed_action: { ...LIVE_SHAPE.governed_action, content_fingerprint: "server-fp-abc" } };
  assert.match(V.renderLaneRuntimeControls(lane), /data-content-fingerprint="server-fp-abc"/);
  const viewSrc = readFileSync(new URL("../apps/vacilando/public/gateway-view.mjs", import.meta.url), "utf8");
  assert.match(viewSrc, /ga\?\.content_fingerprint/);
  // And the client hands it back.
  const client = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  assert.match(client, /content_fingerprint: btn\.getAttribute\("data-content-fingerprint"\)/);
});

// ── Governed dependency integration ──────────────────────────────────────────

await test("14 — a dependency in WAITING_APPROVAL uses the SAME card", () => {
  const lane = {
    lane_id: "l", name: "Health & Safety",
    execution_run: { run_id: "r", state: "WAITING_RESOURCE", resource_wait: { reason: "needs_operator_input" } },
    governed_dependency: {
      dependency_id: "gdep_1", dependency_state: "WAITING_APPROVAL",
      governed_action_id: "gar_dep", governed_action_key: "database.apply_migration",
      target_environment: "development_certification", requested_capability: "apply migrations",
      content_fingerprint: "fp-dep",
      action_inputs: { repository: "ksquared-16/alloy", migrations: ["a.sql", "b.sql", "c.sql"] },
    },
  };
  const html = V.renderLaneRuntimeControls(lane);
  assert.match(html, /data-gw-governed-approve/);
  assert.match(html, /data-request-id="gar_dep"/);
  assert.match(html, /data-content-fingerprint="fp-dep"/);
  assert.match(html, /development_certification/);
  assert.match(html, /3 file/, "the migration set is shown, not hidden behind the id");
  // One component, not two.
  assert.equal((html.match(/data-gw-governed-approve/g) || []).length, 1);
});

await test("15 — only WAITING_APPROVAL surfaces; other dependency states do not", () => {
  const mk = (state) => ({
    lane_id: "l",
    governed_dependency: { dependency_id: "d", dependency_state: state, governed_action_id: "gar_d", governed_action_key: "database.apply_migration" },
  });
  assert.ok(V.laneAwaitingOperatorApproval(mk("WAITING_APPROVAL")));
  for (const s of ["DECLARED", "READY_TO_ROUTE", "WAITING_EXECUTOR", "WAITING_CAPACITY", "EXECUTING", "VERIFYING", "SATISFIED", "FAILED"]) {
    assert.equal(V.laneAwaitingOperatorApproval(mk(s)), null, s);
  }
});

// ── Discoverability ──────────────────────────────────────────────────────────

await test("16 — the lane LIST shows approval required, from the same answer", () => {
  const p = V.deriveLaneExecutionPosture(LIVE_SHAPE);
  assert.equal(p.state, "NEEDS_APPROVAL");
  assert.equal(p.label, "Needs approval");
  assert.equal(p.tone, "needs");
  assert.match(p.headline, /Needs approval ·/);
  // The list badge and the card cannot disagree, because both come from here.
  assert.match(V.renderLaneRuntimeControls(LIVE_SHAPE), /data-gw-governed-approve/);
  // And it clears the moment a decision exists.
  const decided = { ...LIVE_SHAPE, governed_action: { ...LIVE_SHAPE.governed_action, operator_approval: { decision: "approved" } } };
  assert.notEqual(V.deriveLaneExecutionPosture(decided).state, "NEEDS_APPROVAL");
});

await test("17 — discoverability holds for a dependency too", () => {
  const lane = {
    lane_id: "l",
    governed_dependency: { dependency_id: "d", dependency_state: "WAITING_APPROVAL", governed_action_id: "gar_d", governed_action_key: "database.apply_migration", target_environment: "development_certification" },
  };
  assert.equal(V.deriveLaneExecutionPosture(lane).state, "NEEDS_APPROVAL");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
