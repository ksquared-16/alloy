/**
 * DevOps 6 — Promotion Train V1, and the promotion-gate correctness addendum.
 *
 * Two things are proven here. That a train batches certified work into ONE
 * staging mutation without inventing a second way to reach staging; and that
 * `hosted_migration_parity` judges the phase it claims to judge.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as T from "../lib/vacilando/promotion-train.mjs";
import * as P from "../lib/vacilando/migration-parity.mjs";
import * as G from "../lib/vacilando/promotion-gate-contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");

const V = (n) => String(20260912000000 + n * 10000);

/** A fake git that answers from a declared ancestry/tree map. */
function fakeGit({ ancestry = [], trees = {}, heads = {}, mergeFails = new Set(), dirty = "" } = {}) {
  const calls = [];
  const impl = (args) => {
    calls.push(args.join(" "));
    const [verb] = args;
    if (verb === "merge-base" && args[1] === "--is-ancestor") {
      return { status: ancestry.some(([a, b]) => a === args[2] && b === args[3]) ? 0 : 1, stdout: "" };
    }
    if (verb === "rev-parse") return { status: 0, stdout: heads[args[1]] || args[1] };
    if (verb === "status") return { status: 0, stdout: dirty };
    if (verb === "merge") return mergeFails.has(args[3]) ? { status: 1, stderr: "CONFLICT (content): merge conflict in web/x.ts" } : { status: 0, stdout: "" };
    if (verb === "ls-tree") return { status: 0, stdout: (trees[args[3]] || []).map((v) => `supabase/migrations/${v}_x.sql`).join("\n") };
    return { status: 0, stdout: "" };
  };
  impl.calls = calls;
  return impl;
}

const certified = (id, sha, extra = {}) => ({
  id, sha, ready: true, state: T.CANDIDATE_STATE.READY_FOR_STAGING,
  certified_at: extra.certified_at || "2026-09-12T00:00:00Z",
  gates: Object.fromEntries(T.READINESS_GATES.map((g) => [g, true])),
  ...extra,
});

/* ── 1 · two independent certified candidates become one train ───────────── */
test("two independent certified candidates form a single train", () => {
  const git = fakeGit({ heads: { "origin/staging": "base1" } });
  const cands = [certified("a", "aaa"), certified("b", "bbb")];
  const ordered = T.orderTrainCandidates(cands, { gitImpl: git, cwd: "/w" });
  assert.equal(ordered.ordered.length, 2);
  const composed = T.composeTrain({ candidates: ordered.ordered, cwd: "/w", gitImpl: git });
  assert.equal(composed.ok, true);
  assert.equal(composed.composed.length, 2);
  assert.equal(composed.base_sha, "base1");
});

/* ── 2 · a dependent candidate suppresses its ancestor ───────────────────── */
test("an ancestor candidate is dropped, not merged twice", () => {
  // The real shape: 52c95cfcd (DevOps 4) is an ancestor of 3814d8073 (DevOps 5).
  const git = fakeGit({ ancestry: [["d4", "d5"]] });
  const r = T.orderTrainCandidates([certified("devops4", "d4"), certified("devops5", "d5")], { gitImpl: git, cwd: "/w" });
  assert.deepEqual(r.ordered.map((c) => c.sha), ["d5"]);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].sha, "d4");
  assert.equal(r.dropped[0].superseded_by, "d5");
});

test("the real waiting candidate set collapses seven certified candidates to three", () => {
  // Measured with git merge-base --is-ancestor on 2026-09-12.
  const git = fakeGit({ ancestry: [
    ["52c95cfcd", "3814d8073"], ["f59c0fca5", "3814d8073"], ["db0033e12", "3814d8073"],
    ["2eb5c3f27", "3814d8073"], ["f59c0fca5", "52c95cfcd"], ["2eb5c3f27", "db0033e12"],
    ["f1089527b", "16601e54f"],
  ] });
  const all = ["16601e54f", "25c85997d", "2eb5c3f27", "db0033e12", "f59c0fca5", "52c95cfcd", "3814d8073", "f1089527b"]
    .map((s) => certified(s, s));
  const r = T.orderTrainCandidates(all, { gitImpl: git, cwd: "/w" });
  assert.deepEqual(r.ordered.map((c) => c.sha).sort(), ["16601e54f", "25c85997d", "3814d8073"]);
});

/* ── 3 · conflicting candidates block before any staging mutation ────────── */
test("a merge conflict blocks composition and mutates no staging", () => {
  const git = fakeGit({ heads: { "origin/staging": "base1" }, mergeFails: new Set(["bbb"]) });
  const r = T.composeTrain({ candidates: [certified("a", "aaa"), certified("b", "bbb")], cwd: "/w", gitImpl: git });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "merge_conflict");
  assert.equal(r.failed_sha, "bbb");
  assert.equal(r.state, T.TRAIN_STATE.BLOCKED);
  assert.ok(!git.calls.some((c) => c.includes("push")), "composition must never push");
});

