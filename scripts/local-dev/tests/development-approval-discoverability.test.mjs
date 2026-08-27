/**
 * Approval discoverability.
 *
 * The operator was told "approve gar_4dc7b4d8bcd0e0" and could not find
 * anything in Vacilando carrying that string. These fixtures hold the line that
 * an approval is named by the WORK, that it is reachable without knowing which
 * lane raised it, and that the request id is never the operator's concept.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const G = await import("../lib/vacilando/governed-action-request.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");

const MERGE = {
  request_id: "gar_4dc7b4d8bcd0e0",
  action_key: "repository.merge_pull_request",
  target: "staging",
  status: "awaiting_operator",
  purpose: "Installs the governed Approve / Deny operator UI.",
  inputs: {
    repository: "ksquared-16/alloy",
    pullRequestNumber: 563,
    expectedHeadSha: "d40f469b4b6a12f69db1c75c20a8d52c6a0a3c16",
    workTitle: "Governed Approval UI",
  },
};

await test("1 — the label names the work, exactly as the operator asked", () => {
  assert.equal(G.operatorLabel(MERGE), "Merge Governed Approval UI — PR #563");
});

await test("2 — every registered action type gets words, never an identifier", () => {
  const cases = [
    ["repository.merge_pull_request", { pullRequestNumber: 563 }],
    ["repository.push", { branch: "agent/cursor/5-x" }],
    ["promotion.open_pr", { headBranch: "agent/cursor/5-x", base: "staging" }],
    ["database.apply_migration", { migrations: ["a.sql", "b.sql"] }],
    ["database.read_census", {}],
    ["environment.provision_qa_identity", { laneId: "lane_db3431e755a8" }],
    ["environment.assign_qa_identity_access", { laneId: "lane_db3431e755a8" }],
    ["environment.restore_qa_session", { laneId: "lane_db3431e755a8" }],
  ];
  for (const [action_key, inputs] of cases) {
    const label = G.operatorLabel({ action_key, target: "staging", inputs });
    assert.ok(label && label.length > 3, `${action_key} produced no label`);
    assert.ok(!/^gar_/.test(label), `${action_key} fell back to an id`);
    assert.ok(!label.includes("_"), `${action_key} leaked a raw action key: ${label}`);
  }
  // Even an unregistered key gets words rather than an identifier.
  assert.equal(G.operatorLabel({ action_key: "some.new_action", inputs: {} }), "some new action");
});

await test("3 — a migration label never names the wrong work", () => {
  // This read "Apply Access & Identity staging migrations" for EVERY caller.
  const label = G.operatorLabel({
    action_key: "database.apply_migration", target: "staging",
    inputs: { migrations: ["a.sql", "b.sql", "c.sql"] },
  });
  assert.ok(!/Access & Identity/.test(label), label);
  assert.equal(label, "Apply 3 staging migrations");
});

await test("4 — the card leads with the work and demotes the id", () => {
  const card = G.operatorApprovalCard(MERGE);
  assert.equal(card.label, "Merge Governed Approval UI — PR #563");
  assert.equal(card.decision, "Approval required");
  assert.equal(card.reason, "Installs the governed Approve / Deny operator UI.");
  assert.deepEqual(card.context.map((c) => c.label), ["Action", "Commit", "Repository"]);
  assert.equal(card.context[0].value, "Merge to staging");
  assert.match(card.request_id_debug, /^Request gar_/);
});

await test("5 — the rendered card puts the NAME above the id, visually and in order", () => {
  const html = V.renderLaneApprovalCard({}, { ...MERGE, ...G.publicGovernedAction(MERGE) });
  const name = html.indexOf("Merge Governed Approval UI — PR #563");
  const id = html.indexOf("Request gar_4dc7b4d8bcd0e0");
  assert.ok(name > -1, "the work is not named at all");
  assert.ok(id > name, "the id must come after the name");
  assert.match(html, /class="gw-approval-title"/);
  assert.match(html, /class="gw-approval-ref"/);
});

await test("6 — the lane list says what is being approved, not just that something is", () => {
  const lane = { lane_id: "lane_db3431e755a8", governed_action: G.publicGovernedAction(MERGE) };
  const posture = V.deriveLaneExecutionPosture(lane);
  assert.equal(posture.state, "NEEDS_APPROVAL");
  assert.equal(posture.headline, "Needs approval — Merge Governed Approval UI — PR #563");
  assert.ok(!posture.headline.includes("gar_"), "the list must not show an id");
});

await test("7 — pending approvals are reachable WITHOUT knowing a lane", () => {
  const bar = V.renderPendingApprovalsBar([G.publicGovernedAction(MERGE)]);
  assert.match(bar, /data-gw-approvals/);
  assert.match(bar, /Merge Governed Approval UI — PR #563/);
  assert.match(bar, /data-gw-governed-approve/);
  assert.match(bar, /data-gw-governed-deny/);
  // Carries the fingerprint, so a decision from the bar is bound to content.
  assert.match(bar, /data-content-fingerprint="[0-9a-f]{32}"/);
  // Nothing at all when there is nothing to decide.
  assert.equal(V.renderPendingApprovalsBar([]), "");
});

await test("8 — the bar is mounted on every route, not inside a lane view", () => {
  const html = readFileSync(new URL("../apps/vacilando/public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="approvals-bar"/);
  assert.ok(html.indexOf('id="approvals-bar"') < html.indexOf('id="view"'),
    "the bar must precede the routed view so it shows regardless of route");
  const client = readFileSync(new URL("../apps/vacilando/public/gateway.js", import.meta.url), "utf8");
  assert.match(client, /\/api\/v2\/governed-actions\/pending/);
  assert.match(client, /refreshApprovals\(\)\.catch/, "must paint on first show, not only on the next poll");
});

await test("9 — ordering is deterministic", () => {
  const mk = (id, created, run) => ({ request_id: id, created_at: created, run_id: run, action_key: "repository.push", inputs: {}, status: "awaiting_operator" });
  const rows = [mk("gar_c", "2026-08-27T10:00:00Z", null), mk("gar_a", "2026-08-27T09:00:00Z", "erun_1"), mk("gar_b", "2026-08-27T09:00:00Z", "erun_2")];
  const order = (list) => [...list]
    .sort((a, b) => ((a.run_id ? 0 : 1) - (b.run_id ? 0 : 1))
      || (Date.parse(a.created_at) - Date.parse(b.created_at))
      || String(a.request_id).localeCompare(String(b.request_id)))
    .map((r) => r.request_id);
  // Blocking active work first, then oldest, then id — and stable under reshuffle.
  assert.deepEqual(order(rows), ["gar_a", "gar_b", "gar_c"]);
  assert.deepEqual(order([...rows].reverse()), ["gar_a", "gar_b", "gar_c"]);
});

await test("10 — a request that can never succeed is refused when it is FILED", () => {
  // The operator pressed Approve three times on a merge carrying an
  // abbreviated SHA; every attempt died inside GitHub.
  const out = G.requestGovernedAction({
    lane_id: "lane_db3431e755a8",
    action_key: "repository.merge_pull_request",
    target: "staging",
    title: "Merge PR #563",
    purpose: "Certification fixture.",
    reason_worker_cannot_execute: "A managed worker cannot merge.",
    inputs: { repository: "r", pullRequestNumber: 563, targetBranch: "staging", mergeMethod: "merge", expectedHeadSha: "d40f469b4" },
  }, { processNow: false });
  assert.equal(out.ok, false);
  assert.equal(out.error, "abbreviated_source_sha");
  assert.match(out.detail, /full 40-character/);
});
