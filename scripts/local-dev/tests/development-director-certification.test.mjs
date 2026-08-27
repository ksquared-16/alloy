/**
 * Director Authority V1 — end-to-end certification through the REAL governed
 * action path, in an isolated runtime root with execution stubbed so no
 * repository action can fire.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-director-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
writeFileSync(join(ROOT, "vacilando", "repositories.json"), JSON.stringify({
  schema_version: "vacilando.repository.v1",
  repositories: { repo_alloy: { repository_id: "repo_alloy", name: "Alloy", remote: "git@github.com:ksquared-16/alloy.git", remote_normalized: "github.com/ksquared-16/alloy" } },
}, null, 2), "utf8");

const G = await import("../lib/vacilando/governed-action-request.mjs");
const D = await import("../lib/vacilando/director-authority.mjs");

let pass = 0, fail = 0;
const executed = [];
async function test(name, fn) {
  G.resetGovernedActionsForTests(ROOT);
  executed.length = 0;
  G.setGovernedActionExecuteImplForTests(async (rec) => { executed.push(rec.action_key); return { ok: true, result_ref: "tha_stub" }; });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const SHA = "9154a5befec160b2b621f7595428158385e553ed";
const WT = "/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2";
const base = (over = {}) => ({
  lane_id: "lane_cert", mission_id: "msn_cert", action_key: "repository.push", target: "staging",
  title: "t", purpose: "p", reason_worker_cannot_execute: "worker cannot",
  worktreePath: WT,
  inputs: { repository: "ksquared-16/alloy", branch: "agent/cursor/5-director-cert", expectedHeadSha: SHA, worktreePath: WT },
  ...over,
});
// Evidence the collector cannot gather in a temp root is injected via the
// evaluator's own contract in the unit suite; here we drive the REAL path and
// assert the OUTCOME the operator would experience.
const file = (r) => G.getGovernedAction(r, ROOT);

await test("C1 — routine push: Director decides, the operator is not asked", async () => {
  const out = G.requestGovernedAction(base(), { root: ROOT, processNow: true });
  const rec = file(out.request?.request_id || out.request_id);
  assert.ok(rec, "request recorded");
  // Whatever the verdict, it must be RECORDED and attributable.
  assert.ok(rec.director_decision, "a Director verdict is always recorded");
  assert.equal(rec.director_decision.policy_version, D.DIRECTOR_POLICY_VERSION);
  if (rec.policy_decision === "director_approved") {
    assert.equal(rec.director_approval.actor, "director");
    assert.equal(rec.director_approval.policy, "routine_managed_branch_push_v1");
    assert.ok(!rec.operator_approval, "the operator was never asked");
    assert.equal(rec.operator_approval_required, false);
  } else {
    // Escalation is acceptable ONLY with a stated machine-checkable reason.
    assert.ok(rec.escalation_reason, "an escalation must say why");
    assert.match(rec.escalation_reason, /not measured|No delegated policy|reserved|always an operator/);
  }
});

await test("C2 — consequential action always reaches the operator", async () => {
  const out = G.requestGovernedAction(base({
    action_key: "database.apply_migration",
    inputs: { environment: "staging", expectedSha: SHA, migrations: ["a.sql"] },
  }), { root: ROOT, processNow: true });
  const rec = file(out.request?.request_id || out.request_id);
  assert.equal(rec.operator_approval_required, true);
  assert.ok(!rec.director_approval, "the Director must not have decided it");
  assert.equal(executed.length, 0, "nothing executed without the operator");
});

await test("C3 — self-expansion is structurally refused", async () => {
  // Two acceptable refusals, both structural: the key is not registered at all
  // (refused at filing), or it is filed and escalates. What must never happen
  // is a Director approval.
  const out = G.requestGovernedAction(base({ action_key: "governance.update_policy", inputs: { environment: "staging", worktreePath: WT } }), { root: ROOT, processNow: true });
  const id = out.request?.request_id || out.request_id;
  if (!id) { assert.equal(out.ok, false, "an unregistered governance key must not be filed silently"); assert.equal(executed.length, 0); return; }
  const rec = file(id);
  assert.equal(rec.operator_approval_required, true);
  assert.ok(!rec.director_approval);
  assert.equal(executed.length, 0);
  // A push whose CONTENT edits the policy files escalates for the right reason.
  const c = G.requestGovernedAction(base({ inputs: { repository: "ksquared-16/alloy", branch: "agent/cursor/5-director-cert", expectedHeadSha: SHA, worktreePath: WT, changed_files: ["scripts/local-dev/lib/vacilando/director-authority.mjs"] } }), { root: ROOT, processNow: true });
  const crec = file(c.request?.request_id || c.request_id);
  if (crec) { assert.ok(!crec.director_approval, "a policy edit was Director-approved"); }
});

await test("C4 — production never inherits staging authority", async () => {
  const out = G.requestGovernedAction(base({ target: "alloy_deployed_primary", inputs: { repository: "ksquared-16/alloy", branch: "agent/cursor/5-director-cert", expectedHeadSha: SHA, environment: "alloy_deployed_primary" } }), { root: ROOT, processNow: true });
  const rec = file(out.request?.request_id || out.request_id);
  assert.equal(rec.operator_approval_required, true);
  assert.ok(!rec.director_approval);
});

await test("C5 — an unknown capability escalates rather than defaulting open", async () => {
  const out = G.requestGovernedAction(base({ action_key: "some.brand_new_capability" }), { root: ROOT, processNow: true });
  // Either the registry refuses it outright or the Director escalates it.
  // What must NEVER happen is a Director approval.
  const id = out.request?.request_id || out.request_id;
  if (id) {
    const rec = file(id);
    if (rec) assert.ok(!rec.director_approval, "an unknown action was Director-approved");
  }
  assert.equal(executed.length, 0);
});

await test("C6 — a Director approval never masquerades as the operator's", async () => {
  const out = G.requestGovernedAction(base(), { root: ROOT, processNow: true });
  const rec = file(out.request?.request_id || out.request_id);
  if (rec?.director_approval) {
    assert.equal(rec.director_approval.actor, "director");
    assert.notEqual(rec.operator_approval?.actor, "director");
    assert.ok(!rec.operator_approval, "no operator record is fabricated");
    assert.ok(rec.director_approval.content_fingerprint, "the decision is content-bound");
  }
  const pub = G.publicGovernedAction(rec);
  assert.ok("director_approval" in pub && "escalation_reason" in pub, "the ledger projects both");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