test("a declared conflicts_with pair blocks ordering", () => {
  const git = fakeGit();
  const r = T.orderTrainCandidates([certified("a", "aaa", { conflicts_with: ["bbb"] }), certified("b", "bbb")], { gitImpl: git, cwd: "/w" });
  assert.equal(r.ok, false);
  assert.equal(r.conflicts.length, 1);
});

/* ── 4 · a candidate with a missing dependency blocks ────────────────────── */
test("a candidate whose declared dependency is absent is blocked, not reordered", () => {
  const git = fakeGit();
  const r = T.orderTrainCandidates([certified("b", "bbb", { depends_on: ["zzz"] })], { gitImpl: git, cwd: "/w" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.blocked[0].missing, ["zzz"]);
  assert.equal(r.ordered.length, 0);
});

test("a dependency carried inside an included candidate satisfies the requirement", () => {
  const git = fakeGit({ ancestry: [["d4", "d5"]] });
  const r = T.orderTrainCandidates([certified("d4", "d4"), certified("d5", "d5", { depends_on: ["d4"] })], { gitImpl: git, cwd: "/w" });
  assert.equal(r.ok, true, "d4 is inside d5, so the dependency is met even though d4 was dropped");
  assert.deepEqual(r.ordered.map((c) => c.sha), ["d5"]);
});

/* ── 5/6 · staleness and dirt ────────────────────────────────────────────── */
test("a dirty integration worktree refuses composition", () => {
  const git = fakeGit({ heads: { "origin/staging": "base1" }, dirty: " M web/src/x.ts" });
  const r = T.composeTrain({ candidates: [certified("a", "aaa")], cwd: "/w", gitImpl: git });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "dirty_worktree");
});

test("the train records the exact base it composed against and notices it moving", () => {
  const git = fakeGit({ heads: { "origin/staging": "base2" } });
  const r = T.baseMoved({ trainBaseSha: "base1", cwd: "/w", gitImpl: git });
  assert.equal(r.measured, true);
  assert.equal(r.moved, true);
  assert.equal(r.base_sha_now, "base2");
});

/* ── 7/8/9 · the Critical Invariants boundary ────────────────────────────── */
test("Critical Invariants PASS allows the train to continue", () => {
  const d = T.trainIntegrationDecision({
    invariants: { verdict: "PASS", blocks_integration: false, counts: { failed_new: 0, unmeasured: 0 } },
    aggregate: { ok: true },
  });
  assert.equal(d.may_land, true);
  assert.equal(d.state, T.TRAIN_STATE.READY_TO_LAND);
});

test("Critical Invariants FAIL blocks the train", () => {
  const d = T.trainIntegrationDecision({
    invariants: { verdict: "FAIL", blocks_integration: true, counts: { failed_new: 1, unmeasured: 0 } },
    aggregate: { ok: true },
  });
  assert.equal(d.may_land, false);
  assert.equal(d.blockers[0].gate, "critical_invariants");
});

test("Critical Invariants UNMEASURED blocks the train exactly as FAIL does", () => {
  const d = T.trainIntegrationDecision({
    invariants: { verdict: "UNMEASURED", blocks_integration: true, counts: { failed_new: 0, unmeasured: 4 } },
    aggregate: { ok: true },
  });
  assert.equal(d.may_land, false);
  assert.equal(d.blockers[0].outcome, "UNMEASURED");
});

test("there is no override for a blocked train", () => {
  const src = readFileSync(join(LIB, "promotion-train.mjs"), "utf8");
  const fn = src.slice(src.indexOf("export function trainIntegrationDecision"));
  const sig = fn.slice(0, fn.indexOf(")"));
  for (const word of ["override", "force", "approved_anyway", "skip"]) {
    assert.ok(!sig.includes(word), `trainIntegrationDecision must accept no ${word}`);
  }
});

/* ── 10 · aggregate changed-domain validation ────────────────────────────── */
test("aggregate domain failure blocks even when every candidate passed alone", () => {
  const d = T.trainIntegrationDecision({
    invariants: { verdict: "PASS", blocks_integration: false },
    aggregate: { ok: false, failures: ["web/src/attendance"] },
  });
  assert.equal(d.may_land, false);
  assert.equal(d.blockers[0].gate, "aggregate_domain_validation");
});

test("absent aggregate validation is UNMEASURED and blocks", () => {
  const d = T.trainIntegrationDecision({ invariants: { verdict: "PASS", blocks_integration: false }, aggregate: null });
  assert.equal(d.may_land, false);
});

/* ── 11/12 · exactly one staging mutation, through the existing authority ── */
test("a passing train requests exactly one merge, through repository.merge_pull_request", () => {
  const req = T.stagingMergeRequest({ may_land: true, pull_request_number: 900, train_sha: "t".repeat(40) });
  assert.equal(req.ok, true);
  assert.equal(req.action_key, "repository.merge_pull_request");
  assert.equal(req.inputs.target_branch, "staging");
  assert.equal(req.inputs.expected_head_sha, "t".repeat(40));
  assert.equal(req.mutations, 1);
});

test("a train that is not ready cannot produce a merge request at all", () => {
  const req = T.stagingMergeRequest({ may_land: false, blockers: [{ gate: "critical_invariants" }] });
  assert.equal(req.ok, false);
});

/**
 * Asserted against CODE, not prose. The first cut of this control scanned the
 * raw file and failed on the module's own doc comment explaining that it imports
 * child_process nowhere — a control that forbids a file from describing its own
 * guarantee. Comments are stripped; the guarantee is unchanged.
 */
function codeOf(file) {
  return readFileSync(join(LIB, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("no second promotion or merge authority is introduced", () => {
  const code = codeOf("promotion-train.mjs");
  // The train may not reach the shell or the network at all.
  for (const forbidden of ["child_process", "spawnSync", "execFileSync", "execSync", "fetch("]) {
    assert.ok(!code.includes(forbidden), `promotion-train must not use ${forbidden}`);
  }
  // And it may name no way to write a remote. Bare `push` is Array.prototype's
  // and says nothing; a git push is a QUOTED argument, so that is what is
  // forbidden — everywhere except the allowlist whose job is to ban it.
  const withoutAllowlist = code.replace(/const FORBIDDEN_GIT_TOKENS[\s\S]*?\]\);/, "");
  assert.ok(!/["'`]push["'`]/.test(withoutAllowlist), "promotion-train must name no git push");
  assert.ok(!/git\s+push/.test(withoutAllowlist), "promotion-train must invoke no git push");
  // The allowlist itself is the structural guarantee: no verb on it writes a remote.
  for (const verb of T.ALLOWED_GIT_VERBS) {
    assert.ok(!["push", "reset", "filter-branch", "remote"].includes(verb), `${verb} may not be an allowed train verb`);
  }
  assert.equal(T.STAGING_MERGE_ACTION, "repository.merge_pull_request");
});

test("the git verb allowlist refuses anything that could write a remote", () => {
  assert.equal(T.assertGitAllowed(["push", "origin", "staging"]).ok, false);
  assert.equal(T.assertGitAllowed(["merge", "--no-ff", "--no-edit", "abc"]).ok, true);
  assert.equal(T.assertGitAllowed(["merge", "--force", "abc"]).ok, false);
  assert.equal(T.assertGitAllowed(["reset", "--hard", "abc"]).ok, false);
  assert.equal(T.assertGitAllowed(["rev-parse", "HEAD"]).ok, true);
});

/* ── 13 · exact SHAs recorded ────────────────────────────────────────────── */
test("a train records its exact base SHA and its final train SHA", () => {
  const git = fakeGit({ heads: { "origin/staging": "base1", HEAD: "trainsha" } });
  const r = T.composeTrain({ candidates: [certified("a", "aaa")], cwd: "/w", gitImpl: git });
  assert.equal(r.base_sha, "base1");
  assert.equal(r.train_sha, "trainsha");
  assert.equal(r.composed[0].sha, "aaa");
});

/* ── 15 · failure leaves candidates intact ───────────────────────────────── */
test("a failed train returns every candidate to READY_FOR_STAGING and mutates nothing", () => {
  const f = T.failTrain({
    composed: [{ candidate: "a", sha: "aaa" }, { candidate: "b", sha: "bbb" }],
    failed_candidate: "b", reason: "merge_conflict",
  });
  assert.equal(f.staging_mutated, false);
  assert.equal(f.candidates_returned_to, T.CANDIDATE_STATE.READY_FOR_STAGING);
  assert.deepEqual(f.released, ["a", "b"]);
  assert.deepEqual(f.hold_from_next_train, ["b"], "only the offending candidate is held out");
});

/* ── 16/17/18 · supersession and reclamation ─────────────────────────────── */
test("a landed train emits landing and supersession evidence", () => {
  const landed = T.landTrain(
    { train_id: "tr1", composed: [{ candidate: "d5", sha: "3814d8073" }], base_sha: "base1", train_sha: "tsha" },
    { mergeSha: "msha", dropped: [{ candidate: "d4", sha: "52c95cfcd", superseded_by: "3814d8073" }] },
  );
  assert.equal(landed.train.staging_mutations, 1);
  assert.equal(landed.train.deployments_triggered, 1);
  assert.equal(landed.landed_candidates[0].state, T.CANDIDATE_STATE.LANDED);
  const bases = landed.supersession.map((s) => s.basis).sort();
  assert.deepEqual(bases, ["ancestor_of_included_candidate", "landed_on_staging"]);
});

test("DevOps 3 can consume the supersession signal unchanged", async () => {
  const WL = await import("../lib/vacilando/worktree-lifecycle.mjs");
  const records = T.supersessionRecords(
    { train_id: "tr1", composed: [], merge_sha: "msha", landed_at: "2026-09-12T03:00:00Z" },
    { dropped: [{ candidate: "devops-4-knowledge", sha: "52c95cfcd", superseded_by: "3814d8073" }] },
  );
  const index = T.supersessionIndexForWorktrees(records, { worktreeByCandidate: { "devops-4-knowledge": "devops-4-knowledge" } });
  assert.equal(index["devops-4-knowledge"], "3814d8073");
  const inv = WL.inventoryWorktreeLifecycle({
    evaluations: [{ name: "devops-4-knowledge", path: "/Users/x/Code/alloy-promotions/devops-4-knowledge" }],
    supersededBy: index,
  });
  assert.equal(inv.rows[0].state, WL.WORKTREE_LIFECYCLE.SUPERSEDED);
  assert.equal(inv.rows[0].reclaimable, true);
});

test("the train worktree is reclaimable once the train has landed", () => {
  const landed = T.landTrain({ train_id: "tr1", composed: [] }, { mergeSha: "m" });
  assert.equal(landed.worktree_reclaimable, true);
});

/* ── 19/20 · urgency ─────────────────────────────────────────────────────── */
test("urgent bypass requires an enumerated class and an operator approval", () => {
  const ok = T.urgencyAuthorized({ urgency: { class: "production_incident", governed_approval_id: "gar_1" } });
  assert.equal(ok.urgent, true);
  assert.equal(ok.reason, "operator_authorized");
});

test("a candidate cannot declare itself urgent", () => {
  assert.equal(T.urgencyAuthorized({ urgency: { class: "production_incident" } }).urgent, false);
  assert.equal(T.urgencyAuthorized({ urgency: { class: "production_incident" } }).reason, "self_declared");
  assert.equal(T.urgencyAuthorized({ urgency: { class: "we_are_in_a_hurry", governed_approval_id: "g" } }).urgent, false);
  assert.equal(T.urgencyAuthorized({}).urgent, false);
});

test("an authorized urgent candidate departs immediately", () => {
  const f = T.formTrain({
    queue: [certified("a", "aaa", { urgency: { class: "security_fix", governed_approval_id: "gar_9" } })],
    nowMs: Date.parse("2026-09-12T00:00:10Z"),
    windowOpenedAtMs: Date.parse("2026-09-12T00:00:00Z"),
  });
  assert.equal(f.depart, true);
  assert.equal(f.reason, "urgent_authorized");
});

/* ── formation ───────────────────────────────────────────────────────────── */
test("a train waits for cadence and then departs", () => {
  const open = Date.parse("2026-09-12T00:00:00Z");
  const q = [certified("a", "aaa")];
  const early = T.formTrain({ queue: q, windowOpenedAtMs: open, nowMs: open + 10 * 60000 });
  assert.equal(early.depart, false);
  assert.equal(early.reason, "waiting_for_cadence");
  assert.ok(early.next_trigger);
  const late = T.formTrain({ queue: q, windowOpenedAtMs: open, nowMs: open + 31 * 60000 });
  assert.equal(late.depart, true);
  assert.equal(late.reason, "cadence_reached");
});

test("the count ceiling bounds how much one failed train can strand", () => {
  const open = Date.parse("2026-09-12T00:00:00Z");
  const q = Array.from({ length: 6 }, (_, i) => certified(`c${i}`, `s${i}`));
  const f = T.formTrain({ queue: q, windowOpenedAtMs: open, nowMs: open + 60000 });
  assert.equal(f.depart, true);
  assert.equal(f.reason, "count_ceiling");
});

test("an empty queue forms no train", () => {
  assert.equal(T.formTrain({ queue: [] }).depart, false);
});

/* ── B · readiness ───────────────────────────────────────────────────────── */
test("an unmeasured readiness gate blocks exactly like a failed one", () => {
  const r = T.evaluateReadiness({ id: "a", sha: "aaa", gates: { implementation_complete: true } });
  assert.equal(r.ready, false);
  assert.ok(r.unmeasured.includes("affected_domain_validation"));
});

test("certification bound to a different SHA is not certification of this candidate", () => {
  const c = certified("a", "aaa");
  c.certification = { candidate: "bbb" };
  const r = T.evaluateReadiness(c);
  assert.equal(r.ready, false);
  assert.ok(r.failed.includes("certification_bound_to_sha"));
});

test("a fully gated candidate reaches READY_FOR_STAGING without merging", () => {
  const r = T.evaluateReadiness(certified("a", "aaa"));
  assert.equal(r.state, T.CANDIDATE_STATE.READY_FOR_STAGING);
  assert.equal(r.ready, true);
});

/* ── G · provisioning ────────────────────────────────────────────────────── */
test("a bare promotion worktree is reported unprovisioned and names the canonical installer", () => {
  const r = T.invariantEnvironmentReadiness({ worktreePath: "/w", existsImpl: () => false });
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, ["web/node_modules"]);
  assert.equal(r.provisioner, "alloy-worktree-provision");
});

test("a provisioned worktree is ready and asks for no installer", () => {
  const r = T.invariantEnvironmentReadiness({ worktreePath: "/w", existsImpl: () => true });
  assert.equal(r.ready, true);
  assert.equal(r.remedy, null);
});

/* ── the three-phase ledger ──────────────────────────────────────────────── */
test("a train records promoted, candidate and post-merge migrations separately", () => {
  const git = fakeGit({ trees: { "origin/staging": [V(1)], cand: [V(1), V(2)] } });
  const l = T.trainMigrationLedger({ candidates: [{ id: "c", sha: "cand" }], gitImpl: git, cwd: "/w" });
  assert.deepEqual(l.promoted_obligations.migrations, [V(1)]);
  assert.deepEqual(l.candidate_additions.migrations, [V(2)]);
  assert.deepEqual(l.post_merge_obligations.migrations, [V(2)]);
  assert.notEqual(l.promoted_obligations.phase, l.candidate_additions.phase);
  assert.equal(l.post_merge_obligations.phase, "post_merge");
});

/* ── DevOps 7 seam ───────────────────────────────────────────────────────── */
test("maintenance may not begin while a train is in flight", () => {
  const busy = T.drainStateForMaintenance({ trains: [{ train_id: "t1", state: T.TRAIN_STATE.VALIDATING }] });
  assert.equal(busy.safe_to_begin_maintenance, false);
  const idle = T.drainStateForMaintenance({ trains: [{ train_id: "t1", state: T.TRAIN_STATE.LANDED }], queue: [certified("a", "aaa")] });
  assert.equal(idle.safe_to_begin_maintenance, true);
  assert.equal(idle.queued_candidates, 1);
});

/* ══ THE ADDENDUM: hosted_migration_parity ═══════════════════════════════ */

const census = (identities, at, { id = "gar_x", total = null } = {}) => ({
  action_key: "database.read_census", status: "complete", request_id: id,
  inputs: { queryArtifactPath: "certification/migrations/hosted-migration-identity-census.sql", databaseTarget: "alloy_deployed_primary" },
  execution_ended_at: new Date(at).toISOString(),
  result: { census: { questions: {
    ledger: { rows: identities },
    ledger_head: { rows: [identities[identities.length - 1]] },
    ledger_total: { rows: [total ?? identities.length] },
  } } },
});

const NOW = Date.parse("2026-09-12T03:00:00Z");
const gateFor = (staging, hosted, candidate, { records = null, nowMs = NOW } = {}) => {
  const recs = records || [census(hosted, nowMs - 60_000)];
  const ev = P.hostedMigrationEvidence(recs);
  const fr = P.hostedEvidenceFreshness(ev, { requests: recs, nowMs });
  return P.promotionParityGate({ expected: staging, candidate, evidence: ev, freshness: fr, expectedRevision: "staging", nowMs });
};

test("CASE A — no migration in the candidate, staging and hosted level: PASS", () => {
  const g = gateFor([V(0)], [V(0)], [V(0)]);
  assert.equal(g.status, "ok");
  assert.equal(g.promote, true);
  assert.deepEqual(g.candidate_only_migrations, []);
});

test("CASE B — the candidate adds a migration: PASS", () => {
  const g = gateFor([V(0)], [V(0)], [V(0), V(1)]);
  assert.equal(g.status, "ok", g.reason);
  assert.deepEqual(g.candidate_only_migrations, [V(1)]);
  assert.deepEqual(g.missing_on_hosted, []);
});

test("CASE C — promoted staging is ahead of hosted: FAIL, and it names what is missing", () => {
  const g = gateFor([V(0), V(1)], [V(0)], [V(0), V(1), V(2)]);
  assert.equal(g.status, "blocked");
  assert.equal(g.promote, false);
  assert.deepEqual(g.missing_on_hosted, [V(1)]);
  assert.deepEqual(g.candidate_only_migrations, [V(2)]);
});

test("CASE D — hosted catches up after a legitimate failure: PASS", () => {
  const g = gateFor([V(0), V(1)], [V(0), V(1)], [V(0), V(1), V(2)]);
  assert.equal(g.status, "ok");
  assert.deepEqual(g.missing_on_hosted, []);
});

test("CASE E — the candidate adds several migrations: PASS", () => {
  const g = gateFor([V(1)], [V(1)], [V(1), V(2), V(3)]);
  assert.equal(g.status, "ok");
  assert.deepEqual(g.candidate_only_migrations, [V(2), V(3)]);
});

test("CASE F — stale evidence must never be reported as hosted being behind", () => {
  const staging = [V(0), V(1)];
  // The census says 100. A ledger repair completed AFTER it, so hosted is really 101.
  const records = [
    census([V(0)], NOW - 3600_000, { id: "gar_old" }),
    { action_key: "database.repair_migration_ledger", status: "complete", request_id: "gar_repair",
      execution_ended_at: new Date(NOW - 1800_000).toISOString(), inputs: { target: "alloy_deployed_primary" } },
  ];
  const g = gateFor(staging, null, [V(0), V(1), V(2)], { records });
  assert.equal(g.promote, false, "stale evidence still blocks");
  assert.equal(g.status, "stale", "and it is stale, not behind");
  assert.notEqual(g.status, "blocked");
  assert.equal(g.freshness, "superseded_by_hosted_mutation");
  assert.match(g.remedy, /census/);
  assert.deepEqual(g.missing_on_hosted, [], "a stale verdict must make no claim about the database");
});

test("evidence past its age ceiling is stale, not behind", () => {
  const records = [census([V(0)], NOW - 25 * 3600_000)];
  const g = gateFor([V(0)], null, [V(0)], { records });
  assert.equal(g.status, "stale");
  assert.equal(g.freshness, "evidence_expired");
});

test("no census at all is UNKNOWN, and UNKNOWN blocks", () => {
  const g = P.promotionParityGate({
    expected: [V(0)], candidate: [V(0)],
    evidence: null, freshness: P.hostedEvidenceFreshness(null, { requests: [] }),
    expectedRevision: "staging",
  });
  assert.equal(g.status, "unknown");
  assert.equal(g.promote, false);
});

test("CASE G — the real PR #848 shape passes", () => {
  // Measured on 2026-09-12: staging 413 identities head 20260912010000; hosted
  // census gar_970336346cc9ca head 20260912010000 total 413; candidate 414 with
  // 20260912020000 added.
  const staging = ["20260911260000", "20260912010000"];
  const hosted = ["20260911260000", "20260912010000"];
  const candidate = [...staging, "20260912020000"];
  const g = gateFor(staging, hosted, candidate);
  assert.equal(g.status, "ok", g.reason);
  assert.equal(g.promote, true);
  assert.equal(g.expected_migration_head, "20260912010000");
  assert.equal(g.hosted_migration_head, "20260912010000");
  assert.deepEqual(g.candidate_only_migrations, ["20260912020000"]);
  assert.deepEqual(g.missing_on_hosted, []);
  assert.equal(g.expected_revision_kind, "promoted_staging");
});

test("CASE G′ — the same shape measured against the candidate head is the defect", () => {
  // The old behaviour, reproduced: expected drawn from the candidate demands the
  // candidate's own unmerged migration be deployed already.
  const candidate = ["20260911260000", "20260912010000", "20260912020000"];
  const hosted = ["20260911260000", "20260912010000"];
  const g = gateFor(candidate, hosted, candidate);
  assert.equal(g.status, "blocked");
  assert.deepEqual(g.missing_on_hosted, ["20260912020000"], "which no legitimate action could have satisfied before merge");
});

test("CASE H — a candidate migration ordering defect is not reported as hosted being behind", () => {
  // A candidate introducing an identity at or below the promoted head is an
  // ORDER problem owned by the migration system. The parity gate must stay
  // silent about it rather than impersonating its failure.
  const staging = [V(1), V(2)];
  const hosted = [V(1), V(2)];
  const candidate = [V(1), V(2), V(0)]; // V(0) is below the promoted head
  const g = gateFor(staging, hosted, candidate);
  assert.equal(g.status, "ok", "parity has nothing to say about ordering");
  assert.deepEqual(g.missing_on_hosted, []);
  assert.deepEqual(g.candidate_only_migrations, [V(0)]);
  assert.notEqual(g.status, "blocked");
});

test("hosted carrying identities absent from staging is reported, not blocking", () => {
  // Nothing a candidate can do removes a row from a ledger. Blocking on it would
  // be a second impossible precondition.
  const g = gateFor([V(0)], [V(0), V(9)], [V(0), V(1)]);
  assert.equal(g.status, "ok");
  assert.deepEqual(g.unexpected_on_hosted, [V(9)]);
});

test("the windowed census does not report every pre-window migration as missing", () => {
  const staging = [V(-50), V(-40), V(0), V(1)].map(String);
  const hosted = [V(0), V(1)]; // the census window starts at V(0)
  const g = gateFor(staging, hosted, staging);
  assert.equal(g.status, "ok", g.reason);
  assert.deepEqual(g.missing_on_hosted, []);
});

test("the gate emits deterministic comparison evidence", () => {
  const g = gateFor([V(0), V(1)], [V(0)], [V(0), V(1), V(2)]);
  for (const field of [
    "expected_revision", "expected_revision_kind", "expected_migration_head", "expected_migration_count",
    "hosted_migration_head", "hosted_migration_count", "missing_on_hosted", "unexpected_on_hosted",
    "candidate_only_migrations", "evidence_id", "evidence_timestamp", "evidence_age_ms",
  ]) {
    assert.ok(field in g, `hosted_migration_parity must report ${field}`);
  }
  assert.equal(typeof g.evidence_timestamp, "string");
  assert.equal(typeof g.evidence_age_ms, "number");
});

/* ── the gate contract ───────────────────────────────────────────────────── */
test("every canonical promotion gate declares boundary, owner, freshness and explainability", () => {
  const a = G.auditPromotionGates();
  assert.equal(a.clean, true, JSON.stringify(a.findings));
  assert.ok(a.gates >= 6);
});

test("the circularity rule detects the defect this mission fixed", () => {
  const parity = G.gateById("hosted_migration_parity");
  assert.equal(G.isCircular(parity.obligation), false, "the corrected gate is satisfiable");
  assert.equal(G.isCircular(parity.historical_defect.was), true, "the historical shape was not");
});

test("a gate that demands a post-merge effect before merge is caught generically", () => {
  const bad = [{
    id: "invented", lifecycle_boundary: G.LIFECYCLE.PROMOTED_STAGING, canonical_owner: "x",
    freshness: G.FRESHNESS_CLASS.IMMEDIATE, explains: ["a", "b"], unmeasured_blocks: true,
    obligation: G.obligation({ requires: G.LIFECYCLE.PROMOTED_STAGING, becomesDue: G.LIFECYCLE.POST_MERGE }),
  }];
  const a = G.auditPromotionGates(bad);
  assert.equal(a.clean, false);
  assert.equal(a.findings[0].defect, "circular_precondition");
});

test("a gate with recorded evidence and no freshness rule is caught", () => {
  const bad = [{
    id: "invented", lifecycle_boundary: G.LIFECYCLE.CANDIDATE, canonical_owner: "x",
    freshness: G.FRESHNESS_CLASS.RECORDED, explains: ["a", "b"], unmeasured_blocks: true,
    obligation: G.obligation({ requires: G.LIFECYCLE.CANDIDATE, becomesDue: G.LIFECYCLE.CANDIDATE }),
  }];
  assert.equal(G.auditPromotionGates(bad).findings[0].defect, "recorded_evidence_without_freshness_rule");
});

test("a gate that cannot explain itself, or lets unmeasured pass, is caught", () => {
  const noExplain = G.auditPromotionGates([{
    id: "x", lifecycle_boundary: G.LIFECYCLE.CANDIDATE, canonical_owner: "o",
    freshness: G.FRESHNESS_CLASS.IMMEDIATE, explains: [], unmeasured_blocks: true,
    obligation: G.obligation({ requires: G.LIFECYCLE.CANDIDATE, becomesDue: G.LIFECYCLE.CANDIDATE }),
  }]);
  assert.ok(noExplain.findings.some((f) => f.defect === "not_explainable"));
  const failOpen = G.auditPromotionGates([{
    id: "x", lifecycle_boundary: G.LIFECYCLE.CANDIDATE, canonical_owner: "o",
    freshness: G.FRESHNESS_CLASS.IMMEDIATE, explains: ["a", "b"], unmeasured_blocks: false,
    obligation: G.obligation({ requires: G.LIFECYCLE.CANDIDATE, becomesDue: G.LIFECYCLE.CANDIDATE }),
  }]);
  assert.ok(failOpen.findings.some((f) => f.defect === "unmeasured_may_pass"));
});

/* ── the merge path still owns the merge ─────────────────────────────────── */
test("the corrected parity measurement reads expected from the target branch", async () => {
  const M = await import("../lib/vacilando/trusted-host-merge.mjs");
  const seen = [];
  const gh = (args) => {
    const joined = args.join(" ");
    seen.push(joined);
    if (joined.includes("contents/supabase/migrations")) {
      const ref = /ref=([^\s"]+)/.exec(joined)?.[1];
      const names = ref === "staging"
        ? ["20260912010000_a.sql"]
        : ["20260912010000_a.sql", "20260912020000_b.sql"];
      return { status: 0, stdout: JSON.stringify(names) };
    }
    return { status: 1, stdout: "", stderr: "" };
  };
  const r = M.measureMergeMigrationParity(
    { repository: "ksquared-16/alloy", expectedHeadSha: "d32f1982e9101bb178384d8f341576e4ded0b024", targetBranch: "staging" },
    { gh, nowMs: NOW, censusRequests: [census(["20260912010000"], NOW - 60_000, { id: "gar_970336346cc9ca", total: 413 })] },
  );
  assert.equal(r.status, "ok", r.reason);
  assert.equal(r.expected_revision, "staging");
  assert.equal(r.expected_revision_kind, "promoted_staging");
  assert.deepEqual(r.candidate_only_migrations, ["20260912020000"]);
  assert.ok(seen.some((s) => s.includes("ref=staging")), "expected must be read from promoted staging");
});

test("the merge authority still refuses anything but staging, and owns the merge", async () => {
  const M = await import("../lib/vacilando/trusted-host-merge.mjs");
  assert.deepEqual([...M.ALLOWED_TARGET_BRANCHES], ["staging"]);
  for (const b of ["main", "master", "production", "prod"]) {
    assert.ok(M.BLOCKED_TARGET_BRANCHES.includes(b));
  }
});

test("the evidence store is located at the nested gateway root", () => {
  const src = readFileSync(join(LIB, "trusted-host-merge.mjs"), "utf8");
  const fn = src.slice(src.indexOf("function runtimeRoot()"), src.indexOf("function governedActionRequestsPath"));
  assert.ok(fn.includes("canonicalGatewayRuntimeRoot"), "runtimeRoot must defer to the canonical gateway root");
  assert.ok(fn.includes('join(explicit, "gateway")'), "an explicit parent root must still find the nested store");
});

/* ── the policy path, which is where the Director's denial came from ─────── */
test("the POLICY copy of the parity gate also reads expected from promoted staging", async () => {
  const H = await import("../lib/vacilando/trusted-host-repository-housekeeping.mjs");
  const gate = await import("../lib/vacilando/migration-parity.mjs");
  const seen = [];
  const gh = (args) => {
    const joined = args.join(" ");
    seen.push(joined);
    const ref = /ref=([^\s"]+)/.exec(joined)?.[1];
    const names = ref === "staging"
      ? ["20260912010000_w17.sql"]
      : ["20260912010000_w17.sql", "20260912020000_attendance.sql"];
    return { status: 0, stdout: JSON.stringify(names) };
  };
  const out = H.measureHostedMigrationParity(
    { repository: "ksquared-16/alloy", expectedHeadSha: "d32f1982e9101bb178384d8f341576e4ded0b024", targetBranch: "staging" },
    {
      gh, nowMs: NOW, gate,
      censusRequests: [census(["20260912010000"], NOW - 60_000, { id: "gar_970336346cc9ca", total: 413 })],
      provenFrom: () => null,
    },
  );
  assert.equal(out.hosted_migration_parity, true, out.hosted_migration_parity_detail);
  assert.equal(out.hosted_migration_parity_status, "ok");
  assert.equal(out.hosted_migration_expected_revision_kind, "promoted_staging");
  assert.deepEqual(out.hosted_migration_candidate_only, ["20260912020000"]);
  assert.deepEqual(out.hosted_migration_missing_on_hosted, []);
  assert.ok(seen.some((s) => s.includes("ref=staging")));
});

test("the policy copy still denies when promoted staging is genuinely ahead of hosted", async () => {
  const H = await import("../lib/vacilando/trusted-host-repository-housekeeping.mjs");
  const gate = await import("../lib/vacilando/migration-parity.mjs");
  const gh = (args) => {
    const ref = /ref=([^\s"]+)/.exec(args.join(" "))?.[1];
    const names = ref === "staging"
      ? ["20260912010000_a.sql", "20260912015000_b.sql"]
      : ["20260912010000_a.sql", "20260912015000_b.sql", "20260912020000_c.sql"];
    return { status: 0, stdout: JSON.stringify(names) };
  };
  const out = H.measureHostedMigrationParity(
    { repository: "ksquared-16/alloy", expectedHeadSha: "d".repeat(40), targetBranch: "staging" },
    { gh, nowMs: NOW, gate, censusRequests: [census(["20260912010000"], NOW - 60_000)], provenFrom: () => null },
  );
  assert.equal(out.hosted_migration_parity, false, "the first Attendance denial shape stays a denial");
  assert.equal(out.hosted_migration_parity_status, "blocked");
  assert.deepEqual(out.hosted_migration_missing_on_hosted, ["20260912015000"]);
});

test("the policy copy records stale evidence as unmeasured, never as a denial", async () => {
  const H = await import("../lib/vacilando/trusted-host-repository-housekeeping.mjs");
  const gate = await import("../lib/vacilando/migration-parity.mjs");
  const gh = () => ({ status: 0, stdout: JSON.stringify(["20260912010000_a.sql"]) });
  const out = H.measureHostedMigrationParity(
    { repository: "ksquared-16/alloy", expectedHeadSha: "d".repeat(40), targetBranch: "staging" },
    {
      gh, nowMs: NOW, gate, provenFrom: () => null,
      censusRequests: [
        census(["20260911260000"], NOW - 3600_000),
        { action_key: "database.repair_migration_ledger", status: "complete", request_id: "gar_repair",
          execution_ended_at: new Date(NOW - 600_000).toISOString(), inputs: {} },
      ],
    },
  );
  assert.equal(out.hosted_migration_parity, null, "stale is unmeasured, which escalates rather than denying");
  assert.equal(out.hosted_migration_parity_status, "stale");
  assert.deepEqual(out.hosted_migration_missing_on_hosted, []);
});

test("both copies of the parity measurement delegate to the one owner", () => {
  for (const file of ["trusted-host-merge.mjs", "trusted-host-repository-housekeeping.mjs"]) {
    const code = codeOf(file);
    assert.ok(/promotionParityGate/.test(code), `${file} must use the canonical gate`);
    assert.ok(!/ref=\$\{n\.expectedHeadSha\}[\s\S]{0,400}?requiredHead/.test(code),
      `${file} must not draw the parity requirement from the candidate head`);
  }
});
